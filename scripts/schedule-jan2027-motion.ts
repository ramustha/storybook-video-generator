import fs from "fs/promises";
import path from "path";
import { db } from "./lib/db";
import { DAILY_CALENDAR_MONTH_1, SUNDAY_FULL_MOTION_2026 } from "./content-calendar";

interface BudiCatalogBook {
  id: number;
  slug: string;
  title: string;
  author: string;
  illustrator: string;
  format: string;
  level: string;
  readingLevelNumber: number;
  pages: number;
  theme: string;
  synopsis: string;
  coverUrl: string;
  budiPageUrl: string;
  pdfDownloadUrl: string;
  pdfStatus: string;
  views?: number;
}

export type DifficultyTier = "L1-Easy" | "L2-EarlyMed" | "L3-Medium" | "L4-Harder";

export interface PlannedBookSlot {
  date: string;
  dayName: string;
  difficulty: DifficultyTier;
  book: BudiCatalogBook;
  coverContentType: string;
}

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const JAN_2027_START = "2027-01-01";
const JAN_2027_END = "2027-01-31";
const LOG_DIR = path.resolve("./stories/.schedule-logs");

function isCompleteVerifiedSource(book: BudiCatalogBook): boolean {
  if (book.pdfStatus !== "VERIFIED_FULL_PDF") return false;
  if (!book.title?.trim() || !book.slug?.trim()) return false;
  if (!book.coverUrl?.trim() || !book.budiPageUrl?.trim() || !book.pdfDownloadUrl?.trim()) return false;
  if (!book.author?.trim() || book.author.trim() === "-") return false;
  if (!book.illustrator?.trim() || book.illustrator.trim() === "-") return false;
  if (!book.theme?.trim()) return false;
  if (!book.synopsis || book.synopsis.trim().length < 25) return false;
  if (!Number.isFinite(book.pages) || book.pages < 10) return false;
  return true;
}

function classifyDifficulty(book: BudiCatalogBook): DifficultyTier {
  if ((book.readingLevelNumber || 2) === 1 || book.level === "PAUD" || book.pages <= 24) {
    return "L1-Easy";
  }
  if (book.pages <= 28) return "L2-EarlyMed";
  if (book.pages <= 36) return "L3-Medium";
  return "L4-Harder";
}

function sortEasyToHard(books: BudiCatalogBook[]): BudiCatalogBook[] {
  const rank = (b: BudiCatalogBook): number => {
    if ((b.readingLevelNumber || 2) === 1 || b.level === "PAUD") return 1;
    if ((b.readingLevelNumber || 2) === 2) return 2;
    return 3;
  };
  return [...books].sort((a, b) => {
    const rDiff = rank(a) - rank(b);
    if (rDiff !== 0) return rDiff;
    const pDiff = a.pages - b.pages;
    if (pDiff !== 0) return pDiff;
    return (b.views || 0) - (a.views || 0);
  });
}

async function verifyCoverUrl(url: string): Promise<{ ok: boolean; contentType: string }> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const ct = res.headers.get("content-type") || "";
    return { ok: res.ok && ct.startsWith("image/"), contentType: ct || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, contentType: err.message };
  }
}

