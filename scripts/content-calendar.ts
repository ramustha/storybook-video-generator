import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { execSync, spawn } from "child_process";

export interface ScheduledSlot {
  dayName: "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat" | "Sabtu" | "Minggu";
  timeSlot: string; // e.g. "19:00 WIB"
  slotType: "Prime Bedtime Story" | "Morning Energy Short" | "Weekend Family Special" | "Bilingual English Feature";
  bookSlug: string;
  lang: "id" | "en";
  format: "landscape" | "vertical" | "both";
  targetPlatforms: string[];
  theme: string;
}

export const WEEKLY_SCHEDULE: ScheduledSlot[] = [
  {
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "gara-gara-kucing",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Cerita Humor & Tanggung Jawab Mengawali Pekan",
  },
  {
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Bilingual English Feature",
    bookSlug: "hari-cukur-rambut",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Overcoming Anxieties & Problem Solving",
  },
  {
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "hari-cukur-rambut",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Cerita Jenaka Keberanian & Menghadapi Rasa Takut",
  },
  {
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Bilingual English Feature",
    bookSlug: "jas-hujan-merah",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Bedtime Story: Learning Patience & Joy of Waiting",
  },
  {
    dayName: "Jumat",
    timeSlot: "19:30 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "raja-gemuk-anjing-kurus",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Kisah Persahabatan & Pola Hidup Sehat Jelang Akhir Pekan",
  },
  {
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "gara-gara-kucing",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["Instagram Reels", "Facebook Reels", "YouTube Shorts", "TikTok"],
    theme: "Weekend Morning Ceria: Alasan Paling Lucu Nggak Bikin PR!",
  },
  {
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Weekend Family Special",
    bookSlug: "raja-gemuk-anjing-kurus",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9)", "Facebook Watch (16:9)", "Instagram Reels"],
    theme: "Saturday Night Special: Fat King & Thin Dog Comedy",
  },
  {
    dayName: "Minggu",
    timeSlot: "09:00 WIB",
    slotType: "Weekend Family Special",
    bookSlug: "jas-hujan-merah",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook Watch", "Instagram Reels"],
    theme: "Minggu Pagi Santai: Kisah Kesabaran Menunggu Hujan",
  },
  {
    dayName: "Minggu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "gara-gara-kucing",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Sunday Bedtime: It's All the Cat's Fault! (Tidur Nyenyak Penuh Senyum)",
  },
];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

function getTodaySlot(): ScheduledSlot[] {
  const now = new Date();
  const dayIndex = now.getDay(); // 0 is Sunday
  const todayName = DAYS_ID[dayIndex];
  return WEEKLY_SCHEDULE.filter((s) => s.dayName === todayName);
}

function checkPublicationStatus(bookSlug: string, lang: "id" | "en") {
  const storyPath = path.resolve("./stories", bookSlug, "story.json");
  if (!existsSync(storyPath)) {
    return { yt: false, fb: false, ig: false, ready: false };
  }

  try {
    const raw = readFileSync(storyPath, "utf-8");
    const story = JSON.parse(raw);
    const pub = story.publications || {};

    const yt = !!(pub.youtube?.[lang]?.landscape || pub.youtube?.[lang]?.vertical || story.exports?.[lang]?.landscape?.youtubeId);
    const fb = !!(pub.facebook?.[lang]?.landscape || pub.facebook?.[lang]?.vertical || (lang === "id" && pub.facebook?.landscape));
    const ig = !!(pub.instagram?.[lang] || (lang === "id" && pub.instagram?.id));

    return { yt, fb, ig, ready: true, title: story.title || bookSlug };
  } catch {
    return { yt: false, fb: false, ig: false, ready: false };
  }
}

function sendMacNotification(title: string, message: string, sound = "Glass") {
  try {
    const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(
      /"/g,
      '\\"'
    )}" sound name "${sound}"`;
    execSync(`osascript -e '${script}'`);
    return true;
  } catch (err: any) {
    console.warn("⚠️ Could not send macOS notification:", err.message);
    return false;
  }
}

function printHeader() {
  console.log("\n==================================================================");
  console.log("📅 ZAYN STORYBOOK: EDITORIAL BROADCAST & CONTENT CALENDAR");
  console.log("==================================================================");
}

