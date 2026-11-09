/**
 * Automated Metadata Ingestion Engine for BUDI Kemendikdasmen RI
 * (Buku Digital - Badan Pengembangan dan Pembinaan Bahasa)
 * 
 * Harvests book catalog metadata, synopsis, authors, illustrators, reading levels,
 * themes, direct download links, and verifies PDF file integrity (full book vs cover-only).
 * 
 * Usage:
 *   npx tsx scripts/scrape-budi-metadata.ts [options]
 * 
 * Options:
 *   --all                    Scrape full catalog (all pages)
 *   --limit <number>         Limit total books to harvest (e.g. --limit 20)
 *   --category <name>        Filter category: 'digital', 'komik', 'all' (default: 'digital')
 *   --level <name>           Filter level: 'paud', 'sd', 'smp', 'sma', 'umum'
 *   --verify-pdf             Perform HTTP HEAD check on PDF download link (verifies full vs sampul)
 *   --concurrency <number>   Max parallel detail fetch requests (default: 5)
 *   --resume                 Skip books that are already fully harvested in config/budi-catalog.json
 *   --stats                  Display statistics of currently harvested catalog and exit
 *   --to-curated <slug>      Generate a curated-books.json skeleton for a specific book
 *   --search <query>         Search harvested catalog by title, author, or theme
 */

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Category UUID mappings on BUDI Kemendikdasmen
export const BUDI_CATEGORIES: Record<string, { uuid: string; label: string; format: string }> = {
  digital: {
    uuid: "2fd97285-08d0-4d81-83f2-582f0e8b0f36",
    label: "Buku Digital",
    format: "digital",
  },
  komik: {
    uuid: "31ba455c-c9c7-4a3c-a2b1-62915546eaba",
    label: "Buku Komik",
    format: "komik",
  },
  audio: {
    uuid: "9e30a937-0d60-49ad-9775-c19b97cfe864",
    label: "Buku Audio",
    format: "audio",
  },
  video: {
    uuid: "bfe3060d-5f2e-4a1b-9615-40a9f936c6cc",
    label: "Buku Video",
    format: "video",
  },
  braile: {
    uuid: "d677ac85-c5ef-428f-8aaf-71bfb4bcd41f",
    label: "Buku Braile",
    format: "braile",
  },
};

// Reading level UUID mappings on BUDI
export const BUDI_LEVELS: Record<string, { uuid: string; label: string; levelNumber: number }> = {
  paud: { uuid: "014453da-54e6-41b5-be05-952bc233f144", label: "PAUD", levelNumber: 1 },
  sd: { uuid: "0207580f-6a98-477b-a19f-35bfc0f938e9", label: "SD", levelNumber: 2 },
  smp: { uuid: "2070db95-9133-4aa1-9f3f-f711f10df750", label: "SMP", levelNumber: 3 },
  sma: { uuid: "555c961c-fb2a-4a25-8829-4a12c7d2afc0", label: "SMA", levelNumber: 4 },
  umum: { uuid: "a26a4afd-7226-434c-83f3-9ca3ce4af523", label: "UMUM", levelNumber: 4 },
};

export type AssetStatus = "VERIFIED_FULL_PDF" | "CORRUPT_COVER_ONLY" | "VERIFIED_MEDIA" | "UNAVAILABLE" | "PENDING";

export interface BudiBookMetadata {
  id?: number;
  slug: string;
  title: string;
  author: string;
  illustrator: string;
  format: string; // 'digital' | 'komik' | 'audio' | 'video' | 'braile'
  categoryUuid?: string;
  level: string; // 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'UMUM'
  readingLevelNumber: number;
  pages: number;
  language: string;
  theme: string;
  synopsis: string;
  coverUrl: string;
  budiPageUrl: string;
  downloadUrl: string; // Direct file download route
  pdfDownloadUrl?: string; // Legacy/convenience alias for digital & komik
  views: number;
  rating: number;

