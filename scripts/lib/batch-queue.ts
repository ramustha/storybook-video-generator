export interface CalendarSlotCandidate {
  date?: string;
  bookSlug: string;
  lang: string;
  format?: string;
}

export interface BudiBookCandidate {
  slug: string;
  title: string;
  author?: string;
  illustrator?: string;
  level?: string;
  theme?: string;
  budiPageUrl?: string;
  pdfDownloadUrl?: string;
}

export interface CuratedBookCandidate {
  slug: string;
  title: string;
  originalTitle: string;
  author: string;
  illustrator: string;
  publisher: string;
  license: string;
  readingLevel: number;
  sourceUrl: string;
  pdfUrl: string;
  coverPage?: number;
  avatarPage?: number;
  theme: string;
  characterBible: {
    protagonists: Array<{
      id: string;
      name: string;
      role: string;
      voice: { id: string; en: string; color: string; badge: string };
    }>;
  };
  worldBible: { village: string; palette: Record<string, string> };
  moral: {
    headlineId: string;
    spokenId: string;
    headlineEn: string;
    spokenEn: string;
  };
  thumbnailConfig: any;
  scenes: Array<{
    index: number;
    type: string;
    pageNumber: number;
    id: string;
    en: string;
  }>;
}

const KNOWN_COMPILATION_THEMES = new Set([
  "bedtime",
  "sringeri",
  "animals",
  "moral",
  "keluarga-ceria",
  "fabel-hewan",
  "dongeng-menenangkan",
  "bedtime-60m",
]);

/**
 * Formats a WIB (Asia/Jakarta) calendar date shifted by daysOffset from baseDate.
 */
