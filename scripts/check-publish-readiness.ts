import path from "path";
import { getTodaySlot, isFullMotionSlot, ScheduledSlot } from "./content-calendar";
import { inspectStoryReadinessInR2 } from "./manage-story-storage";
import { getRequiredBufferOrientations, parseCompilationTheme } from "./lib/batch-queue";
import { db } from "./lib/db";
import { getTelegramConfig, sendTelegramMessage } from "./notify-telegram";
import { loadJsonArraySafe, resolveExistingSlotPublications } from "./lib/portal-sync";

type SlotFilter = "morning" | "evening" | "motion" | "all" | "auto";

function getWibContext(): { dateStr: string; hour: number } {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const hour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "numeric",
        hourCycle: "h23",
      }).format(now),
      10
    ) % 24;
  return { dateStr, hour };
}

function isMorningIllustrationSlot(slot: ScheduledSlot): boolean {
  if (isFullMotionSlot(slot)) return false;
  return (
    slot.timeSlot.includes("07:") ||
    slot.timeSlot.includes("08:") ||
    slot.timeSlot.toLowerCase().includes("pagi") ||
    slot.slotType.toLowerCase().includes("morning")
  );
}

function resolveTargetSlots(slots: ScheduledSlot[], slotFilter: SlotFilter, jakartaHour: number): ScheduledSlot[] {
  let effective = slotFilter;
  if (effective === "auto") {
    if (jakartaHour >= 5 && jakartaHour < 10) effective = "morning";
    else if (jakartaHour >= 12 && jakartaHour < 15) effective = "motion";
    else if (jakartaHour >= 16 && jakartaHour <= 20) effective = "evening";
    else effective = "all";
  }

  if (effective === "morning") return slots.filter((s) => isMorningIllustrationSlot(s));
  if (effective === "motion") return slots.filter((s) => isFullMotionSlot(s));
  if (effective === "evening") return slots.filter((s) => !isFullMotionSlot(s) && !isMorningIllustrationSlot(s));
  return slots;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const dryRun = args.includes("--dry-run");
  const failOnIncomplete = args.includes("--fail-on-incomplete");
  const slotArg = (getArg("--slot") || "auto") as SlotFilter;
  const wib = getWibContext();
  const targetDate = getArg("--date") || wib.dateStr;

  console.log("\n==================================================================");
  console.log("⏰ ZAYN STORYBOOK: H-2 PUBLISH READINESS CHECK");
  console.log("==================================================================");
  console.log(`📅 Target Date (WIB) : ${targetDate} (${String(wib.hour).padStart(2, "0")}:xx WIB)`);
  console.log(`🎯 Slot Filter       : ${slotArg.toUpperCase()}`);
  console.log(`🧪 Mode              : ${dryRun ? "DRY RUN (No Telegram Send)" : "LIVE CHECK"}`);
  console.log("==================================================================\n");

  const allSlots = await getTodaySlot(targetDate);
  const targetSlots = resolveTargetSlots(allSlots, slotArg, wib.hour);

  if (targetSlots.length === 0) {
    console.log(`🌴 Tidak ada jadwal tayang [${slotArg}] untuk ${targetDate}. Lewati pengecekan H-2.`);
    return;
  }

  const auditRecords = loadJsonArraySafe(path.resolve("./docs/audit-data.json"));
  const calendarRecords = loadJsonArraySafe(path.resolve("./docs/calendar-data.json"));
  const incompleteAlerts: Array<{ slot: ScheduledSlot; missingItems: string[] }> = [];

  for (const slot of targetSlots) {
    const pubStatus = await resolveExistingSlotPublications({
      bookSlug: slot.bookSlug,
      lang: slot.lang,
      localFlags: { yt: false, fb: false, ig: false },
      localAuditRecords: auditRecords,
      localCalendarSlots: calendarRecords,
      queryD1Publications: (slug, lang) => db.getPublishedPublicationsForSlot(slug, lang),
    }).catch(() => ({ allPrimaryLive: false, sources: [] }));

    if (pubStatus.allPrimaryLive) {
      console.log(`✔ [LIVE ALREADY] ${slot.bookSlug} [${slot.lang.toUpperCase()}] @ ${slot.timeSlot}`);
      continue;
    }

    const req = getRequiredBufferOrientations(slot.format, slot.lang);
    const readiness = await inspectStoryReadinessInR2({
      bookSlug: slot.bookSlug,
      lang: slot.lang,
      requireLandscape: req.requireLandscape,
      requireVertical: req.requireVertical,
      isFullMotion: isFullMotionSlot(slot),
      isCompilation: Boolean(parseCompilationTheme(slot.bookSlug)),
    });

    if (readiness.ready) {
      console.log(`✅ [READY] ${slot.bookSlug} [${slot.lang.toUpperCase()}] @ ${slot.timeSlot} (${slot.slotType})`);
    } else {
      console.warn(
        `🚨 [INCOMPLETE H-2] ${slot.bookSlug} [${slot.lang.toUpperCase()}] @ ${slot.timeSlot} -> Missing: ${readiness.missingItems.join(", ")}`
      );
      incompleteAlerts.push({ slot, missingItems: readiness.missingItems });
    }
  }

  if (incompleteAlerts.length === 0) {
    console.log("\n🎉 Semua aset dan video render untuk slot tayang ini SUDAH SIAP!\n");
    return;
  }

  const lines = incompleteAlerts.map(({ slot, missingItems }) => {
    const kind = isFullMotionSlot(slot) ? "🎬 Full-Motion" : "📖 Illustration";
    return (
      `• <b>${slot.bookSlug}</b> [<code>${slot.lang.toUpperCase()}</code>] — ${kind}\n` +
      `  ⏰ Jadwal: <b>${targetDate} ${slot.timeSlot}</b> (${slot.slotType})\n` +
      `  ❌ Belum lengkap: <i>${missingItems.join(", ")}</i>`
    );
  });

  const messageHtml =
    `🚨 <b>H-2 PUBLISH READINESS ALERT — DATA BELUM LENGKAP!</b>\n\n` +
    `Pengecekan 2 jam sebelum jam tayang menemukan aset/video render belum siap di Cloudflare R2:\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `🛠️ Segera jalankan:\n` +
    `<code>npx tsx scripts/buffer-prerender.ts --days 1</code>`;

  if (dryRun) {
    console.log("\n✈️ [DRY RUN] Telegram H-2 Alert Preview:\n" + messageHtml);
    return;
  }

  const tgConfig = getTelegramConfig();
  if (!tgConfig) {
    console.warn("⚠️ Telegram credentials missing; skipping H-2 Telegram notification.");
  } else {
    await sendTelegramMessage(tgConfig, messageHtml);
    console.log("✔ Telegram H-2 incomplete alert dispatched.");
  }

  if (failOnIncomplete) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.includes("check-publish-readiness")) {
  main().catch((err) => {
    console.error("❌ Fatal error in publish readiness check:", err);
    process.exit(1);
  });
}