async function showToday() {
  printHeader();
  const now = new Date();
  const todayName = DAYS_ID[now.getDay()];
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  console.log(`📍 Hari Ini     : ${dateStr}`);
  console.log(`⏰ Waktu Lokal  : ${now.toLocaleTimeString("id-ID")} WIB`);
  console.log("==================================================================\n");

  const todaySlots = getTodaySlot();

  if (todaySlots.length === 0) {
    console.log("🌴 Hari ini tidak ada jadwal rilis wajib. Hari bebas untuk riset atau batch render.");
    return;
  }

  console.log(`🎯 JADWAL TAYANG HARI INI (${todaySlots.length} Tayangan):`);

  todaySlots.forEach((slot, idx) => {
    const status = checkPublicationStatus(slot.bookSlug, slot.lang);
    console.log(`\n[Slot ${idx + 1}] ⏰ ${slot.timeSlot} — ${slot.slotType}`);
    console.log(`   📖 Judul Buku    : ${status.title || slot.bookSlug} (${slot.lang.toUpperCase()})`);
    console.log(`   🎨 Tema / Nilai   : ${slot.theme}`);
    console.log(`   📐 Format Tayang : ${slot.format.toUpperCase()}`);
    console.log(`   📱 Platform      : ${slot.targetPlatforms.join(", ")}`);
    console.log(`   📊 Status Rilis  :`);
    console.log(`      - YouTube     : ${status.yt ? "✔ PUBLISHED" : "⏳ PENDING"}`);
    console.log(`      - Facebook    : ${status.fb ? "✔ PUBLISHED" : "⏳ PENDING"}`);
    console.log(`      - Instagram   : ${status.ig ? "✔ PUBLISHED" : "⏳ PENDING"}`);

    const allPublished = status.yt && status.fb && status.ig;
    if (allPublished) {
      console.log(`   🎉 SEMUA PLATFORM SUDAH LIVE UNTUK SLOT INI!`);
    } else {
      console.log(`\n   👉 Perintah 1-Klik untuk Rilis:`);
      console.log(`      npx tsx scripts/publish-all.ts --book ${slot.bookSlug} --lang ${slot.lang}`);
    }
  });

  console.log("\n------------------------------------------------------------------");
  console.log("💡 TIPS GOLDEN HOUR (KIDS CONTENT):");
  console.log("   Jam 19:00 - 20:00 WIB adalah waktu emas anak bersiap tidur.");
  console.log("   Pastikan video sudah siap dan live sebelum jam 19:00 WIB!");
  console.log("------------------------------------------------------------------\n");
}

function showCalendar() {
  printHeader();
  console.log("🗓️ JADWAL TAYANG MINGGUAN LENGKAP (ROTASI FASE 1):");
  console.log("==================================================================");

  let currentDay = "";
  WEEKLY_SCHEDULE.forEach((slot, i) => {
    if (slot.dayName !== currentDay) {
      currentDay = slot.dayName;
      console.log(`\n📌 ${currentDay.toUpperCase()}`);
    }
    const status = checkPublicationStatus(slot.bookSlug, slot.lang);
    const pubMark = status.yt && status.fb && status.ig ? "✔ [SEMUA LIVE]" : "⏳ [PENDING]";
    console.log(
      `   • [${slot.timeSlot}] ${slot.bookSlug} [${slot.lang.toUpperCase()}] — ${slot.slotType} ${pubMark}`
    );
    console.log(`     "${slot.theme}"`);
  });

  console.log("\n==================================================================");
  console.log("Keterangan:");
  console.log("• Pagi (08:30 WIB): Shorts/Reels keceriaan & humor akhir pekan.");
  console.log("• Malam (19:00/19:30 WIB): Dongeng sebelum tidur (Bedtime story 16:9 & Reels).");
  console.log("==================================================================\n");
}

function triggerReminder() {
  const todaySlots = getTodaySlot();
  if (todaySlots.length === 0) return;

  const slot = todaySlots[0];
  const title = `Zayn Storybook: Tayang Hari Ini!`;
  const message = `Pukul ${slot.timeSlot}: ${slot.bookSlug} (${slot.lang.toUpperCase()}) - ${slot.slotType}`;

  const sent = sendMacNotification(title, message, "Glass");
  if (sent) {
    console.log(`✔ Notifikasi macOS berhasil dikirimkan: "${message}"`);
  }
}

