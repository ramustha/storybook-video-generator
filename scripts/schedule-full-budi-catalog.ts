import fs from "fs/promises";
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
  level: string;
  theme: string;
  synopsis: string;
  coverUrl: string;
  budiPageUrl: string;
  pdfDownloadUrl: string;
  pdfStatus: string;
  views?: number;
  rating?: number;
}

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

async function main() {
  console.log("==========================================================================");
  console.log("🚀 MASTER SCHEDULER: FULL BUDI CATALOG BROADCAST TIMELINE (2026 - 2028)");
  console.log("==========================================================================\n");

  const catalogPath = path.resolve("./config/budi-catalog.json");
  const catalogData = JSON.parse(await fs.readFile(catalogPath, "utf-8"));
  const allBooks: BudiCatalogBook[] = catalogData.books || [];

  // Filter verified PAUD and SD books with full PDFs
  const verifiedBooks = allBooks.filter(
    (b) => b.pdfStatus === "VERIFIED_FULL_PDF" && (b.level === "PAUD" || b.level === "SD")
  );

  console.log(`📚 Total Verified Picture Books for Scheduling: ${verifiedBooks.length} titles`);

  // Place `ayo-berayun-momo` as #1 (Grand Premiere), then sort remaining by views / popularity
  const premiere = verifiedBooks.find((b) => b.slug === "ayo-berayun-momo");
  const rest = verifiedBooks.filter((b) => b.slug !== "ayo-berayun-momo");
  rest.sort((a, b) => (b.views || 0) - (a.views || 0));

  const orderedBooks = premiere ? [premiere, ...rest] : rest;

  // 1. Register all books into `books` and `curated_pool`
  console.log("\n⚡ Step 1: Batch Registering 626 Books into D1 (`books` & `curated_pool`)...");
  const chunkSize = 25;
  for (let i = 0; i < orderedBooks.length; i += chunkSize) {
    const chunk = orderedBooks.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (book) => {
        const titleId = book.title || book.slug;
        const author = book.author || "Penulis BUDI Kemendikdasmen RI";
        const illustrator = book.illustrator && book.illustrator !== "-" ? book.illustrator : "Ilustrator BUDI Kemendikdasmen RI";
        const theme = book.theme || "Cerita Anak Indonesia";
        const sourceUrl = book.budiPageUrl || `https://budi.kemendikdasmen.go.id/baca/digital/${book.slug}`;
        const pdfUrl = book.pdfDownloadUrl || `https://budi.kemendikdasmen.go.id/unduh-file/${book.slug}/digital`;
        const readingLevel = book.level === "PAUD" ? 1 : 2;

        await db.execute(
          `INSERT INTO books (slug, title_id, title_en, original_title, author, illustrator, publisher, license, theme, source_url, pdf_url, reading_level)
           VALUES (?, ?, ?, ?, ?, ?, 'Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI', 'Lisensi Terbuka Kemendikdasmen RI', ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             title_id = excluded.title_id,
             author = excluded.author,
             illustrator = excluded.illustrator,
             theme = excluded.theme,
             source_url = excluded.source_url,
             pdf_url = excluded.pdf_url,
             reading_level = excluded.reading_level;`,
          [book.slug, titleId, titleId, titleId, author, illustrator, theme, sourceUrl, pdfUrl, readingLevel]
        );

        await db.execute(
          `INSERT INTO curated_pool (slug, title_id, title_en, source_url, pdf_url, status, reading_level)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             title_id = excluded.title_id,
             source_url = excluded.source_url,
             pdf_url = excluded.pdf_url;`,
          [
            book.slug,
            titleId,
            titleId,
            sourceUrl,
            pdfUrl,
            book.slug === "ayo-berayun-momo" ? "ingested" : "backlog",
            readingLevel,
          ]
        );
      })
    );
    if ((i + chunkSize) % 100 < chunkSize || i + chunkSize >= orderedBooks.length) {
      console.log(`   ✔ Processed ${Math.min(i + chunkSize, orderedBooks.length)} / ${orderedBooks.length} books...`);
    }
  }

  // 2. Calculate timeline: 6 books per week (Monday to Saturday) + Sunday Compilation
  const totalWeeks = Math.ceil(orderedBooks.length / 6);
  const totalDays = totalWeeks * 7;
  const startDate = new Date("2026-12-07T00:00:00Z");
  const endDate = new Date(startDate.getTime() + (totalDays - 1) * 86400000);

  console.log("\n🗓️ Step 2: Timeline Span Calculation:");
  console.log(`   - Total Books           : ${orderedBooks.length} unique titles`);
  console.log(`   - Broadcast Cadence     : 6 new titles/week + 1 Sunday compilation marathon`);
  console.log(`   - Total Broadcast Weeks : ${totalWeeks} weeks`);
  console.log(`   - Total Calendar Days   : ${totalDays} days`);
  console.log(`   - Start Date            : ${startDate.toISOString().split("T")[0]} (Senin)`);
  console.log(`   - End Date              : ${endDate.toISOString().split("T")[0]} (Minggu)`);
  console.log(`   - Total Duration        : ${(totalWeeks / 52.14).toFixed(2)} YEARS (~${(totalWeeks / 4.345).toFixed(1)} Months)!`);

  // 3. Register 105 Sunday Compilations into `books`
  console.log(`\n📦 Step 3: Registering ${totalWeeks} Sunday Marathon Compilations into D1...`);
  for (let w = 1; w <= totalWeeks; w++) {
    const pad = w.toString().padStart(3, "0");
    const compSlug = `kompilasi-budi-pekan-${pad}`;
    const compTitleId = `Kompilasi Dongeng Nusantara Pilihan BUDI (Pekan ${w})`;
    const compTitleEn = `Indonesian Storybook Bedtime Marathon (Week ${w})`;
    const compTheme = `Maraton Dongeng Anak Nusantara Pekan ${w}`;

    await db.execute(
      `INSERT INTO books (slug, title_id, title_en, author, illustrator, publisher, license, theme)
       VALUES (?, ?, ?, 'Zayn Storybook', 'Zayn Storybook & BUDI Kemendikdasmen RI', 'Zayn Storybook', 'All Rights Reserved', ?)
       ON CONFLICT(slug) DO UPDATE SET
         title_id = excluded.title_id,
         title_en = excluded.title_en,
         theme = excluded.theme;`,
      [compSlug, compTitleId, compTitleEn, compTheme]
    );
  }
  console.log(`   ✔ All ${totalWeeks} compilations registered in D1 books table.`);

  // 4. Generate all daily broadcast slots
  console.log("\n💾 Step 4: Generating and Inserting All Broadcast Slots into `content_calendar`...");
  const slots: any[] = [];
  let bookPointer = 0;

  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = w + 1;
    const weekPad = weekNum.toString().padStart(3, "0");
    const compSlug = `kompilasi-budi-pekan-${weekPad}`;

    for (let day = 0; day < 7; day++) {
      const dayOffset = w * 7 + day;
      const curDate = new Date(startDate.getTime() + dayOffset * 86400000);
      const dateStr = curDate.toISOString().split("T")[0];
      const dayOfWeek = curDate.getUTCDay(); // 0 is Sunday, 1 is Monday ...
      const dayName = DAYS_ID[dayOfWeek];

      if (dayOfWeek === 0) {
        // SUNDAY: Morning short + Evening marathon compilation
        const prevBook = orderedBooks[Math.max(0, Math.min(bookPointer - 1, orderedBooks.length - 1))];

        slots.push({
          scheduled_date: dateStr,
          day_name: dayName,
          time_slot: "08:30 WIB",
          slot_type: "Sunday Morning Kids Energizer (English)",
          book_slug: prevBook.slug,
          lang: "en",
          format: "vertical",
          theme: "Weekend Joy",
        });

        slots.push({
          scheduled_date: dateStr,
          day_name: dayName,
          time_slot: "19:30 WIB",
          slot_type: "Weekend Prime Marathon (Long Compilation)",
          book_slug: compSlug,
          lang: "id",
          format: "landscape",
          theme: `Kompilasi Pekan ${weekNum}`,
        });
      } else {
        // MONDAY - SATURDAY: Single story day
        const book = orderedBooks[Math.min(bookPointer, orderedBooks.length - 1)];
        bookPointer++;

        // Morning slot: English feature (08:30 WIB)
        slots.push({
          scheduled_date: dateStr,
          day_name: dayName,
          time_slot: "08:30 WIB",
          slot_type: "Morning English Feature & Read-Aloud",
          book_slug: book.slug,
          lang: "en",
          format: "both",
          theme: book.theme || "Pendidikan Karakter Anak",
        });

        // Evening slot: Indonesian bedtime story (19:00 WIB)
        slots.push({
          scheduled_date: dateStr,
          day_name: dayName,
          time_slot: "19:00 WIB",
          slot_type: "Prime Bedtime Story",
          book_slug: book.slug,
          lang: "id",
          format: "both",
          theme: book.theme || "Pendidikan Karakter Anak",
        });
      }
    }
  }

  console.log(`   Generated ${slots.length} total broadcast slots across ${totalDays} days.`);

  // Chunked insert into content_calendar
  const slotChunkSize = 50;
  for (let i = 0; i < slots.length; i += slotChunkSize) {
    const chunk = slots.slice(i, i + slotChunkSize);
    await Promise.all(
      chunk.map((s) =>
        db.saveCalendarSlot({
          scheduled_date: s.scheduled_date,
          day_name: s.day_name,
          time_slot: s.time_slot,
          slot_type: s.slot_type,
          book_slug: s.book_slug,
          lang: s.lang,
          format: s.format,
          theme: s.theme,
          is_completed: false,
        })
      )
    );
    if ((i + slotChunkSize) % 200 < slotChunkSize || i + slotChunkSize >= slots.length) {
      console.log(`   ✔ Saved ${Math.min(i + slotChunkSize, slots.length)} / ${slots.length} slots to content_calendar...`);
    }
  }

  console.log("\n==========================================================================");
  console.log("🎉 ALL 626 BUDI BOOKS AND 1,470 BROADCAST SLOTS SUCCESSFULLY SCHEDULED!");
  console.log(`   Active Period: ${startDate.toISOString().split("T")[0]} s.d. ${endDate.toISOString().split("T")[0]}`);
  console.log("   Full 2-Year Continuous Daily Broadcast Secured!");
  console.log("==========================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
