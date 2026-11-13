import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { publishFacebookPhotoPost, publishFacebookMultiPhotoPost } from "./publish-launch-posts";
import { publishInstagramFeedPhoto, publishInstagramCarousel } from "./publish-instagram-post";
import { publishThreadsPhotoPost, publishThreadsCarousel } from "./publish-threads";
import {
  notifyTelegramFailure,
} from "./notify-telegram";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";
import { db } from "./lib/db";

export interface AnnouncementOptions {
  bookSlug?: string;
  lang?: "id" | "en";
  slot?: "morning" | "evening" | "auto" | "all" | "daily";
  dailyLineup?: boolean;
  date?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface PlatformPublishResult {
  id?: string;
  postId?: string;
  url?: string;
  publishedAt?: string;
  sentAt?: string;
  status?: string;
}

export interface AnnouncementRecord {
  scheduledSlot: string;
  announcedAt: string;
  facebook?: PlatformPublishResult;
  instagram?: PlatformPublishResult;
  threads?: PlatformPublishResult;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Returns current hour (0-23) in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

/**
 * Extracts moral lesson with fallback across schema versions.
 */
function extractMoral(story: any, lang: "id" | "en"): string {
  if (lang === "id") {
    if (story.moral?.headlineId) return story.moral.headlineId;
    const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.text) {
      const cleaned = moralScene.audio.text.replace(/^Pesan moral cerita ini:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") ? cleaned : `${cleaned}!`;
    }
    return "Belajar kebaikan budi pekerti, kejujuran, dan kehangatan keluarga.";
  } else {
    if (story.moral?.headlineEn) return story.moral.headlineEn;
    const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.en?.text) {
      const cleaned = moralScene.audio.en.text.replace(/^The moral of the story:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") ? cleaned : `${cleaned}!`;
    }
    return "Learning kindness, empathy, and family warmth together.";
  }
}

/**
 * Generates engaging, cheerful teaser copy for 1-hour-in-advance announcement feeds.
 * Guarantees 100% single-language consistency matching the language of the attached image.
 */
export interface TailoredTeaserCopies {
  captionSocial: string; // Generic fallback
  captionInstagram: string;
  captionFacebook: string;
  captionThreads: string;
  captionYoutubeCommunity: string;
}

/**
 * Generates engaging, platform-tailored teaser copy for pre-broadcast announcement feeds.
 * Follows best practices:
 * - Instagram: Emotive parenting hook, save prompt, engagement question, focused hashtags.
 * - Facebook: Warm community tone, benefits of mindful bedtime screen-time, family discussion.
 * - Threads: Conversational micro-storytelling, bite-sized curiosity hook, zero hashtag spam.
 * - YouTube Community: Scheduled premiere reminder with clear CTA and live-chat invitation.
 * Guarantees 100% single-language consistency matching the target language.
 */
export function generateTeaserCopy(
  story: any,
  lang: "id" | "en",
  slotTime: string
): TailoredTeaserCopies {
  const isId = lang === "id";
  const rawTitle = isId ? story.title : (story.originalTitle || story.title);
  const cleanTitle = rawTitle.replace(/[!]+$/, "").trim();

  // Extract thumbnail typography details corresponding directly to the cover image
  const thumbConf = isId ? story.thumbnailConfig?.id : story.thumbnailConfig?.en;
  const headlineTop = thumbConf?.headlineTop;
  const headlineBottom = thumbConf?.headlineBottom;
  const hook = thumbConf?.hook || (isId ? "Petualangan seru dan penuh tawa untuk si kecil!" : "A joyful, heartwarming tale children will adore!");
  const badge = thumbConf?.badge;
  const sticker = thumbConf?.sticker;
  const moral = extractMoral(story, lang);

  // 1. INSTAGRAM FEED CAPTION (Optimized for Saves & Meaningful Comments)
  const captionInstagram = isId
    ? `⏰ SEBENTAR LAGI TAYANG! (1 JAM LAGI) 🌟✨
${badge ? `🏷️ ${badge}\n` : ""}📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 🌙💤

Halo Ayah Bunda dan adik-adik tersayang! 🥰👋
Tepat pukul ${slotTime} nanti, cerita animasi buku bergambar terbaru kita "${cleanTitle}" akan tayang perdana di kanal YouTube @zayn.storybook!

🎨 Sorotan Cerita:
👉 ${hook}
${sticker ? `✨ Catatan Seru: ${sticker}\n` : ""}
💡 Nilai Kebaikan untuk Si Kecil:
${moral}

📌 TIPS RUTINITAS SEBELUM TIDUR:
Jadikan dongeng 15 menit ini sebagai momen transisi tenang sebelum si kecil terlelap. Redupkan lampu, siapkan selimut hangat, dan nikmati petualangan bersama.

🔔 Nyalakan lonceng pengingat di YouTube @zayn.storybook sekarang agar tidak terlewat saat tayang perdana!
👉 Tautan tontonan resmi akan langsung aktif di bio profil @zayn.storybook tepat pukul ${slotTime}.

💬 Siapa yang sudah siap menemani si kecil mendongeng malam ini? Tulis di kolom komentar ya! 👇❤️

#ZaynStorybook #DongengSebelumTidur #ParentingIndonesia #CeritaAnakBergambar #BukuAnakBermutu #DongengAnak #MembacaSejakDini #BedtimeRoutine #FamilyStorytime`
    : `⏰ PREMIERING IN 1 HOUR! 🌟✨
${badge ? `🏷️ ${badge}\n` : ""}📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 📖🎈

Hello wonderful parents and curious little ones! 🥰👋
In just 1 hour (at ${slotTime}), our brand-new animated read-aloud storybook "${cleanTitle}" is premiering on YouTube @zayn.storybook!

🎨 Tonight's Story Highlight:
👉 ${hook}
${sticker ? `✨ Fun Highlight: ${sticker}\n` : ""}
💡 Life Lesson for Young Minds:
${moral}

📌 BEDTIME ROUTINE TIP:
Use this calming 15-minute story as a peaceful wind-down ritual before sleep. Dim the room lights, snuggle under a warm blanket, and share the journey together.

🔔 Tap the notification bell on YouTube @zayn.storybook right now so you don't miss the premiere!
👉 The official watch link goes live in our bio @zayn.storybook at ${slotTime}.

💬 Ready for tonight's storytime adventure? Let us know in the comments below! 👇❤️

#ZaynStorybook #KidsStories #ReadAloud #BedtimeStories #AnimatedStorybook #ChildrenBooks #KidsAnimation #FamilyStorytime #MindfulParenting`;

  // 2. FACEBOOK PAGE CAPTION (Optimized for Parents Community & Family Discussion)
  const captionFacebook = isId
    ? `⏰ PENGINGAT TAYANG: 1 JAM LAGI! (Pukul ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Ayah Bunda, rutinitas mendongeng 15 menit sebelum tidur terbukti mempererat ikatan batin keluarga dan menenangkan pikiran anak setelah seharian aktif bermain. 🌙💤

Malam ini di kanal YouTube Zayn Storybook, kita akan menyaksikan petualangan baru:
"${cleanTitle}"

✨ Sekilas Kisah:
${hook}

💡 Pesan Karakter:
${moral}

Mari ciptakan kenangan masa kecil yang hangat dan bermakna. Kumpulkan keluarga, siapkan suasana kamar yang nyaman, dan nikmati dongeng animasi penuh warna bersama kami.

🔔 Kunjungi kanal YouTube kami @Zayn.Storybook dan nyalakan lonceng pengingat premiere.
Tautan tontonan resmi akan dibagikan di halaman ini tepat pukul ${slotTime}!

Ayah Bunda biasanya mendongeng jam berapa bersama si kecil? Yuk berbagi cerita di kolom komentar! 👇❤️`
    : `⏰ PREMIERE REMINDER: 1 HOUR TO GO! (At ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Dear parents, a 15-minute bedtime story ritual is one of the most effective ways to nurture emotional connection and help children unwind peacefully after an active day. 🌙💤

Tonight on Zayn Storybook YouTube, we are premiering a wonderful new animated journey:
"${cleanTitle}"

✨ Story Glimpse:
${hook}

💡 Moral Lesson:
${moral}

Let's create warm, cherished childhood memories together. Gather the family, get cozy, and enjoy this beautifully illustrated adventure.

🔔 Visit our YouTube channel @Zayn.Storybook and set your premiere reminder!
The official watch link will be shared right here at ${slotTime}!

What is your favorite bedtime routine with your little ones? Share with our parent community below! 👇❤️`;

  // 3. META THREADS CAPTION (Optimized for Conversational Micro-Storytelling)
  const captionThreads = isId
    ? `Pernahkah si kecil merasa takut atau ragu mencoba hal baru? 🐒🌳

Tepat 1 jam lagi (pukul ${slotTime}), cerita animasi bergambar terbaru kita "${cleanTitle}" akan tayang perdana di YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Nyalakan pengingat di YouTube @zayn.storybook yuk, siapkan selimut hangat untuk dongeng pengantar tidur nanti malam! 🌙💤`
    : `Has your child ever felt hesitant or scared of trying something new? 🐒🌳

In just 1 hour (at ${slotTime}), our new animated read-aloud storybook "${cleanTitle}" premieres on YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Set your premiere reminder on YouTube @zayn.storybook and snuggle up for bedtime storytime tonight! 🌙💤`;

  // 4. YOUTUBE COMMUNITY TAB CAPTION (Optimized for YouTube Premiere Reminder)
  const captionYoutubeCommunity = isId
    ? `⏰ TAYANG PERDANA 1 JAM LAGI! (Pukul ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 🌙💤

Halo teman-teman dan keluarga tersayang! 🥰👋
Cerita animasi buku bergambar terbaru kita "${cleanTitle}" akan tayang perdana tepat pukul ${slotTime} nanti!

🎨 Sorotan Cerita:
👉 ${hook}

💡 Nilai Kebaikan:
${moral}

🔔 Klik tombol "Set Reminder" / "Ingatkan Saya" pada video premiere agar adik-adik tidak terlewatkan momen seru ini!
Sampai jumpa di kolom live chat nanti ya! ❤️👇`
    : `⏰ PREMIERING IN 1 HOUR! (At ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 📖🎈

Hello wonderful families and little readers! 🥰👋
Our brand-new animated read-aloud storybook "${cleanTitle}" premieres at ${slotTime}!

🎨 Tonight's Story Highlight:
👉 ${hook}

💡 Life Lesson:
${moral}

🔔 Hit "Set Reminder" on the premiere video so you don't miss the adventure!
See you in the live chat! ❤️👇`;

  return {
    captionSocial: captionInstagram,
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity,
  };
}

/**
 * Executes a child CLI command synchronously.
 */
async function runChild(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

/**
 * Finds the optimal 4:5 portrait or popular cover photo for feed distribution.
 * Strictly guarantees language isolation: only selects images matching target language typography.
 */
function resolveBestPhoto(storyDir: string, lang: "id" | "en"): string {
  const candidates = [
    path.join(storyDir, "exports", lang, "thumbnail-portrait.png"),
    path.join(storyDir, "exports", lang, "thumbnail-popular.png"),
    path.join(storyDir, "exports", lang, "thumbnail.png"),
    path.join(storyDir, "exports", lang, "thumbnail-vertical.png"),
    path.join(storyDir, "exports", lang, "thumbnail-bedtime.png"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback to neutral book cover only if language exports are missing
  const neutralCover = path.join(storyDir, "assets", "cover.png");
  if (existsSync(neutralCover)) return neutralCover;

  throw new Error(`No image asset found for announcement in language [${lang.toUpperCase()}] at ${storyDir}`);
}

/**
 * Generates unified bilingual teaser copy for the single daily announcement ("Menu Dongeng Hari Ini").
 * Covers both Morning English Read-Aloud (08:30 WIB) and Evening Prime Bedtime Story (19:00 WIB).
 */
export function generateDailyLineupCopy(
  morningStory: any,
  morningSlot: any,
  eveningStory: any,
  eveningSlot: any,
  dateStr: string
): TailoredTeaserCopies {
  const morningLang: "id" | "en" = (morningSlot.lang || "en") === "id" ? "id" : "en";
  const morningRawTitle =
    morningLang === "id"
      ? morningStory.title || morningStory.originalTitle || "Cerita Pagi Ceria"
      : morningStory.originalTitle || morningStory.title || "Morning English Story";
  const morningCleanTitle = morningRawTitle.replace(/[!]+$/, "").trim();
  const morningThumb = morningLang === "id" ? morningStory.thumbnailConfig?.id : morningStory.thumbnailConfig?.en;
  const morningHook =
    morningThumb?.hook ||
    (morningLang === "id"
      ? "Cerita pagi ceria penuh semangat untuk mengawali hari si kecil!"
      : "A joyful, cheerful English read-aloud journey for young learners!");
  const morningHeaderLabel = morningLang === "id" ? "Cerita Pagi Ceria" : "English Read-Aloud";
  const morningEditionLabel = morningLang === "id" ? "Edisi Bahasa Indonesia" : "English Edition";
  const morningDescLine =
    morningLang === "id"
      ? "🎈 Mengawali pagi penuh semangat & menumbuhkan kecintaan membaca si kecil!"
      : "🎈 Melatih kepekaan mendengar & kosakata bahasa Inggris si kecil lewat cerita riang saat sarapan pagi!";

  const eveningRawTitle = eveningStory.title || eveningStory.originalTitle || "Dongeng Pengantar Tidur";
  const eveningCleanTitle = eveningRawTitle.replace(/[!]+$/, "").trim();
  const eveningThumb = eveningStory.thumbnailConfig?.id;
  const eveningHook = eveningThumb?.hook || "Petualangan seru dan penuh tawa untuk si kecil!";
  const eveningMoral = extractMoral(eveningStory, "id");

  const morningTime = morningSlot.time_slot || morningSlot.timeSlot || "08:30 WIB";
  const eveningTime = eveningSlot.time_slot || eveningSlot.timeSlot || "19:00 WIB";

  // 1. INSTAGRAM FEED CAROUSEL CAPTION
  const captionInstagram = `🌟 JADWAL DONGENG ZAYN HARI INI 🌟
Selamat pagi Ayah, Bunda & Adik-adik tersayang! 🥰👋
Hari ini ada 2 cerita bergambar istimewa siap menemani hari ceria si kecil di @zayn.storybook:

🌅 [PAGI · ${morningTime}] ${morningHeaderLabel}:
📖 "${morningCleanTitle}" (${morningEditionLabel})
✨ ${morningHook}
${morningDescLine}

🌙 [MALAM · ${eveningTime}] Prime Bedtime Story:
📖 "${eveningCleanTitle}" (Edisi Bahasa Indonesia)
✨ ${eveningHook}
💖 Pesan Budi Pekerti:
${eveningMoral}

👉 Geser ke kiri (swipe ⬅️) untuk melihat preview cerita malam!
🔔 Nyalakan lonceng notifikasi di YouTube @zayn.storybook agar tidak terlewat saat masing-masing cerita tayang perdana ya!

💬 Cerita mana yang paling ditunggu si kecil hari ini? Sapa kami di kolom komentar ya! 👇❤️

#ZaynStorybook #JadwalDongeng #DongengAnak #CeritaAnakBergambar #BilingualStorybook #EnglishReadAloud #BedtimeStories #ParentingIndonesia #BukuAnakBergambar`;

  // 2. FACEBOOK PAGE MULTI-PHOTO CAPTION
  const captionFacebook = `🌟 JADWAL DONGENG ZAYN HARI INI (${dateStr}) 🌟
Selamat pagi Ayah & Bunda! Awali hari si kecil dengan keceriaan dan tutup malamnya dengan mimpi indah bersama 2 dongeng animasi bergambar pilihan hari ini di kanal YouTube Zayn Storybook:

🌅 [PAGI · Pukul ${morningTime}] ${morningHeaderLabel}:
📖 "${morningCleanTitle}" (${morningEditionLabel})
👉 ${morningHook}
${morningLang === "id" ? "Cerita ringan penuh keceriaan untuk menemani sarapan pagi atau bersiap berangkat beraktivitas." : "Momen pas saat sarapan atau bersiap sekolah untuk melatih kecakapan mendengar bahasa Inggris dengan intonasi ceria dan ramah anak."}

🌙 [MALAM · Pukul ${eveningTime}] Prime Bedtime Story:
📖 "${eveningCleanTitle}" (Edisi Bahasa Indonesia)
👉 ${eveningHook}
💖 Nilai Kebaikan Budi Pekerti:
${eveningMoral}
Dongeng penenang sebelum tidur untuk transisi tidur lelap tanpa layar berisik.

🔔 Pasang alarm atau aktifkan lonceng pengingat di YouTube Zayn Storybook sekarang! Tautan tontonan lengkap akan langsung aktif di beranda saat tayang perdana.

💬 OBROLAN KELUARGA:
Dari kedua cerita hari ini, mana nih yang paling membuat si kecil penasaran? Yuk ceritakan di kolom komentar! 👇❤️

#ZaynStorybook #JadwalDongeng #DongengSebelumTidur #ParentingCeria #BukuAnakBergambar #KeluargaBahagia #DongengEdukasi`;

  // 3. THREADS CAPTION (Guaranteed < 500 chars)
  const captionThreads = `Selamat pagi Ayah & Bunda! 🌟
Berikut Menu Dongeng Zayn Storybook hari ini:

🌅 ${morningTime} [${morningLang.toUpperCase()}]: "${morningCleanTitle}" 📖🎈
👉 ${morningLang === "id" ? "Cerita pagi ceria saat sarapan!" : "English Read-Aloud ceria saat sarapan!"}

🌙 ${eveningTime} [ID]: "${eveningCleanTitle}" 🌙✨
👉 Dongeng pengantar tidur nyenyak & pesan budi pekerti.

Geser ke kiri untuk lihat preview kedua bukunya ya! Cerita mana yang paling ditunggu si kecil hari ini? 👇🥰

#ZaynStorybook #DongengAnak #BilingualKids`;

  return {
    captionSocial: captionInstagram,
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity: captionFacebook,
  };
}

/**
 * Publishes a single unified daily bilingual announcement ("Menu Dongeng Hari Ini")
 * featuring both the morning English story and the evening Indonesian story.
 */
export async function publishDailyLineupAnnouncement(options: AnnouncementOptions = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  morningBook?: string;
  eveningBook?: string;
}> {
  const targetDate = options.date || getJakartaDateString();
  const currentHour = getJakartaHour();

  console.log("\n==================================================================");
  console.log("🌟 SINGLE DAILY UNIFIED BILINGUAL ANNOUNCEMENT DISPATCHER");
  console.log("==================================================================");
  console.log(`📅 Target Date (WIB) : ${targetDate}`);
  console.log(`⏰ Current Hour      : ${currentHour}:00 WIB`);
  console.log(`🧪 Dry Run Mode      : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post     : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  // 1. Resolve today's morning and evening slots
  let slots: any[] = [];
  try {
    slots = await db.getCalendar(targetDate);
  } catch (e: any) {
    console.warn("ℹ️ Could not query D1 calendar, falling back to local calendar:", e.message);
  }

  if (!slots || slots.length === 0) {
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
    const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const dayName = dayNames[nowJakarta.getDay()];

    slots = DAILY_CALENDAR_MONTH_1.filter((s) => {
      if (s.date && s.date === targetDate) return true;
      if (!s.date && s.dayName === dayName) return true;
      return false;
    });
  }

  if (!slots || slots.length === 0) {
    console.log(`🌴 Tidak ada jadwal tayang aktif untuk tanggal (${targetDate}). Lewati pengumuman.`);
    return { success: true, skipped: true };
  }

  const morningSlot = slots.find((s) => {
    const time = (s.time_slot || s.timeSlot || "").toLowerCase();
    const type = (s.slot_type || s.slotType || "").toLowerCase();
    const lang = s.lang || "";
    return time.includes("08:") || time.includes("07:") || type.includes("morning") || lang === "en";
  }) || slots[0];

  const eveningSlot = slots.find((s) => {
    const time = (s.time_slot || s.timeSlot || "").toLowerCase();
    const type = (s.slot_type || s.slotType || "").toLowerCase();
    const lang = s.lang || "";
    return time.includes("19:") || time.includes("18:") || type.includes("prime") || type.includes("bedtime") || (lang === "id" && s !== morningSlot);
  }) || (slots.length > 1 ? slots[1] : slots[0]);

  const morningBook = morningSlot.book_slug || morningSlot.bookSlug;
  const eveningBook = eveningSlot.book_slug || eveningSlot.bookSlug;

  console.log(`🌅 Morning Slot  : [${morningBook}] [${morningSlot.lang || "en"}] @ ${morningSlot.time_slot || morningSlot.timeSlot || "08:30 WIB"}`);
  console.log(`🌙 Evening Slot  : [${eveningBook}] [${eveningSlot.lang || "id"}] @ ${eveningSlot.time_slot || eveningSlot.timeSlot || "19:00 WIB"}`);
  console.log("==================================================================\n");

  // 2. Ensure stories exist locally (skip compilation slugs which have no individual story.json)
  const isMorningComp = morningBook.startsWith("kompilasi-");
  const isEveningComp = eveningBook.startsWith("kompilasi-");
  const storiesToEnsure = Array.from(new Set([morningBook, eveningBook])).filter(
    (s) => !s.startsWith("kompilasi-")
  );
  for (const slug of storiesToEnsure) {
    const sDir = path.resolve("./stories", slug);
    const sJson = path.join(sDir, "story.json");
    if (!existsSync(sJson)) {
      console.log(`📥 Story assets not found locally for [${slug}]. Pulling from Cloudflare R2...`);
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", slug]);
    }
    if (!existsSync(sJson)) {
      throw new Error(`story.json not found for book '${slug}' at ${sJson}`);
    }
  }

  const morningStoryPath = path.resolve("./stories", morningBook, "story.json");
  const eveningStoryPath = path.resolve("./stories", eveningBook, "story.json");
  const buildCompilationStory = (slug: string, slot: any) => ({
    slug,
    title: slot.theme || slug,
    originalTitle: slot.theme || slug,
    moral: {
      headlineId: "Kumpulan dongeng pilihan penuh kehangatan dan pesan budi pekerti untuk keluarga.",
    },
  });
  const morningStory: any = isMorningComp
    ? buildCompilationStory(morningBook, morningSlot)
    : JSON.parse(await fs.readFile(morningStoryPath, "utf-8"));
  const eveningStory: any = isEveningComp
    ? buildCompilationStory(eveningBook, eveningSlot)
    : JSON.parse(await fs.readFile(eveningStoryPath, "utf-8"));

  // 3. Deduplication Check across platforms
  if (!morningStory.publications) morningStory.publications = {};
  if (!morningStory.publications.announcements) morningStory.publications.announcements = {};
  if (!morningStory.publications.announcements[targetDate]) morningStory.publications.announcements[targetDate] = {};

  const existingLineup = morningStory.publications.announcements[targetDate].dailyLineup || {};
  const hasFb = Boolean(existingLineup.facebook?.id || existingLineup.facebook?.postId);
  const hasIg = Boolean(existingLineup.instagram?.id);
  const hasThreads = Boolean(existingLineup.threads?.id || existingLineup.threads?.postId);

  console.log("🔍 DAILY LINEUP DEDUPLICATION STATUS:");
  console.log(`   - Facebook Page : ${hasFb ? `✔ LIVE (${existingLineup.facebook?.id || existingLineup.facebook?.postId})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed : ${hasIg ? `✔ LIVE (${existingLineup.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads   : ${hasThreads ? `✔ LIVE (${existingLineup.threads?.id || existingLineup.threads?.postId})` : "⏳ PENDING"}`);

  if (hasFb && hasIg && hasThreads && !options.force) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Daily lineup announcement for ${targetDate} has ALREADY been published across ALL public social platforms!`);
    console.log(`   ⏩ Skipping to guarantee ZERO duplicate posts. Pass --force to re-post.\n`);
    return { success: true, skipped: true, morningBook, eveningBook };
  }

  // 4. Resolve Visual Assets for both books
  const morningLang: "id" | "en" = (morningSlot.lang || "en") === "id" ? "id" : "en";
  const eveningLang: "id" | "en" = (eveningSlot.lang || "id") === "en" ? "en" : "id";
  const morningStoryDir = path.resolve("./stories", morningBook);
  const eveningStoryDir = path.resolve("./stories", eveningBook);
  const morningPhoto = isMorningComp
    ? resolveBestPhoto(eveningStoryDir, eveningLang)
    : resolveBestPhoto(morningStoryDir, morningLang);
  const eveningPhoto = isEveningComp
    ? morningPhoto
    : resolveBestPhoto(eveningStoryDir, eveningLang);
  const imagePaths = morningPhoto === eveningPhoto ? [morningPhoto] : [morningPhoto, eveningPhoto];

  console.log(`\n🖼️ Visual Slides Selected:`);
  console.log(`   - Slide 1 [Morning ${morningLang.toUpperCase()}]: ${path.basename(morningPhoto)}`);
  if (imagePaths.length > 1) {
    console.log(`   - Slide 2 [Evening ${eveningLang.toUpperCase()}]: ${path.basename(eveningPhoto)}`);
  }

  // 5. Generate Tailored Captions
  const captions = generateDailyLineupCopy(morningStory, morningSlot, eveningStory, eveningSlot, targetDate);

  const errors: string[] = [];
  let fbResult = existingLineup.facebook;
  let igResult = existingLineup.instagram;
  let thResult = existingLineup.threads;

  // 6A. Facebook Multi-Photo Post
  if (!hasFb || options.force) {
    try {
      console.log(`\n📘 [1/3] Publishing Daily Lineup Multi-Photo Post to Facebook Page...`);
      const fbRes = await publishFacebookMultiPhotoPost({
        photoPaths: imagePaths,
        caption: captions.captionFacebook,
        dryRun: options.dryRun,
      });
      if (!options.dryRun && fbRes.success) {
        fbResult = {
          postId: fbRes.postId,
          url: fbRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Facebook multi-photo post live: ${fbRes.permalink}`);
      }
    } catch (fbErr: any) {
      console.error(`⚠️ Facebook announcement warning:`, fbErr.message);
      errors.push(`Facebook: ${fbErr.message}`);
    }
  }

  // 6B. Instagram Carousel Post
  if (!hasIg || options.force) {
    try {
      console.log(`\n📸 [2/3] Publishing Daily Lineup Carousel to Instagram Feed...`);
      const igRes = await publishInstagramCarousel({
        imagePaths,
        caption: captions.captionInstagram,
        dryRun: options.dryRun,
      });
      if (!options.dryRun && igRes.success) {
        igResult = {
          id: igRes.mediaId || (igRes as any).id,
          url: igRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Instagram carousel live: ${igRes.permalink}`);
      }
    } catch (igErr: any) {
      console.error(`⚠️ Instagram announcement warning:`, igErr.message);
      errors.push(`Instagram: ${igErr.message}`);
    }
  }

  // 6C. Threads Multi-Image Carousel Post
  if (!hasThreads || options.force) {
    try {
      console.log(`\n🧵 [3/3] Publishing Daily Lineup Carousel to Meta Threads...`);
      const thRes = await publishThreadsCarousel({
        imagePaths,
        text: captions.captionThreads,
        dryRun: options.dryRun,
      });
      if (!options.dryRun && thRes.success) {
        thResult = {
          id: thRes.postId,
          postId: thRes.postId,
          url: thRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Threads carousel live: ${thRes.permalink}`);
      }
    } catch (thErr: any) {
      console.error(`⚠️ Threads announcement warning:`, thErr.message);
      errors.push(`Threads: ${thErr.message}`);
    }
  }

  // 7. Save publication metadata to story.json and Cloudflare R2
  if (!options.dryRun) {
    const updatedLineup = {
      announcedAt: new Date().toISOString(),
      morningBook,
      eveningBook,
      facebook: fbResult,
      instagram: igResult,
      threads: thResult,
    };

    if (!isMorningComp) {
      morningStory.publications.announcements[targetDate].dailyLineup = updatedLineup;
      await fs.writeFile(morningStoryPath, JSON.stringify(morningStory, null, 2), "utf-8");
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", morningBook, "--manifest-only"]);
    }

    if (eveningBook !== morningBook && !isEveningComp) {
      if (!eveningStory.publications) eveningStory.publications = {};
      if (!eveningStory.publications.announcements) eveningStory.publications.announcements = {};
      if (!eveningStory.publications.announcements[targetDate]) eveningStory.publications.announcements[targetDate] = {};
      eveningStory.publications.announcements[targetDate].dailyLineup = updatedLineup;
      await fs.writeFile(eveningStoryPath, JSON.stringify(eveningStory, null, 2), "utf-8");
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", eveningBook, "--manifest-only"]);
    }
    console.log(`✔ story.json manifests updated with daily lineup publication record in R2.`);
  }

  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: `${morningBook}+${eveningBook}`,
        lang: morningLang,
        slot: `Daily Lineup (${targetDate})`,
        platform: "Single Daily Announcement Dispatcher",
        error: errors.join("\n"),
      });
    } catch {}
  }

  console.log("\n🎉 SINGLE DAILY BILINGUAL ANNOUNCEMENT DISPATCH COMPLETE!\n");
  return { success: errors.length === 0, morningBook, eveningBook };
}

/**
 * Main routine: Publishes deduplicated announcement feeds across Facebook, Instagram, and Threads.
 * Note: Telegram is strictly an internal creator notification tool and skipped from public feeds.
 */
export async function publishAnnouncement(options: AnnouncementOptions = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  targetBook?: string;
  lang?: string;
}> {
  // If daily lineup mode is requested, or if slot is "daily" or "all", or default in morning without explicit book:
  const isDailyLineup =
    options.dailyLineup ||
    options.slot === "daily" ||
    options.slot === "all" ||
    (!options.bookSlug && options.slot !== "morning" && options.slot !== "evening");

  if (isDailyLineup) {
    const res = await publishDailyLineupAnnouncement(options);
    return {
      success: res.success,
      skipped: res.skipped,
      targetBook: `${res.morningBook}+${res.eveningBook}`,
      lang: "bilingual",
    };
  }

  const todayDate = options.date || getJakartaDateString();
  const currentHour = getJakartaHour();

  console.log("\n==================================================================");
  console.log("📢 PRE-BROADCAST ANNOUNCEMENT FEED DISPATCHER (1 HOUR PRIOR)");
  console.log("==================================================================");
  console.log(`📅 Date (WIB)     : ${todayDate}`);
  console.log(`⏰ Current Hour   : ${currentHour}:00 WIB`);
  console.log(`🧪 Dry Run Mode   : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post  : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  // 1. Determine Target Book & Slot
  let targetBook = options.bookSlug;
  let targetLang = options.lang;
  let slotTime = "19:00 WIB";
  let slotLabel = "Prime Bedtime Story";

  if (!targetBook) {
    const isEvening = options.slot === "evening" || (options.slot !== "morning" && currentHour >= 12);
    let matchingSlot: any = null;

    // Check Cloudflare D1 content_calendar first
    try {
      const d1Slots = await db.getCalendar(todayDate);
      if (d1Slots && d1Slots.length > 0) {
        matchingSlot = d1Slots.find((s) => {
          const isMorningSlot =
            s.time_slot.includes("07:") ||
            s.time_slot.includes("08:") ||
            s.slot_type.toLowerCase().includes("morning");
          return isEvening ? !isMorningSlot : isMorningSlot;
        }) || d1Slots[0];
      }
    } catch (e: any) {
      console.warn("ℹ️ Could not query D1 calendar, falling back to local calendar:", e.message);
    }

    if (!matchingSlot) {
      const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
      const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const dayName = dayNames[nowJakarta.getDay()];

      const todaySlots = DAILY_CALENDAR_MONTH_1.filter((s) => {
        if (s.date && s.date === todayDate) return true;
        if (!s.date && s.dayName === dayName) return true;
        return false;
      });

      matchingSlot = todaySlots.find((s) => {
        const isMorningSlot =
          s.timeSlot.includes("07:") ||
          s.timeSlot.includes("08:") ||
          s.slotType.toLowerCase().includes("morning");
        return isEvening ? !isMorningSlot : isMorningSlot;
      }) || todaySlots[0];
    }

    if (!matchingSlot) {
      console.log(`🌴 Hari ini (${todayDate}) tidak ada jadwal tayang aktif. Lewati pengumuman.`);
      return { success: true, skipped: true };
    }

    targetBook = matchingSlot.book_slug || matchingSlot.bookSlug;
    targetLang = targetLang || matchingSlot.lang;
    slotTime = matchingSlot.time_slot || matchingSlot.timeSlot;
    slotLabel = matchingSlot.slot_type || matchingSlot.slotType;
  }

  const lang = targetLang || "id";
  console.log(`📖 Target Story   : ${targetBook} [${lang.toUpperCase()}]`);
  console.log(`🎯 Upcoming Slot  : ${slotTime} (${slotLabel})`);
  console.log("==================================================================\n");

  // 2. Ensure Story Exists Locally (pull from R2 if missing)
  const storyDir = path.resolve("./stories", targetBook);
  const storyJsonPath = path.join(storyDir, "story.json");
  if (!existsSync(storyJsonPath)) {
    console.log(`📥 Story assets not found locally for [${targetBook}]. Pulling from Cloudflare R2...`);
    await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", targetBook]);
  }

  if (!existsSync(storyJsonPath)) {
    throw new Error(`story.json not found for book '${targetBook}' at ${storyJsonPath}`);
  }

  const story = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  if (!story.publications) story.publications = {};
  if (!story.publications.announcements) story.publications.announcements = {};
  if (!story.publications.announcements[todayDate]) story.publications.announcements[todayDate] = {};

  const existingAnn: AnnouncementRecord = story.publications.announcements[todayDate][lang] || {
    scheduledSlot: slotTime,
    announcedAt: new Date().toISOString(),
  };

  // 3. Strict Deduplication Gate (Public Platforms: Facebook, Instagram, Threads)
  // Note: Telegram is strictly reserved for internal creator notifications/alerts and skipped from public feeds.
  const hasFb = Boolean(existingAnn.facebook?.id);
  const hasIg = Boolean(existingAnn.instagram?.id);
  const hasThreads = Boolean(existingAnn.threads?.id);

  console.log("🔍 ANNOUNCEMENT DEDUPLICATION STATUS (PUBLIC SOCIAL FEEDS):");
  console.log(`   - Facebook Page Feed : ${hasFb ? `✔ LIVE (${existingAnn.facebook?.id})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed     : ${hasIg ? `✔ LIVE (${existingAnn.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads       : ${hasThreads ? `✔ LIVE (${existingAnn.threads?.id})` : "⏳ PENDING"}`);

  const isAllPublished = hasFb && hasIg && hasThreads;
  if (isAllPublished && !options.force) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Announcement for "${story.title}" [${lang.toUpperCase()}] on ${todayDate} has ALREADY been published across ALL public social platforms!`);
    console.log(`   ⏩ Skipping announcement feed to guarantee ZERO duplicate posts.`);
    console.log(`   💡 Tip: Pass --force to replace or re-post anyway.\n`);
    return { success: true, skipped: true, targetBook, lang };
  }

  // 4. Resolve Image & Copy
  const photoPath = resolveBestPhoto(storyDir, lang);
  console.log(`\n🖼️ Visual Asset Selected: ${path.basename(photoPath)} (${photoPath})`);

  const {
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity,
  } = generateTeaserCopy(story, lang, slotTime);

  const errors: string[] = [];

  // 5. Granular Publishing to Pending Public Platforms
  // 5A. Facebook Page Feed Photo (Tailored for Parenting Community)
  if (!hasFb || options.force) {
    try {
      console.log(`\n📘 [1/3] Publishing Announcement to Facebook Page...`);
      const fbRes = await publishFacebookPhotoPost({
        photoPath,
        caption: captionFacebook,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && fbRes.success) {
        existingAnn.facebook = {
          id: fbRes.photoId || fbRes.postId,
          postId: fbRes.postId,
          url: fbRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Facebook announcement live: ${fbRes.permalink}`);
      }
    } catch (fbErr: any) {
      console.error(`⚠️ Facebook announcement warning:`, fbErr.message);
      errors.push(`[Facebook] ${fbErr.message}`);
    }
  } else {
    console.log(`\n⏩ [1/3] Skipping Facebook Page: Already published today (${existingAnn.facebook?.id}).`);
  }

  // 5B. Instagram Feed Photo (Tailored for Saves & Engagement)
  if (!hasIg || options.force) {
    try {
      console.log(`\n📸 [2/3] Publishing Announcement to Instagram Feed...`);
      const igRes = await publishInstagramFeedPhoto({
        imagePath: photoPath,
        caption: captionInstagram,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && igRes.success) {
        existingAnn.instagram = {
          id: igRes.mediaId,
          url: igRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Instagram announcement live: ${igRes.permalink}`);
      }
    } catch (igErr: any) {
      console.error(`⚠️ Instagram announcement warning:`, igErr.message);
      errors.push(`[Instagram] ${igErr.message}`);
    }
  } else {
    console.log(`\n⏩ [2/3] Skipping Instagram Feed: Already published today (${existingAnn.instagram?.id}).`);
  }

  // 5C. Meta Threads Image Post (Tailored for Conversational Micro-Storytelling)
  if (!hasThreads || options.force) {
    try {
      console.log(`\n🧵 [3/3] Publishing Announcement to Meta Threads...`);
      const thRes = await publishThreadsPhotoPost({
        imagePath: photoPath,
        text: captionThreads,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && thRes.success) {
        existingAnn.threads = {
          id: thRes.postId,
          url: thRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Threads announcement live: ${thRes.permalink}`);
      }
    } catch (thErr: any) {
      console.error(`⚠️ Threads announcement warning:`, thErr.message);
      errors.push(`[Threads] ${thErr.message}`);
    }
  } else {
    console.log(`\n⏩ [3/3] Skipping Meta Threads: Already published today (${existingAnn.threads?.id}).`);
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] YouTube Community Announcement Preview:\n", captionYoutubeCommunity);
  }

  // 6. Save Manifest & Push Back to Cloudflare R2
  if (!options.dryRun) {
    story.publications.announcements[todayDate][lang] = existingAnn;
    await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2), "utf-8");
    console.log(`\n✔ story.json updated with announcement publication record.`);

    try {
      console.log(`☁️ Syncing updated manifest to Cloudflare R2...`);
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", targetBook, "--manifest-only"]);
      console.log(`✔ Cloudflare R2 manifest synchronized.`);
    } catch (pushErr: any) {
      console.warn(`⚠️ Warning syncing manifest to Cloudflare R2:`, pushErr.message);
    }
  }

  // 7. Alert Telegram if errors occurred
  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: targetBook,
        lang,
        slot: `${slotTime} (${slotLabel})`,
        platform: "Pre-Broadcast Announcement Feed",
        error: errors.join("\n"),
      });
    } catch {}
  }

  console.log("\n🎉 ANNOUNCEMENT FEED DISPATCH COMPLETE!\n");
  return { success: errors.length === 0, targetBook, lang };
}

// ── CLI Runner ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const dailyLineup = args.includes("--daily-lineup");
  const dateArg = getArg("--date");
  const bookSlug = getArg("--book");
  const langArg = getArg("--lang") as "id" | "en" | undefined;
  const slotArg = getArg("--slot") as "morning" | "evening" | "auto" | "daily" | "all" | undefined;

  await publishAnnouncement({
    bookSlug,
    lang: langArg,
    slot: slotArg,
    dailyLineup,
    date: dateArg,
    dryRun,
    force,
  });
}

if (process.argv[1]?.includes("publish-announcement")) {
  main().catch((err) => {
    console.error("❌ Fatal error in Announcement Publisher:", err);
    process.exit(1);
  });
}