async function select31LeveledBooks(
  catalogBooks: BudiCatalogBook[],
  excludedSlugs: Set<string>
): Promise<Array<{ book: BudiCatalogBook; difficulty: DifficultyTier; coverContentType: string }>> {
  const eligible = catalogBooks.filter(
    (b) => isCompleteVerifiedSource(b) && !excludedSlugs.has(b.slug)
  );
  const ordered = sortEasyToHard(eligible);

  // Build balanced progression: prioritize PAUD RL1 + <=24p (L1), 25-28p (L2), 29-36p (L3), >=40p (L4)
  const l1 = ordered.filter((b) => classifyDifficulty(b) === "L1-Easy");
  const l2 = ordered.filter((b) => classifyDifficulty(b) === "L2-EarlyMed");
  const l3 = ordered.filter((b) => classifyDifficulty(b) === "L3-Medium");
  const l4 = ordered.filter((b) => classifyDifficulty(b) === "L4-Harder");

  const targetBuckets: Array<{ tier: DifficultyTier; need: number; pool: BudiCatalogBook[] }> = [
    { tier: "L1-Easy", need: 7, pool: l1 },
    { tier: "L2-EarlyMed", need: 7, pool: l2 },
    { tier: "L3-Medium", need: 9, pool: l3 },
    { tier: "L4-Harder", need: 8, pool: l4 },
  ];

  const picked: Array<{ book: BudiCatalogBook; difficulty: DifficultyTier; coverContentType: string }> = [];
  const used = new Set<string>();

  for (const bucket of targetBuckets) {
    let added = 0;
    for (const candidate of bucket.pool) {
      if (added >= bucket.need) break;
      if (used.has(candidate.slug)) continue;
      const check = await verifyCoverUrl(candidate.coverUrl);
      if (!check.ok) {
        console.warn(`   ⏩ Skipped [${candidate.slug}] (broken cover: ${check.contentType})`);
        continue;
      }
      used.add(candidate.slug);
      picked.push({ book: candidate, difficulty: bucket.tier, coverContentType: check.contentType });
      added++;
    }
  }

  if (picked.length < 31) {
    for (const fallback of ordered) {
      if (picked.length >= 31) break;
      if (used.has(fallback.slug)) continue;
      const check = await verifyCoverUrl(fallback.coverUrl);
      if (!check.ok) continue;
      used.add(fallback.slug);
      picked.push({
        book: fallback,
        difficulty: classifyDifficulty(fallback),
        coverContentType: check.contentType,
      });
    }
  }

  return picked;
}

async function upsertBudiBook(
  b: BudiCatalogBook,
  slugOverride: string,
  themeLabel: string,
  updateIfExists = true
) {
  const conflictClause = updateIfExists
    ? `ON CONFLICT(slug) DO UPDATE SET
       title_id = excluded.title_id,
       author = excluded.author,
       illustrator = excluded.illustrator,
       theme = excluded.theme,
       source_url = excluded.source_url,
       pdf_url = excluded.pdf_url;`
    : `ON CONFLICT(slug) DO NOTHING;`;
  await db.execute(
    `INSERT INTO books (slug, title_id, title_en, original_title, author, illustrator, publisher, license, theme, source_url, pdf_url)
     VALUES (?, ?, ?, ?, ?, ?, 'Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI', 'Lisensi Terbuka Kemendikdasmen RI', ?, ?, ?)
     ${conflictClause}`,
    [slugOverride, b.title, b.title, b.title, b.author, b.illustrator, themeLabel, b.budiPageUrl, b.pdfDownloadUrl]
  );
}

