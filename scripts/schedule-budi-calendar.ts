import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db } from "./lib/db";

interface BudiCatalogBook {
  id: number;
  slug: string;
  title: string;
  author: string;
  illustrator: string;
  format: string;
  pages: number;
  theme: string;
  synopsis: string;
  coverUrl: string;
  budiPageUrl: string;
  pdfDownloadUrl: string;
  pdfStatus: string;
}

const TARGET_BUDI_TITLES: Array<{
  slug: string;
  theme: string;
  englishTitle: string;
}> = [
  // Week 1 (7 - 13 Des 2026): Fabel & Nilai Budi Pekerti
  { slug: "ayo-berayun-momo", theme: "Hewan Endemik / Keberanian", englishTitle: "Swing High, Momo!" },
  { slug: "kue-lapis-harimau", theme: "Kuliner Tradisional & Fabel", englishTitle: "Tiger's Layer Cake" },
  { slug: "jangan-dekat-dekat", theme: "Empati & Persahabatan", englishTitle: "Don't Come Near Me!" },
  { slug: "gerubak-takung", theme: "Permainan Tradisional Nusantara", englishTitle: "The Wooden Cart Race" },
  { slug: "cerita-putri-gema", theme: "Seni, Budaya & Fantasi Suara", englishTitle: "The Tale of Princess Echo" },
  { slug: "celengan-ruru", theme: "Literasi Finansial & Kejujuran", englishTitle: "Ruru's Little Piggy Bank" },

  // Week 2 (14 - 20 Des 2026): Hewan Ceria & Pembentukan Karakter
  { slug: "ela-si-kecil-yang-baik-hati", theme: "Kebaikan & Kasih Sayang", englishTitle: "Ela, The Kind Little Elephant" },
  { slug: "jujur-itu-keren", theme: "Integritas & Kejujuran", englishTitle: "Honesty is Awesome" },
  { slug: "lomba-tebak-cepat", theme: "Kecerdasan & Kekompakan Teman", englishTitle: "The Quick Guess Contest" },
  { slug: "awan-lalat", theme: "Alam, Kebersihan & Lingkungan", englishTitle: "The Fly Cloud Mystery" },
  { slug: "merah", theme: "Eksplorasi Warna & Percaya Diri", englishTitle: "Bold Red!" },
  { slug: "fokus-fokus-lempar", theme: "Ketekunan & Inklusivitas", englishTitle: "Focus, Aim, and Throw!" },

  // Week 3 (21 - 27 Des 2026): Kehangatan Sahabat & Keluarga Menjelang Liburan
  { slug: "adik-kecil-dan-kucing", theme: "Kepedulian Hewan Peliharaan", englishTitle: "Little Sister and the Kitten" },
  { slug: "lihat-kebunku", theme: "Eksplorasi Kebun & Alam Hijau", englishTitle: "Look at My Blooming Garden" },
  { slug: "si-rancak-sakit", theme: "Kepedulian Merawat Sahabat Sakit", englishTitle: "Poor Rancak Is Sick" },
  { slug: "mimpi-loni", theme: "Imajinasi Dongeng Sebelum Tidur", englishTitle: "Loni's Dreamland Adventure" },
  { slug: "dung-trek-trek-dung", theme: "Irama Musik & Alat Musik Daerah", englishTitle: "Boom Click Clack Boom!" },
  { slug: "uli-ingin-sendiri", theme: "Pengenalan Emosi & Waktu Tenang", englishTitle: "Uli Wants Some Quiet Time" },

  // Week 4 (28 Des 2026 - 3 Jan 2027): Liburan Akhir Tahun & Semangat Baru
  { slug: "daun-daun-istimewa", theme: "Sains Alami & Cerita Rakyat", englishTitle: "The Magical Forest Leaves" },
  { slug: "di-mana-sepatuku", theme: "Kemandirian & Tanggung Jawab", englishTitle: "Where Did My Shoes Go?" },
  { slug: "pemberian-pak-beruang", theme: "Kedermawanan & Rasa Syukur", englishTitle: "Mr. Bear's Sweet Gift" },
  { slug: "di-mana-ibu", theme: "Kasih Sayang Ibu yang Hangat", englishTitle: "Where is My Mommy?" },
  { slug: "dudung-suka-balap-karung", theme: "Sportivitas & Kegembiraan Pesta Rakyat", englishTitle: "Dudung's Sack Race Dash" },
  { slug: "kiti-dan-balon-udara", theme: "Keberanian Menggapai Impian", englishTitle: "Kiti and the Hot Air Balloon" },
];

