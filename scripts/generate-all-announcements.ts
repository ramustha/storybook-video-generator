import fs from "fs/promises";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { db, AnnouncementRecordD1, CalendarRecord } from "./lib/db";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";

interface BudiBook {
  id: number;
  slug: string;
  title: string;
  author: string;
  illustrator: string;
  format: string;
  level: string;
  pages: number;
  theme: string;
  synopsis: string;
  coverUrl: string;
  budiPageUrl: string;
  pdfDownloadUrl: string;
  views?: number;
}

interface CuratedBook {
  slug: string;
  title_id?: string;
  title_en?: string;
  title?: string;
  theme?: string;
  moral?: any;
  thumbnailConfig?: any;
}

/**
 * Extracts clean, punchy hook and moral from various book sources.
 */
function resolveBookMetadata(
  slug: string,
  lang: "id" | "en",
  catalogMap: Map<string, BudiBook>,
  curatedMap: Map<string, any>,
  localStoryMap: Map<string, any>,
  calendarSlot?: CalendarRecord
): {
  cleanTitle: string;
  hook: string;
  moral: string;
  photoUrl: string;
  theme: string;
} {
  const isId = lang === "id";

  // 1. Check if local story.json exists
  const localStory = localStoryMap.get(slug);
  if (localStory) {
    const rawTitle = isId ? localStory.title : (localStory.originalTitle || localStory.title);
    const cleanTitle = (rawTitle || slug).replace(/[!]+$/, "").trim();
    const thumbConf = isId ? localStory.thumbnailConfig?.id : localStory.thumbnailConfig?.en;
    const hook = thumbConf?.hook || (isId ? localStory.synopsis || "Petualangan seru dan penuh tawa untuk si kecil!" : "A joyful, heartwarming tale children will adore!");
    
    let moral = "";
    if (isId) {
      moral = localStory.moral?.headlineId || localStory.moral?.id?.headline || "Belajar kebaikan budi pekerti, kejujuran, dan kehangatan keluarga.";
    } else {
      moral = localStory.moral?.headlineEn || localStory.moral?.en?.headline || "Learning kindness, empathy, and family warmth together.";
    }

    const r2PublicDomain = "https://pub-f2786231e5e34f19a6860d7fe9ddd569.r2.dev";
    const coverRel = typeof localStory.coverAsset === "string" && localStory.coverAsset.trim() ? localStory.coverAsset.trim() : "assets/cover.png";
    const photoUrl = `${r2PublicDomain}/stories/${slug}/${coverRel}`;

    return {
      cleanTitle,
      hook,
      moral,
      photoUrl,
      theme: localStory.theme || calendarSlot?.theme || "Pendidikan Karakter Anak",
    };
  }

  // 2. Check if it is a Sunday Marathon Compilation
  if (slug.startsWith("kompilasi-budi-pekan-")) {
    const weekNum = parseInt(slug.replace("kompilasi-budi-pekan-", ""), 10) || 1;
    const cleanTitle = isId
      ? `Kompilasi Dongeng Nusantara Pilihan BUDI (Pekan ${weekNum})`
      : `Indonesian Storybook Bedtime Marathon (Week ${weekNum})`;
    const hook = isId
      ? `Kumpulan 6 cerita bergambar terbaik pekan ini dirangkum dalam satu maraton animasi utuh 60 menit untuk menemani tidur lelap si kecil.`
      : `A grand 60-minute animated marathon gathering this week's 6 top illustrated tales for a tranquil bedtime journey.`;
    const moral = isId
      ? "Memupuk kecintaan membaca buku, kebaikan budi pekerti, dan kedekatan emosional keluarga di akhir pekan."
      : "Fostering a lifelong love for reading, moral integrity, and warm family bonding over the weekend.";
    const photoUrl = `https://pub-f2786231e5e34f19a6860d7fe9ddd569.r2.dev/compilations/${slug}/cover.png`;

    return {
      cleanTitle,
      hook,
      moral,
      photoUrl,
      theme: `Maraton Dongeng Anak Nusantara Pekan ${weekNum}`,
    };
  }

  // 3. Check BUDI Catalog
  const budi = catalogMap.get(slug);
  if (budi) {
    const cleanTitle = (budi.title || slug).replace(/[!]+$/, "").trim();
    let hook = budi.synopsis
      ? budi.synopsis.split(". ")[0].replace(/[\r\n]+/g, " ").trim()
      : isId
      ? `Kisah penuh inspirasi tentang petualangan dan nilai budi pekerti luhur nusantara.`
      : `An inspiring tale of joyful adventure and timeless character values.`;
    if (!hook.endsWith(".")) hook += ".";

    const theme = budi.theme || calendarSlot?.theme || "Pendidikan Karakter Anak";
    const moral = generateMoralFromTheme(theme, isId);
    const photoUrl = budi.coverUrl || `https://pub-f2786231e5e34f19a6860d7fe9ddd569.r2.dev/stories/${slug}/assets/cover.png`;

    return {
      cleanTitle,
      hook,
      moral,
      photoUrl,
      theme,
    };
  }

  // 4. Check Month 1 curated slots
  const m1Slot = DAILY_CALENDAR_MONTH_1.find((s: any) => s.bookSlug === slug);
  const title = m1Slot ? (m1Slot as any).title || slug : slug;
  const cleanTitle = title.replace(/[!]+$/, "").trim();
  const theme = calendarSlot?.theme || m1Slot?.theme || "Pendidikan Karakter Anak";
  const hook = isId
    ? `Petualangan imajinatif nan hangat yang mengajarkan empati dan keceriaan bagi anak-anak.`
    : `An imaginative, heartwarming journey inspiring empathy and wonder in every young child.`;
  const moral = generateMoralFromTheme(theme, isId);
  const photoUrl = `https://pub-f2786231e5e34f19a6860d7fe9ddd569.r2.dev/stories/${slug}/assets/cover.png`;

  return {
    cleanTitle,
    hook,
    moral,
    photoUrl,
    theme,
  };
}