  // Asset/PDF verification state
  pdfStatus: AssetStatus;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  remoteFileName?: string;
  contentType?: string;
  lastCheckedAt?: string;
}

export interface BudiCatalogData {
  lastUpdated: string;
  totalBooks: number;
  stats: {
    totalScraped: number;
    verifiedFullPdf: number;
    verifiedMedia: number;
    corruptCoverOnly: number;
    unavailablePdf: number;
    pendingVerification: number;
    byFormat: Record<string, number>;
    byLevel: Record<string, number>;
    byTheme: Record<string, number>;
  };
  books: BudiBookMetadata[];
}

const CATALOG_PATH = path.resolve(process.cwd(), "config/budi-catalog.json");
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Format bytes to readable string (e.g. 32.4 MB)
 */
function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Clean and unescape HTML text, handling multiple passes for nested encodings
 */
function cleanHtmlText(text: string): string {
  if (!text) return "";
  let prev: string;
  let decoded = text;
  // Unescape up to 3 passes to handle nested encoding like &amp;nbsp;
  for (let i = 0; i < 3; i++) {
    prev = decoded;
    decoded = decoded
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (decoded === prev) break;
  }
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * Maps level string (e.g. SD, PAUD) to numeric reading level (1-4)
 */
function getReadingLevelNumber(levelStr: string): number {
  const norm = levelStr.toUpperCase().trim();
  if (norm.includes("PAUD") || norm.includes("TK")) return 1;
  if (norm.includes("SD")) return 2;
  if (norm.includes("SMP")) return 3;
  if (norm.includes("SMA") || norm.includes("SMK") || norm.includes("UMUM")) return 4;
  return 2;
}

/**
 * Fetch with retry on temporary network hiccups
 */
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        // Rate limited - back off
        console.warn(`⏳ Rate limited (429) on ${url}, waiting 3s before retry...`);
        await new Promise((r) => setTimeout(r, 3000));
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Parse book listing cards from BUDI load-more AJAX response HTML
 */
function parseBookCards(html: string): Array<Partial<BudiBookMetadata>> {
  const cards: Array<Partial<BudiBookMetadata>> = [];
  // Match link and inner book card
  const cardRegex = /<a\s+href="https:\/\/budi\.kemendikdasmen\.go\.id\/baca\/([^\/]+)\/([^"]+)"[\s\S]*?<div class="book-card">([\s\S]*?)<\/div>\s*<\/div>\s*<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const format = match[1];
    const slug = match[2];
    const cardContent = match[3];

    const imgMatch = cardContent.match(/<img[^>]+src="([^">]+)"/i);
    const ratingMatch = cardContent.match(/class="book-rating"[^>]*>[\s\S]*?([\d.]+)\s*<\/span>/i);
    const viewsMatch = cardContent.match(/class="book-views"[^>]*>[\s\S]*?([\d.]+)\s*<\/span>/i);
    const jenjangMatch = cardContent.match(/class="book-jenjang"[^>]*>[\s\S]*?([A-Za-z0-9\/]+)\s*<\/span>/i);
    const titleMatch = cardContent.match(/class="book-title[^"]*"[^>]*>([\s\S]*?)<\/h5>/i);
    const penulisMatch = cardContent.match(/<b>Penulis:<\/b><br>\s*([\s\S]*?)<\/p>/i);
    const ilustratorMatch = cardContent.match(/<b>Ilustrator:<\/b><br>\s*([\s\S]*?)<\/p>/i);
    const temaMatch = cardContent.match(/<b>Tema:<\/b><br>\s*([\s\S]*?)<\/p>/i);

    const level = jenjangMatch ? cleanHtmlText(jenjangMatch[1]) : "SD";

    cards.push({
      slug,
      format,
      title: titleMatch ? cleanHtmlText(titleMatch[1]) : slug,
      author: penulisMatch ? cleanHtmlText(penulisMatch[1]) : "Tim Penulis",
      illustrator: ilustratorMatch ? cleanHtmlText(ilustratorMatch[1]) : "Tim Ilustrator",
      theme: temaMatch ? cleanHtmlText(temaMatch[1]) : "Umum",
      level,
      readingLevelNumber: getReadingLevelNumber(level),
      views: viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, ""), 10) : 0,
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
      coverUrl: imgMatch ? imgMatch[1].trim() : "",
      budiPageUrl: `https://budi.kemendikdasmen.go.id/baca/${format}/${slug}`,
      downloadUrl: `https://budi.kemendikdasmen.go.id/unduh-file/${slug}/${format}`,
      pdfDownloadUrl: `https://budi.kemendikdasmen.go.id/unduh-file/${slug}/${format}`,
      pdfStatus: "PENDING",
    });
  }

  return cards;
}

