import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { DAILY_CALENDAR_MONTH_1, ScheduledSlot } from "./content-calendar";
import {
  checkStoryBufferedVideos,
  hasStoryManifestInR2,
  pushCompilationBuffer,
} from "./manage-story-storage";
import { db } from "./lib/db";
import { notifyTelegramFailure } from "./notify-telegram";
import {
  getRequiredBufferOrientations,
  getWibDateOffsetIso,
  parseCompilationTheme,
} from "./lib/batch-queue";

interface BufferOptions {
  daysAhead?: number;
  dryRun?: boolean;
  force?: boolean;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function recordBufferedStory(slug: string) {
  try {
    const configPath = path.resolve(process.cwd(), "config/buffered-stories.json");
    let list: string[] = [];
    if (existsSync(configPath)) {
      list = JSON.parse(await fs.readFile(configPath, "utf-8"));
    }
    if (!list.includes(slug)) {
      list.push(slug);
      await fs.writeFile(configPath, JSON.stringify(list, null, 2));
    }
  } catch {}
}

async function loadCandidateSlots(candidateDates: string[]): Promise<ScheduledSlot[]> {
  const dateSet = new Set(candidateDates);
  const localSlots = DAILY_CALENDAR_MONTH_1.filter((s) => s.date && dateSet.has(s.date));
  const localKeys = new Set(localSlots.map((s) => `${s.date}::${s.timeSlot}::${s.lang}`));

  try {
    const remoteRows = await db.getCalendar();
    for (const row of remoteRows) {
      if (!dateSet.has(row.scheduled_date)) continue;
      const key = `${row.scheduled_date}::${row.time_slot}::${row.lang}`;
      if (localKeys.has(key)) continue;
      localKeys.add(key);
      localSlots.push({
        date: row.scheduled_date,
        dayName: (row.day_name as ScheduledSlot["dayName"]) || "Senin",
        timeSlot: row.time_slot,
        slotType: row.slot_type,
        bookSlug: row.book_slug,
        lang: row.lang as "id" | "en",
        format: (row.format as ScheduledSlot["format"]) || "both",
        targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
        theme: row.theme || "Scheduled Storybook Feature",
      });
    }
  } catch (err: any) {
    console.warn(`⚠️ D1 calendar lookup skipped (${err.message}); using Month-1 static calendar.`);
  }

  return localSlots.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/**
 * Evaluates whether an R2 buffer status satisfies all aspect ratios required by a slot.
 */
export function hasRequiredBufferVideos(
  bufferStatus: {
    idLandscape: boolean;
    idVertical: boolean;
    enLandscape: boolean;
    enVertical: boolean;
  },
  format: string | undefined,
  lang: "id" | "en"
): boolean {
  const req = getRequiredBufferOrientations(format, lang);
  const landOk = !req.requireLandscape || (lang === "id" ? bufferStatus.idLandscape : bufferStatus.enLandscape);
  const vertOk = !req.requireVertical || (lang === "id" ? bufferStatus.idVertical : bufferStatus.enVertical);
  return landOk && vertOk;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  const daysIdx = args.indexOf("--days");
  const daysAhead = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 3;

  console.log(`\n==================================================================`);
  console.log(`🛡️  ZAYN STORYBOOK: AUTOMATED PRE-RENDER BUFFER ENGINE`);
  console.log(`==================================================================`);
  console.log(`📅 Buffer Window : Next ${daysAhead} Days Ahead (H+1 to H+${daysAhead})`);
  console.log(`🧪 Mode          : ${dryRun ? "DRY RUN (Preview Only)" : "LIVE BATCH RENDER"}`);
  console.log(`⚡ Force Re-render: ${force ? "YES" : "NO (Skip existing R2 videos)"}`);
  console.log(`==================================================================\n`);

  const now = new Date();
  const candidateDates: string[] = [];

  for (let i = 1; i <= daysAhead; i++) {
    candidateDates.push(getWibDateOffsetIso(i, now));
  }

  console.log(`🎯 Target Broadcast Dates: ${candidateDates.join(", ")}\n`);

  const slotsToBuffer = await loadCandidateSlots(candidateDates);

  if (slotsToBuffer.length === 0) {
    console.log(`⚠️ No scheduled stories found for dates ${candidateDates.join(", ")}.`);
    return;
  }

  console.log(`📋 Found ${slotsToBuffer.length} broadcast slots in the buffer window:\n`);
  const failures: Array<{ bookSlug: string; lang: string; date?: string; error: string }> = [];
  const handledSlotKeys = new Set<string>();

  for (const slot of slotsToBuffer) {
    const slotKey = `${slot.date}::${slot.timeSlot}::${slot.lang}`;
    if (handledSlotKeys.has(slotKey)) continue;

    console.log(`------------------------------------------------------------------`);
    console.log(`📖 Story     : ${slot.bookSlug} [${slot.lang.toUpperCase()}]`);
    console.log(`📅 Scheduled : ${slot.dayName}, ${slot.date} @ ${slot.timeSlot} (${slot.slotType})`);
    console.log(`🎨 Theme     : "${slot.theme}"`);

    const req = getRequiredBufferOrientations(slot.format, slot.lang);
    const compTheme = parseCompilationTheme(slot.bookSlug);
    const bufferStatus = await checkStoryBufferedVideos(slot.bookSlug);
    const hasRequiredVideos = hasRequiredBufferVideos(bufferStatus, slot.format, slot.lang);

    if (hasRequiredVideos && !force) {
      console.log(`   🟢 [BUFFER HIT] Required MP4 buffer (${req.renderFormatArg.toUpperCase()}) already exists in Cloudflare R2!`);
      console.log(`   ⏩ Skipping render. This story is ready for instant broadcast on ${slot.date}.`);
      try {
        await db.markCalendarSlotBuffered(slot.bookSlug, slot.lang);
        await recordBufferedStory(slot.bookSlug);
        console.log(`   ✔ Confirmed buffer status in Cloudflare D1 for [${slot.bookSlug}] [${slot.lang}]`);
      } catch (d1Err: any) {
        console.warn(`   ⚠️ D1 buffer flag update warning: ${d1Err.message}`);
      }
      continue;
    }

    // Batch sibling language slot for the same non-compilation story so pull/bundle/push run once.
    const batchedSlots: ScheduledSlot[] = [slot];
    if (!compTheme) {
      for (const peer of slotsToBuffer) {
        const peerKey = `${peer.date}::${peer.timeSlot}::${peer.lang}`;
        if (peerKey === slotKey || handledSlotKeys.has(peerKey) || peer.bookSlug !== slot.bookSlug) continue;
        const peerReq = getRequiredBufferOrientations(peer.format, peer.lang);
        const peerReady = hasRequiredBufferVideos(bufferStatus, peer.format, peer.lang);
        if ((!peerReady || force) && peerReq.renderFormatArg === req.renderFormatArg && peer.lang !== slot.lang) {
          batchedSlots.push(peer);
          handledSlotKeys.add(peerKey);
        }
      }
    }
    const langArg = batchedSlots.length > 1 ? "all" : slot.lang;
    const langLabel = batchedSlots.map((s) => s.lang.toUpperCase()).join("+");

    console.log(`   🟡 [BUFFER MISS] Video not yet buffered in R2 for [${langLabel} / ${req.renderFormatArg}].`);

    if (dryRun) {
      if (compTheme) {
        console.log(`   [DRY RUN] Would execute compilation render & R2 sync:`);
        console.log(`     1. npx tsx scripts/render-compilation.ts --theme "${compTheme}" --lang ${slot.lang} --format ${req.renderFormatArg}`);
        console.log(`     2. pushCompilationBuffer("${slot.bookSlug}", "${slot.lang}")`);
      } else {
        const localMotionSpec = path.join(process.cwd(), "stories", slot.bookSlug, "motion-spec.json");
        if (existsSync(localMotionSpec)) {
          console.log(`   [DRY RUN] Edu-Motion Spec detected locally: ${localMotionSpec}`);
          console.log(`     0. npx tsx scripts/pack-edu-motion.ts --book "${slot.bookSlug}"`);
        } else {
          const hasManifest = await hasStoryManifestInR2(slot.bookSlug);
          console.log(`   [DRY RUN] R2 Manifest: ${hasManifest ? "PRESENT" : "MISSING (would auto-ingest first)"}`);
          if (!hasManifest) {
            console.log(`     0. npx tsx scripts/ingest-story.ts --book "${slot.bookSlug}"`);
          }
          console.log(`     1. npx tsx scripts/manage-story-storage.ts pull ${slot.bookSlug}`);
        }
        console.log(`     2. npx tsx scripts/render-book.ts --book "${slot.bookSlug}" --lang ${langArg} --format ${req.renderFormatArg} --resolution 1080p`);
        console.log(`     3. npx tsx scripts/manage-story-storage.ts push ${slot.bookSlug} --include-videos`);
      }
      continue;
    }

    try {
      if (compTheme) {
        console.log(`   🎞️ Rendering Marathon Compilation [--theme ${compTheme}] (${slot.lang.toUpperCase()})...`);
        execSync(
          `npx tsx scripts/render-compilation.ts --theme "${compTheme}" --lang "${slot.lang}" --format "${req.renderFormatArg}"`,
          { stdio: "inherit" }
        );
        console.log(`   ☁️ Uploading compilation buffer to Cloudflare R2...`);
        await pushCompilationBuffer(slot.bookSlug, slot.lang);
      } else {
        const localMotionSpec = path.join(process.cwd(), "stories", slot.bookSlug, "motion-spec.json");
        if (existsSync(localMotionSpec)) {
          console.log(`   🎨 Packaging deterministic Edu-Motion assets from motion-spec.json for [${slot.bookSlug}]...`);
          execSync(`npx tsx scripts/pack-edu-motion.ts --book "${slot.bookSlug}"`, { stdio: "inherit" });
        } else {
          const hasManifest = await hasStoryManifestInR2(slot.bookSlug);
          if (!hasManifest) {
            console.log(`   📥 Story [${slot.bookSlug}] not yet in R2. Running auto-ingestion before pre-render...`);
            execSync(`npx tsx scripts/ingest-story.ts --book "${slot.bookSlug}"`, { stdio: "inherit" });
          }

          // Step 1: Ensure assets are present
          console.log(`   ⬇️ Pulling story assets from Cloudflare R2...`);
          execSync(`npx tsx scripts/manage-story-storage.ts pull ${slot.bookSlug}`, { stdio: "inherit" });
        }

        // Step 2: Render required orientation(s) in a single bundle pass
        console.log(`   🎬 Rendering Remotion videos (${req.renderFormatArg}) for [${langLabel}]...`);
        execSync(
          `npx tsx scripts/render-book.ts --book "${slot.bookSlug}" --lang "${langArg}" --format "${req.renderFormatArg}" --resolution 1080p`,
          { stdio: "inherit" }
        );

        // Step 3: Push rendered MP4s back to Cloudflare R2
        console.log(`   ☁️ Uploading rendered MP4 video buffer to Cloudflare R2...`);
        execSync(`npx tsx scripts/manage-story-storage.ts push ${slot.bookSlug} --include-videos`, { stdio: "inherit" });
      }

      for (const bSlot of batchedSlots) {
        try {
          await db.markCalendarSlotBuffered(bSlot.bookSlug, bSlot.lang);
          await recordBufferedStory(bSlot.bookSlug);
          console.log(`   ✔ Marked calendar slot as buffered in Cloudflare D1 for [${bSlot.bookSlug}] [${bSlot.lang}]`);
        } catch (d1Err: any) {
          console.warn(`   ⚠️ D1 buffer flag update warning: ${d1Err.message}`);
        }
      }

      console.log(`   🎉 SUCCESS! Pre-render buffer complete for [${slot.bookSlug}] (${langLabel}) on ${slot.date}!`);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error(`   ❌ Error buffering [${slot.bookSlug}]:`, errMsg);
      for (const bSlot of batchedSlots) {
        failures.push({
          bookSlug: bSlot.bookSlug,
          lang: bSlot.lang,
          date: bSlot.date,
          error: errMsg,
        });
      }
    }
  }

  console.log(`\n==================================================================`);
  console.log(`✨ Pre-Render Buffer Check Completed (${slotsToBuffer.length - failures.length}/${slotsToBuffer.length} ready): ${candidateDates[0]} to ${candidateDates[candidateDates.length - 1]}`);
  console.log(`==================================================================\n`);

  if (failures.length > 0) {
    try {
      await notifyTelegramFailure({
        bookSlug: failures.map((f) => f.bookSlug).join(", "),
        platform: "Pre-Render Buffer Engine",
        error: failures.map((f) => `[${f.date} ${f.bookSlug} (${f.lang})]: ${f.error}`).join("\n"),
        dryRun,
      });
    } catch {}
    process.exitCode = 1;
  }
}

if (process.argv[1]?.includes("buffer-prerender")) {
  main().catch((err) => {
    console.error("❌ Fatal error in buffer-prerender:", err);
    process.exit(1);
  });
}