/**
 * Derives child-friendly character moral lessons from broad educational themes.
 */
function generateMoralFromTheme(theme: string, isId: boolean): string {
  const t = theme.toLowerCase();
  if (t.includes("fabel") || t.includes("hewan")) {
    return isId
      ? "Belajar menyayangi sesama makhluk hidup, keberanian, dan tolong-menolong."
      : "Learning compassion for animals, bravery, and helping friends in need.";
  }
  if (t.includes("jujur") || t.includes("integritas")) {
    return isId
      ? "Menjunjung tinggi kejujuran dan selalu berani berkata benar dalam setiap keadaan."
      : "Upholding honesty, truthfulness, and integrity in every situation.";
  }
  if (t.includes("teman") || t.includes("sahabat") || t.includes("empati")) {
    return isId
      ? "Menghargai perbedaan, berbagi keceriaan, dan setia kawan kepada sesama sahabat."
      : "Cherishing friendships, celebrating differences, and being kind to others.";
  }
  if (t.includes("keluarga") || t.includes("ibu") || t.includes("ayah") || t.includes("nenek")) {
    return isId
      ? "Menghormati orang tua dan menyebarkan kehangatan kasih sayang di rumah."
      : "Respecting parents, loving family, and spreading warmth in the home.";
  }
  if (t.includes("lingkungan") || t.includes("alam") || t.includes("kebun")) {
    return isId
      ? "Menjaga kebersihan lingkungan sekitar dan mensyukuri keindahan alam ciptaan Tuhan."
      : "Caring for the environment, keeping nature clean, and appreciating our planet.";
  }
  if (t.includes("tradisional") || t.includes("nusantara") || t.includes("budaya")) {
    return isId
      ? "Mengenal kekayaan budaya nusantara dan bangga terhadap tradisi warisan leluhur."
      : "Discovering cultural heritage and celebrating traditional values with pride.";
  }
  return isId
    ? "Menumbuhkan budi pekerti luhur, rasa ingin tahu yang sehat, dan kehangatan hati."
    : "Nurturing curiosity, kind hearts, and wonderful character in every little reader.";
}

/**
 * Generates platform-tailored announcement copy for Instagram, Facebook, Threads, and YouTube.
 * Note: Telegram is strictly omitted from public announcements (internal creator alerts only).
 */