function setupCrontab() {
  console.log("\n⚙️ SETUP AUTO-REMINDER CRON (Mac OS)");
  console.log("==================================================================");
  const repoDir = process.cwd();
  const cronCommand = `0 18 * * * cd ${repoDir} && /usr/local/bin/node -r tsx/register scripts/content-calendar.ts --remind >> /tmp/zayn-storybook-cron.log 2>&1`;

  console.log("Perintah reminder otomatis disiapkan untuk berjalan setiap hari jam 18:00 WIB");
  console.log("(1 jam sebelum jam tayang utama 19:00 WIB).");
  console.log("\nBaris Crontab:");
  console.log(`  ${cronCommand}\n`);
  console.log("Untuk mengaktifkan ke sistem Mac Anda, jalankan:");
  console.log("  (crontab -l 2>/dev/null; echo \"0 18 * * * cd " + repoDir + " && npx tsx scripts/content-calendar.ts --remind\") | crontab -");
  console.log("==================================================================\n");
}

async function runChildCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

async function publishToday(dryRun: boolean, targetBook?: string, targetLang?: "id" | "en") {
  printHeader();
  let slots = getTodaySlot();
  if (targetBook) {
    slots = [
      {
        dayName: "Senin",
        timeSlot: "Now",
        slotType: "Prime Bedtime Story",
        bookSlug: targetBook,
        lang: targetLang || "id",
        format: "both",
        targetPlatforms: ["All"],
        theme: "Manual Broadcast Dispatch",
      },
    ];
  }

  if (slots.length === 0) {
    console.log("🌴 Hari ini tidak ada jadwal rilis wajib.");
    return;
  }

  for (const slot of slots) {
    console.log(`\n🚀 Memproses Jadwal: ${slot.bookSlug} [${slot.lang.toUpperCase()}]`);
    const status = checkPublicationStatus(slot.bookSlug, slot.lang);

    if (status.yt && status.fb && status.ig && !dryRun) {
      console.log(`✔ [ALREADY LIVE] Buku ${slot.bookSlug} (${slot.lang}) sudah terbit di semua platform. Lewati.`);
      continue;
    }

    // Step 1: Cek apakah file video sudah ada; jika belum, render otomatis!
    const storyDir = path.resolve("./stories", slot.bookSlug);
    const storyJson = JSON.parse(await fs.readFile(path.join(storyDir, "story.json"), "utf-8"));
    const vertPath = storyJson.exports?.[slot.lang]?.vertical?.path ? path.join(storyDir, storyJson.exports[slot.lang].vertical.path) : null;
    const landPath = storyJson.exports?.[slot.lang]?.landscape?.path ? path.join(storyDir, storyJson.exports[slot.lang].landscape.path) : null;

    const needRender = !vertPath || !existsSync(vertPath) || !landPath || !existsSync(landPath);

    if (needRender) {
      console.log(`⚙️ Video belum ada di disk. Menjalankan render Remotion otomatis...`);
      const renderArgs = ["scripts/render-book.ts", "--book", slot.bookSlug, "--lang", slot.lang, "--format", slot.format];
      await runChildCommand("npx", ["tsx", ...renderArgs]);
    }

    // Step 2: Jalankan sync & upload ke semua platform
    console.log(`📡 Mempublikasikan ke platform tujuan...`);
    const publishArgs = ["scripts/publish-all.ts", "--book", slot.bookSlug, "--lang", slot.lang];
    if (dryRun) publishArgs.push("--dry-run");

    await runChildCommand("npx", ["tsx", ...publishArgs]);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--calendar") || args.includes("--all") || args.includes("-a")) {
    showCalendar();
  } else if (args.includes("--remind")) {
    triggerReminder();
  } else if (args.includes("--cron")) {
    setupCrontab();
  } else if (args.includes("--publish-today") || args.includes("--run-today")) {
    const dryRun = args.includes("--dry-run");
    const bookIdx = args.indexOf("--book");
    const book = bookIdx !== -1 && args[bookIdx + 1] !== "auto" ? args[bookIdx + 1] : undefined;
    const langIdx = args.indexOf("--lang");
    const lang = langIdx !== -1 && (args[langIdx + 1] === "id" || args[langIdx + 1] === "en") ? args[langIdx + 1] as "id" | "en" : undefined;
    await publishToday(dryRun, book, lang);
  } else {
    await showToday();
  }
}

main().catch(console.error);