const COMPILATIONS: Array<{
  slug: string;
  titleId: string;
  titleEn: string;
  theme: string;
}> = [
  {
    slug: "kompilasi-budi-fabel-nusantara",
    titleId: "Kompilasi Fabel Nusantara Pilihan BUDI (Pekan 1)",
    titleEn: "Indonesian Animal Fables Compilation (Week 1)",
    theme: "Fabel Hewan Endemik Nusantara",
  },
  {
    slug: "kompilasi-budi-karakter-hebat",
    titleId: "Kompilasi Cerita Karakter Anak Hebat (Pekan 2)",
    titleEn: "Great Character Stories for Kids Compilation (Week 2)",
    theme: "Pendidikan Karakter & Empati",
  },
  {
    slug: "kompilasi-budi-keluarga-hangat",
    titleId: "Kompilasi Kisah Hangat Sahabat & Keluarga (Pekan 3)",
    titleEn: "Warm Family & Friendship Bedtime Compilation (Week 3)",
    theme: "Kasih Sayang Keluarga & Persahabatan",
  },
  {
    slug: "kompilasi-budi-akbar-tahun-baru",
    titleId: "Kompilasi Akbar 60 Menit Sambut Tahun Baru 2027",
    titleEn: "60-Minute New Year 2027 Grand Bedtime Story Marathon",
    theme: "Maraton Dongeng Spesial Tahun Baru",
  },
];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