export function buildPlatformCaptions(params: {
  cleanTitle: string;
  hook: string;
  moral: string;
  slotTime: string;
  slotType: string;
  lang: "id" | "en";
}): {
  captionInstagram: string;
  captionFacebook: string;
  captionThreads: string;
  captionYoutubeCommunity: string;
} {
  const { cleanTitle, hook, moral, slotTime, slotType, lang } = params;
  const isId = lang === "id";
  const isMorning = slotTime.includes("08:") || slotType.toLowerCase().includes("morning");
  const isCompilation = slotType.toLowerCase().includes("marathon") || slotType.toLowerCase().includes("kompilasi");

  // 1. INSTAGRAM FEED CAPTION
  let captionInstagram = "";
  if (isId) {
    if (isMorning) {
      captionInstagram = `☀️ SEMANGAT PAGI! SEBENTAR LAGI TAYANG (1 JAM LAGI) 🌟✨
📖 ${cleanTitle} 🎈

Halo Ayah Bunda dan adik-adik ceria! 🥰👋
Tepat pukul ${slotTime} nanti, cerita animasi berbahasa Inggris terbaru kita "${cleanTitle}" akan tayang perdana di kanal YouTube @zayn.storybook!

🎨 Sorotan Cerita Pagi Ini:
👉 ${hook}

💡 Nilai Kebaikan untuk Si Kecil:
${moral}

📌 TIPS MORNING SCREEN-TIME SEHAT:
Jadikan video animasi edukatif 10 menit ini sebagai pengantar sarapan santai yang kaya kosakata dan mengasah imajinasi anak sebelum beraktivitas.

🔔 Nyalakan lonceng pengingat di YouTube @zayn.storybook sekarang agar tidak terlewat saat tayang perdana!
👉 Tautan tontonan resmi langsung aktif di bio profil @zayn.storybook tepat pukul ${slotTime}.

💬 Siapa yang suka mendengarkan cerita sambil sarapan? Tulis di kolom komentar ya! 👇❤️

#ZaynStorybook #CeritaAnakEdukatif #BelajarBahasaInggris #ReadAloud #ParentingIndonesia #BukuAnakBermutu #MembacaSejakDini #MorningRoutine`;
    } else if (isCompilation) {
      captionInstagram = `🌙 MARATON AKHIR PEKAN! 1 JAM LAGI TAYANG PERDANA 🌟✨
📖 ${cleanTitle} 💤

Selamat malam Ayah Bunda! Akhir pekan saatnya memanjakan si kecil dengan maraton dongeng spesial. Tepat pukul ${slotTime} nanti di YouTube @zayn.storybook!

🎨 Sorotan Maraton Malam Ini:
👉 ${hook}

💡 Pesan Karakter Akhir Pekan:
${moral}

📌 TIPS BEDTIME ROUTINE:
Nyalakan video kompilasi tanpa iklan mengganggu ini, redupkan lampu kamar, dan biarkan narasi lembut menuntun si kecil menuju alam mimpi yang indah.

🔔 Nyalakan lonceng pengingat di YouTube @zayn.storybook sekarang!
👉 Tautan langsung tersedia di bio profil @zayn.storybook tepat pukul ${slotTime}.

💬 Simpan (Save) postingan ini untuk playlist dongeng akhir pekan bersama keluarga! 👇❤️

#ZaynStorybook #DongengSebelumTidur #KompilasiCeritaAnak #BedtimeMarathon #ParentingIndonesia #BukuAnakBergambar #KeluargaBahagia`;
    } else {
      captionInstagram = `⏰ SEBENTAR LAGI TAYANG! (1 JAM LAGI) 🌟✨
📖 ${cleanTitle} 🌙💤

Halo Ayah Bunda dan adik-adik tersayang! 🥰👋
Tepat pukul ${slotTime} nanti, cerita animasi buku bergambar terbaru kita "${cleanTitle}" akan tayang perdana di kanal YouTube @zayn.storybook!

🎨 Sorotan Cerita Malam Ini:
👉 ${hook}

💡 Nilai Kebaikan untuk Si Kecil:
${moral}

📌 TIPS RUTINITAS SEBELUM TIDUR:
Jadikan dongeng 15 menit ini sebagai momen transisi tenang sebelum si kecil terlelap. Redupkan lampu, siapkan selimut hangat, dan nikmati petualangan bersama.

🔔 Nyalakan lonceng pengingat di YouTube @zayn.storybook sekarang agar tidak terlewat saat tayang perdana!
👉 Tautan tontonan resmi akan langsung aktif di bio profil @zayn.storybook tepat pukul ${slotTime}.

💬 Siapa yang sudah siap menemani si kecil mendongeng malam ini? Tulis di kolom komentar ya! 👇❤️

#ZaynStorybook #DongengSebelumTidur #ParentingIndonesia #CeritaAnakBergambar #BukuAnakBermutu #DongengAnak #MembacaSejakDini #BedtimeRoutine #FamilyStorytime`;
    }
  } else {
    if (isMorning) {
      captionInstagram = `☀️ GOOD MORNING! PREMIERING IN 1 HOUR! 🌟✨
📖 ${cleanTitle} 🎈

Hello wonderful parents and bright little readers! 🥰👋
In just 1 hour (at ${slotTime}), our cheerful animated read-aloud storybook "${cleanTitle}" premieres on YouTube @zayn.storybook!

🎨 Morning Story Highlight:
👉 ${hook}

💡 Life Lesson:
${moral}

📌 MINDFUL MORNING TIP:
Pair this 10-minute joyful read-aloud with a cozy breakfast to spark vocabulary growth and morning creativity before daily activities begin.

🔔 Tap the notification bell on YouTube @zayn.storybook right now so you don't miss the premiere!
👉 The official watch link goes live in our bio @zayn.storybook at ${slotTime}.

💬 Ready to jumpstart today with a fun story? Let us know below! 👇❤️

#ZaynStorybook #KidsStories #ReadAloud #MorningRoutine #ChildrenBooks #AnimatedStorybook #KidsAnimation #MindfulParenting`;
    } else {
      captionInstagram = `⏰ PREMIERING IN 1 HOUR! 🌟✨
📖 ${cleanTitle} 🌙💤

Hello wonderful parents and curious little ones! 🥰👋
In just 1 hour (at ${slotTime}), our brand-new animated read-aloud storybook "${cleanTitle}" is premiering on YouTube @zayn.storybook!

🎨 Tonight's Story Highlight:
👉 ${hook}

💡 Life Lesson for Young Minds:
${moral}

📌 BEDTIME ROUTINE TIP:
Use this calming 15-minute story as a peaceful wind-down ritual before sleep. Dim the room lights, snuggle under a warm blanket, and share the journey together.

🔔 Tap the notification bell on YouTube @zayn.storybook right now so you don't miss the premiere!
👉 The official watch link goes live in our bio @zayn.storybook at ${slotTime}.

💬 Ready for tonight's storytime adventure? Let us know in the comments below! 👇❤️

#ZaynStorybook #KidsStories #ReadAloud #BedtimeStories #AnimatedStorybook #ChildrenBooks #KidsAnimation #FamilyStorytime #MindfulParenting`;
    }
  }

  // 2. FACEBOOK PAGE CAPTION
  let captionFacebook = "";
  if (isId) {
    captionFacebook = `⏰ PENGINGAT TAYANG: 1 JAM LAGI! (Pukul ${slotTime}) 🌟✨
📖 ${cleanTitle}

Ayah Bunda, waktu berkualitas bersama si kecil melalui dongeng bergambar terbukti menstimulasi perkembangan bahasa dan mempererat keterikatan batin keluarga. 🌙💤

Malam ini di kanal YouTube Zayn Storybook, kita akan menyaksikan tayangan perdana:
"${cleanTitle}"

✨ Sekilas Kisah:
${hook}

💡 Pesan Karakter:
${moral}

Mari ciptakan kenangan masa kecil yang hangat dan bermakna. Kumpulkan keluarga, siapkan suasana ruangan yang nyaman, dan nikmati animasi dongeng penuh warna bersama kami.

🔔 Kunjungi kanal YouTube kami @Zayn.Storybook dan nyalakan lonceng pengingat premiere.
Tautan tontonan resmi akan dibagikan di halaman ini tepat pukul ${slotTime}!

Ayah Bunda biasanya mendongeng jam berapa bersama si kecil? Yuk berbagi cerita di kolom komentar! 👇❤️`;
  } else {
    captionFacebook = `⏰ PREMIERE REMINDER: 1 HOUR TO GO! (At ${slotTime}) 🌟✨
📖 ${cleanTitle}

Dear parents, sharing a short illustrated storybook journey is one of the most heartwarming ways to nurture emotional bonds and curiosity in growing children. 🌙💤

Tonight on Zayn Storybook YouTube, we are premiering a wonderful animated journey:
"${cleanTitle}"

✨ Story Glimpse:
${hook}

💡 Life Lesson:
${moral}

Let's create warm, cherished childhood memories together. Gather the family, get cozy, and enjoy this beautifully illustrated adventure.

🔔 Visit our YouTube channel @Zayn.Storybook and set your premiere reminder!
The official watch link will be shared right here at ${slotTime}!

What is your favorite family storytime routine? Share with our parent community below! 👇❤️`;
  }

  // 3. META THREADS CAPTION
  let captionThreads = "";
  if (isId) {
    captionThreads = `Pernahkah si kecil bertanya tentang petualangan seru sebelum tidur? 🐒🌳

Tepat 1 jam lagi (pukul ${slotTime}), cerita animasi bergambar terbaru kita "${cleanTitle}" akan tayang perdana di YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Nyalakan pengingat di YouTube @zayn.storybook yuk, siapkan selimut hangat untuk dongeng nanti! 🌙💤`;
  } else {
    captionThreads = `Looking for a heartwarming story to brighten bedtime tonight? 🐒🌳

In just 1 hour (at ${slotTime}), our new animated read-aloud storybook "${cleanTitle}" premieres on YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Set your premiere reminder on YouTube @zayn.storybook and snuggle up for storytime! 🌙💤`;
  }

  // 4. YOUTUBE COMMUNITY TAB CAPTION
  let captionYoutubeCommunity = "";
  if (isId) {
    captionYoutubeCommunity = `⏰ TAYANG PERDANA 1 JAM LAGI! (Pukul ${slotTime}) 🌟✨
📖 ${cleanTitle} 🌙💤

Halo teman-teman dan keluarga tersayang! 🥰👋
Cerita animasi buku bergambar terbaru kita "${cleanTitle}" akan tayang perdana tepat pukul ${slotTime} nanti!

🎨 Sorotan Cerita:
👉 ${hook}

💡 Nilai Kebaikan:
${moral}

🔔 Klik tombol "Set Reminder" / "Ingatkan Saya" pada video premiere agar adik-adik tidak terlewatkan momen seru ini!
Sampai jumpa di kolom live chat nanti ya! ❤️👇`;
  } else {
    captionYoutubeCommunity = `⏰ PREMIERING IN 1 HOUR! (At ${slotTime}) 🌟✨
📖 ${cleanTitle} 📖🎈

Hello wonderful families and little readers! 🥰👋
Our brand-new animated read-aloud storybook "${cleanTitle}" premieres at ${slotTime}!

🎨 Tonight's Story Highlight:
👉 ${hook}

💡 Life Lesson:
${moral}

🔔 Hit "Set Reminder" on the premiere video so you don't miss the adventure!
See you in the live chat! ❤️👇`;
  }

  return {
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity,
  };
}