/**
 * Fetch detailed metadata for a single book (synopsis, pages, bookId, language)
 */
async function fetchBookDetail(book: Partial<BudiBookMetadata>): Promise<Partial<BudiBookMetadata>> {
  const url = book.budiPageUrl || `https://budi.kemendikdasmen.go.id/baca/${book.format || "digital"}/${book.slug}`;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ HTTP ${res.status} fetching detail for ${book.slug}`);
      return book;
    }

    const html = await res.text();

    // Synopsis
    let synopsis = "";
    const synMatch = html.match(/<h6[^>]*>[\s\S]*?Sinopsis[\s\S]*?<\/h6>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    if (synMatch) {
      synopsis = cleanHtmlText(synMatch[1]);
    }

    // Page count
    let pages = book.pages || 0;
    const pageMatch = html.match(/<td>Halaman<\/td>\s*<td>:<\/td>\s*<td>(\d+)\s*halaman<\/td>/i);
    if (pageMatch) {
      pages = parseInt(pageMatch[1], 10);
    }

    // Language
    let language = book.language || "Indonesia";
    const langMatch = html.match(/<td>Bahasa<\/td>\s*<td>:<\/td>\s*<td>([^<]+)<\/td>/i);
    if (langMatch) {
      language = cleanHtmlText(langMatch[1]);
    }

    // Internal book ID
    let bookId = book.id || 0;
    const idMatch = html.match(/name="book_id"\s+value="(\d+)"/i);
    if (idMatch) {
      bookId = parseInt(idMatch[1], 10);
    }

    return {
      ...book,
      synopsis,
      pages,
      language,
      id: bookId > 0 ? bookId : undefined,
    };
  } catch (err) {
    console.warn(`⚠️ Error fetching detail for ${book.slug}:`, err instanceof Error ? err.message : err);
    return book;
  }
}

/**
 * Verify asset/PDF health using HTTP HEAD
 * Checks if the file exists and whether PDFs are full content vs truncated sampul-only upload
 */
async function verifyAssetHealth(book: BudiBookMetadata): Promise<BudiBookMetadata> {
  const downloadUrl = book.downloadUrl || book.pdfDownloadUrl;
  try {
    const res = await fetchWithRetry(downloadUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    const now = new Date().toISOString();
    if (!res.ok) {
      return {
        ...book,
        pdfStatus: "UNAVAILABLE",
        lastCheckedAt: now,
      };
    }

    const disposition = res.headers.get("content-disposition") || "";
    const length = parseInt(res.headers.get("content-length") || "0", 10);
    const contentType = res.headers.get("content-type") || "";
    const filenameMatch = disposition.match(/filename=["']?([^"';]+)/i);
    const remoteFileName = filenameMatch ? filenameMatch[1].trim() : "";

    let status: AssetStatus = "VERIFIED_FULL_PDF";

    if (book.format === "audio" || book.format === "video") {
      status = "VERIFIED_MEDIA";
    } else {
      // Known BUDI bug signature on PDF books:
      // When admin mis-uploaded the cover file instead of the full book:
      // 1. remote filename begins with "Sampul_"
      // 2. OR file size is tiny (< 1.5MB) while page count is high (> 10 pages)
      if (remoteFileName.toLowerCase().startsWith("sampul_") || (length < 1_500_000 && length > 0 && book.pages > 10)) {
        status = "CORRUPT_COVER_ONLY";
      }
    }

    return {
      ...book,
      pdfStatus: status,
      fileSizeBytes: length,
      fileSizeFormatted: formatBytes(length),
      remoteFileName,
      contentType,
      lastCheckedAt: now,
    };
  } catch (err) {
    return {
      ...book,
      pdfStatus: "UNAVAILABLE",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

/**
 * Load existing catalog file if available
 */
async function loadExistingCatalog(): Promise<BudiCatalogData> {
  if (existsSync(CATALOG_PATH)) {
    try {
      const raw = await fs.readFile(CATALOG_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      // Ignore parse error and start fresh
    }
  }

  return {
    lastUpdated: new Date().toISOString(),
    totalBooks: 0,
    stats: {
      totalScraped: 0,
      verifiedFullPdf: 0,
      verifiedMedia: 0,
      corruptCoverOnly: 0,
      unavailablePdf: 0,
      pendingVerification: 0,
      byFormat: {},
      byLevel: {},
      byTheme: {},
    },
    books: [],
  };
}

/**
 * Compute aggregate statistics for the catalog
 */
function computeCatalogStats(books: BudiBookMetadata[]): BudiCatalogData["stats"] {
  const stats: BudiCatalogData["stats"] = {
    totalScraped: books.length,
    verifiedFullPdf: 0,
    verifiedMedia: 0,
    corruptCoverOnly: 0,
    unavailablePdf: 0,
    pendingVerification: 0,
    byFormat: {},
    byLevel: {},
    byTheme: {},
  };

  for (const b of books) {
    if (b.pdfStatus === "VERIFIED_FULL_PDF") stats.verifiedFullPdf++;
    else if (b.pdfStatus === "VERIFIED_MEDIA") stats.verifiedMedia++;
    else if (b.pdfStatus === "CORRUPT_COVER_ONLY") stats.corruptCoverOnly++;
    else if (b.pdfStatus === "UNAVAILABLE") stats.unavailablePdf++;
    else stats.pendingVerification++;

    stats.byFormat[b.format] = (stats.byFormat[b.format] || 0) + 1;
    stats.byLevel[b.level] = (stats.byLevel[b.level] || 0) + 1;
    stats.byTheme[b.theme] = (stats.byTheme[b.theme] || 0) + 1;
  }

  return stats;
}

/**
 * Print catalog statistics table to console
 */
function printCatalogStats(catalog: BudiCatalogData) {
  const s = catalog.stats;
  console.log("\n=======================================================");
  console.log("📊 BUDI KEMENDIKDASMEN CATALOG OVERVIEW");
  console.log("=======================================================");
  console.log(`🕒 Last Updated      : ${catalog.lastUpdated}`);
  console.log(`📚 Total Books Ingest: ${catalog.totalBooks}`);
  console.log(`✅ Verified Full PDFs : ${s.verifiedFullPdf}`);
  if (s.verifiedMedia > 0) {
    console.log(`🎬 Verified Media     : ${s.verifiedMedia} (Audio/Video streams)`);
  }
  console.log(`⚠️ Corrupt Cover Only : ${s.corruptCoverOnly} (Admin mis-uploads flagged)`);
  console.log(`❌ Unavailable Assets : ${s.unavailablePdf}`);
  console.log(`⏳ Pending Verify    : ${s.pendingVerification}`);

  console.log("\n📂 Distribution by Format:");
  for (const [fmt, cnt] of Object.entries(s.byFormat)) {
    console.log(`   - ${fmt.padEnd(12)}: ${cnt} books`);
  }

  console.log("\n🎓 Distribution by Level:");
  for (const [lvl, cnt] of Object.entries(s.byLevel)) {
    console.log(`   - ${lvl.padEnd(12)}: ${cnt} books`);
  }

  console.log("\n🎨 Distribution by Theme (Top 6):");
  const topThemes = Object.entries(s.byTheme)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  for (const [thm, cnt] of topThemes) {
    console.log(`   - ${thm.padEnd(25)}: ${cnt} books`);
  }
  console.log("=======================================================\n");
}

/**
 * Export a book skeleton formatted for Zayn Storybook curated-books.json
 */
function generateCuratedSkeleton(book: BudiBookMetadata) {
  const skeleton = {
    slug: book.slug,
    title: book.title,
    originalTitle: book.title,
    author: book.author,
    illustrator: book.illustrator,
    publisher: "Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI",
    license: "Lisensi Terbuka / Hak Cipta Kemendikdasmen RI",
    readingLevel: book.readingLevelNumber,
    sourceUrl: book.budiPageUrl,
    pdfUrl: book.pdfDownloadUrl,
    coverPage: 1,
    avatarPage: 2,
    theme: `${book.theme}: ${book.title}`,
    characterBible: {
      protagonists: [
        {
          id: "tokoh-utama",
          name: "Tokoh Utama",
          role: "Main Character",
          voice: {
            id: "id-ID-GadisNeural",
            en: "en-US-AnaNeural",
            color: "#38BDF8",
            badge: "📖 Narator",
          },
        },
      ],
    },
    worldBible: {
      village: book.title,
      palette: {
        primary: "#38BDF8",
        warmYellow: "#FDE047",
        coralRed: "#EF4444",
        softPurple: "#A855F7",
      },
    },
    moral: {
      headlineId: `Pelajaran dari ${book.title}`,
      spokenId: `Cerita ini mengajarkan kita tentang ${book.theme.toLowerCase()}.`,
      headlineEn: `Lesson from ${book.title}`,
      spokenEn: `This story teaches us about ${book.theme.toLowerCase()}.`,
    },
    thumbnailConfig: {
      heroImage: "page-01.png",
      backdropImage: "page-01.png",
      id: {
        badge: book.level,
        headline: book.title,
        subhead: `Karya ${book.author}`,
      },
      en: {
        badge: `Level ${book.readingLevelNumber}`,
        headline: book.title,
        subhead: `By ${book.author}`,
      },
    },
    scenes: [
      {
        index: 1,
        type: "cover",
        pageNumber: 1,
        id: book.title,
        en: book.title,
      },
    ],
  };

  console.log("\n=======================================================");
  console.log(`📋 SKELETON FOR CURATED-BOOKS.JSON: ${book.slug}`);
  console.log("=======================================================");
  console.log(JSON.stringify(skeleton, null, 2));
  console.log("=======================================================\n");
}

/**
 * Worker pool helper for bounded concurrent processing
 */
async function asyncPool<T, R>(concurrency: number, items: T[], fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Main Scraper Engine
 */
async function main() {
  const args = process.argv.slice(2);

  // CLI argument parsing
  const isAll = args.includes("--all");
  const isVerifyPdf = args.includes("--verify-pdf");
  const isResume = args.includes("--resume");
  const isStats = args.includes("--stats");

  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : isAll ? Infinity : 20;

  const categoryIdx = args.indexOf("--category");
  const categoryFilter = categoryIdx !== -1 && args[categoryIdx + 1] ? args[categoryIdx + 1].toLowerCase() : "digital";

  const levelIdx = args.indexOf("--level");
  const levelFilter = levelIdx !== -1 && args[levelIdx + 1] ? args[levelIdx + 1].toLowerCase() : undefined;

  const concurrencyIdx = args.indexOf("--concurrency");
  const concurrency = concurrencyIdx !== -1 && args[concurrencyIdx + 1] ? parseInt(args[concurrencyIdx + 1], 10) : 5;

  const searchIdx = args.indexOf("--search");
  const searchQuery = searchIdx !== -1 && args[searchIdx + 1] ? args[searchIdx + 1].toLowerCase() : undefined;

  const toCuratedIdx = args.indexOf("--to-curated");
  const toCuratedSlug = toCuratedIdx !== -1 && args[toCuratedIdx + 1] ? args[toCuratedIdx + 1] : undefined;

  // Load existing catalog
  const catalog = await loadExistingCatalog();

  // If --stats requested, print and exit
  if (isStats) {
    catalog.stats = computeCatalogStats(catalog.books);
    printCatalogStats(catalog);
    return;
  }

  // If --search requested
  if (searchQuery) {
    console.log(`\n🔍 Searching catalog for: "${searchQuery}"...`);
    const results = catalog.books.filter(
      (b) =>
        b.title.toLowerCase().includes(searchQuery) ||
        b.slug.toLowerCase().includes(searchQuery) ||
        b.author.toLowerCase().includes(searchQuery) ||
        b.theme.toLowerCase().includes(searchQuery)
    );
    console.log(`Found ${results.length} matching books:`);
    for (const r of results) {
      console.log(`  • [${r.format.toUpperCase()} | ${r.level}] ${r.title} (${r.slug}) - ${r.author} [${r.pdfStatus}]`);
    }
    return;
  }

  // If --to-curated requested
  if (toCuratedSlug) {
    const book = catalog.books.find((b) => b.slug === toCuratedSlug);
    if (!book) {
      console.error(`❌ Book with slug "${toCuratedSlug}" not found in catalog. Run ingestion first!`);
      process.exit(1);
    }
    generateCuratedSkeleton(book);
    return;
  }

  console.log("=======================================================");
  console.log("🚀 BUDI KEMENDIKDASMEN INGESTION ENGINE");
  console.log("=======================================================");
  console.log(`🎯 Category Filter : ${categoryFilter} (${BUDI_CATEGORIES[categoryFilter]?.label || "All Categories"})`);
  console.log(`🎯 Target Limit     : ${limit === Infinity ? "ALL CATALOG" : limit}`);
  console.log(`🔍 Verify PDF Heads : ${isVerifyPdf ? "YES (HEAD check)" : "NO"}`);
  console.log(`⚡ Concurrency      : ${concurrency}`);
  console.log(`🔄 Resume Mode      : ${isResume ? "ON" : "OFF"}`);
  console.log("=======================================================\n");

  const categoryUuid = categoryFilter === "all" ? "" : BUDI_CATEGORIES[categoryFilter]?.uuid || "";
  const levelUuid = levelFilter ? BUDI_LEVELS[levelFilter]?.uuid || "" : "";

  // Map existing slugs for resume lookup
  const bookMap = new Map<string, BudiBookMetadata>();
  for (const b of catalog.books) {
    bookMap.set(b.slug, b);
  }

  // Phase 1: Crawl Catalog Listing
  console.log("📡 Phase 1: Crawling book listing from BUDI AJAX endpoint...");
  const discoveredCards: Array<Partial<BudiBookMetadata>> = [];
  let offset = 0;
  const batchSize = 6;
  let hasMore = true;

  while (hasMore && discoveredCards.length < limit) {
    const queryParams = new URLSearchParams();
    queryParams.set("offset", offset.toString());
    if (categoryUuid) queryParams.set("tipe", categoryUuid);
    if (levelUuid) queryParams.set("level", levelUuid);

    const loadMoreUrl = `https://budi.kemendikdasmen.go.id/buku/load-more?${queryParams.toString()}`;
    const res = await fetchWithRetry(loadMoreUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ HTTP ${res.status} on offset ${offset}`);
      break;
    }

    const data = (await res.json()) as { html?: string };
    if (!data.html || data.html.trim().length === 0) {
      hasMore = false;
      break;
    }

    const cards = parseBookCards(data.html);
    if (cards.length === 0) {
      hasMore = false;
      break;
    }

    for (const card of cards) {
      if (discoveredCards.length >= limit) break;
      discoveredCards.push(card);
    }

    process.stdout.write(`\r📥 Harvested ${discoveredCards.length} book cards (offset ${offset})...`);
    offset += batchSize;
    // Gentle throttle
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\n✅ Phase 1 Complete: Discovered ${discoveredCards.length} book entries.`);

  // Phase 2: Detail Metadata Enrichment
  console.log("\n📖 Phase 2: Fetching synopsis and detailed page metadata...");
  const enrichedBooks: BudiBookMetadata[] = [];
  let processedCount = 0;

  await asyncPool(concurrency, discoveredCards, async (card) => {
    const slug = card.slug!;
    let fullBook: BudiBookMetadata;

    // Check resume cache
    const existing = bookMap.get(slug);
    if (isResume && existing && existing.synopsis) {
      fullBook = { ...existing, ...card };
    } else {
      const detail = await fetchBookDetail(card);
      fullBook = {
        id: detail.id,
        slug: detail.slug!,
        title: detail.title!,
        author: detail.author!,
        illustrator: detail.illustrator!,
        format: detail.format || categoryFilter,
        categoryUuid: categoryUuid || undefined,
        level: detail.level!,
        readingLevelNumber: detail.readingLevelNumber || getReadingLevelNumber(detail.level!),
        pages: detail.pages || 0,
        language: detail.language || "Indonesia",
        theme: detail.theme!,
        synopsis: detail.synopsis || "",
        coverUrl: detail.coverUrl!,
        budiPageUrl: detail.budiPageUrl!,
        downloadUrl: detail.downloadUrl || detail.pdfDownloadUrl || `https://budi.kemendikdasmen.go.id/unduh-file/${detail.slug}/${detail.format || categoryFilter}`,
        pdfDownloadUrl: detail.pdfDownloadUrl || `https://budi.kemendikdasmen.go.id/unduh-file/${detail.slug}/${detail.format || categoryFilter}`,
        views: detail.views || 0,
        rating: detail.rating || 0,
        pdfStatus: existing?.pdfStatus || "PENDING",
        fileSizeBytes: existing?.fileSizeBytes,
        fileSizeFormatted: existing?.fileSizeFormatted,
        remoteFileName: existing?.remoteFileName,
        lastCheckedAt: existing?.lastCheckedAt,
      };
    }

    // Phase 3: PDF Health Verification (if requested or missing)
    if (isVerifyPdf) {
      if (!isResume || !fullBook.lastCheckedAt || fullBook.pdfStatus === "PENDING") {
        fullBook = await verifyAssetHealth(fullBook);
      }
    }

    enrichedBooks.push(fullBook);
    bookMap.set(slug, fullBook);
    processedCount++;

    if (processedCount % 10 === 0 || processedCount === discoveredCards.length) {
      process.stdout.write(`\r⏳ Enriched ${processedCount}/${discoveredCards.length} books...`);
    }

    // Gentle pacing
    await new Promise((r) => setTimeout(r, 60));
  });

  console.log(`\n✅ Phase 2 & 3 Complete.`);

  // Update Catalog Data
  catalog.lastUpdated = new Date().toISOString();
  catalog.books = Array.from(bookMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  catalog.totalBooks = catalog.books.length;
  catalog.stats = computeCatalogStats(catalog.books);

  // Write to disk
  await fs.mkdir(path.dirname(CATALOG_PATH), { recursive: true });
  await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf-8");
  console.log(`\n💾 Saved ${catalog.totalBooks} books to: ${CATALOG_PATH}`);

  // Display summary
  printCatalogStats(catalog);
}

// Execute
if (require.main === module || process.argv[1].endsWith("scrape-budi-metadata.ts")) {
  main().catch((err) => {
    console.error("❌ Fatal scraper error:", err);
    process.exit(1);
  });
}