async function main() {
  console.log("===============================================================");
  console.log("📅 GENERATING SCHEDULE 2: BUDI KEMENDIKDASMEN RI (DES 2026)");
  console.log("===============================================================\n");

  const catalogPath = path.resolve("./config/budi-catalog.json");
  const catalogData = JSON.parse(await fs.readFile(catalogPath, "utf-8"));
  const budiBooks: BudiCatalogBook[] = catalogData.books || [];
  const bookMap = new Map<string, BudiCatalogBook>(budiBooks.map((b) => [b.slug, b]));

  // Step 1: Register books into `books` and `curated_pool`
  console.log("📚 Step 1: Registering 24 BUDI Books + 4 Compilations in D1...");
  for (const item of TARGET_BUDI_TITLES) {
    const info = bookMap.get(item.slug);
    const titleId = info?.title || item.slug;
    const author = info?.author || "Penulis BUDI Kemendikdasmen RI";
    const illustrator = info?.illustrator && info.illustrator !== "-" ? info.illustrator : "Ilustrator BUDI Kemendikdasmen RI";
    const sourceUrl = info?.budiPageUrl || `https://budi.kemendikdasmen.go.id/baca/digital/${item.slug}`;
    const pdfUrl = info?.pdfDownloadUrl || `https://budi.kemendikdasmen.go.id/unduh-file/${item.slug}/digital`;

    await db.execute(
      `INSERT INTO books (slug, title_id, title_en, original_title, author, illustrator, publisher, license, theme, source_url, pdf_url)
       VALUES (?, ?, ?, ?, ?, ?, 'Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI', 'Lisensi Terbuka Kemendikdasmen RI', ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         title_id = excluded.title_id,
         title_en = excluded.title_en,
         author = excluded.author,
         illustrator = excluded.illustrator,
         theme = excluded.theme,
         source_url = excluded.source_url,
         pdf_url = excluded.pdf_url;`,
      [item.slug, titleId, item.englishTitle, titleId, author, illustrator, item.theme, sourceUrl, pdfUrl]
    );

    await db.execute(
      `INSERT INTO curated_pool (slug, title_id, title_en, source_url, pdf_url, status, reading_level)
       VALUES (?, ?, ?, ?, ?, ?, 2)
       ON CONFLICT(slug) DO UPDATE SET
         title_id = excluded.title_id,
         title_en = excluded.title_en,
         source_url = excluded.source_url,
         pdf_url = excluded.pdf_url;`,
      [item.slug, titleId, item.englishTitle, sourceUrl, pdfUrl, item.slug === "ayo-berayun-momo" ? "ingested" : "backlog"]
    );
  }

  // Register compilations
  for (const comp of COMPILATIONS) {
    await db.execute(
      `INSERT INTO books (slug, title_id, title_en, author, illustrator, publisher, license, theme)
       VALUES (?, ?, ?, 'Zayn Storybook', 'Zayn Storybook Team', 'Zayn Storybook', 'All Rights Reserved', ?)
       ON CONFLICT(slug) DO UPDATE SET
         title_id = excluded.title_id,
         title_en = excluded.title_en,
         theme = excluded.theme;`,
      [comp.slug, comp.titleId, comp.titleEn, comp.theme]
    );
  }
  console.log("✔ All 28 books and compilations registered in D1 database.\n");

  // Step 2: Build 4-week calendar slots from 2026-12-07 to 2027-01-03
  console.log("🗓️ Step 2: Scheduling Calendar Slots (2026-12-07 s.d. 2027-01-03)...");
  const startDate = new Date("2026-12-07T00:00:00Z");
  const slots: any[] = [];
  let singleBookIdx = 0;
  let compIdx = 0;

  for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
    const curDate = new Date(startDate.getTime() + dayOffset * 86400000);
    const dateStr = curDate.toISOString().split("T")[0];
    const dayOfWeek = curDate.getUTCDay(); // 0 is Sunday, 1 is Monday
    const dayName = DAYS_ID[dayOfWeek];

    if (dayOfWeek === 0) {
      // Sunday: Morning Short & Evening Compilation
      const comp = COMPILATIONS[compIdx % COMPILATIONS.length];
      compIdx++;

      // 08:30 WIB Morning Feature
      slots.push({
        scheduled_date: dateStr,
        day_name: dayName,
        time_slot: "08:30 WIB",
        slot_type: "Sunday Morning Kids Energizer",
        book_slug: TARGET_BUDI_TITLES[Math.max(0, singleBookIdx - 1)].slug,
        lang: "en",
        format: "vertical",
        theme: "Weekend Joy",
      });

      // 19:30 WIB Evening Compilation Marathon
      slots.push({
        scheduled_date: dateStr,
        day_name: dayName,
        time_slot: "19:30 WIB",
        slot_type: "Weekend Prime Marathon (Long Compilation)",
        book_slug: comp.slug,
        lang: "id",
        format: "landscape",
        theme: comp.theme,
      });
    } else {
      // Monday - Saturday: 2 daily slots (Morning English & Evening Indonesian Bedtime)
      const book = TARGET_BUDI_TITLES[singleBookIdx % TARGET_BUDI_TITLES.length];
      singleBookIdx++;

      // Morning slot: English feature (08:30 WIB)
      slots.push({
        scheduled_date: dateStr,
        day_name: dayName,
        time_slot: "08:30 WIB",
        slot_type: "Morning English Feature & Read-Aloud",
        book_slug: book.slug,
        lang: "en",
        format: "both",
        theme: book.theme,
      });

      // Evening slot: Indonesian prime bedtime story (19:00 WIB)
      slots.push({
        scheduled_date: dateStr,
        day_name: dayName,
        time_slot: "19:00 WIB",
        slot_type: "Prime Bedtime Story",
        book_slug: book.slug,
        lang: "id",
        format: "both",
        theme: book.theme,
      });
    }
  }

  // Save all slots to D1 content_calendar
  console.log(`💾 Step 3: Inserting ${slots.length} broadcast slots into content_calendar...`);
  for (const s of slots) {
    await db.saveCalendarSlot({
      scheduled_date: s.scheduled_date,
      day_name: s.day_name,
      time_slot: s.time_slot,
      slot_type: s.slot_type,
      book_slug: s.book_slug,
      lang: s.lang,
      format: s.format,
      theme: s.theme,
      is_completed: false,
    });
  }

  console.log(`✔ Successfully inserted ${slots.length} calendar slots into content_calendar!`);
  console.log("   Period: 7 Desember 2026 s.d. 3 Januari 2027 (4 Pekan Non-Stop)");
  console.log("   Grand Launching: [ayo-berayun-momo] pada Senin, 7 Desember 2026!\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