/**
 * Main generator routine.
 */
export async function generateAllAnnouncements(options: {
  limit?: number;
  dryRun?: boolean;
  startDate?: string;
  endDate?: string;
} = {}): Promise<{
  totalGenerated: number;
  totalSaved: number;
  registryPath: string;
}> {
  console.log("==========================================================================");
  console.log("📢 MASTER ANNOUNCEMENT GENERATOR FOR ENTIRE BROADCAST CALENDAR");
  console.log("==========================================================================");
  console.log(`🧪 Dry Run Mode   : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Save to D1 & JSON)"}`);
  if (options.limit) console.log(`🔢 Limit          : ${options.limit} slots`);
  if (options.startDate) console.log(`📅 Start Date     : ${options.startDate}`);
  if (options.endDate) console.log(`📅 End Date       : ${options.endDate}`);
  console.log("==========================================================================\n");

  // 1. Load Data Sources
  console.log("📥 Loading calendar, BUDI catalog, and curated manifest data...");
  const calendarSlots = await db.getCalendar();
  console.log(`   ✔ Retrieved ${calendarSlots.length} calendar slots from D1.`);

  const catalogPath = path.resolve("./config/budi-catalog.json");
  const catalogData = JSON.parse(await fs.readFile(catalogPath, "utf-8"));
  const catalogBooks: BudiBook[] = catalogData.books || [];
  const catalogMap = new Map<string, BudiBook>(catalogBooks.map((b) => [b.slug, b]));

  const curatedPath = path.resolve("./config/curated-books.json");
  let curatedBooks: any[] = [];
  if (existsSync(curatedPath)) {
    try {
      curatedBooks = JSON.parse(await fs.readFile(curatedPath, "utf-8"));
    } catch {}
  }
  const curatedMap = new Map<string, any>(curatedBooks.map((b) => [b.slug, b]));

  // Cache local story.json files for known stories
  const localStoryMap = new Map<string, any>();
  const storiesDir = path.resolve("./stories");
  if (existsSync(storiesDir)) {
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const p = path.join(storiesDir, ent.name, "story.json");
        if (existsSync(p)) {
          try {
            const raw = JSON.parse(readFileSync(p, "utf-8"));
            localStoryMap.set(ent.name, raw);
          } catch {}
        }
      }
    }
  }

  // 2. Filter target slots
  let targetSlots = calendarSlots;
  if (options.startDate) {
    targetSlots = targetSlots.filter((s) => s.scheduled_date >= options.startDate!);
  }
  if (options.endDate) {
    targetSlots = targetSlots.filter((s) => s.scheduled_date <= options.endDate!);
  }
  if (options.limit && options.limit > 0) {
    targetSlots = targetSlots.slice(0, options.limit);
  }

  console.log(`🎯 Generating announcements for ${targetSlots.length} scheduled slots...`);

  // 3. Generate announcements
  const generatedRecords: AnnouncementRecordD1[] = [];

  for (const slot of targetSlots) {
    const bookSlug = slot.book_slug || "ayo-berayun-momo";
    const lang = (slot.lang as "id" | "en") || "id";
    const slotTime = slot.time_slot;
    const slotType = slot.slot_type;

    const meta = resolveBookMetadata(bookSlug, lang, catalogMap, curatedMap, localStoryMap, slot);
    const captions = buildPlatformCaptions({
      cleanTitle: meta.cleanTitle,
      hook: meta.hook,
      moral: meta.moral,
      slotTime,
      slotType,
      lang,
    });

    const record: AnnouncementRecordD1 = {
      scheduled_date: slot.scheduled_date,
      time_slot: slotTime,
      lang,
      book_slug: bookSlug,
      slot_type: slotType,
      title: meta.cleanTitle,
      theme: meta.theme,
      hook: meta.hook,
      moral: meta.moral,
      photo_url: meta.photoUrl,
      caption_instagram: captions.captionInstagram,
      caption_facebook: captions.captionFacebook,
      caption_threads: captions.captionThreads,
      caption_youtube_community: captions.captionYoutubeCommunity,
      status: "scheduled",
    };

    generatedRecords.push(record);
  }

  console.log(`✔ Successfully generated ${generatedRecords.length} tailored announcement packages!`);

  // 4. Save to JSON registry
  const registryPath = path.resolve("./config/scheduled-announcements.json");
  if (!options.dryRun) {
    console.log(`\n💾 Step 4A: Writing static registry to ${registryPath}...`);
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totalSlots: generatedRecords.length,
          startDate: generatedRecords[0]?.scheduled_date,
          endDate: generatedRecords[generatedRecords.length - 1]?.scheduled_date,
          announcements: generatedRecords,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`✔ Static registry saved (${(Buffer.byteLength(JSON.stringify(generatedRecords)) / 1024 / 1024).toFixed(2)} MB).`);

    // 5. Batch insert into Cloudflare D1 announcements table
    console.log("\n⚡ Step 4B: Batch inserting all announcements into Cloudflare D1 `announcements` table...");
    const chunkSize = 50;
    for (let i = 0; i < generatedRecords.length; i += chunkSize) {
      const chunk = generatedRecords.slice(i, i + chunkSize);
      await Promise.all(chunk.map((rec) => db.saveAnnouncement(rec)));
      if ((i + chunkSize) % 200 < chunkSize || i + chunkSize >= generatedRecords.length) {
        console.log(`   ✔ Inserted ${Math.min(i + chunkSize, generatedRecords.length)} / ${generatedRecords.length} announcements...`);
      }
    }
    console.log(`✔ All ${generatedRecords.length} announcements synchronized with Cloudflare D1!`);
  } else {
    console.log("\n[DRY RUN SAMPLE PREVIEW]:");
    console.log("Slot 1:", JSON.stringify(generatedRecords[0], null, 2));
    if (generatedRecords.length > 1) {
      console.log("\nSlot 2:", JSON.stringify(generatedRecords[1], null, 2));
    }
  }

  console.log("\n==========================================================================");
  console.log(`🎉 COMPLETED: ${generatedRecords.length} ANNOUNCEMENTS READY FOR ENTIRE SCHEDULE!`);
  console.log("==========================================================================\n");

  return {
    totalGenerated: generatedRecords.length,
    totalSaved: options.dryRun ? 0 : generatedRecords.length,
    registryPath,
  };
}

// ── CLI Runner ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const dryRun = args.includes("--dry-run");
  const limitStr = getArg("--limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  const startDate = getArg("--start-date");
  const endDate = getArg("--end-date");

  await generateAllAnnouncements({
    limit,
    dryRun,
    startDate,
    endDate,
  });
}

if (process.argv[1]?.includes("generate-all-announcements")) {
  main().catch((err) => {
    console.error("❌ Fatal error in Announcement Generator:", err);
    process.exit(1);
  });
}
