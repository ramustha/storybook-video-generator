import fs from "fs";
import path from "path";
import { db } from "./lib/db";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";
import { getWibDateIso, isPrimaryPublishedRecord } from "./lib/portal-sync";

function collectProductionStorySlugs(storiesDir: string, baseSlugs: string[]): string[] {
  const slugSet = new Set(baseSlugs);
  if (fs.existsSync(storiesDir)) {
    for (const entry of fs.readdirSync(storiesDir)) {
      if (
        entry === "branding" ||
        entry.startsWith("test-") ||
        entry.startsWith("poc-") ||
        entry.startsWith("edu-")
      ) {
        continue;
      }
      if (fs.existsSync(path.join(storiesDir, entry, "story.json"))) {
        slugSet.add(entry);
      }
    }
  }
  return Array.from(slugSet).sort();
}

async function main() {
  console.log("\n=======================================================");
  console.log("🚀 MIGRATING STORYBOOK METADATA TO CLOUDFLARE D1");
  console.log("=======================================================\n");

  const storiesDir = path.resolve(process.cwd(), "stories");
  const productionSlugs = collectProductionStorySlugs(storiesDir, [
    "bulan-dan-topi-biru",
    "gara-gara-kucing",
    "hari-cukur-rambut",
    "jangan-sekarang",
    "jas-hujan-merah",
    "kacamata-nenek",
    "pisang-terlalu-banyak",
    "raja-gemuk-anjing-kurus",
    "raja-gemuk-remotion",
    "terlalu-banyak-suara",
    "topsy-turvy-serba-terbalik",
  ]);

  // 1. Migrate Books & Scenes
  console.log("📚 Step 1: Migrating Stories & Scenes into D1...");
  let booksMigrated = 0;
  let scenesMigrated = 0;

  for (const slug of productionSlugs) {
    const storyJsonPath = path.join(storiesDir, slug, "story.json");
    if (!fs.existsSync(storyJsonPath)) {
      console.warn(`⚠️ Warning: ${storyJsonPath} not found, skipping.`);
      continue;
    }

    try {
      const raw = fs.readFileSync(storyJsonPath, "utf-8");
      const story = JSON.parse(raw);
      story.slug = slug; // Ensure slug matches directory name

      await db.saveStory(story);
      booksMigrated++;
      scenesMigrated += story.scenes?.length || 0;
      console.log(`  ✔ Migrated book: [${slug}] "${story.title}" (${story.scenes?.length || 0} scenes)`);
    } catch (err: any) {
      console.error(`  ❌ Failed migrating [${slug}]:`, err.message);
    }
  }

  // 1b. Insert Marathon Compilations (bedtime-id, bedtime-en)
  const compilations = [
    {
      slug: "bedtime-id",
      title_id: "Kumpulan Dongeng Sebelum Tidur (5 Cerita Non-Stop)",
      title_en: "Bedtime Stories Marathon (5 Stories Non-Stop)",
      author: "Pratham Books Authors (Various)",
      illustrator: "Pratham Books Illustrators (Various)",
      publisher: "Pratham Books",
      license: "CC BY 4.0",
      theme: "Bedtime Story Marathon Compilation",
    },
    {
      slug: "bedtime-en",
      title_id: "Kumpulan Dongeng Sebelum Tidur Bahasa Inggris (5 Cerita Non-Stop)",
      title_en: "English Bedtime Stories Marathon (5 Stories Non-Stop)",
      author: "Pratham Books Authors (Various)",
      illustrator: "Pratham Books Illustrators (Various)",
      publisher: "Pratham Books",
      license: "CC BY 4.0",
      theme: "English Bedtime Stories Marathon",
    },
  ];

  for (const comp of compilations) {
    await db.execute(
      `INSERT INTO books (slug, title_id, title_en, author, illustrator, publisher, license, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         title_id = excluded.title_id,
         title_en = excluded.title_en,
         theme = excluded.theme;`,
      [comp.slug, comp.title_id, comp.title_en, comp.author, comp.illustrator, comp.publisher, comp.license, comp.theme]
    );
    console.log(`  ✔ Registered marathon compilation: [${comp.slug}] "${comp.title_id}"`);
  }

  // 2. Migrate Publications from docs/audit-data.json
  console.log("\n📡 Step 2: Migrating Live Publications into D1...");
  const auditPath = path.resolve(process.cwd(), "docs/audit-data.json");
  let pubsMigrated = 0;

  if (fs.existsSync(auditPath)) {
    try {
      const auditRecords = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
      const existingBooks = await db.getAllBooks();
      const validSlugs = new Set(existingBooks.map((b) => b.slug));

      const chunkSize = 5;
      for (let i = 0; i < auditRecords.length; i += chunkSize) {
        const chunk = auditRecords.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (rec: any) => {
            if (!rec.storySlug || !rec.platform) return;
            if (!validSlugs.has(rec.storySlug)) {
              console.warn(`  ⚠️ Skipping publication for unknown slug: ${rec.storySlug}`);
              return;
            }

            let platformKey = rec.platform.toLowerCase();
            if (platformKey.includes("youtube")) platformKey = "youtube";
            else if (platformKey.includes("facebook")) platformKey = "facebook";
            else if (platformKey.includes("instagram")) platformKey = "instagram";
            else if (platformKey.includes("threads")) platformKey = "threads";
            else if (platformKey.includes("tiktok")) platformKey = "tiktok";

            let formatKey = "landscape";
            const fmt = (rec.format || "").toLowerCase();
            if (fmt.includes("short") || fmt.includes("vertical") || fmt.includes("reels") || fmt.includes("9:16")) {
              formatKey = "vertical";
            } else if (fmt.includes("post")) {
              formatKey = "post";
            }

            await db.recordPublication({
              bookSlug: rec.storySlug,
              platform: platformKey,
              lang: rec.language || "id",
              format: formatKey,
              externalId: rec.videoId || rec.id,
              videoUrl: rec.videoUrl,
              externalTitle: rec.videoTitle,
              thumbnailUrl: rec.thumbnailUrl,
              publishedAt: rec.publishedAt,
              status: rec.status || "published",
            });
            pubsMigrated++;
          })
        );
      }
      console.log(`  ✔ Ingested ${pubsMigrated} publications from audit-data.json`);
    } catch (err: any) {
      console.error("  ❌ Failed reading audit-data.json:", err.message);
    }
  }

  // 3. Migrate Curated Pool Backlog
  console.log("\n📦 Step 3: Migrating Curated Pool Backlog...");
  const curatedPath = path.resolve(process.cwd(), "config/curated-books.json");
  let curatedCount = 0;

  if (fs.existsSync(curatedPath)) {
    try {
      const curatedList = JSON.parse(fs.readFileSync(curatedPath, "utf-8"));
      for (const b of curatedList) {
        const isIngested = productionSlugs.includes(b.slug);
        await db.upsertCuratedBook({
          slug: b.slug,
          title_en: b.originalTitle || b.title,
          title_id: b.title,
          source_url: b.sourceUrl || "",
          pdf_url: b.pdfUrl || "",
          reading_level: b.readingLevel || 2,
          status: isIngested ? "ingested" : "backlog",
        });
        curatedCount++;
      }
      console.log(`  ✔ Ingested ${curatedCount} books into curated_pool`);
    } catch (err: any) {
      console.error("  ❌ Failed migrating curated-books.json:", err.message);
    }
  }

  // 4. Pre-register Upcoming Calendar Books & Migrate 30-Day Content Calendar
  console.log("\n📅 Step 4: Migrating 30-Day Content Calendar...");
  const allCurrentBooks = await db.getAllBooks();
  const validBookSlugs = new Set(allCurrentBooks.map((b) => b.slug));

  const calendarSlugs = new Set(DAILY_CALENDAR_MONTH_1.map((s) => s.bookSlug).filter(Boolean));
  for (const slug of calendarSlugs) {
    if (!validBookSlugs.has(slug)) {
      const slot = DAILY_CALENDAR_MONTH_1.find((s) => s.bookSlug === slug);
      const title = slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      await db.execute(
        `INSERT INTO books (slug, title_id, title_en, author, illustrator, publisher, license, theme)
         VALUES (?, ?, ?, 'Pratham Books Authors', 'Pratham Books Illustrators', 'Pratham Books', 'CC BY 4.0', ?)
         ON CONFLICT(slug) DO NOTHING;`,
        [slug, title, title, slot?.theme || "Upcoming Storybook"]
      );
      validBookSlugs.add(slug);
    }
  }

  const allPubRows = await db.query<{ book_slug: string; platform: string; lang: string; status: string }>(
    "SELECT book_slug, platform, lang, status FROM publications WHERE status = 'published'"
  );
  const publishedPrimaryPairs = new Set(
    allPubRows
      .filter((r) => isPrimaryPublishedRecord({ storySlug: r.book_slug, platform: r.platform, status: r.status }))
      .map((r) => `${r.book_slug}::${(r.lang || "id").toLowerCase()}`)
  );
  const todayWibIso = getWibDateIso(new Date());

  let calendarCount = 0;
  let completedSyncedCount = 0;
  const calChunkSize = 5;
  for (let i = 0; i < DAILY_CALENDAR_MONTH_1.length; i += calChunkSize) {
    const chunk = DAILY_CALENDAR_MONTH_1.slice(i, i + calChunkSize);
    await Promise.all(
      chunk.map(async (slot) => {
        if (!slot.date) return;
        const slotDone =
          slot.date <= todayWibIso && publishedPrimaryPairs.has(`${slot.bookSlug}::${slot.lang.toLowerCase()}`);
        await db.saveCalendarSlot({
          scheduled_date: slot.date,
          day_name: slot.dayName,
          time_slot: slot.timeSlot,
          slot_type: slot.slotType,
          book_slug: slot.bookSlug,
          lang: slot.lang,
          format: slot.format,
          theme: slot.theme,
          is_completed: slotDone,
          completed_at: slotDone ? new Date().toISOString() : undefined,
        });
        calendarCount++;
        if (slotDone) completedSyncedCount++;
      })
    );
  }
  console.log(
    `  ✔ Ingested ${calendarCount} calendar broadcast slots into content_calendar (${completedSyncedCount} marked completed)`
  );

  // 5. Setup GCP Quota Projects
  console.log("\n⚡ Step 5: Initializing GCP Quota Projects...");
  const quotaProjects = [
    { id: "default", limit: 10000 },
    { id: "project-2", limit: 10000 },
  ];

  for (const qp of quotaProjects) {
    await db.execute(
      `INSERT INTO gcp_quota_pool (project_id, daily_quota_limit, quota_used_today, is_active)
       VALUES (?, ?, 0, 1)
       ON CONFLICT(project_id) DO UPDATE SET
         daily_quota_limit = excluded.daily_quota_limit;`,
      [qp.id, qp.limit]
    );
  }
  console.log(`  ✔ Configured ${quotaProjects.length} projects in gcp_quota_pool`);

  // 6. Verification Summary
  console.log("\n=======================================================");
  console.log("📊 MIGRATION VERIFICATION & SUMMARY");
  console.log("=======================================================");
  const [bRows] = await db.query("SELECT COUNT(*) as cnt FROM books");
  const [sRows] = await db.query("SELECT COUNT(*) as cnt FROM scenes");
  const [pRows] = await db.query("SELECT COUNT(*) as cnt FROM publications");
  const [cRows] = await db.query("SELECT COUNT(*) as cnt FROM content_calendar");
  const [poolRows] = await db.query("SELECT COUNT(*) as cnt FROM curated_pool");
  const [qRows] = await db.query("SELECT COUNT(*) as cnt FROM gcp_quota_pool");

  console.log(`  • books:            ${bRows.cnt} rows`);
  console.log(`  • scenes:           ${sRows.cnt} rows`);
  console.log(`  • publications:     ${pRows.cnt} rows`);
  console.log(`  • content_calendar: ${cRows.cnt} rows`);
  console.log(`  • curated_pool:     ${poolRows.cnt} rows`);
  console.log(`  • gcp_quota_pool:   ${qRows.cnt} rows`);
  console.log("\n🎉 D1 MIGRATION SUCCESSFUL!\n");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