function addUtcDays(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function runRollback() {
  await fs.mkdir(LOG_DIR, { recursive: true });
  await db.execute(
    `DELETE FROM content_calendar WHERE scheduled_date >= ? AND scheduled_date <= ?;`,
    [JAN_2027_START, JAN_2027_END]
  );
  await db.execute(
    `DELETE FROM content_calendar WHERE scheduled_date >= '2026-11-15' AND scheduled_date <= '2027-02-05' AND time_slot = '15:00 WIB';`,
    []
  );
  await db.execute(
    `DELETE FROM announcements WHERE scheduled_date >= ? AND scheduled_date <= ?;`,
    [JAN_2027_START, JAN_2027_END]
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(
    path.join(LOG_DIR, `jan2027-rollback-${stamp}.log`),
    `Rolled back D1 Sunday Full-Motion slots (2026-11-15..2026-12-31 @ 15:00 WIB) and ${JAN_2027_START}..${JAN_2027_END} content_calendar + announcements.\n`,
    "utf-8"
  );
  console.log(`✅ Rolled back 2026 Sunday Full-Motion slots and ${JAN_2027_START}..${JAN_2027_END} slots in D1.`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const rollback = args.includes("--rollback");

  if (rollback) {
    await runRollback();
    return;
  }

  const catalogRaw = await fs.readFile(path.resolve("./config/budi-catalog.json"), "utf-8");
  const catalogBooks: BudiCatalogBook[] = JSON.parse(catalogRaw).books || [];

  const calRows = await db.query<{ book_slug: string }>("SELECT DISTINCT book_slug FROM content_calendar");
  const poolRows = await db.query<{ slug: string }>("SELECT slug FROM curated_pool WHERE status = 'ingested'");
  const excluded = new Set<string>([
    ...calRows.map((r) => r.book_slug),
    ...poolRows.map((r) => r.slug),
    ...DAILY_CALENDAR_MONTH_1.map((s) => s.bookSlug.replace(/^edu-budi-/, "")),
    "papang-teripang",
    "fermentasi-nusantara",
  ]);

  console.log("🔍 Filtering complete verified BUDI books (Easy → Hard) and checking live cover URLs...");
  const selected = await select31LeveledBooks(catalogBooks, excluded);
  if (selected.length < 31) {
    throw new Error(`Expected 31 valid leveled BUDI books, found only ${selected.length}`);
  }

  const janDailyUsed = new Set(selected.slice(0, 31).map((s) => s.book.slug));
  const sundayPool = sortEasyToHard(
    catalogBooks.filter(
      (b) => isCompleteVerifiedSource(b) && !excluded.has(b.slug) && !janDailyUsed.has(b.slug)
    )
  ).reverse();

  const startMs = new Date(`${JAN_2027_START}T00:00:00Z`).getTime();
  const plan: PlannedBookSlot[] = selected.slice(0, 31).map((item, idx) => {
    const dt = new Date(startMs + idx * 86_400_000);
    const date = dt.toISOString().slice(0, 10);
    const dayName = DAYS_ID[dt.getUTCDay()];
    return {
      date,
      dayName,
      difficulty: item.difficulty,
      book: item.book,
      coverContentType: item.coverContentType,
    };
  });

  const janSundays = plan.filter((p) => p.dayName === "Minggu").map((p) => p.date);
  const janSundayMotion: Array<{ date: string; motionSlug: string; book: BudiCatalogBook }> = [];
  for (const b of sundayPool) {
    if (janSundayMotion.length >= janSundays.length) break;
    const check = await verifyCoverUrl(b.coverUrl);
    if (!check.ok) continue;
    janSundayMotion.push({
      date: janSundays[janSundayMotion.length],
      motionSlug: `edu-budi-${b.slug}`,
      book: b,
    });
  }

  await fs.mkdir(LOG_DIR, { recursive: true });
  const planFile = path.join(LOG_DIR, "jan2027-plan.json");
  await fs.writeFile(planFile, JSON.stringify(plan, null, 2), "utf-8");

  const sunday2026File = path.join(LOG_DIR, "sunday-motion-roadmap.json");
  await fs.writeFile(
    sunday2026File,
    JSON.stringify({ sundays2026: SUNDAY_FULL_MOTION_2026, sundaysJan2027: janSundayMotion }, null, 2),
    "utf-8"
  );

  console.log(`\n🎬 FULL-MOTION ROADMAP (Sun 15:00 WIB EN | Wed 15:00 WIB ID — ${SUNDAY_FULL_MOTION_2026.length / 2} stories 2026 + ${janSundayMotion.length} stories Jan 2027):`);
  for (const s of SUNDAY_FULL_MOTION_2026) {
    if (!s.date) continue;
    console.log(`   ${s.date} (${s.dayName.padEnd(6)} 15:00 WIB) [${s.lang.toUpperCase()}] ${s.bookSlug} — ${s.theme}`);
  }
  for (const j of janSundayMotion) {
    console.log(`   ${j.date} (Minggu 15:00 WIB) [EN] ${j.motionSlug} — "${j.book.title}" (${j.book.theme})`);
    console.log(`   ${addUtcDays(j.date, 3)} (Rabu   15:00 WIB) [ID] ${j.motionSlug} — "${j.book.title}" (${j.book.theme})`);
  }

  console.log(`\n📅 JANUARY 2027 FULL-MONTH EASY → HARD PLAN (${plan.length} daily books / ${plan.length * 2} slots):`);
  for (const row of plan) {
    const b = row.book;
    console.log(
      `   ${row.date} (${row.dayName.padEnd(6)}) [${row.difficulty.padEnd(11)} RL${b.readingLevelNumber} ${String(b.pages).padStart(2)}p] ${b.slug} — "${b.title}" (${b.theme})`
    );
  }
  console.log(`\n📄 Plans saved to: ${planFile} & ${sunday2026File}`);

  if (!apply) {
    console.log("ℹ️ Dry-run mode active (pass --apply to write to D1, or --rollback to revert).");
    return;
  }

  let writtenBooks = 0;
  let writtenSlots = 0;

  const catalogBySlug = new Map(catalogBooks.map((b) => [b.slug, b]));
  const ensured2026Slugs = new Set<string>();
  for (const s of SUNDAY_FULL_MOTION_2026) {
    if (!ensured2026Slugs.has(s.bookSlug)) {
      ensured2026Slugs.add(s.bookSlug);
      const rawSlug = s.bookSlug.replace(/^edu-budi-/, "");
      const catalogMatch = catalogBySlug.get(rawSlug);
      if (catalogMatch) {
        await upsertBudiBook(catalogMatch, s.bookSlug, s.theme, false);
        writtenBooks++;
      }
    }
    await db.saveCalendarSlot({
      scheduled_date: s.date!,
      day_name: s.dayName,
      time_slot: s.timeSlot,
      slot_type: s.slotType,
      book_slug: s.bookSlug,
      lang: s.lang,
      format: s.format,
      theme: s.theme,
      is_completed: false,
    });
    writtenSlots++;
  }

  for (const j of janSundayMotion) {
    await upsertBudiBook(j.book, j.motionSlug, `Full-Motion · ${j.book.theme}`);
    writtenBooks++;
    await db.saveCalendarSlot({
      scheduled_date: j.date,
      day_name: "Minggu",
      time_slot: "15:00 WIB",
      slot_type: "Sunday Full-Motion Premiere (EN)",
      book_slug: j.motionSlug,
      lang: "en",
      format: "both",
      theme: `Sunday Full-Motion · ${j.book.theme}`,
      is_completed: false,
    });
    await db.saveCalendarSlot({
      scheduled_date: addUtcDays(j.date, 3),
      day_name: "Rabu",
      time_slot: "15:00 WIB",
      slot_type: "Wednesday Full-Motion Premiere (ID)",
      book_slug: j.motionSlug,
      lang: "id",
      format: "both",
      theme: `Wednesday Full-Motion · ${j.book.theme}`,
      is_completed: false,
    });
    writtenSlots += 2;
  }

  for (const item of plan) {
    const b = item.book;
    await upsertBudiBook(b, b.slug, `${item.difficulty} · ${b.theme}`);
    writtenBooks++;

    await db.saveCalendarSlot({
      scheduled_date: item.date,
      day_name: item.dayName,
      time_slot: "08:30 WIB",
      slot_type: `Morning English Feature (${item.difficulty})`,
      book_slug: b.slug,
      lang: "en",
      format: "both",
      theme: `${item.difficulty} · ${b.theme}`,
      is_completed: false,
    });
    await db.saveCalendarSlot({
      scheduled_date: item.date,
      day_name: item.dayName,
      time_slot: "19:00 WIB",
      slot_type: `Prime Bedtime Story (${item.difficulty})`,
      book_slug: b.slug,
      lang: "id",
      format: "both",
      theme: `${item.difficulty} · ${b.theme}`,
      is_completed: false,
    });
    writtenSlots += 2;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const applyLog = path.join(LOG_DIR, `jan2027-apply-${stamp}.log`);
  await fs.writeFile(
    applyLog,
    `Applied ${writtenBooks} books and ${writtenSlots} slots (2026 Sunday Full-Motion + ${JAN_2027_START}..${JAN_2027_END}) to D1.\nRollback command: npx tsx scripts/schedule-jan2027-motion.ts --rollback\n`,
    "utf-8"
  );
  console.log(`✅ Applied ${writtenBooks} books and ${writtenSlots} slots to D1. Log: ${applyLog}`);
}

main().catch((err) => {
  console.error("❌ Failed scheduling Jan 2027:", err);
  process.exit(1);
});