export function getWibDateOffsetIso(daysOffset: number = 0, baseDate: Date = new Date()): string {
  const shifted = new Date(baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/**
 * Resolves the compilation preset theme ID if bookSlug refers to a marathon compilation.
 */
export function parseCompilationTheme(bookSlug: string): string | null {
  if (!bookSlug.startsWith("kompilasi-")) {
    return null;
  }
  const themeId = bookSlug.slice("kompilasi-".length);
  if (KNOWN_COMPILATION_THEMES.has(themeId)) {
    return themeId;
  }
  if (themeId.includes("keluarga")) return "keluarga-ceria";
  if (themeId.includes("fabel") || themeId.includes("hewan")) return "fabel-hewan";
  if (themeId.includes("bedtime-60m") || themeId.includes("akbar")) return "bedtime-60m";
  return "dongeng-menenangkan";
}

/**
 * Converts a BUDI catalog record into a CuratedBook payload ready for auto-extraction ingestion.
 */
export function buildCuratedBookFromBudi(b: BudiBookCandidate): CuratedBookCandidate {
  const safeTitle = b.title || b.slug;
  return {
    slug: b.slug,
    title: safeTitle,
    originalTitle: safeTitle,
    author: b.author || "Penulis BUDI Kemendikdasmen RI",
    illustrator:
      b.illustrator && b.illustrator !== "-" ? b.illustrator : "Ilustrator BUDI Kemendikdasmen RI",
    publisher: "Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI",
    license: "Lisensi Terbuka Kemendikdasmen RI",
    readingLevel: b.level === "PAUD" ? 1 : 2,
    sourceUrl: b.budiPageUrl || `https://budi.kemendikdasmen.go.id/baca/digital/${b.slug}`,
    pdfUrl: b.pdfDownloadUrl || `https://budi.kemendikdasmen.go.id/unduh-file/${b.slug}/digital`,
    coverPage: 1,
    avatarPage: 2,
    theme: b.theme || "Cerita Anak Indonesia",
    characterBible: { protagonists: [] },
    worldBible: { village: "Nusantara", palette: {} },
    moral: {
      headlineId: "Budi Pekerti & Keberanian",
      spokenId: "Mari belajar kebaikan, keberanian, dan kepedulian kepada sesama setiap hari.",
      headlineEn: "Kindness & Courage",
      spokenEn: "Let's practice kindness, courage, and caring for everyone around us every day.",
    },
    thumbnailConfig: {
      heroImage: "assets/cover.png",
      backdropImage: "assets/cover.png",
      id: {
        headlineTop: safeTitle.toUpperCase(),
        headlineBottom: "CERITA NUSANTARA",
        hook: "Petualangan Seru Penuh Nilai Kebaikan!",
        hookEmoji: "📖✨💖",
        badge: "Kisah Pilihan Anak",
        sticker: "Cerita Edukatif!",
        bedtimeTitle: safeTitle,
        bedtimeHook: "Dongeng Pengantar Tidur Penuh Ketenangan",
      },
      en: {
        headlineTop: safeTitle.toUpperCase(),
        headlineBottom: "INDONESIAN TALE",
        hook: "A Heartwarming Journey of Kindness!",
        hookEmoji: "📖✨💖",
        badge: "Featured Story",
        sticker: "Bedtime Classic!",
        bedtimeTitle: safeTitle,
        bedtimeHook: "A Soothing Bedtime Story for Sweet Dreams",
      },
    },
    scenes: [],
  };
}

/**
 * Normalizes a story title for duplicate-title detection across slugs/catalogs.
 */
export function normalizeStoryTitle(title: string): string {
  return String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Selects the next standalone books to ingest, prioritizing upcoming calendar dates (>= startDateIso)
 * starting tomorrow before falling back to remaining un-ingested entries in curatedBooks.
 * Deduplicates by both slug and normalized title (unless force=true).
 */
export function selectUpcomingIngestionQueue<T extends CuratedBookCandidate>(params: {
  calendarSlots: CalendarSlotCandidate[];
  curatedBooks: T[];
  budiBooks: BudiBookCandidate[];
  r2Slugs: Set<string>;
  startDateIso: string;
  limit: number;
  includeAll?: boolean;
  force?: boolean;
}): {
  queue: T[];
  uncuratedUpcomingSlugs: string[];
  skippedDuplicateTitles: Array<{ slug: string; title: string }>;
} {
  const curatedMap = new Map<string, T>(params.curatedBooks.map((b) => [b.slug, b]));
  const budiMap = new Map<string, BudiBookCandidate>(params.budiBooks.map((b) => [b.slug, b]));

  const seenTitles = new Set<string>();
  if (!params.force) {
    for (const b of params.curatedBooks) {
      if (params.r2Slugs.has(b.slug)) {
        const norm = normalizeStoryTitle(b.title);
        if (norm) seenTitles.add(norm);
      }
    }
    for (const b of params.budiBooks) {
      if (params.r2Slugs.has(b.slug)) {
        const norm = normalizeStoryTitle(b.title);
        if (norm) seenTitles.add(norm);
      }
    }
  }

  const upcomingSlots = params.calendarSlots
    .filter((s) => Boolean(s.date) && s.date! >= params.startDateIso && !parseCompilationTheme(s.bookSlug))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const seen = new Set<string>();
  const orderedCandidates: T[] = [];
  const uncuratedUpcomingSlugs: string[] = [];
  const skippedDuplicateTitles: Array<{ slug: string; title: string }> = [];

  const pushIfUniqueTitle = (candidate: T) => {
    const norm = normalizeStoryTitle(candidate.title);
    if (!params.force && norm && seenTitles.has(norm) && !params.r2Slugs.has(candidate.slug)) {
      skippedDuplicateTitles.push({ slug: candidate.slug, title: candidate.title });
      return;
    }
    if (norm) seenTitles.add(norm);
    orderedCandidates.push(candidate);
  };

  for (const slot of upcomingSlots) {
    if (seen.has(slot.bookSlug)) continue;
    seen.add(slot.bookSlug);

    const curated = curatedMap.get(slot.bookSlug);
    if (curated) {
      pushIfUniqueTitle(curated);
      continue;
    }

    const budi = budiMap.get(slot.bookSlug);
    if (budi) {
      pushIfUniqueTitle(buildCuratedBookFromBudi(budi) as T);
      continue;
    }

    uncuratedUpcomingSlugs.push(slot.bookSlug);
  }

  for (const book of params.curatedBooks) {
    if (!seen.has(book.slug)) {
      seen.add(book.slug);
      pushIfUniqueTitle(book);
    }
  }

  const eligible = params.force
    ? orderedCandidates
    : orderedCandidates.filter((b) => !params.r2Slugs.has(b.slug));

  const queue = params.includeAll ? eligible : eligible.slice(0, Math.max(1, params.limit));
  return { queue, uncuratedUpcomingSlugs, skippedDuplicateTitles };
}

/**
 * Computes which video aspect ratios are required for a calendar slot in Cloudflare R2.
 */
export function getRequiredBufferOrientations(
  format: string | undefined,
  lang: "id" | "en"
): {
  requireLandscape: boolean;
  requireVertical: boolean;
  renderFormatArg: "landscape" | "vertical" | "both";
  lang: "id" | "en";
} {
  const normalized = (format || "both").toLowerCase();
  const hasVert = normalized.includes("vertical") || normalized.includes("9:16") || normalized.includes("shorts");
  const hasLand = normalized.includes("landscape") || normalized.includes("16:9");

  if (normalized === "both" || (hasVert && hasLand)) {
    return { requireLandscape: true, requireVertical: true, renderFormatArg: "both", lang };
  }
  if (hasVert && !hasLand) {
    return { requireLandscape: false, requireVertical: true, renderFormatArg: "vertical", lang };
  }
  return { requireLandscape: true, requireVertical: false, renderFormatArg: "landscape", lang };
}
