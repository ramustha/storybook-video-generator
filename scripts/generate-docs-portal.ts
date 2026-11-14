import fs from "fs";
import path from "path";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";
import {
  applyTodayStatusToSlots,
  formatSlugFallbackTitle,
  getBrowserPortalSyncScript,
  getWibDateIso,
  isPrimaryPublishedRecord,
  loadJsonArraySafe,
  mergeAuditRecordLists,
  mergeCalendarSlotLists,
} from "./lib/portal-sync";

interface AuditRecord {
  id: string; // unique audit id e.g. "AUD-001"
  storySlug: string;
  storyTitleId: string;
  storyTitleEn: string;
  category: "Standalone Story" | "Compilation Marathon";
  platform: "YouTube" | "Facebook" | "Instagram";
  platformIcon: "youtube" | "facebook" | "instagram";
  language: "id" | "en";
  format: "Landscape (16:9)" | "Shorts (9:16)" | "Watch Video (16:9)" | "Facebook Reel (9:16)" | "Instagram Reel (9:16)" | "Marathon Video (16:9)";
  aspectRatio: "16:9" | "9:16";
  videoTitle: string;
  videoId: string;
  videoUrl: string;
  publishedAt: string;
  status: string;
  privacy: string;
  duration?: string;
  thumbnailUrl?: string;
  author: string;
  illustrator: string;
  license: string;
  sourceUrl: string;
}

export interface EnrichedCalendarSlot {
  id: string; // e.g. "SLOT-001"
  date: string; // "2026-11-07"
  dayName: string; // "Sabtu"
  timeSlot: string; // "19:30 WIB"
  slotType: string;
  bookSlug: string;
  storyTitleId: string;
  storyTitleEn: string;
  lang: "id" | "en";
  format: string;
  targetPlatforms: string[];
  theme: string;
  status: "completed" | "today" | "upcoming";
  isCompleted: boolean;
  hasPublishedAsset: boolean;
  isBuffered?: boolean;
  hasAssets?: boolean;
}

const workspaceRoot = path.resolve(__dirname, "..");
const storiesDir = path.join(workspaceRoot, "stories");
const docsDir = path.join(workspaceRoot, "docs");
const curatedPath = path.join(workspaceRoot, "config", "curated-books.json");
const bufferedPath = path.join(workspaceRoot, "config", "buffered-stories.json");

let bufferedStories: string[] = [];
if (fs.existsSync(bufferedPath)) {
  try {
    bufferedStories = JSON.parse(fs.readFileSync(bufferedPath, "utf-8"));
  } catch {
    // Ignore parse error
  }
}

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const auditJsonPath = path.join(docsDir, "audit-data.json");
const calendarJsonPath = path.join(docsDir, "calendar-data.json");

const existingAuditRecords = loadJsonArraySafe<AuditRecord>(auditJsonPath);
const existingCalendarSlots = loadJsonArraySafe<EnrichedCalendarSlot>(calendarJsonPath);

// 1. Build Story Titles Map
const storyTitlesMap = new Map<string, { id: string; en: string }>();

const stories = fs.existsSync(storiesDir)
  ? fs.readdirSync(storiesDir).filter((f) => {
      try {
        const stat = fs.statSync(path.join(storiesDir, f));
        return stat.isDirectory() && fs.existsSync(path.join(storiesDir, f, "story.json"));
      } catch {
        return false;
      }
    }).sort()
  : [];

for (const s of stories) {
  const jsonPath = path.join(storiesDir, s, "story.json");
  if (!fs.existsSync(jsonPath)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const id = typeof data.title === "object" ? data.title.id : data.title;
    const en = data.originalTitle || (typeof data.title === "object" ? data.title.en : id);
    storyTitlesMap.set(s, { id, en });
  } catch {
    // Ignore parse error
  }
}

if (fs.existsSync(curatedPath)) {
  try {
    const list = JSON.parse(fs.readFileSync(curatedPath, "utf-8"));
    for (const b of list) {
      if (!storyTitlesMap.has(b.slug)) {
        storyTitlesMap.set(b.slug, { id: b.title, en: b.originalTitle || b.title });
      }
    }
  } catch {
    // Ignore parse error
  }
}

for (const prevRec of existingAuditRecords) {
  if (prevRec?.storySlug && !storyTitlesMap.has(prevRec.storySlug)) {
    storyTitlesMap.set(prevRec.storySlug, {
      id: prevRec.storyTitleId || formatSlugFallbackTitle(prevRec.storySlug),
      en: prevRec.storyTitleEn || prevRec.storyTitleId || formatSlugFallbackTitle(prevRec.storySlug),
    });
  }
}

const existingAssetSlugs = existingCalendarSlots
  .filter((slot) => slot?.bookSlug && slot.hasAssets)
  .map((slot) => slot.bookSlug);

const allAssetSlugs: string[] = Array.from(
  new Set([...stories, ...Array.from(storyTitlesMap.keys()), ...existingAssetSlugs])
);

// 2. Build Audit Records
const localAuditRecords: AuditRecord[] = [];
let counter = 1;

function padId(n: number): string {
  return "AUD-" + String(n).padStart(3, "0");
}

/**
 * Resolves verified thumbnail URL strictly matching aspect ratio.
 * Guarantees zero aspect-ratio mismatch between landscape (16:9) and vertical (9:16).
 */
function resolveStoryThumbnail(data: any, lang: "id" | "en", fmt: "landscape" | "vertical"): string {
  const yt = data.publications?.youtube || {};
  const altLang = lang === "id" ? "en" : "id";

  const candidateId =
    yt[lang]?.[fmt]?.id ||
    yt[altLang]?.[fmt]?.id ||
    data.exports?.[lang]?.[fmt]?.youtubeId ||
    data.exports?.[altLang]?.[fmt]?.youtubeId;

  if (candidateId) {
    return `https://img.youtube.com/vi/${candidateId}/hqdefault.jpg`;
  }
  return fmt === "vertical"
    ? "branding/story-highlight-instagram-1080x1920.png"
    : "branding/cover-facebook-1640x924.png";
}

for (const s of stories) {
  const jsonPath = path.join(storiesDir, s, "story.json");
  if (!fs.existsSync(jsonPath)) continue;
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  const titleId = typeof data.title === "object" ? data.title.id : data.title;
  const titleEn = data.originalTitle || (typeof data.title === "object" ? data.title.en : "");
  const author = data.source?.originalAuthor || "Pratham Books Community";
  const illustrator = data.source?.originalIllustrator || "Various Illustrators";
  const license = data.source?.license || "Creative Commons Attribution 4.0 International (CC BY 4.0)";
  const sourceUrl = data.source?.sourceUrl || "https://storyweaver.org.in";

  // YouTube Publications
  const yt = data.publications?.youtube || {};
  for (const lang of ["id", "en"] as const) {
    if (!yt[lang]) continue;
    for (const fmt of ["landscape", "vertical"] as const) {
      const item = yt[lang][fmt];
      if (item && item.url) {
        localAuditRecords.push({
          id: padId(counter++),
          storySlug: s,
          storyTitleId: titleId,
          storyTitleEn: titleEn,
          category: "Standalone Story",
          platform: "YouTube",
          platformIcon: "youtube",
          language: lang,
          format: fmt === "landscape" ? "Landscape (16:9)" : "Shorts (9:16)",
          aspectRatio: fmt === "landscape" ? "16:9" : "9:16",
          videoTitle: item.title || (lang === "id" ? titleId : titleEn),
          videoId: item.id,
          videoUrl: item.url,
          publishedAt: item.publishedAt || "2026-11-01T00:00:00.000Z",
          status: item.status || "published",
          privacy: item.privacy || "public",
          thumbnailUrl: `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
          author,
          illustrator,
          license,
          sourceUrl
        });
      }
    }
  }

  // Facebook Publications
  const fb = data.publications?.facebook || {};
  for (const lang of ["id", "en"] as const) {
    if (!fb[lang]) continue;
    for (const fmt of ["landscape", "vertical"] as const) {
      const item = fb[lang][fmt];
      if (item && item.url) {
        const thumbUrl = resolveStoryThumbnail(data, lang, fmt);
        localAuditRecords.push({
          id: padId(counter++),
          storySlug: s,
          storyTitleId: titleId,
          storyTitleEn: titleEn,
          category: "Standalone Story",
          platform: "Facebook",
          platformIcon: "facebook",
          language: lang,
          format: fmt === "landscape" ? "Watch Video (16:9)" : "Facebook Reel (9:16)",
          aspectRatio: fmt === "landscape" ? "16:9" : "9:16",
          videoTitle: item.title || (lang === "id" ? titleId : titleEn),
          videoId: item.id,
          videoUrl: item.url,
          publishedAt: item.publishedAt || "2026-11-04T00:00:00.000Z",
          status: item.status || "published",
          privacy: "public",
          thumbnailUrl: thumbUrl,
          author,
          illustrator,
          license,
          sourceUrl
        });
      }
    }
  }

  // Instagram Publications
  const ig = data.publications?.instagram || {};
  for (const lang of ["id", "en"] as const) {
    const item = ig[lang];
    if (item && item.url) {
      const thumbUrl = resolveStoryThumbnail(data, lang, "vertical");
      localAuditRecords.push({
        id: padId(counter++),
        storySlug: s,
        storyTitleId: titleId,
        storyTitleEn: titleEn,
        category: "Standalone Story",
        platform: "Instagram",
        platformIcon: "instagram",
        language: lang,
        format: "Instagram Reel (9:16)",
        aspectRatio: "9:16",
        videoTitle: item.title || (lang === "id" ? titleId : titleEn),
        videoId: item.id,
        videoUrl: item.url,
        publishedAt: item.publishedAt || "2026-11-04T00:00:00.000Z",
        status: item.status || "published",
        privacy: "public",
        thumbnailUrl: thumbUrl,
        author,
        illustrator,
        license,
        sourceUrl
      });
    }
  }
}

// Compilation Marathons
const compPath = path.join(workspaceRoot, "exports/compilations/publication-status.json");
if (fs.existsSync(compPath)) {
  const comps = JSON.parse(fs.readFileSync(compPath, "utf-8"));
  for (const [key, comp] of Object.entries(comps) as [string, any][]) {
    const lang: "id" | "en" = key.includes("-en") ? "en" : "id";
    const title = comp.title;

    if (comp.permalink && comp.videoId) {
      localAuditRecords.push({
        id: padId(counter++),
        storySlug: key,
        storyTitleId: "Kumpulan Dongeng Sebelum Tidur (5 Cerita Non-Stop)",
        storyTitleEn: "Bedtime Stories Marathon (5 Stories Non-Stop)",
        category: "Compilation Marathon",
        platform: "Facebook",
        platformIcon: "facebook",
        language: lang,
        format: "Watch Video (16:9)",
        aspectRatio: "16:9",
        videoTitle: title,
        videoId: comp.videoId,
        videoUrl: comp.permalink,
        publishedAt: comp.publishedAt || comp.facebookPublishedAt || "2026-11-05T02:00:00.000Z",
        status: "published",
        privacy: "public",
        duration: "11m 06s (19,928 frames)",
        thumbnailUrl: comp.youtube?.videoId ? `https://img.youtube.com/vi/${comp.youtube.videoId}/hqdefault.jpg` : "branding/cover-facebook-1640x924.png",
        author: "Pratham Books Authors (Various)",
        illustrator: "Pratham Books Illustrators (Various)",
        license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        sourceUrl: "https://storyweaver.org.in"
      });
    }

    if (comp.youtube && comp.youtube.url) {
      localAuditRecords.push({
        id: padId(counter++),
        storySlug: key,
        storyTitleId: "Kumpulan Dongeng Sebelum Tidur (5 Cerita Non-Stop)",
        storyTitleEn: "Bedtime Stories Marathon (5 Stories Non-Stop)",
        category: "Compilation Marathon",
        platform: "YouTube",
        platformIcon: "youtube",
        language: lang,
        format: "Marathon Video (16:9)",
        aspectRatio: "16:9",
        videoTitle: title,
        videoId: comp.youtube.videoId,
        videoUrl: comp.youtube.url,
        publishedAt: comp.youtube.publishedAt || "2026-11-05T02:00:00.000Z",
        status: "published",
        privacy: comp.youtube.privacy || "public",
        duration: "11m 06s (19,928 frames)",
        thumbnailUrl: `https://img.youtube.com/vi/${comp.youtube.videoId}/hqdefault.jpg`,
        author: "Pratham Books Authors (Various)",
        illustrator: "Pratham Books Illustrators (Various)",
        license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        sourceUrl: "https://storyweaver.org.in"
      });
    }
  }
}

const auditRecords = mergeAuditRecordLists(
  localAuditRecords,
  existingAuditRecords,
  true
);

// 3. Enrich Calendar Slots
const publishedStorySlugs = new Set(
  auditRecords.filter(isPrimaryPublishedRecord).map((r) => r.storySlug)
);
const todayIso = getWibDateIso(new Date());

const currentHour =
  parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
    10
  ) % 24;

const localCalendarSlots: EnrichedCalendarSlot[] = DAILY_CALENDAR_MONTH_1.map((slot, idx) => {
  const dateStr = slot.date || "2026-11-07";
  const titles = storyTitlesMap.get(slot.bookSlug) || {
    id: formatSlugFallbackTitle(slot.bookSlug),
    en: formatSlugFallbackTitle(slot.bookSlug),
  };

  const hasPublishedAsset = publishedStorySlugs.has(slot.bookSlug);
  const storyDir = path.join(storiesDir, slot.bookSlug);
  let isBuffered = false;
  let hasAssets = allAssetSlugs.includes(slot.bookSlug);

  if (fs.existsSync(storyDir)) {
    hasAssets = fs.existsSync(path.join(storyDir, "story.json")) || hasAssets;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(storyDir, "story.json"), "utf-8"));
      const hasVert = !!(manifest.exports?.[slot.lang]?.vertical?.path && fs.existsSync(path.join(storyDir, manifest.exports[slot.lang].vertical.path)));
      const hasLand = !!(manifest.exports?.[slot.lang]?.landscape?.path && fs.existsSync(path.join(storyDir, manifest.exports[slot.lang].landscape.path)));
      isBuffered = hasVert && hasLand;
    } catch {
      isBuffered = false;
    }
  }

  if (bufferedStories.includes(slot.bookSlug)) {
    isBuffered = true;
  }

  return {
    id: `SLOT-${String(idx + 1).padStart(3, "0")}`,
    date: dateStr,
    dayName: slot.dayName,
    timeSlot: slot.timeSlot,
    slotType: slot.slotType,
    bookSlug: slot.bookSlug,
    storyTitleId: titles.id,
    storyTitleEn: titles.en,
    lang: slot.lang,
    format:
      slot.format === "both"
        ? "Landscape (16:9) & Shorts (9:16)"
        : slot.format === "vertical"
        ? "Shorts / Reels (9:16)"
        : "Landscape (16:9)",
    targetPlatforms: slot.targetPlatforms,
    theme: slot.theme,
    status: "upcoming",
    isCompleted: false,
    hasPublishedAsset,
    isBuffered,
    hasAssets,
  };
});

const mergedCalendarSlots = mergeCalendarSlotLists(localCalendarSlots, existingCalendarSlots);
const calendarSlots = applyTodayStatusToSlots(
  mergedCalendarSlots,
  auditRecords,
  todayIso
);
const browserSyncScript = getBrowserPortalSyncScript();

// Merge stats-data.json if present
const statsJsonPath = path.join(docsDir, "stats-data.json");
let statsSummaryPayload: { recordedAt: string | null; summary: any } = {
  recordedAt: null,
  summary: null,
};
if (fs.existsSync(statsJsonPath)) {
  try {
    const statsData = JSON.parse(fs.readFileSync(statsJsonPath, "utf-8"));
    statsSummaryPayload = {
      recordedAt: statsData.recordedAt || null,
      summary: statsData.summary || null,
    };
    const statsMap = new Map<string, any>();
    for (const item of statsData.items || []) {
      if (item.id) statsMap.set(item.id, item);
    }
    for (const rec of auditRecords as any[]) {
      const s = statsMap.get(rec.videoId) || statsMap.get(rec.id);
      if (s) {
        rec.views = Math.max(rec.views || 0, s.views || 0);
        rec.likes = Math.max(rec.likes || 0, s.likes || 0);
        rec.comments = Math.max(rec.comments || 0, s.comments || 0);
      } else {
        rec.views = rec.views || 0;
        rec.likes = rec.likes || 0;
        rec.comments = rec.comments || 0;
      }
    }
    console.log(`Merged weekly stats for ${statsMap.size} assets from ${statsJsonPath}`);
  } catch (err: any) {
    console.warn("⚠️ Failed to read stats-data.json:", err.message);
  }
}

// Write audit-data.json and calendar-data.json
fs.writeFileSync(auditJsonPath, JSON.stringify(auditRecords, null, 2));
console.log(`Saved ${auditRecords.length} audit records to ${auditJsonPath}`);

fs.writeFileSync(calendarJsonPath, JSON.stringify(calendarSlots, null, 2));
console.log(`Saved ${calendarSlots.length} calendar slots to ${calendarJsonPath}`);

// Precompute summary metrics for build-time HTML injection
const initialTotal = auditRecords.length;
const initialYt = auditRecords.filter((r) => r.platform === "YouTube").length;
const initialFb = auditRecords.filter((r) => r.platform === "Facebook").length;
const initialIg = auditRecords.filter((r) => r.platform === "Instagram").length;
const initialTotalViews = (auditRecords as any[]).reduce((sum, r) => sum + (r.views || 0), 0);
const initialTotalLikes = (auditRecords as any[]).reduce((sum, r) => sum + (r.likes || 0), 0);
const initialStorySlugs = new Set(
  auditRecords.filter((r) => r.category !== "Compilation Marathon").map((r) => r.storySlug)
);
const initialStoriesCount = initialStorySlugs.size;

// Precompute unique story options for build-time dropdown
const initialStoryMap = new Map<string, string>();
for (const r of auditRecords) {
  if (r.category === "Compilation Marathon") continue;
  if (!initialStoryMap.has(r.storySlug)) {
    initialStoryMap.set(r.storySlug, r.storyTitleId || r.storySlug);
  }
}
const initialStoryOptions = Array.from(initialStoryMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

// Precompute calendar metrics
const initialCalTotal = calendarSlots.length;
const initialCalCompleted = calendarSlots.filter((s) => s.status === "completed" || s.isCompleted).length;
const initialCalToday = calendarSlots.filter((s) => s.date === todayIso).length;
const initialCalUpcoming = calendarSlots.filter((s) => s.date > todayIso && !s.isCompleted).length;
const initialCalProgress = initialCalTotal > 0 ? ((initialCalCompleted / initialCalTotal) * 100).toFixed(1) : "0.0";

// Find active next-up slot dynamically
const todaySlots = calendarSlots.filter((s) => s.date === todayIso);
const todayPendingSlots = todaySlots.filter((s) => !s.isCompleted);
const nextUpPool = todayPendingSlots.length > 0 ? todayPendingSlots : todaySlots;
const nextUpSlot = nextUpPool.find((s) => {
  const isMorning = s.timeSlot.includes("08:") || s.slotType.toLowerCase().includes("morning");
  return currentHour < 12 ? isMorning : !isMorning;
}) || nextUpPool[0] || calendarSlots.find((s) => s.status === "upcoming");

// Generate docs/index.html
const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zayn Storybook — Multi-Platform Publication Registry & Release Timeline</title>
  <meta name="description" content="Comprehensive audit directory, live catalog, 30-day release timeline, and licensing tracker of all published storybook videos by Zayn Storybook.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0b0f19;
      --bg-secondary: #111827;
      --bg-tertiary: #1f2937;
      --card-bg: rgba(22, 30, 46, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-hover: rgba(30, 41, 62, 0.95);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --accent-primary: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.22);
      --yt-color: #ef4444;
      --fb-color: #3b82f6;
      --ig-color: #ec4899;
      --success-green: #10b981;
      --gold: #f59e0b;
      --purple: #a855f7;
      --radius-xs: 4px;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-full: 9999px;
      --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.35);
      --transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }

    [data-theme="light"] {
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-tertiary: #f1f5f9;
      --card-bg: rgba(255, 255, 255, 0.92);
      --card-border: rgba(0, 0, 0, 0.08);
      --card-hover: #ffffff;
      --text-main: #0f172a;
      --text-muted: #475569;
      --text-dim: #94a3b8;
      --accent-primary: #0284c7;
      --accent-glow: rgba(2, 132, 199, 0.16);
      --shadow-card: 0 4px 18px rgba(0, 0, 0, 0.05);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-main);
      min-height: 100vh;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1560px;
      margin: 0 auto;
      padding: 0.85rem 1.15rem;
    }

    /* Header styling */
    header {
      margin-bottom: 0.65rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.6rem;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .brand-title {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }

    .brand-logo {
      font-size: 1.5rem;
      line-height: 1;
      filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.35));
    }

    .brand-heading h1 {
      font-size: 1.22rem;
      font-weight: 800;
      letter-spacing: -0.015em;
      background: linear-gradient(135deg, #ffffff 40%, var(--accent-primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }

    [data-theme="light"] .brand-heading h1 {
      background: linear-gradient(135deg, #0f172a 40%, #0369a1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-heading p {
      color: var(--text-muted);
      font-size: 0.76rem;
      margin-top: 0.1rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.32rem 0.65rem;
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: var(--transition);
      height: 30px;
    }

    .btn-action:hover {
      background: var(--bg-tertiary);
      border-color: var(--accent-primary);
      transform: translateY(-1px);
    }

    .btn-accent {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      border: none;
      color: #ffffff;
      box-shadow: 0 2px 8px var(--accent-glow);
    }

    .btn-accent:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      color: #ffffff;
    }

    /* Channel badges */
    .channel-strip {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 0.45rem;
      padding-top: 0.45rem;
      border-top: 1px dashed var(--card-border);
    }

    .channel-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.18rem 0.55rem;
      border-radius: var(--radius-full);
      font-size: 0.72rem;
      font-weight: 600;
      text-decoration: none;
      transition: var(--transition);
      background: var(--bg-secondary);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
    }

    .channel-pill:hover {
      color: var(--text-main);
      border-color: currentColor;
      transform: translateY(-1px);
    }

    .channel-pill.yt { border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
    .channel-pill.fb { border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }
    .channel-pill.ig { border-color: rgba(236, 72, 153, 0.4); color: #f472b6; }
    .channel-pill.gh { border-color: rgba(156, 163, 175, 0.4); color: #d1d5db; }

    /* Live Data Status Indicator */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.18rem 0.55rem;
      border-radius: var(--radius-full);
      font-size: 0.72rem;
      font-weight: 600;
      border: 1px solid var(--card-border);
      background: var(--bg-secondary);
      color: var(--text-muted);
      cursor: pointer;
      transition: var(--transition);
    }

    .status-badge:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .status-badge.status-live {
      border-color: rgba(16, 185, 129, 0.45);
      background: rgba(16, 185, 129, 0.1);
      color: #34d399;
    }

    .status-badge.status-snapshot {
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
    }

    .status-badge.status-embedded {
      border-color: rgba(168, 85, 247, 0.4);
      background: rgba(168, 85, 247, 0.1);
      color: #c084fc;
    }

    .status-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .status-dot.pulsing {
      animation: pulseAnim 1.5s infinite;
    }

    @keyframes pulseAnim {
      0% { opacity: 0.3; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.1); }
      100% { opacity: 0.3; transform: scale(0.9); }
    }

    /* Main Navigation Tabs */
    .main-nav-tabs {
      position: sticky;
      top: 0;
      z-index: 45;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.75rem;
      border-bottom: 2px solid var(--card-border);
      padding: 0.45rem 0;
      background: rgba(11, 15, 25, 0.88);
      backdrop-filter: blur(14px);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .main-nav-tabs::-webkit-scrollbar {
      display: none;
    }

    [data-theme="light"] .main-nav-tabs {
      background: rgba(248, 250, 252, 0.9);
    }

    .nav-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.95rem;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
    }

    .nav-tab-btn:hover {
      color: var(--text-main);
      background: var(--bg-secondary);
    }

    .nav-tab-btn.active {
      background: var(--bg-secondary);
      border-color: var(--accent-primary);
      color: var(--accent-primary);
      box-shadow: 0 2px 8px var(--accent-glow);
    }

    .tab-badge {
      font-size: 0.72rem;
      padding: 0.12rem 0.45rem;
      border-radius: var(--radius-full);
      background: var(--bg-tertiary);
      color: var(--text-muted);
    }

    .nav-tab-btn.active .tab-badge {
      background: var(--accent-primary);
      color: #0b0f19;
      font-weight: 800;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 0.55rem;
      margin-bottom: 0.75rem;
    }

    .stat-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.55rem 0.75rem;
      transition: var(--transition);
      position: relative;
      overflow: hidden;
    }

    .stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--accent-primary);
      opacity: 0.7;
    }

    .stat-card.yt::after { background: var(--yt-color); }
    .stat-card.fb::after { background: var(--fb-color); }
    .stat-card.ig::after { background: var(--ig-color); }
    .stat-card.stories::after { background: var(--purple); }
    .stat-card.cc::after { background: var(--success-green); }
    .stat-card.gold::after { background: var(--gold); }

    .stat-title {
      font-size: 0.67rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      margin-bottom: 0.2rem;
    }

    .stat-value {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
      display: flex;
      align-items: baseline;
      gap: 0.3rem;
      line-height: 1.15;
    }

    .stat-desc {
      font-size: 0.69rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Filter & Controls Toolbar */
    .toolbar {
      background: var(--bg-secondary);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.55rem 0.75rem;
      margin-bottom: 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .search-row {
      display: flex;
      gap: 0.55rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1 1 240px;
      min-width: 200px;
      position: relative;
    }

    .search-input {
      width: 100%;
      height: 32px;
      padding: 0.25rem 0.65rem 0.25rem 2rem;
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      font-size: 0.81rem;
      font-family: inherit;
      transition: var(--transition);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .search-icon {
      position: absolute;
      left: 0.65rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.75rem;
      color: var(--text-dim);
      pointer-events: none;
    }

    .view-toggles {
      display: inline-flex;
      background: var(--bg-primary);
      padding: 2px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
      height: 32px;
    }

    .view-btn {
      padding: 0.2rem 0.55rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.74rem;
      font-weight: 600;
      border-radius: var(--radius-xs);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      transition: var(--transition);
    }

    .view-btn.active {
      background: var(--bg-tertiary);
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .filter-chips-row {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      margin-right: 0.15rem;
    }

    .filter-chip {
      padding: 0.18rem 0.52rem;
      border-radius: var(--radius-full);
      background: var(--bg-primary);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      line-height: 1.3;
    }

    .filter-chip:hover {
      color: var(--text-main);
      border-color: var(--accent-primary);
    }

    .filter-chip.active {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
      color: #0b0f19;
      font-weight: 700;
    }

    [data-theme="light"] .filter-chip.active {
      color: #ffffff;
    }

    .filter-select {
      height: 26px;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      font-size: 0.74rem;
      font-family: inherit;
      cursor: pointer;
      max-width: 260px;
    }

    .filter-select:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    /* Results Header */
    .results-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.55rem;
      padding: 0 0.2rem;
    }

    .results-count {
      font-size: 0.76rem;
      color: var(--text-muted);
    }

    .results-count strong {
      color: var(--text-main);
    }

    /* Card Grid View */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(265px, 1fr));
      gap: 0.65rem;
    }

    .video-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: var(--transition);
      box-shadow: var(--shadow-card);
    }

    .video-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .card-thumb-wrapper {
      position: relative;
      width: 100%;
      padding-top: 52%; /* 16:9 compact */
      background: #0b0f19;
      overflow: hidden;
    }

    .card-thumb-wrapper.ratio-vertical {
      padding-top: 56%;
    }

    .card-thumb-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .video-card:hover .card-thumb-img {
      transform: scale(1.03);
    }

    .thumb-overlay-badge {
      position: absolute;
      top: 0.4rem;
      left: 0.4rem;
      display: flex;
      gap: 0.25rem;
      z-index: 2;
    }

    .thumb-duration-badge {
      position: absolute;
      bottom: 0.4rem;
      right: 0.4rem;
      background: rgba(0, 0, 0, 0.85);
      color: #ffffff;
      padding: 0.12rem 0.35rem;
      border-radius: var(--radius-xs);
      font-size: 0.67rem;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      z-index: 2;
    }

    .platform-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.12rem 0.42rem;
      border-radius: var(--radius-xs);
      font-size: 0.67rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      line-height: 1.3;
    }

    .platform-badge.yt { background: #ef4444; color: #ffffff; }
    .platform-badge.fb { background: #2563eb; color: #ffffff; }
    .platform-badge.ig { background: #ec4899; color: #ffffff; }

    .lang-badge {
      padding: 0.12rem 0.38rem;
      border-radius: var(--radius-xs);
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      color: #ffffff;
      font-size: 0.67rem;
      font-weight: 700;
      border: 1px solid rgba(255, 255, 255, 0.2);
      line-height: 1.3;
    }

    .format-badge {
      padding: 0.12rem 0.38rem;
      border-radius: var(--radius-xs);
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      color: #38bdf8;
      font-size: 0.67rem;
      font-weight: 600;
      border: 1px solid rgba(56, 189, 248, 0.3);
      line-height: 1.3;
    }

    .card-content {
      padding: 0.65rem 0.75rem;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .card-story-title {
      font-size: 0.69rem;
      font-weight: 700;
      color: var(--accent-primary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.18rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-video-title {
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1.28;
      color: var(--text-main);
      margin-bottom: 0.45rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      height: 2.1rem;
    }

    .card-meta-list {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      font-size: 0.71rem;
      color: var(--text-muted);
      border-top: 1px solid var(--card-border);
      padding-top: 0.45rem;
      margin-bottom: 0.55rem;
    }

    .card-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .meta-id-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.69rem;
      color: var(--text-muted);
      background: var(--bg-tertiary);
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-xs);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .meta-id-tag:hover {
      color: var(--accent-primary);
    }

    .card-subtitle-en {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--text-dim);
      font-style: italic;
      margin-top: 0.15rem;
    }

    .badge-landscape {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .badge-vertical {
      background: rgba(236, 72, 153, 0.15);
      color: #f472b6;
      border: 1px solid rgba(236, 72, 153, 0.35);
    }

    .thumb-count-badge {
      position: absolute;
      bottom: 0.4rem;
      right: 0.4rem;
      background: rgba(0, 0, 0, 0.85);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.12rem 0.42rem;
      border-radius: var(--radius-xs);
      font-size: 0.67rem;
      font-weight: 700;
      z-index: 2;
    }

    .platform-hub-list {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      margin: 0.45rem 0 0.55rem 0;
      background: rgba(0, 0, 0, 0.25);
      padding: 0.45rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
      max-height: 140px;
      overflow-y: auto;
    }

    .platform-hub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.28rem 0.45rem;
      border-radius: var(--radius-xs);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.72rem;
      transition: all 0.2s ease;
    }

    .platform-hub-row:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(56, 189, 248, 0.3);
    }

    .platform-hub-left {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      overflow: hidden;
    }

    .hub-platform-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      flex-shrink: 0;
    }

    .hub-platform-icon svg {
      width: 15px;
      height: 15px;
    }

    .hub-name {
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.72rem;
    }

    .hub-lang-tag {
      font-size: 0.58rem;
      font-weight: 700;
      padding: 0.05rem 0.25rem;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-dim);
      flex-shrink: 0;
    }

    .hub-ratio-tag {
      font-size: 0.58rem;
      font-weight: 800;
      padding: 0.04rem 0.22rem;
      border-radius: 3px;
      line-height: 1.1;
      flex-shrink: 0;
    }

    .hub-ratio-tag.l-tag {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .hub-ratio-tag.p-tag {
      background: rgba(236, 72, 153, 0.15);
      color: #f472b6;
      border: 1px solid rgba(236, 72, 153, 0.35);
    }

    .hub-id-text {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 135px;
    }

    .hub-metric-pill {
      font-size: 0.62rem;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 3px;
      padding: 0.05rem 0.25rem;
      white-space: nowrap;
      margin-left: 0.15rem;
      flex-shrink: 0;
    }

    .platform-hub-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .hub-btn-play {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      border-radius: 3px;
      padding: 0.12rem 0.4rem;
      font-size: 0.68rem;
      cursor: pointer;
      line-height: 1.1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .hub-btn-play:hover {
      background: #38bdf8;
      color: #0b0f19;
      transform: scale(1.05);
    }

    .hub-btn-link {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-muted);
      border-radius: 3px;
      padding: 0.12rem 0.4rem;
      font-size: 0.68rem;
      text-decoration: none;
      line-height: 1.1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .hub-btn-link:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
      transform: scale(1.05);
    }

    .card-actions {
      display: flex;
      gap: 0.35rem;
    }

    .btn-card {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      padding: 0.32rem 0.55rem;
      border-radius: var(--radius-sm);
      font-size: 0.74rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: var(--transition);
      border: 1px solid var(--card-border);
      background: var(--bg-secondary);
      color: var(--text-main);
      height: 28px;
    }

    .btn-card:hover {
      background: var(--bg-tertiary);
      border-color: var(--accent-primary);
    }

    .btn-card.primary {
      background: var(--accent-primary);
      color: #0b0f19;
      border: none;
      font-weight: 700;
    }

    [data-theme="light"] .btn-card.primary {
      color: #ffffff;
      background: #0284c7;
    }

    .btn-card.primary:hover {
      filter: brightness(1.1);
    }

    /* Table View */
    .table-container {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      overflow-x: auto;
      box-shadow: var(--shadow-card);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
      text-align: left;
    }

    thead th {
      background: var(--bg-secondary);
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.69rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.45rem 0.65rem;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    tbody tr {
      border-bottom: 1px solid var(--card-border);
      transition: background 0.12s ease;
    }

    tbody tr:hover {
      background: var(--card-hover);
    }

    tbody tr.today-row {
      background: rgba(245, 158, 11, 0.09);
      box-shadow: inset 3px 0 0 #f59e0b;
    }

    tbody tr.today-row:hover {
      background: rgba(245, 158, 11, 0.15);
    }

    tbody td {
      padding: 0.42rem 0.65rem;
      color: var(--text-main);
      vertical-align: middle;
    }

    .table-cell-title {
      font-weight: 600;
      max-width: 280px;
      font-size: 0.77rem;
    }

    .table-cell-title small {
      display: block;
      color: var(--text-muted);
      font-weight: 400;
      font-size: 0.69rem;
      margin-top: 0.1rem;
    }

    .table-link {
      color: var(--accent-primary);
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.74rem;
    }

    .table-link:hover {
      text-decoration: underline;
    }

    /* =========================================================================
       TIMELINE & SCHEDULE SPECIFIC STYLES
       ========================================================================= */
    .timeline-progress-banner {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
      margin-bottom: 0.75rem;
      box-shadow: var(--shadow-card);
    }

    .progress-bar-wrapper {
      margin: 0.6rem 0 0.2rem;
    }

    .progress-track {
      width: 100%;
      height: 10px;
      background: var(--bg-primary);
      border-radius: var(--radius-full);
      overflow: hidden;
      border: 1px solid var(--card-border);
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #0284c7, #38bdf8);
      border-radius: var(--radius-full);
      transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    }

    .progress-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-dim);
      margin-top: 0.35rem;
    }

    .progress-labels strong {
      color: var(--text-main);
    }

    /* =========================================================================
       AUTOMATION & BROADCAST PIPELINE MONITOR
       ========================================================================= */
    .pipeline-monitor-section {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 41, 59, 0.72) 100%);
      border: 1px solid rgba(56, 189, 248, 0.28);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
      margin-bottom: 0.85rem;
      position: relative;
      overflow: hidden;
    }

    .pipeline-monitor-section::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, #38bdf8, #818cf8, #f59e0b, #10b981);
    }

    .pipeline-monitor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.55rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .pipeline-monitor-title-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pipeline-monitor-icon {
      font-size: 1.15rem;
      background: rgba(56, 189, 248, 0.15);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .pipeline-monitor-heading h2 {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .pipeline-monitor-heading p {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin: 0;
    }

    .pipeline-monitor-controls {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .pipeline-clock-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(0, 0, 0, 0.4);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-xs);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .pipeline-pulse-badge {
      font-size: 0.68rem;
      font-weight: 800;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 0.2rem 0.5rem;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      gap: 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* Next Up Spotlight inside Monitor */
    .pipeline-spotlight-bar {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.1));
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: var(--radius-sm);
      padding: 0.65rem 0.85rem;
      margin-bottom: 0.65rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .pipeline-spotlight-left {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
    }

    .pipeline-event-badge {
      background: #f59e0b;
      color: #0b0f19;
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .pipeline-spotlight-info {
      min-width: 0;
    }

    .pipeline-spotlight-title {
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pipeline-spotlight-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 0.1rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .pipeline-countdown-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      font-weight: 800;
      background: rgba(15, 23, 42, 0.8);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
      padding: 0.25rem 0.65rem;
      border-radius: var(--radius-xs);
      display: flex;
      align-items: center;
      gap: 0.35rem;
      white-space: nowrap;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.15);
    }

    /* 4-Stage Lifecycle Grid */
    .pipeline-stages-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(225px, 1fr));
      gap: 0.6rem;
      margin-bottom: 0.65rem;
    }

    .pipeline-stage-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 0.65rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      transition: var(--transition);
      position: relative;
    }

    .pipeline-stage-card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(255, 255, 255, 0.05);
    }

    .pipeline-stage-card.active-stage {
      border-color: rgba(245, 158, 11, 0.5);
      background: rgba(245, 158, 11, 0.05);
    }

    .stage-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.35rem;
    }

    .stage-step-tag {
      font-size: 0.62rem;
      font-weight: 800;
      color: var(--accent-primary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stage-time-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.06);
      padding: 0.08rem 0.35rem;
      border-radius: var(--radius-xs);
    }

    .stage-name {
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .stage-desc {
      font-size: 0.7rem;
      color: var(--text-dim);
      line-height: 1.3;
    }

    .stage-channels {
      font-size: 0.66rem;
      color: var(--text-muted);
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
      margin-top: auto;
    }

    .stage-channel-pill {
      background: rgba(0, 0, 0, 0.3);
      padding: 0.05rem 0.3rem;
      border-radius: var(--radius-xs);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .stage-status-pill {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.12rem 0.45rem;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
      width: fit-content;
      margin-top: 0.2rem;
    }

    .stage-status-pill.ready {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .stage-status-pill.done {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .stage-status-pill.live {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .stage-status-pill.queued {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }

    /* Pipeline Infra Bar */
    .pipeline-infra-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 0.7rem;
      color: var(--text-dim);
    }

    .infra-badges-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .infra-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(0, 0, 0, 0.3);
      padding: 0.1rem 0.4rem;
      border-radius: var(--radius-xs);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
    }

    .infra-tag strong {
      color: var(--text-main);
    }

    .cli-cheat-group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .cli-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      background: rgba(0, 0, 0, 0.4);
      color: var(--accent-primary);
      padding: 0.1rem 0.4rem;
      border-radius: var(--radius-xs);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }

    /* Header Pipeline Status Badge */
    .status-badge.status-pipeline {
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.35);
      cursor: pointer;
    }

    .status-badge.status-pipeline:hover {
      background: rgba(99, 102, 241, 0.25);
      border-color: #818cf8;
      color: #fff;
    }

    /* Timeline Day Grouping */
    .timeline-day-group {
      margin-bottom: 1.15rem;
    }

    .timeline-day-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.6rem;
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent-primary);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin-bottom: 0.55rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
    }

    .timeline-day-header.today {
      border-left-color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
    }

    .day-today-tag {
      font-size: 0.68rem;
      font-weight: 800;
      background: #f59e0b;
      color: #0b0f19;
      padding: 0.1rem 0.4rem;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* =========================================================================
       COMPACT & NON-WRAPPING DAY CARDS LAYOUT
       ========================================================================= */
    .timeline-slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(295px, 1fr));
      gap: 0.55rem;
    }

    .slot-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.55rem 0.75rem;
      display: flex;
      flex-direction: column;
      transition: var(--transition);
      position: relative;
      min-width: 0;
    }

    .slot-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    .slot-card.today-card {
      border-color: rgba(245, 158, 11, 0.5);
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.15);
    }

    .slot-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.4rem;
      gap: 0.35rem;
      white-space: nowrap;
      min-width: 0;
    }

    .slot-time-lang {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .slot-time-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.12rem 0.4rem;
      border-radius: var(--radius-xs);
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      white-space: nowrap;
    }

    .slot-time-pill.morning {
      background: rgba(245, 158, 11, 0.12);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .slot-time-pill.bedtime {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .slot-lang-tag {
      font-size: 0.65rem;
      font-weight: 800;
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .slot-lang-tag.id {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .slot-lang-tag.en {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .slot-meta-right {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .slot-status-pill {
      font-size: 0.64rem;
      font-weight: 700;
      padding: 0.12rem 0.42rem;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 1.2;
    }

    .slot-status-pill.completed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .slot-status-pill.buffered {
      background: rgba(14, 165, 233, 0.2);
      color: #38bdf8;
      border: 1px solid rgba(14, 165, 233, 0.4);
    }

    .slot-status-pill.assets-ready {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.4);
    }

    .slot-status-pill.today {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .slot-status-pill.upcoming {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }

    .slot-main-info {
      margin-bottom: 0.35rem;
      min-width: 0;
    }

    .slot-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 0.1rem;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .slot-subtitle {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 0.15rem;
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .slot-type-label {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.35rem;
    }

    .slot-tags-row {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-wrap: nowrap;
      overflow: hidden;
      margin-bottom: 0.4rem;
      white-space: nowrap;
    }

    .format-mini-tag {
      font-size: 0.64rem;
      padding: 0.08rem 0.35rem;
      border-radius: var(--radius-xs);
      background: var(--bg-primary);
      color: var(--accent-primary);
      border: 1px solid rgba(56, 189, 248, 0.25);
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .platform-mini-tag {
      font-size: 0.62rem;
      padding: 0.08rem 0.3rem;
      border-radius: var(--radius-xs);
      background: var(--bg-primary);
      color: var(--text-muted);
      border: 1px solid var(--card-border);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .slot-theme-box {
      font-size: 0.71rem;
      color: var(--text-muted);
      background: var(--bg-primary);
      border-radius: var(--radius-xs);
      padding: 0.3rem 0.5rem;
      border-left: 2px solid var(--accent-primary);
      margin-top: auto;
      margin-bottom: 0.45rem;
      line-height: 1.3;
      font-style: italic;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .slot-footer-actions {
      min-width: 0;
    }

    .slot-banner {
      font-size: 0.68rem;
      font-weight: 700;
      text-align: center;
      padding: 0.25rem 0.4rem;
      border-radius: var(--radius-xs);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.02em;
    }

    .slot-banner.buffered {
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.35);
      color: #38bdf8;
    }

    .slot-banner.assets {
      background: rgba(234, 179, 8, 0.15);
      border: 1px solid rgba(234, 179, 8, 0.35);
      color: #facc15;
    }

    .slot-banner.today {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #f59e0b;
    }

    .slot-banner.queued {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      color: var(--text-dim);
    }

    .slot-runner-countdowns {
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      margin-bottom: 0.45rem;
      padding: 0.34rem 0.46rem;
      background: rgba(0, 0, 0, 0.24);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-xs);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.63rem;
    }

    .slot-runner-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
    }

    .slot-runner-label {
      color: var(--text-muted);
      white-space: nowrap;
    }

    .slot-countdown-chip {
      color: #38bdf8;
      font-weight: 600;
      white-space: nowrap;
    }

    .slot-countdown-chip.done {
      color: #34d399;
    }

    .slot-countdown-chip.imminent {
      color: #fbbf24;
    }

    .slot-action-btn {
      width: 100%;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      font-size: 0.72rem;
      font-weight: 600;
      border-radius: var(--radius-xs);
      border: 1px solid var(--card-border);
      background: var(--bg-secondary);
      color: var(--text-main);
      cursor: pointer;
      text-decoration: none;
      transition: var(--transition);
      white-space: nowrap;
    }

    .slot-action-btn:hover {
      background: var(--bg-tertiary);
      border-color: var(--accent-primary);
    }

    .slot-action-btn.active-btn {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
      color: #0b0f19;
      font-weight: 700;
    }

    /* Modal Player */
    .modal-backdrop {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .modal-backdrop.open {
      display: flex;
    }

    .modal-window {
      background: var(--bg-secondary);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      max-width: 820px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--card-border);
    }

    .modal-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.35rem;
      cursor: pointer;
      line-height: 1;
      padding: 0.2rem;
    }

    .modal-close:hover {
      color: var(--text-main);
    }

    .modal-player-container {
      position: relative;
      width: 100%;
      padding-top: 56.25%; /* 16:9 */
      background: #000000;
    }

    .modal-player-container iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 0.6rem 1rem;
      border-radius: var(--radius-md);
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: 0 8px 20px rgba(0,0,0,0.4);
      z-index: 1100;
      transform: translateY(80px);
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }

    /* Footer */
    footer {
      margin-top: 2rem;
      border-top: 1px solid var(--card-border);
      padding: 1.25rem 0;
      color: var(--text-muted);
      font-size: 0.76rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.85rem;
    }

    .footer-links {
      display: flex;
      gap: 0.85rem;
      flex-wrap: wrap;
    }

    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }

    .footer-links a:hover {
      color: var(--accent-primary);
    }

    /* Analytics Dashboard & Insights */
    .analytics-grid-2col {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.85rem;
      margin-bottom: 0.85rem;
    }

    .analytics-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      min-width: 0;
    }

    .analytics-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.45rem;
    }

    .analytics-panel-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .analytics-panel-sub {
      font-size: 0.7rem;
      color: var(--text-dim);
    }

    .analytics-bar-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .analytics-bar-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      gap: 0.5rem;
    }

    .analytics-bar-track {
      height: 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    [data-theme="light"] .analytics-bar-track {
      background: rgba(15, 23, 42, 0.08);
    }

    .analytics-bar-fill {
      height: 100%;
      border-radius: var(--radius-full);
      transition: width 0.35s ease;
    }

    .leaderboard-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      padding: 0.5rem 0.65rem;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid var(--card-border);
      transition: var(--transition);
    }

    .leaderboard-item:hover {
      border-color: var(--accent-primary);
      background: var(--bg-tertiary);
    }

    .leaderboard-rank {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--accent-primary);
      flex-shrink: 0;
    }

    .leaderboard-info {
      flex: 1;
      min-width: 0;
    }

    .leaderboard-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .leaderboard-meta {
      font-size: 0.68rem;
      color: var(--text-muted);
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    /* Story Hub Coverage Matrix */
    .story-coverage-matrix {
      display: flex;
      flex-direction: column;
      gap: 0.32rem;
      margin: 0.45rem 0;
      padding: 0.45rem;
      background: rgba(0, 0, 0, 0.22);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
    }

    [data-theme="light"] .story-coverage-matrix {
      background: rgba(15, 23, 42, 0.03);
    }

    .coverage-lang-row {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      flex-wrap: wrap;
    }

    .coverage-lang-label {
      font-size: 0.66rem;
      font-weight: 800;
      min-width: 34px;
      color: var(--text-main);
    }

    .coverage-pill {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.12rem 0.36rem;
      border-radius: var(--radius-xs);
      border: 1px solid var(--card-border);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      cursor: pointer;
    }

    .coverage-pill.done {
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }

    .coverage-pill.missing {
      background: rgba(255, 255, 255, 0.02);
      color: var(--text-dim);
      opacity: 0.55;
      cursor: default;
    }

    .day-readiness-pill {
      font-size: 0.66rem;
      font-weight: 700;
      padding: 0.14rem 0.48rem;
      border-radius: var(--radius-full);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
    }

    .day-readiness-pill.done {
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.38);
      color: #34d399;
    }

    /* Sticky Mobile Bottom Navigation Bar */
    .mobile-bottom-nav {
      display: none;
    }

    .mobile-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.12rem;
      padding: 0.28rem 0.2rem;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.65rem;
      font-weight: 700;
      cursor: pointer;
    }

    .mobile-nav-item span:first-child {
      font-size: 1rem;
      line-height: 1.1;
    }

    .mobile-nav-item.active {
      color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.12);
    }

    @media (max-width: 1024px) {
      .analytics-grid-2col { grid-template-columns: 1fr; }
      .pipeline-stages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 768px) {
      html, body { max-width: 100%; overflow-x: hidden; }
      body { padding-bottom: 68px; }
      .container { max-width: 100%; overflow-x: clip; padding: 0.65rem 0.75rem; }
      .brand-heading h1 { font-size: 1.08rem; }
      .nav-tab-btn { flex-shrink: 0; white-space: nowrap; }
      .pipeline-spotlight-left { width: 100%; max-width: 100%; flex-wrap: wrap; }
      .pipeline-spotlight-info { width: 100%; max-width: 100%; }
      .pipeline-spotlight-title { white-space: normal; word-break: break-word; }
      .pipeline-monitor-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .header-actions {
        width: 100%;
        justify-content: flex-start;
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 0.25rem;
        scrollbar-width: none;
      }
      .header-actions::-webkit-scrollbar { display: none; }
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; }
      .cards-grid { grid-template-columns: 1fr; }
      .timeline-slots-grid { grid-template-columns: 1fr; }
      .pipeline-stages-grid { grid-template-columns: 1fr; }
      .pipeline-spotlight-bar { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .toolbar { padding: 0.55rem; }
      .search-box { min-width: 100%; }
      .view-toggles { width: 100%; overflow-x: auto; }
      .filter-chips-row {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 0.2rem;
      }
      .filter-chips-row::-webkit-scrollbar { display: none; }
      .filter-chip, .filter-label, .filter-select { flex-shrink: 0; }
      .modal-window { width: 96vw; max-width: 96vw; margin: 0.5rem; }
      footer { flex-direction: column; align-items: flex-start; }
      .mobile-bottom-nav {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.25rem;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 60;
        background: rgba(17, 24, 39, 0.94);
        border-top: 1px solid var(--card-border);
        padding: 0.35rem 0.45rem calc(0.35rem + env(safe-area-inset-bottom, 0px));
        backdrop-filter: blur(16px);
      }
      [data-theme="light"] .mobile-bottom-nav {
        background: rgba(255, 255, 255, 0.96);
      }
    }

    @media (max-width: 480px) {
      .stat-value { font-size: 1.15rem; }
      .nav-tab-btn { padding: 0.38rem 0.65rem; font-size: 0.78rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="header-top">
        <div class="brand-title">
          <div class="brand-logo">📚</div>
          <div class="brand-heading">
            <h1>Zayn Storybook Catalog & Release Hub</h1>
            <p>Official Multi-Platform Publication Registry & 30-Day Bedtime Broadcast Timeline</p>
          </div>
        </div>
        <div class="header-actions">
          <span class="status-badge status-pipeline" id="pipeline-header-badge" onclick="switchMainTab('timeline'); document.getElementById('pipelineMonitorSection')?.scrollIntoView({behavior: 'smooth'});" title="Click to view Live Pipeline Monitor">
            <span class="status-dot pulsing" style="background: #38bdf8;"></span>
            <span id="pipelineHeaderStatusText">⚡ Next: Loading...</span>
          </span>
          <span class="status-badge status-live" id="d1-status-pill" onclick="syncCatalog(true)" title="Click to refresh data from Cloudflare D1">
            <span class="status-dot"></span>
            <span id="d1StatusText">⚡ Cloudflare D1</span>
          </span>
          <button class="btn-action" id="themeToggleBtn" onclick="toggleTheme()" title="Switch Light/Dark mode">🌓 Theme</button>
          <button class="btn-action" onclick="exportActiveCsv()" title="Download current view in CSV format">📥 CSV</button>
          <button class="btn-action btn-accent" onclick="exportActiveJson()" title="Download structured JSON dataset">📋 JSON</button>
        </div>
      </div>

      <div class="channel-strip">
        <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Official Channels:</span>
        <a href="https://www.youtube.com/@zayn.storybook" target="_blank" rel="noopener noreferrer" class="channel-pill yt">
          <span>📺</span> YouTube (@zayn.storybook)
        </a>
        <a href="https://www.facebook.com/1473240609201601" target="_blank" rel="noopener noreferrer" class="channel-pill fb">
          <span>📘</span> Facebook Page
        </a>
        <a href="https://www.instagram.com/zayn.storybook" target="_blank" rel="noopener noreferrer" class="channel-pill ig">
          <span>📸</span> Instagram (@zayn.storybook)
        </a>
        <a href="https://github.com/ramustha/storybook-video-generator" target="_blank" rel="noopener noreferrer" class="channel-pill gh">
          <span>💻</span> GitHub
        </a>
      </div>
    </header>

    <!-- Main Navigation View Switcher (Tabs) -->
    <nav class="main-nav-tabs">
      <button class="nav-tab-btn active" id="tabCatalogBtn" onclick="switchMainTab('catalog')">
        <span>📚</span> Published Video Assets
        <span class="tab-badge" id="tabCatalogCount">${initialTotal}</span>
      </button>
      <button class="nav-tab-btn" id="tabTimelineBtn" onclick="switchMainTab('timeline')">
        <span>📅</span> Release Roadmap
        <span class="tab-badge" id="tabTimelineBadge">${initialCalCompleted}/${initialCalTotal} (${initialCalProgress}%)</span>
      </button>
      <button class="nav-tab-btn" id="tabAnalyticsBtn" onclick="switchMainTab('analytics')">
        <span>📊</span> Analytics & Insights
        <span class="tab-badge" id="tabAnalyticsBadge">${initialTotalViews.toLocaleString()} views</span>
      </button>
    </nav>

    <!-- =========================================================================
         SECTION 1: PUBLISHED ASSETS CATALOG
         ========================================================================= -->
    <div id="catalogViewSection">
      <!-- Stats KPI Section -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-title">Total Publications</div>
          <div class="stat-value" id="kpiTotal">${initialTotal}</div>
          <div class="stat-desc">Published & verified assets</div>
        </div>
        <div class="stat-card" style="border-color: rgba(56, 189, 248, 0.3);">
          <div class="stat-title">Total Live Views</div>
          <div class="stat-value" id="kpiTotalViews" style="color: #38bdf8;">${initialTotalViews.toLocaleString()}</div>
          <div class="stat-desc">Cross-Platform Weekly Harvest</div>
        </div>
        <div class="stat-card" style="border-color: rgba(236, 72, 153, 0.3);">
          <div class="stat-title">Total Reactions</div>
          <div class="stat-value" id="kpiTotalLikes" style="color: #f472b6;">${initialTotalLikes.toLocaleString()}</div>
          <div class="stat-desc">Likes & Audience Reactions</div>
        </div>
        <div class="stat-card yt">
          <div class="stat-title">YouTube Videos</div>
          <div class="stat-value" id="kpiYt">${initialYt}</div>
          <div class="stat-desc">Full HD, Shorts & Marathons</div>
        </div>
        <div class="stat-card fb">
          <div class="stat-title">Facebook Videos</div>
          <div class="stat-value" id="kpiFb">${initialFb}</div>
          <div class="stat-desc">Watch Videos, Reels & Specials</div>
        </div>
        <div class="stat-card ig">
          <div class="stat-title">Instagram Reels</div>
          <div class="stat-value" id="kpiIg">${initialIg}</div>
          <div class="stat-desc">Bilingual Reels (9:16)</div>
        </div>
      </section>

      <!-- Toolbar Filters -->
      <section class="toolbar">
        <div class="search-row">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="searchInput" class="search-input" placeholder="Search by story, video title, ID, author, or keyword..." oninput="handleSearch()">
          </div>
          <div class="view-toggles">
            <button id="viewGroupedBtn" class="view-btn active" onclick="setViewMode('grouped')">
              <span>📦</span> Ratio Hub
            </button>
            <button id="viewStoryBtn" class="view-btn" onclick="setViewMode('story')">
              <span>📖</span> Story Hub
            </button>
            <button id="viewCardBtn" class="view-btn" onclick="setViewMode('card')">
              <span>⊞</span> All Cards
            </button>
            <button id="viewTableBtn" class="view-btn" onclick="setViewMode('table')">
              <span>☰</span> Table
            </button>
          </div>
          <select id="catalogSortSelect" class="filter-select" onchange="handleSortChange()" title="Sort Assets">
            <option value="newest">🆕 Latest Published</option>
            <option value="views">👀 Most Viewed</option>
            <option value="likes">❤️ Most Liked</option>
            <option value="title">🔤 Title A–Z</option>
          </select>
        </div>

        <div class="filter-chips-row">
          <span class="filter-label">Ratio:</span>
          <button class="filter-chip active" data-filter="ratio" data-value="all" onclick="setRatioFilter('all', this)">All</button>
          <button class="filter-chip" data-filter="ratio" data-value="16:9" onclick="setRatioFilter('16:9', this)" title="Landscape (16:9)">📺 L</button>
          <button class="filter-chip" data-filter="ratio" data-value="9:16" onclick="setRatioFilter('9:16', this)" title="Portrait (9:16)">📱 P</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Platform:</span>
          <button class="filter-chip active" data-filter="platform" data-value="all" onclick="setPlatformFilter('all', this)">All</button>
          <button class="filter-chip" data-filter="platform" data-value="YouTube" onclick="setPlatformFilter('YouTube', this)">📺 YouTube</button>
          <button class="filter-chip" data-filter="platform" data-value="Facebook" onclick="setPlatformFilter('Facebook', this)">📘 Facebook</button>
          <button class="filter-chip" data-filter="platform" data-value="Instagram" onclick="setPlatformFilter('Instagram', this)">📸 Instagram</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Lang:</span>
          <button class="filter-chip active" data-filter="lang" data-value="all" onclick="setLangFilter('all', this)">All</button>
          <button class="filter-chip" data-filter="lang" data-value="id" onclick="setLangFilter('id', this)">🇮🇩 ID</button>
          <button class="filter-chip" data-filter="lang" data-value="en" onclick="setLangFilter('en', this)">🇬🇧 EN</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Story:</span>
          <select id="storySelect" class="filter-select" onchange="handleStoryChange()">
            <option value="all">All Stories & Marathons (${initialTotal})</option>
            <option value="compilation">🌙 Bedtime Story Marathons (Compilations)</option>
            ${initialStoryOptions.map(([slug, title]) => `<option value="${slug}">${title}</option>`).join("")}
          </select>
        </div>
      </section>

      <!-- Results Status Bar -->
      <div class="results-bar">
        <div class="results-count">
          Showing <strong id="visibleCount">${initialTotal}</strong> of <strong id="totalCount">${initialTotal}</strong> verified video assets
        </div>
        <div style="font-size: 0.72rem; color: var(--text-dim);" id="filterNotice"></div>
      </div>

      <!-- Card Grid View Container -->
      <div id="cardViewContainer" class="cards-grid">
        <!-- Injected by JavaScript -->
      </div>

      <!-- Table View Container -->
      <div id="tableViewContainer" class="table-container" style="display: none;">
        <table>
          <thead>
            <tr>
              <th>Audit ID</th>
              <th>Platform</th>
              <th>Lang</th>
              <th>Format</th>
              <th>Story Title</th>
              <th>Published Video Title</th>
              <th>Video ID</th>
              <th>Date (UTC)</th>
              <th>Status</th>
              <th>Direct Link</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            <!-- Injected by JavaScript -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         SECTION 2: 30-DAY RELEASE TIMELINE & PRODUCTION PROGRESS
         ========================================================================= -->
    <div id="timelineViewSection" style="display: none;">
      <!-- Timeline Progress Overview Banner -->
      <div class="timeline-progress-banner">
        <section class="stats-grid" style="margin-bottom: 0.6rem;">
          <div class="stat-card">
            <div class="stat-title">Planned Slots</div>
            <div class="stat-value" id="kpiCalTotal">${initialCalTotal}</div>
            <div class="stat-desc" id="kpiCalPlanDesc">Active 30 Days Launch Roadmap</div>
          </div>
          <div class="stat-card cc">
            <div class="stat-title">Completed</div>
            <div class="stat-value" id="kpiCalCompleted" style="color: var(--success-green);">${initialCalCompleted}</div>
            <div class="stat-desc">Broadcasted & Archived</div>
          </div>
          <div class="stat-card gold">
            <div class="stat-title">Today's Schedule</div>
            <div class="stat-value" id="kpiCalToday" style="color: #f59e0b;">${initialCalToday}</div>
            <div class="stat-desc" id="kpiCalTodayDesc">Active Production Broadcasts</div>
          </div>
          <div class="stat-card yt">
            <div class="stat-title">Upcoming</div>
            <div class="stat-value" id="kpiCalUpcoming">${initialCalUpcoming}</div>
            <div class="stat-desc">Queued in D1 Scheduler</div>
          </div>
          <div class="stat-card stories">
            <div class="stat-title">Roadmap Progress</div>
            <div class="stat-value" id="kpiCalProgress" style="color: var(--accent-primary);">${initialCalProgress}%</div>
            <div class="stat-desc" id="kpiCalProgressDesc">${initialCalCompleted} of ${initialCalTotal} Slots Broadcasted</div>
          </div>
        </section>

        <!-- Progress Bar -->
        <div class="progress-bar-wrapper">
          <div class="progress-track">
            <div class="progress-fill" id="timelineProgressBar" style="width: ${initialCalProgress}%;"></div>
          </div>
          <div class="progress-labels">
            <span>🚀 Launch: <strong id="roadmapLaunchDate">07 Nov 2026</strong></span>
            <span id="progressBarLabel"><strong>${initialCalCompleted} of ${initialCalTotal} Slots</strong> (${initialCalProgress}%)</span>
            <span>🏁 Finale: <strong id="roadmapFinaleDate">31 Dec 2026</strong></span>
          </div>
        </div>
      </div>

      <!-- =========================================================================
           AUTOMATION & BROADCAST PIPELINE MONITOR
           ========================================================================= -->
      <section class="pipeline-monitor-section" id="pipelineMonitorSection">
        <!-- Monitor Header -->
        <div class="pipeline-monitor-header">
          <div class="pipeline-monitor-title-group">
            <div class="pipeline-monitor-icon">📡</div>
            <div class="pipeline-monitor-heading">
              <h2>Automated Broadcast Pipeline Monitor</h2>
              <p>Edge Cloudflare Worker cron triggers, R2 pre-render buffer, & multi-platform dispatcher</p>
            </div>
          </div>
          <div class="pipeline-monitor-controls">
            <span class="pipeline-clock-pill" id="pipelineClockWib">⏰ 00:00:00 WIB</span>
            <span class="pipeline-pulse-badge">
              <span class="status-dot pulsing" style="background: #10b981;"></span>
              Dispatcher Active
            </span>
          </div>
        </div>

        <!-- Immediate Next Event Spotlight Bar -->
        <div class="pipeline-spotlight-bar" id="nextUpBanner">
          <div class="pipeline-spotlight-left">
            <span class="pipeline-event-badge" id="pipelineSpotlightBadge">⚡ NEXT EVENT</span>
            <div class="pipeline-spotlight-info">
              <div class="pipeline-spotlight-title" id="pipelineSpotlightName">
                Loading Next Automated Action...
              </div>
              <div class="pipeline-spotlight-meta" id="pipelineSpotlightMeta">
                <span>📅 Scheduled Today</span> · <span>⏰ Target Broadcast</span>
              </div>
            </div>
          </div>
          <div class="pipeline-countdown-badge" id="pipelineCountdown">
            ⏳ T - Calculating...
          </div>
        </div>

        <!-- Active Story Spotlight Row -->
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--card-border); border-radius: var(--radius-xs); padding: 0.45rem 0.65rem; margin-bottom: 0.65rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="min-width: 0;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);" id="pipelineSpotlightTitle">
              ${nextUpSlot ? `${nextUpSlot.storyTitleId} (${nextUpSlot.lang.toUpperCase()})` : "Active Story Slot"}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 650px;" id="pipelineSpotlightDesc">
              "${nextUpSlot ? nextUpSlot.theme : 'Pendidikan Karakter Anak'}"
            </div>
          </div>
          <div style="display: flex; gap: 0.3rem; align-items: center; flex-shrink: 0;">
            <span class="platform-mini-tag">📺 YouTube</span>
            <span class="platform-mini-tag">📘 Facebook</span>
            <span class="platform-mini-tag">📸 Instagram</span>
          </div>
        </div>

        <!-- 4-Stage Lifecycle Grid -->
        <div class="pipeline-stages-grid">
          <!-- Stage 1: Asset Buffering -->
          <div class="pipeline-stage-card" id="stageCardBuffer">
            <div class="stage-card-top">
              <span class="stage-step-tag">STAGE 1 · CLOUD BUFFER</span>
              <span class="stage-time-tag">Daily 07:00</span>
            </div>
            <div class="stage-name">📦 Asset Pre-render Buffer</div>
            <div class="stage-desc">Pre-renders 1080p landscape & vertical MP4s and caches them to Cloudflare R2 bucket 48h in advance.</div>
            <div class="stage-channels">
              <span class="stage-channel-pill">☁️ Cloudflare R2</span>
              <span class="stage-channel-pill">⚡ Zero Runner Delay</span>
            </div>
            <div id="stageBufferStatus" class="stage-status-pill queued">⏳ Checking Buffer...</div>
            <div style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.15rem;" id="stageBufferNextText">Next Cron: Daily 07:00 WIB</div>
          </div>

          <!-- Stage 2: Daily Announcement -->
          <div class="pipeline-stage-card" id="stageCardAnnounce">
            <div class="stage-card-top">
              <span class="stage-step-tag">STAGE 2 · SOCIAL TEASER</span>
              <span class="stage-time-tag">Daily 07:15 WIB</span>
            </div>
            <div class="stage-name">📣 Daily Bilingual Teaser</div>
            <div class="stage-desc">Publishes unified morning carousel announcement ("Menu Dongeng Hari Ini") covering both EN & ID slots.</div>
            <div class="stage-channels">
              <span class="stage-channel-pill">📸 IG Carousel (4:5)</span>
              <span class="stage-channel-pill">📘 FB Multi-Photo</span>
              <span class="stage-channel-pill">🧵 Threads</span>
            </div>
            <div id="stageAnnounceStatus" class="stage-status-pill queued">⏳ Checking Status...</div>
            <div style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.15rem;" id="stageAnnounceNextText">Single Teaser per Day</div>
          </div>

          <!-- Stage 3: Morning English Broadcast -->
          <div class="pipeline-stage-card" id="stageCardMorning">
            <div class="stage-card-top">
              <span class="stage-step-tag">STAGE 3 · MORNING BROADCAST</span>
              <span class="stage-time-tag">Daily 08:30 WIB</span>
            </div>
            <div class="stage-name">🌅 Morning Edu-Story (EN)</div>
            <div class="stage-desc">English educational story video published across global channels in vertical and landscape formats.</div>
            <div class="stage-channels">
              <span class="stage-channel-pill">📺 YT Shorts & 16:9</span>
              <span class="stage-channel-pill">📘 FB Reels & Video</span>
              <span class="stage-channel-pill">📸 IG Reels</span>
            </div>
            <div id="stageMorningStatus" class="stage-status-pill queued">⏳ Checking Status...</div>
            <div style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.15rem;" id="stageMorningNextText">Daily Morning Slot</div>
          </div>

          <!-- Stage 4: Prime Bedtime Indonesian Broadcast -->
          <div class="pipeline-stage-card" id="stageCardBedtime">
            <div class="stage-card-top">
              <span class="stage-step-tag">STAGE 4 · PRIME BEDTIME</span>
              <span class="stage-time-tag">Daily 19:00 WIB</span>
            </div>
            <div class="stage-name">🌙 Prime Bedtime Story (ID)</div>
            <div class="stage-desc">Indonesian calming bedtime narration with ambient acoustic foley and bilingual subtitles.</div>
            <div class="stage-channels">
              <span class="stage-channel-pill">📺 YT Landscape & Shorts</span>
              <span class="stage-channel-pill">📘 FB Watch & Reels</span>
              <span class="stage-channel-pill">📸 IG Reels</span>
            </div>
            <div id="stageBedtimeStatus" class="stage-status-pill queued">⏳ Checking Status...</div>
            <div style="font-size: 0.65rem; color: var(--text-dim); margin-top: 0.15rem;" id="stageBedtimeNextText">Daily Prime Slot</div>
          </div>
        </div>

        <!-- Infrastructure & Quick CLI Helper Strip -->
        <div class="pipeline-infra-bar">
          <div class="infra-badges-group">
            <span class="infra-tag">⚡ Dispatcher: <strong>Cloudflare Worker Cron</strong></span>
            <span class="infra-tag">🗄️ Database: <strong>D1 SQLite (60s sync)</strong></span>
            <span class="infra-tag">☁️ Video CDN: <strong>Cloudflare R2 Bucket</strong></span>
          </div>
          <div class="cli-cheat-group">
            <span style="font-size: 0.66rem; color: var(--text-dim);">CLI Helpers:</span>
            <code class="cli-pill" title="Check scheduled slots for today">npm run calendar:today</code>
            <code class="cli-pill" title="Check R2 pre-render buffer status">npm run buffer:prerender -- --status</code>
            <code class="cli-pill" title="Trigger daily broadcast pipeline manually">npm run broadcast:daily</code>
          </div>
        </div>
      </section>

      <!-- Timeline Toolbar -->
      <section class="toolbar">
        <div class="search-row">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="timelineSearchInput" class="search-input" placeholder="Search scheduled story, date, theme, or slot type..." oninput="handleTimelineSearch()">
          </div>
          <div class="view-toggles">
            <button class="view-btn" onclick="jumpToTodaySchedule()" title="Scroll directly to Today's broadcast slots">
              <span>🎯</span> Today
            </button>
            <button id="viewCalFlowBtn" class="view-btn active" onclick="setTimelineViewMode('flow')">
              <span>⊞</span> Day Cards
            </button>
            <button id="viewCalTableBtn" class="view-btn" onclick="setTimelineViewMode('table')">
              <span>☰</span> Schedule Table
            </button>
          </div>
        </div>

        <div class="filter-chips-row">
          <span class="filter-label">Roadmap:</span>
          <button class="filter-chip active" data-cal-filter="scope" data-value="active30" onclick="setTimelineScopeFilter('active30', this)">🌟 2026 Launch</button>
          <button class="filter-chip" data-cal-filter="scope" data-value="all" onclick="setTimelineScopeFilter('all', this)">🚀 2-Year Master Plan (1,530)</button>
          <button class="filter-chip" data-cal-filter="scope" data-value="budi" onclick="setTimelineScopeFilter('budi', this)">📚 BUDI 2027–2028</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Status:</span>
          <button class="filter-chip active" data-cal-filter="status" data-value="all" onclick="setTimelineStatusFilter('all', this)">All (${initialCalTotal})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="today" onclick="setTimelineStatusFilter('today', this)">🔥 Today (${initialCalToday})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="upcoming" onclick="setTimelineStatusFilter('upcoming', this)">⏳ Upcoming (${initialCalUpcoming})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="completed" onclick="setTimelineStatusFilter('completed', this)">✅ Completed (${initialCalCompleted})</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Lang:</span>
          <button class="filter-chip active" data-cal-filter="lang" data-value="all" onclick="setTimelineLangFilter('all', this)">All</button>
          <button class="filter-chip" data-cal-filter="lang" data-value="id" onclick="setTimelineLangFilter('id', this)">🇮🇩 ID</button>
          <button class="filter-chip" data-cal-filter="lang" data-value="en" onclick="setTimelineLangFilter('en', this)">🇬🇧 EN</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Readiness:</span>
          <button class="filter-chip active" data-cal-filter="readiness" data-value="all" onclick="setTimelineReadinessFilter('all', this)">All</button>
          <button class="filter-chip" data-cal-filter="readiness" data-value="buffered" onclick="setTimelineReadinessFilter('buffered', this)">🟢 R2 Ready</button>
          <button class="filter-chip" data-cal-filter="readiness" data-value="assets" onclick="setTimelineReadinessFilter('assets', this)">🟡 Assets Ready</button>
          <button class="filter-chip" data-cal-filter="readiness" data-value="queued" onclick="setTimelineReadinessFilter('queued', this)">⏳ Queued</button>
        </div>
      </section>

      <!-- Timeline Results Bar -->
      <div class="results-bar">
        <div class="results-count">
          Showing <strong id="timelineVisibleCount">${initialCalTotal}</strong> of <strong id="timelineTotalCount">${initialCalTotal}</strong> scheduled broadcasts
        </div>
        <div style="font-size: 0.72rem; color: var(--text-dim);" id="timelineFilterNotice"></div>
      </div>

      <!-- Timeline Card Flow Container -->
      <div id="timelineFlowContainer">
        <!-- Injected by JavaScript -->
      </div>

      <!-- Timeline Table View Container -->
      <div id="timelineTableContainer" class="table-container" style="display: none;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Day</th>
              <th>Status</th>
              <th>Story Title</th>
              <th>Lang</th>
              <th>Format</th>
              <th>Slot Type</th>
              <th>Platforms</th>
              <th>Theme / Notes</th>
            </tr>
          </thead>
          <tbody id="timelineTableBody">
            <!-- Injected by JavaScript -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         SECTION 3: CROSS-PLATFORM ANALYTICS & PRODUCTION TELEMETRY
         ========================================================================= -->
    <div id="analyticsViewSection" style="display: none;">
      <section class="stats-grid" style="margin-bottom: 0.85rem;">
        <div class="stat-card" style="border-color: rgba(56, 189, 248, 0.35);">
          <div class="stat-title">Total Reach (Views)</div>
          <div class="stat-value" id="anTotalViews" style="color: #38bdf8;">${initialTotalViews.toLocaleString()}</div>
          <div class="stat-desc" id="anTotalViewsSub">Across YT, FB, IG & Threads</div>
        </div>
        <div class="stat-card ig">
          <div class="stat-title">Total Engagement</div>
          <div class="stat-value" id="anTotalLikes" style="color: #f472b6;">${initialTotalLikes.toLocaleString()}</div>
          <div class="stat-desc" id="anEngagementRate">Likes & Comments</div>
        </div>
        <div class="stat-card yt">
          <div class="stat-title">YouTube Channel</div>
          <div class="stat-value" id="anYtChannelViews">0</div>
          <div class="stat-desc" id="anYtSubs">Channel Telemetry</div>
        </div>
        <div class="stat-card stories">
          <div class="stat-title">Story Coverage</div>
          <div class="stat-value" id="anUniqueStories">${initialStoriesCount}</div>
          <div class="stat-desc" id="anStoriesIngested">Published vs R2 Assets</div>
        </div>
        <div class="stat-card cc">
          <div class="stat-title">R2 Buffer Health</div>
          <div class="stat-value" id="anBufferHealth">0%</div>
          <div class="stat-desc" id="anBufferHealthSub">Upcoming Pre-Rendered Slots</div>
        </div>
      </section>

      <div class="analytics-grid-2col">
        <div class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <div class="analytics-panel-title">🌐 Platform Performance Share</div>
              <div class="analytics-panel-sub" id="anStatsRecordedAt">Weekly harvested metrics & catalog views</div>
            </div>
          </div>
          <div id="anPlatformBreakdown"></div>
        </div>

        <div class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <div class="analytics-panel-title">🎭 Language & Format Split</div>
              <div class="analytics-panel-sub">ID vs EN & Landscape (16:9) vs Vertical (9:16)</div>
            </div>
          </div>
          <div id="anFormatLangBreakdown"></div>
        </div>
      </div>

      <div class="analytics-grid-2col">
        <div class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <div class="analytics-panel-title">🏆 Top Performing Videos</div>
              <div class="analytics-panel-sub">Ranked by cross-platform views (click to play/open)</div>
            </div>
          </div>
          <div id="anTopVideosList" style="display: flex; flex-direction: column; gap: 0.45rem;"></div>
        </div>

        <div class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <div class="analytics-panel-title">📚 Top Stories by Combined Reach</div>
              <div class="analytics-panel-sub">Aggregated views across all platforms & ratios</div>
            </div>
          </div>
          <div id="anTopStoriesList" style="display: flex; flex-direction: column; gap: 0.45rem;"></div>
        </div>
      </div>
    </div>

    <!-- Video Modal Preview -->
    <div id="videoModal" class="modal-backdrop" onclick="closeModal(event)">
      <div class="modal-window" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title" id="modalVideoTitle">Video Player Preview</div>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-player-container" id="modalPlayerFrame">
          <!-- Iframe injected dynamically -->
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <div id="toast" class="toast">Copied to clipboard!</div>

    <!-- Footer -->
    <footer>
      <div>
        <strong>Zayn Storybook</strong> &copy; 2026. Automated Production Engine for Children's Literature.
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.15rem;">
          All stories adapted under Creative Commons Attribution 4.0 International (CC BY 4.0) from Pratham Books / StoryWeaver.
        </div>
      </div>
      <div class="footer-links">
        <a href="COPYRIGHT_AND_ATTRIBUTION_GUIDE.md" target="_blank">Attribution Guide</a>
        <a href="PRIVACY_POLICY.md" target="_blank">Privacy Policy</a>
        <a href="TERMS_OF_SERVICE.md" target="_blank">Terms of Service</a>
        <a href="https://github.com/ramustha/storybook-video-generator" target="_blank">GitHub Repo</a>
      </div>
    </footer>
  </div>

  <!-- Sticky Mobile Bottom Navigation -->
  <nav class="mobile-bottom-nav" aria-label="Mobile Navigation">
    <button class="mobile-nav-item active" id="mobNavCatalog" onclick="switchMainTab('catalog')">
      <span>📚</span>
      <span>Assets</span>
    </button>
    <button class="mobile-nav-item" id="mobNavTimeline" onclick="switchMainTab('timeline')">
      <span>📅</span>
      <span>Schedule</span>
    </button>
    <button class="mobile-nav-item" id="mobNavAnalytics" onclick="switchMainTab('analytics')">
      <span>📊</span>
      <span>Analytics</span>
    </button>
    <button class="mobile-nav-item" id="mobNavToday" onclick="jumpToTodaySchedule()">
      <span>🎯</span>
      <span>Today</span>
    </button>
  </nav>

  <script>
    // Embedded Snapshots
    const BUILD_AUDIT_SNAPSHOT = ${JSON.stringify(auditRecords)};
    const KNOWN_STORY_ASSETS = ${JSON.stringify(allAssetSlugs)};
    const KNOWN_BUFFERED_STORIES = ${JSON.stringify(bufferedStories)};
    function cloneRecordList(list) {
      return (list || []).map(function(item) { return Object.assign({}, item); });
    }
    let RAW_AUDIT_DATA = cloneRecordList(BUILD_AUDIT_SNAPSHOT);
    let lastRenderedWibDate = '';
    let activeCatalogSource = 'embedded';

${browserSyncScript}

    // Defensive normalizer guaranteeing zero missing or undefined slot properties
    function normalizeCalendarSlot(s, idx) {
      if (!s) return null;
      const dateStr = s.date || s.scheduled_date || '2026-11-07';
      const dayName = s.dayName || s.day_name || 'Hari';
      const timeSlot = s.timeSlot || s.time_slot || '08:30 WIB';
      const slotType = s.slotType || s.slot_type || 'Daily Broadcast';
      const bookSlug = s.bookSlug || s.book_slug || 'story';

      let storyTitleId = s.storyTitleId || s.title_id || s.titleId;
      let storyTitleEn = s.storyTitleEn || s.title_en || s.titleEn;
      if (!storyTitleId) {
        storyTitleId = formatSlugFallbackTitle(bookSlug);
      }
      if (!storyTitleEn) {
        storyTitleEn = storyTitleId;
      }

      const lang = s.lang || s.language || 'id';
      const theme = s.theme || s.book_theme || 'Cerita Anak';
      const format = s.format === 'both'
        ? 'Landscape (16:9) & Shorts (9:16)'
        : s.format === 'vertical'
        ? 'Shorts / Reels (9:16)'
        : (s.format || 'Landscape (16:9)');

      const targetPlatforms = Array.isArray(s.targetPlatforms) && s.targetPlatforms.length > 0
        ? s.targetPlatforms
        : format.includes('Shorts') && format.includes('Landscape')
        ? ['YouTube (16:9 & Shorts)', 'Facebook (Watch & Reels)', 'Instagram Reels']
        : format.includes('Shorts')
        ? ['YouTube Shorts', 'Facebook Reels', 'Instagram Reels']
        : ['YouTube (16:9)', 'Facebook Watch (16:9)'];

      const publishedSlugs = new Set(
        (RAW_AUDIT_DATA || []).filter(isPrimaryPublishedRecord).map(function(r) { return r.storySlug; })
      );
      const hasPublishedAsset = Boolean(s.hasPublishedAsset || publishedSlugs.has(bookSlug));
      const isCompleted = Boolean(s.isCompleted || s.is_completed);
      const isBuffered = Boolean(s.isBuffered || s.is_buffered || (typeof KNOWN_BUFFERED_STORIES !== 'undefined' && KNOWN_BUFFERED_STORIES.includes(bookSlug)));
      const hasAssets = Boolean(s.hasAssets || s.has_assets || hasPublishedAsset || KNOWN_STORY_ASSETS.includes(bookSlug));

      return {
        id: s.id ? (typeof s.id === 'string' && s.id.startsWith('SLOT-') ? s.id : 'SLOT-' + String(s.id).padStart(4, '0')) : 'SLOT-' + String((idx || 0) + 1).padStart(4, '0'),
        date: dateStr,
        dayName: dayName,
        timeSlot: timeSlot,
        slotType: slotType,
        bookSlug: bookSlug,
        storyTitleId: storyTitleId,
        storyTitleEn: storyTitleEn,
        lang: lang,
        format: format,
        targetPlatforms: targetPlatforms,
        theme: theme,
        status: s.status || 'upcoming',
        isCompleted: isCompleted,
        hasPublishedAsset: hasPublishedAsset,
        isBuffered: isBuffered,
        hasAssets: hasAssets
      };
    }

    const BUILD_CALENDAR_SNAPSHOT = ${JSON.stringify(calendarSlots)}.map(normalizeCalendarSlot);
    const BUILD_STATS_SNAPSHOT = ${JSON.stringify(statsSummaryPayload)};
    let RAW_CALENDAR_DATA = cloneRecordList(BUILD_CALENDAR_SNAPSHOT);
    let LIVE_STATS_SUMMARY = BUILD_STATS_SNAPSHOT || { recordedAt: null, summary: null };

    function isBudiSlot(s) {
      return (s && s.date >= '2027-01-01') || String((s && s.bookSlug) || '').indexOf('budi-') === 0;
    }

    function escapeAttr(str) {
      if (!str) return '';
      return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let activeTab = 'catalog'; // 'catalog' | 'timeline' | 'analytics'

    let state = {
      searchQuery: '',
      platformFilter: 'all',
      langFilter: 'all',
      storyFilter: 'all',
      ratioFilter: 'all',
      sortBy: 'newest',
      viewMode: 'grouped'
    };

    let timelineState = {
      searchQuery: '',
      scopeFilter: 'active30', // 'active30' | 'all' | 'budi'
      statusFilter: 'all',
      langFilter: 'all',
      readinessFilter: 'all',
      viewMode: 'flow', // 'flow' | 'table'
      maxDisplayCount: 120
    };

    // Tab Navigation
    function switchMainTab(tab) {
      activeTab = tab;
      document.getElementById('tabCatalogBtn')?.classList.toggle('active', tab === 'catalog');
      document.getElementById('tabTimelineBtn')?.classList.toggle('active', tab === 'timeline');
      document.getElementById('tabAnalyticsBtn')?.classList.toggle('active', tab === 'analytics');

      document.getElementById('mobNavCatalog')?.classList.toggle('active', tab === 'catalog');
      document.getElementById('mobNavTimeline')?.classList.toggle('active', tab === 'timeline');
      document.getElementById('mobNavAnalytics')?.classList.toggle('active', tab === 'analytics');

      document.getElementById('catalogViewSection').style.display = tab === 'catalog' ? 'block' : 'none';
      document.getElementById('timelineViewSection').style.display = tab === 'timeline' ? 'block' : 'none';
      const analyticsEl = document.getElementById('analyticsViewSection');
      if (analyticsEl) analyticsEl.style.display = tab === 'analytics' ? 'block' : 'none';

      localStorage.setItem('zayn_main_tab', tab);

      if (tab === 'timeline') {
        renderTimeline();
      } else if (tab === 'analytics') {
        renderAnalytics();
      }
    }

    // Switch to catalog and filter by a specific story
    function filterCatalogByStory(slug) {
      switchMainTab('catalog');
      const select = document.getElementById('storySelect');
      if (select) {
        select.value = slug;
        state.storyFilter = slug;
        render();
        select.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Calculate and render all KPIs dynamically
    function renderKPIs() {
      const total = RAW_AUDIT_DATA.length;
      const yt = RAW_AUDIT_DATA.filter(d => d.platform === 'YouTube').length;
      const fb = RAW_AUDIT_DATA.filter(d => d.platform === 'Facebook').length;
      const ig = RAW_AUDIT_DATA.filter(d => d.platform === 'Instagram').length;
      
      const storySlugs = new Set(
        RAW_AUDIT_DATA.filter(d => d.category !== 'Compilation Marathon').map(d => d.storySlug)
      );
      const storiesCount = storySlugs.size;

      const elTotal = document.getElementById('kpiTotal');
      if (elTotal) elTotal.textContent = total;

      const elYt = document.getElementById('kpiYt');
      if (elYt) elYt.textContent = yt;

      const elFb = document.getElementById('kpiFb');
      if (elFb) elFb.textContent = fb;

      const elIg = document.getElementById('kpiIg');
      if (elIg) elIg.textContent = ig;

      const elStories = document.getElementById('kpiStories');
      if (elStories) elStories.textContent = storiesCount;

      const totalViews = RAW_AUDIT_DATA.reduce((sum, d) => sum + (d.views || 0), 0);
      const totalLikes = RAW_AUDIT_DATA.reduce((sum, d) => sum + (d.likes || 0), 0);

      const elViews = document.getElementById('kpiTotalViews');
      if (elViews) elViews.textContent = totalViews.toLocaleString();

      const elLikes = document.getElementById('kpiTotalLikes');
      if (elLikes) elLikes.textContent = totalLikes.toLocaleString();

      const elTotalCount = document.getElementById('totalCount');
      if (elTotalCount) elTotalCount.textContent = total;

      const tabCatCount = document.getElementById('tabCatalogCount');
      if (tabCatCount) tabCatCount.textContent = total;

      const tabAnBadge = document.getElementById('tabAnalyticsBadge');
      if (tabAnBadge) tabAnBadge.textContent = totalViews.toLocaleString() + ' views';

      // Update counts inside platform filter chips
      const chipAll = document.querySelector('[data-filter="platform"][data-value="all"]');
      if (chipAll) chipAll.textContent = 'All (' + total + ')';

      const chipYt = document.querySelector('[data-filter="platform"][data-value="YouTube"]');
      if (chipYt) chipYt.textContent = 'YouTube (' + yt + ')';

      const chipFb = document.querySelector('[data-filter="platform"][data-value="Facebook"]');
      if (chipFb) chipFb.textContent = 'Facebook (' + fb + ')';

      const chipIg = document.querySelector('[data-filter="platform"][data-value="Instagram"]');
      if (chipIg) chipIg.textContent = 'Instagram (' + ig + ')';
    }

    // Populate the story dropdown dynamically from the loaded dataset
    function populateStoryDropdown() {
      const select = document.getElementById('storySelect');
      if (!select) return;
      const currentVal = select.value;

      const storyMap = new Map();
      let hasCompilation = false;

      RAW_AUDIT_DATA.forEach(item => {
        if (item.category === 'Compilation Marathon' || (item.storySlug && item.storySlug.includes('compilation'))) {
          hasCompilation = true;
        } else if (item.storySlug && !storyMap.has(item.storySlug)) {
          storyMap.set(item.storySlug, item.storyTitleId || item.storySlug);
        }
      });

      const sorted = Array.from(storyMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

      let html = '<option value="all">All Stories & Marathons (' + RAW_AUDIT_DATA.length + ')</option>';
      if (hasCompilation) {
        html += '<option value="compilation">🌙 Bedtime Story Marathons (Compilations)</option>';
      }
      for (const [slug, title] of sorted) {
        html += '<option value="' + slug + '">' + title + '</option>';
      }

      select.innerHTML = html;
      if (currentVal && (currentVal === 'all' || currentVal === 'compilation' || storyMap.has(currentVal))) {
        select.value = currentVal;
      }
    }

    // Apply active filters and refresh render
    function applyFilters() {
      render();
    }

    async function fetchJsonSafe(url, timeoutMs) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs || 5000) : null;
      try {
        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    // Monotonic 3-Tier Hydration System: merges live D1 + static snapshot + embedded baseline without ever regressing newer releases
    async function hydrateLiveCatalog(manual = false) {
      const pill = document.getElementById('d1-status-pill');
      const text = document.getElementById('d1StatusText');
      const dot = pill ? pill.querySelector('.status-dot') : null;

      if (dot) dot.classList.add('pulsing');
      if (text) text.textContent = 'Syncing...';

      const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
      const baseOrigin = isHttp ? '' : 'https://storybook-catalog.pages.dev';
      const ts = Date.now();

      const [apiData, staticAuditData, staticCalData, staticStatsData] = await Promise.all([
        fetchJsonSafe(baseOrigin + '/api/catalog?_t=' + ts, 5000),
        fetchJsonSafe((isHttp ? './audit-data.json' : baseOrigin + '/audit-data.json') + '?_t=' + ts, 5000),
        fetchJsonSafe((isHttp ? './calendar-data.json' : baseOrigin + '/calendar-data.json') + '?_t=' + ts, 5000),
        fetchJsonSafe((isHttp ? './stats-data.json' : baseOrigin + '/stats-data.json') + '?_t=' + ts, 5000)
      ]);

      if (staticStatsData && staticStatsData.summary) {
        LIVE_STATS_SUMMARY = {
          recordedAt: staticStatsData.recordedAt || null,
          summary: staticStatsData.summary
        };
      }

      const hasD1 = Boolean(apiData && apiData.success && Array.isArray(apiData.auditRecords) && apiData.auditRecords.length > 0);
      const hasStatic = Boolean(Array.isArray(staticAuditData) && staticAuditData.length > 0);
      const hasStaticCal = Boolean(Array.isArray(staticCalData) && staticCalData.length > 0);

      let nextAuditPool = cloneRecordList(
        RAW_AUDIT_DATA && RAW_AUDIT_DATA.length > 0 ? RAW_AUDIT_DATA : BUILD_AUDIT_SNAPSHOT
      );
      if (hasStatic) {
        nextAuditPool = mergeAuditRecordLists(staticAuditData, nextAuditPool, true);
      }
      if (hasD1) {
        nextAuditPool = mergeAuditRecordLists(apiData.auditRecords, nextAuditPool, true);
      }

      RAW_AUDIT_DATA = nextAuditPool;

      let nextCalendarPool = cloneRecordList(
        RAW_CALENDAR_DATA && RAW_CALENDAR_DATA.length > 0 ? RAW_CALENDAR_DATA : BUILD_CALENDAR_SNAPSHOT
      );
      if (hasStaticCal) {
        nextCalendarPool = mergeCalendarSlotLists(nextCalendarPool, staticCalData.map(normalizeCalendarSlot).filter(Boolean));
      }
      if (hasD1 && Array.isArray(apiData.calendarSlots) && apiData.calendarSlots.length > 0) {
        nextCalendarPool = mergeCalendarSlotLists(nextCalendarPool, apiData.calendarSlots.map(normalizeCalendarSlot).filter(Boolean));
      }

      RAW_CALENDAR_DATA = nextCalendarPool;
      populateStoryDropdown();
      renderKPIs();
      render();
      renderTimeline();
      renderAnalytics();

      if (dot) dot.classList.remove('pulsing');

      if (hasD1) {
        activeCatalogSource = 'live';
        const apiCount = apiData.auditRecords.length;
        const mergedWithSnapshot = nextAuditPool.length > apiCount;
        if (pill) {
          pill.className = 'status-badge status-live';
          pill.title = mergedWithSnapshot
            ? 'Cloudflare D1 (' + apiCount + ') merged monotonically with newer static CI snapshot (Click to refresh)'
            : 'Live from Cloudflare D1 SQLite database (Click to refresh)';
        }
        if (text) {
          text.textContent = (mergedWithSnapshot ? '⚡ D1 + Snapshot (' : '⚡ D1 Live (') + nextAuditPool.length + ')';
        }
        if (manual) showToast('Synchronized ' + nextAuditPool.length + ' records (D1 live' + (mergedWithSnapshot ? ' + snapshot' : '') + ')!');
        return;
      }

      if (hasStatic) {
        if (activeCatalogSource !== 'live') activeCatalogSource = 'snapshot';
        if (pill) {
          pill.className = activeCatalogSource === 'live' ? 'status-badge status-live' : 'status-badge status-snapshot';
          pill.title = activeCatalogSource === 'live'
            ? 'Cached D1 live records merged with audit-data.json (D1 temporarily unreachable)'
            : 'Snapshot from audit-data.json (Click to refresh)';
        }
        if (text) {
          text.textContent = (activeCatalogSource === 'live' ? '⚡ D1 + Snapshot (' : '📁 Snapshot (') + nextAuditPool.length + ')';
        }
        if (manual) showToast('Loaded ' + nextAuditPool.length + ' records from audit-data.json');
        return;
      }

      if (activeCatalogSource === 'live' || activeCatalogSource === 'snapshot') {
        if (pill) {
          pill.className = activeCatalogSource === 'live' ? 'status-badge status-live' : 'status-badge status-snapshot';
          pill.title = 'Preserving hydrated records during temporary network unavailability (Click to retry)';
        }
        if (text) {
          text.textContent = (activeCatalogSource === 'live' ? '⚡ D1 Cached (' : '📁 Snapshot Cached (') + RAW_AUDIT_DATA.length + ')';
        }
        if (manual) showToast('Network offline — kept ' + RAW_AUDIT_DATA.length + ' hydrated records');
        return;
      }

      if (pill) {
        pill.className = 'status-badge status-embedded';
        pill.title = 'Pre-rendered in HTML bundle (Click to refresh)';
      }
      if (text) text.textContent = '📦 Embedded (' + RAW_AUDIT_DATA.length + ')';
      if (manual) showToast('Using embedded dataset (' + RAW_AUDIT_DATA.length + ' records)');
    }

    function syncCatalog(manual) {
      hydrateLiveCatalog(manual);
    }

    // Auto-hydrate on startup
    hydrateLiveCatalog(false);

    // Periodic background auto-sync every 60s
    setInterval(() => {
      hydrateLiveCatalog(false);
    }, 60000);

    // Re-sync immediately when browser tab regains focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        hydrateLiveCatalog(false);
      }
    });

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const target = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', target);
      localStorage.setItem('zayn_theme', target);
    }

    const savedTheme = localStorage.getItem('zayn_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedTab = localStorage.getItem('zayn_main_tab');
    if (savedTab === 'timeline' || savedTab === 'analytics') {
      switchMainTab(savedTab);
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function copyToClipboard(text, label) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied ' + (label || text) + ' to clipboard!');
      }).catch(err => {
        console.error('Copy failed', err);
      });
    }

    function setViewMode(mode) {
      state.viewMode = mode;
      const btnGrouped = document.getElementById('viewGroupedBtn');
      const btnStory = document.getElementById('viewStoryBtn');
      const btnCard = document.getElementById('viewCardBtn');
      const btnTable = document.getElementById('viewTableBtn');
      if (btnGrouped) btnGrouped.classList.toggle('active', mode === 'grouped');
      if (btnStory) btnStory.classList.toggle('active', mode === 'story');
      if (btnCard) btnCard.classList.toggle('active', mode === 'card');
      if (btnTable) btnTable.classList.toggle('active', mode === 'table');
      document.getElementById('cardViewContainer').style.display = (mode === 'grouped' || mode === 'story' || mode === 'card') ? 'grid' : 'none';
      document.getElementById('tableViewContainer').style.display = mode === 'table' ? 'block' : 'none';
      render();
    }

    function handleSortChange() {
      const sel = document.getElementById('catalogSortSelect');
      state.sortBy = sel ? sel.value : 'newest';
      render();
    }

    function setRatioFilter(val, btn) {
      state.ratioFilter = val;
      document.querySelectorAll('[data-filter="ratio"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }

    function setPlatformFilter(val, btn) {
      state.platformFilter = val;
      document.querySelectorAll('[data-filter="platform"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }

    function setLangFilter(val, btn) {
      state.langFilter = val;
      document.querySelectorAll('[data-filter="lang"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    }

    function handleStoryChange() {
      state.storyFilter = document.getElementById('storySelect').value;
      render();
    }

    function handleSearch() {
      state.searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
      render();
    }

    function getFilteredData() {
      const filtered = RAW_AUDIT_DATA.filter(item => {
        if (state.ratioFilter !== 'all' && item.aspectRatio !== state.ratioFilter) {
          return false;
        }
        if (state.platformFilter !== 'all' && item.platform !== state.platformFilter) {
          return false;
        }
        if (state.langFilter !== 'all' && item.language !== state.langFilter) {
          return false;
        }
        if (state.storyFilter !== 'all') {
          if (state.storyFilter === 'compilation') {
            if (item.category !== 'Compilation Marathon') return false;
          } else if (item.storySlug !== state.storyFilter) {
            return false;
          }
        }
        if (state.searchQuery) {
          const q = state.searchQuery;
          const searchStr = [
            item.id,
            item.storyTitleId,
            item.storyTitleEn,
            item.videoTitle,
            item.videoId,
            item.platform,
            item.format,
            item.author,
            item.illustrator
          ].join(' ').toLowerCase();

          if (!searchStr.includes(q)) return false;
        }

        return true;
      });

      if (state.sortBy === 'views') {
        return filtered.slice().sort((a, b) => (b.views || 0) - (a.views || 0));
      }
      if (state.sortBy === 'likes') {
        return filtered.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
      }
      if (state.sortBy === 'title') {
        return filtered.slice().sort((a, b) => (a.storyTitleId || '').localeCompare(b.storyTitleId || ''));
      }
      if (state.sortBy === 'newest') {
        return filtered.slice().sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
      }
      return filtered;
    }

    function formatDate(isoStr) {
      if (!isoStr || isoStr === 'N/A' || isoStr === 'undefined') return 'Scheduled';
      try {
        const normalized = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(isoStr).trim())
          ? String(isoStr).trim() + 'T00:00:00+07:00'
          : isoStr;
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Jakarta',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      } catch (e) {
        return isoStr;
      }
    }

    function getGroupedData(items) {
      const groups = new Map();
      const platOrder = { 'YouTube': 1, 'Facebook': 2, 'Instagram': 3, 'Threads': 4, 'Telegram': 5 };

      for (const item of items) {
        const key = item.storySlug + '__' + (item.aspectRatio === '9:16' ? '9:16' : '16:9');
        if (!groups.has(key)) {
          groups.set(key, {
            key: key,
            storySlug: item.storySlug,
            storyTitleId: item.storyTitleId,
            storyTitleEn: item.storyTitleEn,
            author: item.author,
            illustrator: item.illustrator,
            aspectRatio: item.aspectRatio === '9:16' ? '9:16' : '16:9',
            formatLabel: item.aspectRatio === '9:16' ? '📱 Vertical (9:16)' : '📺 Landscape (16:9)',
            thumbnailUrl: item.thumbnailUrl,
            languages: new Set(),
            publications: [],
            latestPublishedAt: item.publishedAt,
            primaryVideoId: item.id,
            totalViews: 0,
            totalLikes: 0
          });
        }
        const g = groups.get(key);
        g.languages.add(item.language.toUpperCase());
        g.totalViews = (g.totalViews || 0) + (item.views || 0);
        g.totalLikes = (g.totalLikes || 0) + (item.likes || 0);
        if (item.publishedAt && item.publishedAt > g.latestPublishedAt) {
          g.latestPublishedAt = item.publishedAt;
        }
        // Strict aspect-ratio thumbnail assignment: prioritize YouTube thumbnail
        if (item.platform === 'YouTube' && item.thumbnailUrl && !item.thumbnailUrl.includes('branding')) {
          g.thumbnailUrl = item.thumbnailUrl;
          g.primaryVideoId = item.id;
        }
        g.publications.push(item);
      }

      const result = Array.from(groups.values());
      result.forEach(g => {
        g.publications.sort((a, b) => {
          const pA = platOrder[a.platform] || 99;
          const pB = platOrder[b.platform] || 99;
          if (pA !== pB) return pA - pB;
          return a.language.localeCompare(b.language);
        });
      });

      return result;
    }

    function getPlatformIconSvg(platform) {
      if (platform === 'YouTube') {
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="#ff0000" style="vertical-align: middle;"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
      }
      if (platform === 'Facebook') {
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="#1877f2" style="vertical-align: middle;"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
      }
      if (platform === 'Instagram') {
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="#e4405f" style="vertical-align: middle;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>';
      }
      if (platform === 'Telegram') {
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="#229ed9" style="vertical-align: middle;"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.196 1.006.128.832.941z"/></svg>';
      }
      if (platform === 'Threads') {
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" style="vertical-align: middle;"><path d="M12.186 24h-.007C5.463 24 0 18.537 0 11.814 0 5.091 5.463 0 12.186 0c6.702 0 12.158 5.437 12.186 12.138v.076c0 3.323-1.196 6.33-3.367 8.468-2.095 2.062-4.912 3.208-7.933 3.228h-.699zm0-21.84c-5.426 0-9.84 4.414-9.84 9.84 0 5.427 4.414 9.84 9.84 9.84h.565c2.464-.016 4.757-.95 6.455-2.628 1.76-1.733 2.73-4.17 2.73-6.862 0-5.426-4.414-9.84-9.84-9.84z"/></svg>';
      }
      return '<span style="font-size: 0.95rem;">🌐</span>';
    }

    function renderGroupedCard(group) {
      const isVertical = group.aspectRatio === '9:16';
      const badgeClass = isVertical ? 'badge-vertical' : 'badge-landscape';
      const defaultThumb = isVertical ? 'branding/cover-instagram-1080x1080.png' : 'branding/cover-facebook-1640x924.png';
      const thumbSrc = group.thumbnailUrl || defaultThumb;
      const langBadges = Array.from(group.languages).map(l => '<span class="lang-badge">' + (l === 'ID' ? 'ID' : 'EN') + '</span>').join(' ');

      const pubRowsHtml = group.publications.map(pub => {
        const iconSvg = getPlatformIconSvg(pub.platform);
        const langBadge = pub.language.toUpperCase() === 'ID' ? 'ID' : 'EN';
        const ratioBadge = pub.aspectRatio === '9:16' ? 'P' : 'L';
        const ratioClass = pub.aspectRatio === '9:16' ? 'p-tag' : 'l-tag';
        const metricPill = pub.views ? \`<span class="hub-metric-pill" title="\${pub.views.toLocaleString()} views · \${pub.likes || 0} likes">👀 \${pub.views >= 1000 ? (pub.views/1000).toFixed(1) + 'K' : pub.views}</span>\` : '';

        return \`
          <div class="platform-hub-row">
            <div class="platform-hub-left">
              <span class="hub-platform-icon" title="\${pub.platform}">\${iconSvg}</span>
              <span class="hub-lang-tag">\${langBadge}</span>
              <span class="hub-ratio-tag \${ratioClass}" title="\${pub.aspectRatio === '9:16' ? 'Portrait (9:16)' : 'Landscape (16:9)'}">\${ratioBadge}</span>
              <span class="hub-id-text" title="\${pub.videoTitle}">\${pub.videoId}</span>
              \${metricPill}
            </div>
            <div class="platform-hub-actions">
              <button class="hub-btn-play" onclick="openPreviewModal('\${pub.id}')" title="Play Preview">
                ▶
              </button>
              <a href="\${pub.videoUrl}" target="_blank" rel="noopener noreferrer" class="hub-btn-link" title="Open on \${pub.platform}">
                ↗
              </a>
            </div>
          </div>
        \`;
      }).join('');

      return \`
        <div class="video-card grouped-card">
          <div class="card-thumb-wrapper \${isVertical ? 'ratio-vertical' : ''}">
            <img src="\${thumbSrc}" alt="\${group.storyTitleId}" class="card-thumb-img" loading="lazy" onerror="if(this.src.indexOf('branding')===-1){this.src='\${defaultThumb}'}">
            <div class="thumb-overlay-badge">
              <span class="format-badge \${badgeClass}" title="\${isVertical ? 'Portrait (9:16)' : 'Landscape (16:9)'}" style="font-weight: 800; padding: 0.12rem 0.45rem;">\${isVertical ? 'P' : 'L'}</span>
              \${langBadges}
            </div>
            <span class="thumb-count-badge">\${group.publications.length} Releases\${group.totalViews > 0 ? \` · 👀 \${group.totalViews.toLocaleString()}\` : ''}</span>
          </div>

          <div class="card-content">
            <div class="card-story-title" title="\${group.storyTitleId}">\${group.storyTitleId}</div>
            \${group.storyTitleEn && group.storyTitleEn !== group.storyTitleId ? \`<div class="card-subtitle-en">\${group.storyTitleEn}</div>\` : ''}

            <!-- Multiplatform Hub Breakdown -->
            <div class="platform-hub-list">
              \${pubRowsHtml}
            </div>

            <div class="card-meta-list">
              <div class="card-meta-row">
                <span>Credits:</span>
                <span>\${group.author} · \${group.illustrator}</span>
              </div>
              \${group.totalViews > 0 ? \`
              <div class="card-meta-row">
                <span>Audience Reach:</span>
                <span style="color: #38bdf8; font-weight: 700;">👀 \${group.totalViews.toLocaleString()} views · ❤️ \${group.totalLikes.toLocaleString()} likes</span>
              </div>
              \` : ''}
              <div class="card-meta-row">
                <span>Updated:</span>
                <span>\${formatDate(group.latestPublishedAt)} · <strong style="color: var(--success-green); font-size: 0.7rem;">CC BY 4.0</strong></span>
              </div>
            </div>

            <div class="card-actions">
              <button class="btn-card" onclick="openPreviewModal('\${group.primaryVideoId}')" title="Play Preview">
                ▶
              </button>
              <button class="btn-card primary" onclick="filterCatalogByStory('\${group.storySlug}')" title="Filter Story Releases">
                🔍 Filter (\${group.publications.length})
              </button>
            </div>
          </div>
        </div>
      \`;
    }

    function renderCard(item) {
      const isYt = item.platform === 'YouTube';
      const isFb = item.platform === 'Facebook';
      const isIg = item.platform === 'Instagram';

      const platClass = isYt ? 'yt' : isFb ? 'fb' : 'ig';
      const platIcon = isYt ? '📺' : isFb ? '📘' : '📸';
      const isVertical = item.aspectRatio === '9:16';

      const thumbSrc = item.thumbnailUrl || (isVertical ? 'branding/cover-instagram-1080x1080.png' : 'branding/cover-facebook-1640x924.png');

      return \`
        <div class="video-card">
          <div class="card-thumb-wrapper \${isVertical ? 'ratio-vertical' : ''}">
            <img src="\${thumbSrc}" alt="\${item.videoTitle}" class="card-thumb-img" loading="lazy" onerror="if(this.src.indexOf('branding')===-1){this.src='branding/cover-facebook-1640x924.png'}">
            <div class="thumb-overlay-badge">
              <span class="platform-badge \${platClass}" title="\${item.platform}">\${platIcon}</span>
              <span class="lang-badge">\${item.language.toUpperCase()}</span>
              <span class="format-badge \${isVertical ? 'badge-vertical' : 'badge-landscape'}" style="font-weight: 800;">\${isVertical ? 'P' : 'L'}</span>
            </div>
            \${item.duration ? \`<span class="thumb-duration-badge">\${item.duration.split(' ')[0]}</span>\` : ''}
          </div>

          <div class="card-content">
            <div class="card-story-title" title="\${item.storyTitleId}">\${item.storyTitleId}</div>
            <h3 class="card-video-title" title="\${item.videoTitle}">\${item.videoTitle}</h3>

            <div class="card-meta-list">
              <div class="card-meta-row">
                <span>Audit / Video:</span>
                <span style="display: inline-flex; gap: 0.25rem;">
                  <span class="meta-id-tag" onclick="copyToClipboard('\${item.id}', 'Audit ID')">\${item.id}</span>
                  <span class="meta-id-tag" onclick="copyToClipboard('\${item.videoId}', 'Video ID')">\${item.videoId}</span>
                </span>
              </div>
              <div class="card-meta-row">
                <span>Published:</span>
                <span>\${formatDate(item.publishedAt)} · <strong style="color: var(--success-green); font-size: 0.7rem;">CC BY 4.0</strong></span>
              </div>
            </div>

            <div class="card-actions">
              <button class="btn-card" onclick="openPreviewModal('\${item.id}')" title="Play Preview">
                ▶
              </button>
              <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-card primary" title="Open on \${item.platform}">
                ↗
              </a>
            </div>
          </div>
        </div>
      \`;
    }

    function renderTableRow(item) {
      const platClass = item.platform === 'YouTube' ? 'yt' : item.platform === 'Facebook' ? 'fb' : 'ig';
      const isVertical = item.aspectRatio === '9:16';
      return \`
        <tr>
          <td><span class="meta-id-tag" onclick="copyToClipboard('\${item.id}', 'Audit ID')">\${item.id}</span></td>
          <td><span class="platform-badge \${platClass}">\${item.platform}</span></td>
          <td><span class="lang-badge">\${item.language.toUpperCase()}</span></td>
          <td><span class="format-badge \${isVertical ? 'badge-vertical' : 'badge-landscape'}" style="font-weight: 800;">\${isVertical ? 'P' : 'L'}</span></td>
          <td><strong>\${item.storyTitleId}</strong></td>
          <td class="table-cell-title">
            \${item.videoTitle}
            <small>By \${item.author}</small>
          </td>
          <td><span class="meta-id-tag" onclick="copyToClipboard('\${item.videoId}', 'Video ID')">\${item.videoId}</span></td>
          <td style="white-space: nowrap; font-size: 0.74rem;">\${formatDate(item.publishedAt)}</td>
          <td><span style="color: var(--success-green); font-weight: 600; font-size: 0.72rem;">\${item.status.toUpperCase()}</span></td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn-card" style="padding: 0.2rem 0.45rem; font-size: 0.7rem; height: 24px;" onclick="openPreviewModal('\${item.id}')" title="Play Preview">
                ▶
              </button>
              <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="table-link" title="Open on \${item.platform}">
                ↗
              </a>
            </div>
          </td>
        </tr>
      \`;
    }

    function getStoryHubGroups(items) {
      const stories = new Map();
      for (const item of items) {
        const slug = item.storySlug || 'unknown';
        if (!stories.has(slug)) {
          stories.set(slug, {
            storySlug: slug,
            storyTitleId: item.storyTitleId || slug,
            storyTitleEn: item.storyTitleEn || item.storyTitleId || slug,
            author: item.author || 'Unknown',
            illustrator: item.illustrator || 'Unknown',
            thumbnailUrl: item.thumbnailUrl || '',
            latestPublishedAt: item.publishedAt || '',
            primaryVideoId: item.id,
            totalViews: 0,
            totalLikes: 0,
            publications: [],
            slots: {}
          });
        }
        const g = stories.get(slug);
        g.totalViews += (item.views || 0);
        g.totalLikes += (item.likes || 0);
        g.publications.push(item);
        if (item.publishedAt && item.publishedAt > g.latestPublishedAt) {
          g.latestPublishedAt = item.publishedAt;
        }
        if (item.platform === 'YouTube' && item.aspectRatio === '16:9' && item.thumbnailUrl && !item.thumbnailUrl.includes('branding')) {
          g.thumbnailUrl = item.thumbnailUrl;
          g.primaryVideoId = item.id;
        } else if (!g.thumbnailUrl && item.thumbnailUrl) {
          g.thumbnailUrl = item.thumbnailUrl;
        }
        const langKey = (item.language || 'id').toLowerCase();
        const platCode = item.platform === 'YouTube' ? 'YT' : item.platform === 'Facebook' ? 'FB' : 'IG';
        const cellKey = langKey + '_' + platCode + '_' + (item.aspectRatio === '9:16' ? '9:16' : '16:9');
        g.slots[cellKey] = item;
      }
      const list = Array.from(stories.values());
      if (state.sortBy === 'views') list.sort((a, b) => b.totalViews - a.totalViews);
      else if (state.sortBy === 'likes') list.sort((a, b) => b.totalLikes - a.totalLikes);
      else if (state.sortBy === 'title') list.sort((a, b) => a.storyTitleId.localeCompare(b.storyTitleId));
      else list.sort((a, b) => String(b.latestPublishedAt || '').localeCompare(String(a.latestPublishedAt || '')));
      return list;
    }

    function renderStoryBookCard(story) {
      const thumbSrc = story.thumbnailUrl || 'branding/cover-facebook-1640x924.png';
      const matrixCols = [
        { k: 'YT_16:9', label: 'YT 16:9' },
        { k: 'YT_9:16', label: 'YT 9:16' },
        { k: 'FB_16:9', label: 'FB 16:9' },
        { k: 'FB_9:16', label: 'FB 9:16' },
        { k: 'IG_9:16', label: 'IG 9:16' }
      ];
      const matrixHtml = ['id', 'en'].map(lang => {
        const pills = matrixCols.map(c => {
          const hit = story.slots[lang + '_' + c.k];
          return hit
            ? \`<button type="button" class="coverage-pill done" onclick="openPreviewModal('\${hit.id}')" title="\${hit.platform} \${hit.aspectRatio} (\${(hit.views || 0).toLocaleString()} views)">✓ \${c.label}</button>\`
            : \`<span class="coverage-pill missing" title="Not yet published">\${c.label}</span>\`;
        }).join('');
        return \`<div class="coverage-lang-row"><span class="coverage-lang-label">\${lang === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}</span>\${pills}</div>\`;
      }).join('');

      return \`
        <div class="video-card grouped-card">
          <div class="card-thumb-wrapper">
            <img src="\${thumbSrc}" alt="\${escapeAttr(story.storyTitleId)}" class="card-thumb-img" loading="lazy" onerror="if(this.src.indexOf('branding')===-1){this.src='branding/cover-facebook-1640x924.png'}">
            <div class="thumb-overlay-badge">
              <span class="lang-badge">ID+EN</span>
            </div>
            <span class="thumb-count-badge">\${story.publications.length}/10 Releases\${story.totalViews > 0 ? \` · 👀 \${story.totalViews.toLocaleString()}\` : ''}</span>
          </div>
          <div class="card-content">
            <div class="card-story-title" title="\${escapeAttr(story.storyTitleId)}">\${story.storyTitleId}</div>
            \${story.storyTitleEn && story.storyTitleEn !== story.storyTitleId ? \`<div class="card-subtitle-en">\${story.storyTitleEn}</div>\` : ''}
            <div class="story-coverage-matrix">\${matrixHtml}</div>
            <div class="card-meta-list">
              <div class="card-meta-row">
                <span>Credits:</span>
                <span>\${story.author} · \${story.illustrator}</span>
              </div>
              <div class="card-meta-row">
                <span>Reach:</span>
                <span style="color: #38bdf8; font-weight: 700;">👀 \${story.totalViews.toLocaleString()} · ❤️ \${story.totalLikes.toLocaleString()}</span>
              </div>
              <div class="card-meta-row">
                <span>Updated:</span>
                <span>\${formatDate(story.latestPublishedAt)}</span>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-card" onclick="openPreviewModal('\${story.primaryVideoId}')" title="Play Preview">▶ Preview</button>
              <button class="btn-card primary" onclick="filterCatalogByStory('\${story.storySlug}')">🔍 All (\${story.publications.length})</button>
            </div>
          </div>
        </div>
      \`;
    }

    function renderAnalytics() {
      const summary = (LIVE_STATS_SUMMARY && LIVE_STATS_SUMMARY.summary) || {};
      const auditViews = RAW_AUDIT_DATA.reduce((s, d) => s + (d.views || 0), 0);
      const auditLikes = RAW_AUDIT_DATA.reduce((s, d) => s + (d.likes || 0), 0);
      const totalViews = Math.max(auditViews, summary.totalViews || 0);
      const totalLikes = Math.max(auditLikes, summary.totalLikes || 0);
      const totalComments = summary.totalComments || 0;
      const engRate = totalViews > 0 ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(2) : '0.00';

      const publishedStories = new Set(RAW_AUDIT_DATA.filter(d => d.category !== 'Compilation Marathon').map(d => d.storySlug));
      const futureSlots = RAW_CALENDAR_DATA.filter(s => !s.isCompleted);
      const bufferedCount = futureSlots.filter(s => s.isBuffered).length;
      const bufferPct = futureSlots.length > 0 ? Math.round((bufferedCount / futureSlots.length) * 100) : 100;

      const elViews = document.getElementById('anTotalViews');
      if (elViews) elViews.textContent = totalViews.toLocaleString();
      const elLikes = document.getElementById('anTotalLikes');
      if (elLikes) elLikes.textContent = totalLikes.toLocaleString();
      const elEng = document.getElementById('anEngagementRate');
      if (elEng) elEng.textContent = engRate + '% engagement (' + totalComments + ' comments)';
      const ytSummary = summary.youtube || {};
      const elYtChan = document.getElementById('anYtChannelViews');
      if (elYtChan) elYtChan.textContent = (ytSummary.totalChannelViews || ytSummary.views || 0).toLocaleString();
      const elYtSubs = document.getElementById('anYtSubs');
      if (elYtSubs) elYtSubs.textContent = (ytSummary.subscribers || 0) + ' subscribers · ' + (ytSummary.videoCount || RAW_AUDIT_DATA.filter(d => d.platform === 'YouTube').length) + ' videos';
      const elStories = document.getElementById('anUniqueStories');
      if (elStories) elStories.textContent = publishedStories.size + ' / ' + Math.max(publishedStories.size, (KNOWN_STORY_ASSETS || []).length);
      const elBuf = document.getElementById('anBufferHealth');
      if (elBuf) elBuf.textContent = bufferedCount + ' slots';
      const elBufSub = document.getElementById('anBufferHealthSub');
      if (elBufSub) elBufSub.textContent = bufferPct + '% of ' + futureSlots.length + ' upcoming slots buffered in R2';

      const recAtEl = document.getElementById('anStatsRecordedAt');
      if (recAtEl && LIVE_STATS_SUMMARY && LIVE_STATS_SUMMARY.recordedAt) {
        recAtEl.textContent = 'Last stats harvest: ' + formatDate(LIVE_STATS_SUMMARY.recordedAt);
      }

      // Platform Share Bars
      const plats = [
        { name: 'YouTube', color: 'var(--yt-color)', icon: '📺', summaryKey: 'youtube' },
        { name: 'Facebook', color: 'var(--fb-color)', icon: '📘', summaryKey: 'facebook' },
        { name: 'Instagram', color: 'var(--ig-color)', icon: '📸', summaryKey: 'instagram' },
        { name: 'Threads', color: '#a855f7', icon: '🧵', summaryKey: 'threads' }
      ].map(p => {
        const items = RAW_AUDIT_DATA.filter(d => d.platform === p.name);
        const sumObj = summary[p.summaryKey] || {};
        const views = Math.max(items.reduce((s, d) => s + (d.views || 0), 0), sumObj.views || 0);
        const likes = Math.max(items.reduce((s, d) => s + (d.likes || 0), 0), sumObj.likes || 0);
        const count = Math.max(items.length, sumObj.videoCount || 0);
        return { ...p, views, likes, count };
      });
      const platTotalViews = Math.max(1, plats.reduce((s, p) => s + p.views, 0));
      const platHtml = plats.map(p => {
        const pct = Math.round((p.views / platTotalViews) * 100);
        const avg = p.count > 0 ? Math.round(p.views / p.count) : 0;
        return \`
          <div class="analytics-bar-row">
            <div class="analytics-bar-meta">
              <span><strong>\${p.icon} \${p.name}</strong> <span style="color: var(--text-dim);">(\${p.count} assets · avg \${avg} views)</span></span>
              <span><strong>\${p.views.toLocaleString()}</strong> views (\${pct}%) · ❤️ \${p.likes}</span>
            </div>
            <div class="analytics-bar-track">
              <div class="analytics-bar-fill" style="width: \${pct}%; background: \${p.color};"></div>
            </div>
          </div>
        \`;
      }).join('');
      const platEl = document.getElementById('anPlatformBreakdown');
      if (platEl) platEl.innerHTML = platHtml;

      // Language & Aspect Ratio Split
      const splitRows = [
        { label: '🇮🇩 Indonesian Stories (ID)', filter: d => d.language === 'id', color: '#ef4444' },
        { label: '🇬🇧 English Stories (EN)', filter: d => d.language === 'en', color: '#38bdf8' },
        { label: '📱 Vertical Shorts / Reels (9:16)', filter: d => d.aspectRatio === '9:16', color: '#ec4899' },
        { label: '📺 Landscape Widescreen (16:9)', filter: d => d.aspectRatio === '16:9', color: '#10b981' }
      ].map(r => {
        const items = RAW_AUDIT_DATA.filter(r.filter);
        const views = items.reduce((s, d) => s + (d.views || 0), 0);
        return { ...r, count: items.length, views };
      });
      const maxSplitViews = Math.max(1, ...splitRows.map(r => r.views));
      const splitHtml = splitRows.map(r => {
        const pct = Math.round((r.views / maxSplitViews) * 100);
        return \`
          <div class="analytics-bar-row">
            <div class="analytics-bar-meta">
              <span><strong>\${r.label}</strong> <span style="color: var(--text-dim);">(\${r.count} releases)</span></span>
              <span><strong>\${r.views.toLocaleString()}</strong> views</span>
            </div>
            <div class="analytics-bar-track">
              <div class="analytics-bar-fill" style="width: \${pct}%; background: \${r.color};"></div>
            </div>
          </div>
        \`;
      }).join('');
      const splitEl = document.getElementById('anFormatLangBreakdown');
      if (splitEl) splitEl.innerHTML = splitHtml;

      // Top 10 Performing Videos
      const topVideos = RAW_AUDIT_DATA
        .slice()
        .sort((a, b) => ((b.views || 0) - (a.views || 0)) || ((b.likes || 0) - (a.likes || 0)))
        .slice(0, 8);
      const topVidEl = document.getElementById('anTopVideosList');
      if (topVidEl) {
        topVidEl.innerHTML = topVideos.map((v, idx) => \`
          <div class="leaderboard-item">
            <span class="leaderboard-rank">\${idx + 1}</span>
            <div class="leaderboard-info">
              <div class="leaderboard-title" title="\${escapeAttr(v.videoTitle)}">\${v.videoTitle}</div>
              <div class="leaderboard-meta">
                <span>\${v.platform}</span>·<span>\${v.language.toUpperCase()}</span>·<span>\${v.aspectRatio}</span>·<span>👀 \${(v.views || 0).toLocaleString()}</span>·<span>❤️ \${v.likes || 0}</span>
              </div>
            </div>
            <button class="hub-btn-play" onclick="openPreviewModal('\${v.id}')" title="Play Preview">▶</button>
          </div>
        \`).join('') || '<div style="color: var(--text-dim); font-size: 0.8rem;">No video telemetry yet.</div>';
      }

      // Top Stories by Combined Reach
      const storyMap = new Map();
      RAW_AUDIT_DATA.forEach(v => {
        const slug = v.storySlug || 'unknown';
        if (!storyMap.has(slug)) {
          storyMap.set(slug, { slug, title: v.storyTitleId || slug, views: 0, likes: 0, count: 0 });
        }
        const s = storyMap.get(slug);
        s.views += (v.views || 0);
        s.likes += (v.likes || 0);
        s.count += 1;
      });
      const topStories = Array.from(storyMap.values()).sort((a, b) => b.views - a.views).slice(0, 8);
      const topStoryEl = document.getElementById('anTopStoriesList');
      if (topStoryEl) {
        topStoryEl.innerHTML = topStories.map((st, idx) => \`
          <div class="leaderboard-item" style="cursor: pointer;" onclick="filterCatalogByStory('\${st.slug}')">
            <span class="leaderboard-rank">\${idx + 1}</span>
            <div class="leaderboard-info">
              <div class="leaderboard-title" title="\${escapeAttr(st.title)}">\${st.title}</div>
              <div class="leaderboard-meta">
                <span>\${st.count} releases</span>·<span>👀 \${st.views.toLocaleString()} views</span>·<span>❤️ \${st.likes} likes</span>
              </div>
            </div>
            <span style="font-size: 0.72rem; color: var(--accent-primary); font-weight: 700;">View ↗</span>
          </div>
        \`).join('');
      }
    }

    function render() {
      const data = getFilteredData();
      const visibleEl = document.getElementById('visibleCount');
      const totalEl = document.getElementById('totalCount');

      const noticeEl = document.getElementById('filterNotice');
      if (noticeEl) {
        const isFiltered = state.ratioFilter !== 'all' || state.platformFilter !== 'all' || state.langFilter !== 'all' || state.storyFilter !== 'all' || state.searchQuery;
        noticeEl.textContent = isFiltered ? '(Filters Active)' : '';
      }

      const grouped = getGroupedData(data);
      if (state.sortBy === 'views') {
        grouped.sort((a, b) => (b.totalViews || 0) - (a.totalViews || 0));
      } else if (state.sortBy === 'likes') {
        grouped.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0));
      } else if (state.sortBy === 'title') {
        grouped.sort((a, b) => (a.storyTitleId || '').localeCompare(b.storyTitleId || ''));
      } else {
        grouped.sort((a, b) => String(b.latestPublishedAt || '').localeCompare(String(a.latestPublishedAt || '')));
      }

      if (state.viewMode === 'story') {
        const storyHubs = getStoryHubGroups(data);
        if (visibleEl) visibleEl.textContent = storyHubs.length + ' stories (' + data.length + ' releases)';
        if (totalEl) totalEl.textContent = RAW_AUDIT_DATA.length + ' releases';

        const storyHtml = storyHubs.map(renderStoryBookCard).join('');
        document.getElementById('cardViewContainer').innerHTML = storyHtml || '<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No stories match your filter.</div>';
      } else if (state.viewMode === 'grouped') {
        if (visibleEl) visibleEl.textContent = grouped.length + ' format editions (' + data.length + ' releases)';
        if (totalEl) totalEl.textContent = (RAW_AUDIT_DATA.length) + ' releases';

        const groupedHtml = grouped.map(renderGroupedCard).join('');
        document.getElementById('cardViewContainer').innerHTML = groupedHtml || '<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No format editions match your filter.</div>';
      } else if (state.viewMode === 'card') {
        if (visibleEl) visibleEl.textContent = data.length;
        if (totalEl) totalEl.textContent = RAW_AUDIT_DATA.length;

        const cardsHtml = data.map(renderCard).join('');
        document.getElementById('cardViewContainer').innerHTML = cardsHtml || '<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No published videos match your filter.</div>';
      } else {
        if (visibleEl) visibleEl.textContent = data.length;
        if (totalEl) totalEl.textContent = RAW_AUDIT_DATA.length;

        const rowsHtml = data.map(renderTableRow).join('');
        document.getElementById('tableBody').innerHTML = rowsHtml || '<tr><td colspan="10" style="text-align: center; padding: 1.5rem; color: var(--text-dim); font-size: 0.85rem;">No published videos match your filter.</td></tr>';
      }
    }

    // =========================================================================
    // TIMELINE RENDERING & INTERACTIONS
    // =========================================================================
    function setTimelineScopeFilter(val, btn) {
      timelineState.scopeFilter = val;
      timelineState.maxDisplayCount = val === 'active30' ? 120 : 120;
      document.querySelectorAll('[data-cal-filter="scope"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTimeline();
    }

    function loadMoreTimelineSlots() {
      timelineState.maxDisplayCount += 60;
      renderTimeline();
    }

    function setTimelineViewMode(mode) {
      timelineState.viewMode = mode;
      document.getElementById('viewCalFlowBtn').classList.toggle('active', mode === 'flow');
      document.getElementById('viewCalTableBtn').classList.toggle('active', mode === 'table');
      document.getElementById('timelineFlowContainer').style.display = mode === 'flow' ? 'block' : 'none';
      document.getElementById('timelineTableContainer').style.display = mode === 'table' ? 'block' : 'none';
    }

    function setTimelineStatusFilter(val, btn) {
      timelineState.statusFilter = val;
      document.querySelectorAll('[data-cal-filter="status"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTimeline();
    }

    function setTimelineLangFilter(val, btn) {
      timelineState.langFilter = val;
      document.querySelectorAll('[data-cal-filter="lang"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTimeline();
    }

    function setTimelineReadinessFilter(val, btn) {
      timelineState.readinessFilter = val;
      document.querySelectorAll('[data-cal-filter="readiness"]').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderTimeline();
    }

    function jumpToTodaySchedule() {
      switchMainTab('timeline');
      timelineState.statusFilter = 'all';
      timelineState.readinessFilter = 'all';
      document.querySelectorAll('[data-cal-filter="status"]').forEach(b => b.classList.toggle('active', b.getAttribute('data-value') === 'all'));
      document.querySelectorAll('[data-cal-filter="readiness"]').forEach(b => b.classList.toggle('active', b.getAttribute('data-value') === 'all'));
      renderTimeline();
      setTimeout(function() {
        const todayHeader = document.querySelector('.timeline-day-header.today') || document.getElementById('timelineFlowContainer');
        if (todayHeader) {
          todayHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    }

    function handleTimelineSearch() {
      timelineState.searchQuery = document.getElementById('timelineSearchInput').value.trim().toLowerCase();
      renderTimeline();
    }

    function getFilteredTimelineData() {
      const clientTodayIso = getWibDateIso();
      return RAW_CALENDAR_DATA.filter(item => {
        // 1. Scope filter
        if (timelineState.scopeFilter === 'active30') {
          if (isBudiSlot(item) || item.date > '2026-12-31') return false;
        } else if (timelineState.scopeFilter === 'budi') {
          if (!isBudiSlot(item)) return false;
        }

        if (timelineState.statusFilter !== 'all') {
          if (timelineState.statusFilter === 'completed' && !item.isCompleted && item.status !== 'completed') return false;
          if (timelineState.statusFilter === 'today' && item.date !== clientTodayIso && item.status !== 'today') return false;
          if (timelineState.statusFilter === 'upcoming' && item.status !== 'upcoming') return false;
        }

        if (timelineState.langFilter !== 'all' && item.lang !== timelineState.langFilter) {
          return false;
        }

        if (timelineState.readinessFilter !== 'all') {
          if (timelineState.readinessFilter === 'buffered' && !item.isBuffered) return false;
          if (timelineState.readinessFilter === 'assets' && (!item.hasAssets || item.isBuffered)) return false;
          if (timelineState.readinessFilter === 'queued' && (item.isCompleted || item.isBuffered || item.hasAssets)) return false;
        }

        if (timelineState.searchQuery) {
          const q = timelineState.searchQuery;
          const searchStr = [
            item.id,
            item.date,
            item.dayName,
            item.timeSlot,
            item.slotType,
            item.bookSlug,
            item.storyTitleId,
            item.storyTitleEn,
            item.theme
          ].join(' ').toLowerCase();

          if (!searchStr.includes(q)) return false;
        }

        return true;
      });
    }

    /**
     * Dynamically synchronizes slot status with current client date/hour in Western Indonesia Time (WIB).
     * Prevents static build-time staleness when page is opened on subsequent days.
     */
    function updateLiveTodayStatus() {
      try {
        const clientTodayIso = getWibDateIso();
        lastRenderedWibDate = clientTodayIso;
        RAW_CALENDAR_DATA = applyTodayStatusToSlots(RAW_CALENDAR_DATA, RAW_AUDIT_DATA, clientTodayIso);
      } catch (e) {
        // Fallback silently if Intl fails
      }
    }

    /**
     * Live Pipeline Monitor & Real-Time Countdown.
     * Ticks every second, synchronizes with Western Indonesia Time (WIB),
     * audits Cloudflare R2 cache buffer, and spotlights the immediate next automated event.
     */
    function updatePipelineMonitor() {
      try {
        const now = new Date();

        // 1. Current Time in Western Indonesia Time (WIB, Asia/Jakarta)
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          weekday: 'short',
          hourCycle: 'h23'
        }).formatToParts(now);

        const getVal = (type) => parts.find(p => p.type === type)?.value;
        const wibYear = parseInt(getVal('year'), 10);
        const wibMonth = parseInt(getVal('month'), 10);
        const wibDay = parseInt(getVal('day'), 10);
        const wibHour = parseInt(getVal('hour'), 10) % 24;
        const wibMin = parseInt(getVal('minute'), 10);
        const wibSec = parseInt(getVal('second'), 10);
        const wibDayOfWeek = getVal('weekday');

        const clientTodayIso = \`\${wibYear}-\${String(wibMonth).padStart(2, '0')}-\${String(wibDay).padStart(2, '0')}\`;
        if (lastRenderedWibDate && clientTodayIso !== lastRenderedWibDate) {
          lastRenderedWibDate = clientTodayIso;
          renderTimeline();
        }
        const wibClockStr = \`\${String(wibHour).padStart(2, '0')}:\${String(wibMin).padStart(2, '0')}:\${String(wibSec).padStart(2, '0')} WIB\`;

        const clockEl = document.getElementById('pipelineClockWib');
        if (clockEl) clockEl.textContent = \`⏰ \${wibClockStr}\`;

        const totalSecNow = wibHour * 3600 + wibMin * 60 + wibSec;

        // Schedule milestones in seconds:
        const SEC_BUFFER = 7 * 3600;
        const SEC_ANNOUNCE = 7 * 3600 + 15 * 60;
        const SEC_MORNING = 8 * 3600 + 30 * 60;
        const SEC_BEDTIME = 19 * 3600;

        // Today's and upcoming slots
        const todaySlots = (RAW_CALENDAR_DATA || []).filter(s => s.date === clientTodayIso);
        const tomorrowSlots = (RAW_CALENDAR_DATA || []).filter(s => s.date > clientTodayIso).slice(0, 2);

        const todayMorning = todaySlots.find(s => s.timeSlot.includes('08:') || (s.slotType && s.slotType.toLowerCase().includes('morning'))) || todaySlots[0];
        const todayBedtime = todaySlots.find(s => s.timeSlot.includes('19:') || (s.slotType && s.slotType.toLowerCase().includes('bedtime'))) || todaySlots[1];

        const tomorrowMorning = tomorrowSlots.find(s => s.timeSlot.includes('08:') || (s.slotType && s.slotType.toLowerCase().includes('morning'))) || tomorrowSlots[0];
        const tomorrowBedtime = tomorrowSlots.find(s => s.timeSlot.includes('19:') || (s.slotType && s.slotType.toLowerCase().includes('bedtime'))) || tomorrowSlots[1];

        // Stage 1: Asset Buffering
        const bufferEl = document.getElementById('stageBufferStatus');
        const bufferNextEl = document.getElementById('stageBufferNextText');
        const tomorrowBufferedCount = tomorrowSlots.filter(s => s.isBuffered || s.isCompleted).length;
        const tomorrowTotalCount = tomorrowSlots.length;
        if (bufferEl) {
          if (tomorrowTotalCount > 0 && tomorrowBufferedCount === tomorrowTotalCount) {
            bufferEl.className = 'stage-status-pill ready';
            bufferEl.textContent = '🟢 ' + tomorrowBufferedCount + '/' + tomorrowTotalCount + ' Tomorrow Ready';
          } else if (tomorrowBufferedCount > 0) {
            bufferEl.className = 'stage-status-pill live';
            bufferEl.textContent = '🟡 ' + tomorrowBufferedCount + '/' + tomorrowTotalCount + ' Tomorrow Buffered';
          } else {
            bufferEl.className = 'stage-status-pill queued';
            bufferEl.textContent = '⏳ Render Queue Active';
          }
        }
        if (bufferNextEl) {
          bufferNextEl.textContent = 'Next Cron: Daily 07:00 WIB (R2 CDN)';
        }

        // Stage 2: Daily Bilingual Announcement
        const announceEl = document.getElementById('stageAnnounceStatus');
        const announceNextEl = document.getElementById('stageAnnounceNextText');
        if (announceEl) {
          if (totalSecNow >= SEC_ANNOUNCE) {
            announceEl.className = 'stage-status-pill done';
            announceEl.textContent = '✅ Sent Today (07:15 WIB)';
          } else {
            announceEl.className = 'stage-status-pill live';
            announceEl.textContent = '🔥 Airing at 07:15 WIB';
          }
        }
        if (announceNextEl) {
          announceNextEl.textContent = totalSecNow >= SEC_ANNOUNCE ? 'Next: Tomorrow 07:15 WIB (IG/FB/Threads)' : 'Teaser: Dual Morning EN + Bedtime ID';
        }

        // Stage 3: Morning English Broadcast
        const morningEl = document.getElementById('stageMorningStatus');
        const morningNextEl = document.getElementById('stageMorningNextText');
        const morningDone = Boolean(todayMorning && (todayMorning.isCompleted || todayMorning.status === 'completed'));
        if (morningEl) {
          if (morningDone) {
            morningEl.className = 'stage-status-pill done';
            morningEl.textContent = '✅ Broadcasted Today';
          } else if (!todayMorning) {
            morningEl.className = 'stage-status-pill queued';
            morningEl.textContent = '⏭️ No Morning Slot';
          } else if (totalSecNow >= SEC_MORNING) {
            morningEl.className = 'stage-status-pill live';
            morningEl.textContent = '⏳ Pending / Syncing';
          } else if (todayMorning.isBuffered) {
            morningEl.className = 'stage-status-pill ready';
            morningEl.textContent = '🟢 Buffered · 08:30 WIB';
          } else {
            morningEl.className = 'stage-status-pill live';
            morningEl.textContent = '🔥 Airing at 08:30 WIB';
          }
        }
        if (morningNextEl) {
          if ((morningDone || totalSecNow >= SEC_MORNING) && tomorrowMorning) {
            morningNextEl.textContent = \`Next: Tomorrow 08:30 WIB · \${tomorrowMorning.storyTitleEn || tomorrowMorning.storyTitleId}\`;
          } else if (todayMorning) {
            morningNextEl.textContent = \`Today: \${todayMorning.storyTitleEn || todayMorning.storyTitleId} [EN]\`;
          }
        }

        // Stage 4: Prime Bedtime Indonesian Broadcast
        const bedtimeEl = document.getElementById('stageBedtimeStatus');
        const bedtimeNextEl = document.getElementById('stageBedtimeNextText');
        const bedtimeDone = Boolean(todayBedtime && (todayBedtime.isCompleted || todayBedtime.status === 'completed'));
        if (bedtimeEl) {
          if (bedtimeDone) {
            bedtimeEl.className = 'stage-status-pill done';
            bedtimeEl.textContent = '✅ Broadcasted Tonight';
          } else if (!todayBedtime) {
            bedtimeEl.className = 'stage-status-pill queued';
            bedtimeEl.textContent = '⏭️ No Bedtime Slot';
          } else if (totalSecNow >= SEC_BEDTIME) {
            bedtimeEl.className = 'stage-status-pill live';
            bedtimeEl.textContent = '⏳ Pending / Syncing';
          } else if (todayBedtime.isBuffered) {
            bedtimeEl.className = 'stage-status-pill ready';
            bedtimeEl.textContent = '🟢 Buffered · 19:00 WIB';
          } else {
            bedtimeEl.className = 'stage-status-pill live';
            bedtimeEl.textContent = '🔥 Scheduled Tonight (19:00 WIB)';
          }
        }
        if (bedtimeNextEl) {
          if ((bedtimeDone || totalSecNow >= SEC_BEDTIME) && tomorrowBedtime) {
            bedtimeNextEl.textContent = \`Next: Tomorrow 19:00 WIB · \${tomorrowBedtime.storyTitleId}\`;
          } else if (todayBedtime) {
            bedtimeNextEl.textContent = \`Tonight: \${todayBedtime.storyTitleId} [ID]\`;
          }
        }

        // Active Card Highlight in Grid
        const cardBuffer = document.getElementById('stageCardBuffer');
        const cardAnnounce = document.getElementById('stageCardAnnounce');
        const cardMorning = document.getElementById('stageCardMorning');
        const cardBedtime = document.getElementById('stageCardBedtime');
        [cardBuffer, cardAnnounce, cardMorning, cardBedtime].forEach(c => c && c.classList.remove('active-stage'));

        // Immediate Next Automated Pipeline Event
        let nextEventName = '';
        let targetSecRemaining = 0;
        let spotlightSlot = null;
        let spotlightSub = '';
        let shortActionName = 'Broadcast';

        if (totalSecNow < SEC_ANNOUNCE) {
          nextEventName = '📣 Daily Bilingual Social Announcement (07:15 WIB)';
          shortActionName = 'Announcement';
          targetSecRemaining = SEC_ANNOUNCE - totalSecNow;
          spotlightSlot = todayMorning || todayBedtime;
          spotlightSub = 'Bilingual Teaser Carousel for Instagram, Facebook, and Threads';
          if (cardAnnounce) cardAnnounce.classList.add('active-stage');
        } else if (totalSecNow < SEC_MORNING) {
          nextEventName = '🌅 Morning English Broadcast (08:30 WIB)';
          shortActionName = 'Morning [EN]';
          targetSecRemaining = SEC_MORNING - totalSecNow;
          spotlightSlot = todayMorning;
          spotlightSub = 'Educational English Story (9:16 Shorts & 16:9 Landscape) on YouTube, Facebook, and Instagram';
          if (cardMorning) cardMorning.classList.add('active-stage');
        } else if (totalSecNow < SEC_BEDTIME) {
          nextEventName = '🌙 Prime Bedtime Indonesian Broadcast (19:00 WIB)';
          shortActionName = 'Bedtime [ID]';
          targetSecRemaining = SEC_BEDTIME - totalSecNow;
          spotlightSlot = todayBedtime;
          spotlightSub = 'Indonesian Bedtime Tale with Relaxing Soundscape on YouTube, Facebook, and Instagram';
          if (cardBedtime) cardBedtime.classList.add('active-stage');
        } else {
          const isTomorrowBuffer = wibDayOfWeek === 'Sun' || wibDayOfWeek === 'Wed';
          const nextTargetSec = isTomorrowBuffer ? SEC_BUFFER : SEC_ANNOUNCE;
          targetSecRemaining = (86400 - totalSecNow) + nextTargetSec;
          nextEventName = isTomorrowBuffer
            ? '📦 Cloudflare R2 Pre-render Buffering (Tomorrow 07:00 WIB)'
            : '📣 Daily Bilingual Social Announcement (Tomorrow 07:15 WIB)';
          shortActionName = isTomorrowBuffer ? 'R2 Buffer' : 'Announcement';
          spotlightSlot = tomorrowMorning || tomorrowBedtime;
          spotlightSub = 'Tomorrow Launch Preparation · Cloudflare Worker Cron Dispatch';
          if (isTomorrowBuffer && cardBuffer) cardBuffer.classList.add('active-stage');
          else if (cardAnnounce) cardAnnounce.classList.add('active-stage');
        }

        // Format Countdown String
        const cdHours = Math.floor(targetSecRemaining / 3600);
        const cdMins = Math.floor((targetSecRemaining % 3600) / 60);
        const cdSecs = targetSecRemaining % 60;
        const countdownStr = \`⏳ T - \${String(cdHours).padStart(2, '0')}h \${String(cdMins).padStart(2, '0')}m \${String(cdSecs).padStart(2, '0')}s\`;

        // Update Spotlight UI elements
        const nameEl = document.getElementById('pipelineSpotlightName');
        if (nameEl) nameEl.textContent = nextEventName;

        const cdEl = document.getElementById('pipelineCountdown');
        if (cdEl) cdEl.textContent = countdownStr;

        const titleEl = document.getElementById('pipelineSpotlightTitle');
        if (titleEl && spotlightSlot) {
          titleEl.textContent = \`\${spotlightSlot.storyTitleId} (\${(spotlightSlot.lang || 'id').toUpperCase()})\`;
        }

        const metaEl = document.getElementById('pipelineSpotlightMeta');
        if (metaEl && spotlightSlot) {
          metaEl.innerHTML = \`<span>📅 \${spotlightSlot.dayName}, \${spotlightSlot.date}</span> · <span>⏰ \${spotlightSlot.timeSlot}</span> · <span>📺 \${spotlightSlot.slotType}</span> · <span style="color: var(--accent-primary); font-weight: 600;">\${spotlightSlot.format}</span>\`;
        }

        const descEl = document.getElementById('pipelineSpotlightDesc');
        if (descEl) {
          descEl.textContent = spotlightSlot ? \`"\${spotlightSlot.theme}" — \${spotlightSub}\` : spotlightSub;
        }

        // Update Top Header Pipeline Pill
        const headerPillText = document.getElementById('pipelineHeaderStatusText');
        if (headerPillText) {
          headerPillText.textContent = \`⚡ Next: \${shortActionName} in \${String(cdHours).padStart(2, '0')}h \${String(cdMins).padStart(2, '0')}m\`;
        }

        // Tick per-card runner countdowns in-place
        const nowMs = Date.now();
        document.querySelectorAll('.slot-countdown-chip[data-target-ms]').forEach(function(el) {
          const targetMs = Number(el.getAttribute('data-target-ms'));
          if (!Number.isFinite(targetMs)) return;
          const text = formatRunnerCountdown(targetMs, nowMs);
          el.textContent = text;
          const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
          el.classList.toggle('imminent', diffSec > 0 && diffSec <= 3600);
        });
      } catch (err) {
        console.warn('Pipeline monitor update error:', err);
      }
    }

    function renderTimeline() {
      updateLiveTodayStatus();
      const clientTodayIso = getWibDateIso();

      // Compute stats based on the active roadmap scope
      const scopeSlots = RAW_CALENDAR_DATA.filter(item => {
        if (timelineState.scopeFilter === 'active30') return !isBudiSlot(item) && item.date <= '2026-12-31';
        if (timelineState.scopeFilter === 'budi') return isBudiSlot(item);
        return true;
      });

      const total = scopeSlots.length;
      const completed = scopeSlots.filter(s => s.status === 'completed' || s.isCompleted).length;
      const todaySlotsInScope = scopeSlots.filter(s => s.date === clientTodayIso);
      const todayCount = todaySlotsInScope.length;
      const todayDoneCount = todaySlotsInScope.filter(s => s.status === 'completed' || s.isCompleted).length;
      const upcoming = scopeSlots.filter(s => s.date > clientTodayIso && !s.isCompleted).length;
      const progress = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

      const elTotal = document.getElementById('kpiCalTotal');
      if (elTotal) elTotal.textContent = total;

      const elPlanDesc = document.getElementById('kpiCalPlanDesc');
      if (elPlanDesc) {
        elPlanDesc.textContent = timelineState.scopeFilter === 'active30'
          ? '2026 Launch Roadmap (Nov–Dec 2026)'
          : timelineState.scopeFilter === 'budi'
          ? 'BUDI Kemendikdasmen (2027–2028)'
          : 'Full 2-Year Editorial Masterplan (2026–2028)';
      }

      const elCompleted = document.getElementById('kpiCalCompleted');
      if (elCompleted) elCompleted.textContent = completed;

      const elToday = document.getElementById('kpiCalToday');
      if (elToday) elToday.textContent = todayCount;

      const elTodayDesc = document.getElementById('kpiCalTodayDesc');
      if (elTodayDesc) {
        elTodayDesc.textContent = todayCount === 0
          ? 'No Scheduled Broadcasts Today'
          : todayDoneCount === todayCount
          ? 'All ' + todayCount + ' Broadcasted Today'
          : todayDoneCount > 0
          ? todayDoneCount + ' Done · ' + (todayCount - todayDoneCount) + ' Remaining Today'
          : todayCount + ' Scheduled Broadcasts Today';
      }

      const elUpcoming = document.getElementById('kpiCalUpcoming');
      if (elUpcoming) elUpcoming.textContent = upcoming;

      const elProgress = document.getElementById('kpiCalProgress');
      if (elProgress) elProgress.textContent = progress + '%';

      const elDesc = document.getElementById('kpiCalProgressDesc');
      if (elDesc) elDesc.textContent = completed + ' of ' + total + ' Slots Broadcasted';

      const elProgressBar = document.getElementById('timelineProgressBar');
      if (elProgressBar) elProgressBar.style.width = progress + '%';

      const elBarLabel = document.getElementById('progressBarLabel');
      if (elBarLabel) elBarLabel.innerHTML = '<strong>' + completed + ' of ' + total + ' Slots</strong> (' + progress + '%)';

      const elLaunch = document.getElementById('roadmapLaunchDate');
      if (elLaunch && scopeSlots.length > 0) {
        elLaunch.textContent = formatDate(scopeSlots[0].date);
      }

      const elFinale = document.getElementById('roadmapFinaleDate');
      if (elFinale && scopeSlots.length > 0) {
        elFinale.textContent = formatDate(scopeSlots[scopeSlots.length - 1].date);
      }

      const elTabBadge = document.getElementById('tabTimelineBadge');
      if (elTabBadge) elTabBadge.textContent = completed + '/' + total + ' (' + progress + '%)';

      // Dynamically update scope buttons from loaded dataset
      const active30Count = RAW_CALENDAR_DATA.filter(function(s) { return !isBudiSlot(s) && s.date <= '2026-12-31'; }).length;
      const budiCount = RAW_CALENDAR_DATA.filter(function(s) { return isBudiSlot(s); }).length;
      const totalAll = RAW_CALENDAR_DATA.length;

      const btnActive30 = document.querySelector('[data-cal-filter="scope"][data-value="active30"]');
      if (btnActive30) btnActive30.textContent = '🌟 2026 Launch (' + active30Count + ')';

      const btnAll = document.querySelector('[data-cal-filter="scope"][data-value="all"]');
      if (btnAll) btnAll.textContent = '🚀 2-Year Master Plan (' + totalAll + ')';

      const btnBudi = document.querySelector('[data-cal-filter="scope"][data-value="budi"]');
      if (btnBudi) btnBudi.textContent = '📚 BUDI 2027–2028 (' + budiCount + ')';

      // Update filter chip text counts
      const chipAll = document.querySelector('[data-cal-filter="status"][data-value="all"]');
      if (chipAll) chipAll.textContent = 'All (' + total + ')';
      const chipToday = document.querySelector('[data-cal-filter="status"][data-value="today"]');
      if (chipToday) chipToday.textContent = '🔥 Today (' + todayCount + ')';
      const chipUpcoming = document.querySelector('[data-cal-filter="status"][data-value="upcoming"]');
      if (chipUpcoming) chipUpcoming.textContent = '⏳ Upcoming (' + upcoming + ')';
      const chipCompleted = document.querySelector('[data-cal-filter="status"][data-value="completed"]');
      if (chipCompleted) chipCompleted.textContent = '✅ Completed (' + completed + ')';

      const data = getFilteredTimelineData();
      const displayData = data.slice(0, timelineState.maxDisplayCount);

      const visibleEl = document.getElementById('timelineVisibleCount');
      if (visibleEl) visibleEl.textContent = displayData.length;

      const totalEl = document.getElementById('timelineTotalCount');
      if (totalEl) totalEl.textContent = data.length;

      const noticeEl = document.getElementById('timelineFilterNotice');
      if (noticeEl) {
        const isFiltered = timelineState.statusFilter !== 'all' || timelineState.langFilter !== 'all' || timelineState.readinessFilter !== 'all' || timelineState.searchQuery || timelineState.scopeFilter !== 'active30';
        noticeEl.textContent = isFiltered ? '(Filters Active)' : '';
      }

      // Group slots by date for Flow View
      const groups = new Map();
      displayData.forEach(slot => {
        const key = slot.date;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(slot);
      });

      let flowHtml = '';
      if (groups.size === 0) {
        flowHtml = '<div style="text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No scheduled broadcasts match your filter.</div>';
      } else {
        for (const [dateStr, slots] of groups) {
          const isToday = slots.some(s => s.date === clientTodayIso || s.status === 'today');
          const dayName = slots[0]?.dayName || '';
          const doneCount = slots.filter(s => s.isCompleted || s.status === 'completed').length;
          const bufferedDayCount = slots.filter(s => s.isBuffered).length;
          const assetsDayCount = slots.filter(s => s.hasAssets).length;
          const readinessBadge = doneCount === slots.length
            ? \`<span class="day-readiness-pill done">✅ \${doneCount}/\${slots.length} Broadcasted</span>\`
            : bufferedDayCount > 0
            ? \`<span class="day-readiness-pill">🟢 \${bufferedDayCount}/\${slots.length} R2 Ready</span>\`
            : assetsDayCount > 0
            ? \`<span class="day-readiness-pill">🟡 \${assetsDayCount}/\${slots.length} Assets</span>\`
            : \`<span class="day-readiness-pill">⏳ Queued</span>\`;

          flowHtml += \`
            <div class="timeline-day-group">
              <div class="timeline-day-header \${isToday ? 'today' : ''}">
                <span>📅 \${dayName}, \${formatDate(dateStr)}</span>
                \${isToday ? '<span class="day-today-tag">🔥 Hari Ini / Today</span>' : ''}
                \${readinessBadge}
                <span style="font-size: 0.7rem; color: var(--text-dim); margin-left: auto;">\${slots.length} Broadcast\${slots.length > 1 ? 's' : ''}</span>
              </div>
              <div class="timeline-slots-grid">
                \${slots.map(renderSlotCard).join('')}
              </div>
            </div>
          \`;
        }

        if (data.length > timelineState.maxDisplayCount) {
          flowHtml += \`
            <div style="text-align: center; padding: 2.5rem 1rem;">
              <button class="btn-card primary" onclick="loadMoreTimelineSlots()" style="padding: 0.75rem 2rem; font-size: 0.88rem; font-weight: 600;">
                ⬇️ Load More Broadcasts (Showing \${displayData.length} of \${data.length})
              </button>
              <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.5rem;">
                Displaying \${displayData.length} of \${data.length} scheduled slots in active filter
              </div>
            </div>
          \`;
        }
      }
      document.getElementById('timelineFlowContainer').innerHTML = flowHtml;

      // Render Schedule Table View
      const rowsHtml = displayData.map(renderSlotTableRow).join('');
      document.getElementById('timelineTableBody').innerHTML = rowsHtml || '<tr><td colspan="10" style="text-align: center; padding: 1.5rem; color: var(--text-dim); font-size: 0.85rem;">No scheduled broadcasts match your filter.</td></tr>';
      updatePipelineMonitor();
    }

    function formatRunnerCountdown(targetMs, nowMs) {
      const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
      if (diffSec === 0) return '⏳ Due / Running';
      const days = Math.floor(diffSec / 86400);
      const hrs = Math.floor((diffSec % 86400) / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      if (days > 0) {
        return \`T-\${days}d \${String(hrs).padStart(2, '0')}h \${String(mins).padStart(2, '0')}m\`;
      }
      return \`T-\${String(hrs).padStart(2, '0')}h \${String(mins).padStart(2, '0')}m \${String(secs).padStart(2, '0')}s\`;
    }

    function nextDailyWibMs(hourWib, nowMs) {
      const wibNow = new Date(nowMs + 7 * 3600000);
      const y = wibNow.getUTCFullYear();
      const m = String(wibNow.getUTCMonth() + 1).padStart(2, '0');
      const d = String(wibNow.getUTCDate()).padStart(2, '0');
      let candidate = new Date(\`\${y}-\${m}-\${d}T\${String(hourWib).padStart(2, '0')}:00:00+07:00\`).getTime();
      if (candidate <= nowMs) candidate += 86400000;
      return candidate;
    }

    function nextMonThuWibMs(hourWib, nowMs) {
      let candidate = nextDailyWibMs(hourWib, nowMs);
      for (let i = 0; i < 7; i++) {
        const day = new Date(candidate + 7 * 3600000).getUTCDay();
        if (day === 1 || day === 4) return candidate;
        candidate += 86400000;
      }
      return candidate;
    }

    function computeSlotRunnerTargets(slot, isMorning, nowMs) {
      const dateStr = slot.date && /^\\d{4}-\\d{2}-\\d{2}$/.test(slot.date) ? slot.date : null;
      if (!dateStr) return { ingestMs: null, bufferMs: null, publishMs: null };

      const publishTime = isMorning ? '08:30:00' : '19:00:00';
      const publishMs = new Date(\`\${dateStr}T\${publishTime}+07:00\`).getTime();

      // Nightly pre-render buffer runs at 02:00 WIB for the next 3 days
      const dayMidnightMs = new Date(\`\${dateStr}T00:00:00+07:00\`).getTime();
      let bufferMs = dayMidnightMs - 3 * 86400000 + 2 * 3600000;
      if (bufferMs <= nowMs) bufferMs = nextDailyWibMs(2, nowMs);

      // Daily ingestion runs at 07:00 WIB on or before slot.date
      let ingestMs = dayMidnightMs + 7 * 3600000;
      if (ingestMs <= nowMs) ingestMs = nextDailyWibMs(7, nowMs);

      return { ingestMs, bufferMs, publishMs };
    }

    function renderSlotCard(slot) {
      const display = resolveSlotDisplayState(slot, getWibDateIso());
      const { statusClass, statusText, isTodayPending, footerKind } = display;

      const timeText = slot.timeSlot || '08:30 WIB';
      const timeShort = timeText.replace(' WIB', '');
      const isMorning = timeText.includes('08:') || (slot.slotType && slot.slotType.toLowerCase().includes('morning'));
      const titleId = slot.storyTitleId || 'Dongeng Anak';
      const slotType = slot.slotType || 'Daily Broadcast';
      const theme = slot.theme || 'Pendidikan Karakter Anak';
      const langUpper = (slot.lang || 'id').toUpperCase();
      const langClass = (slot.lang || 'id').toLowerCase();

      // Compact format label
      let formatShort = '16:9 & 9:16';
      if (slot.format) {
        if (slot.format.includes('Shorts') && !slot.format.includes('Landscape')) formatShort = '9:16 Shorts';
        else if (slot.format.includes('Landscape') && !slot.format.includes('Shorts')) formatShort = '16:9 Landscape';
      }

      const todayBufferSuffix = display.isBuffered ? ' · 🟢 R2 Ready' : display.hasAssets ? ' · 🟡 Assets' : '';
      const nowMs = Date.now();
      const { ingestMs, bufferMs, publishMs } = computeSlotRunnerTargets(slot, isMorning, nowMs);
      const isDone = footerKind === 'completed';
      const ingestChip = (isDone || display.hasAssets || display.isBuffered)
        ? '<span class="slot-countdown-chip done">✅ Done</span>'
        : ingestMs
        ? \`<span class="slot-countdown-chip" data-target-ms="\${ingestMs}">\${formatRunnerCountdown(ingestMs, nowMs)}</span>\`
        : '<span class="slot-countdown-chip">—</span>';
      const bufferChip = (isDone || display.isBuffered)
        ? '<span class="slot-countdown-chip done">🟢 R2 Ready</span>'
        : bufferMs
        ? \`<span class="slot-countdown-chip" data-target-ms="\${bufferMs}">\${formatRunnerCountdown(bufferMs, nowMs)}</span>\`
        : '<span class="slot-countdown-chip">—</span>';
      const publishChip = isDone
        ? '<span class="slot-countdown-chip done">✅ Live</span>'
        : publishMs
        ? \`<span class="slot-countdown-chip" data-target-ms="\${publishMs}">\${formatRunnerCountdown(publishMs, nowMs)}</span>\`
        : '<span class="slot-countdown-chip">—</span>';

      return \`
        <div class="slot-card \${isTodayPending ? 'today-card' : ''}">
          <!-- Compact Single-Line Header -->
          <div class="slot-top">
            <div class="slot-time-lang">
              <span class="slot-time-pill \${isMorning ? 'morning' : 'bedtime'}">
                \${isMorning ? '🌅' : '🌙'} \${timeShort}
              </span>
              <span class="slot-lang-tag \${langClass}">\${langUpper}</span>
            </div>
            <div class="slot-meta-right">
              <span class="meta-id-tag" style="font-size: 0.64rem;">\${slot.id}</span>
              <span class="slot-status-pill \${statusClass}">\${statusText}</span>
            </div>
          </div>

          <!-- Story Title & Subtitle with Ellipsis & Full Tooltip -->
          <div class="slot-main-info">
            <div class="slot-title" title="\${escapeAttr(titleId)}">\${titleId}</div>
            \${slot.storyTitleEn && slot.storyTitleEn !== titleId ? \`<div class="slot-subtitle" title="\${escapeAttr(slot.storyTitleEn)}">\${slot.storyTitleEn}</div>\` : ''}
            <div class="slot-type-label" title="\${escapeAttr(slotType)}">\${slotType}</div>
          </div>

          <!-- Compact Single-Row Tags (Format + Platforms) -->
          <div class="slot-tags-row">
            <span class="format-mini-tag">\${formatShort}</span>
            <span class="platform-mini-tag">📺 YT</span>
            <span class="platform-mini-tag">📘 FB</span>
            <span class="platform-mini-tag">📸 IG</span>
          </div>

          <!-- 2-Line Clamped Theme Box -->
          <div class="slot-theme-box" title="\${escapeAttr(theme)}">
            "\${theme}"
          </div>

          <!-- Per-Slot Runner Countdowns (Ingest · Pre-render Buffer · Broadcast) -->
          <div class="slot-runner-countdowns">
            <div class="slot-runner-row" title="Daily Ingestion Runner (Daily 07:00 WIB)">
              <span class="slot-runner-label">📥 Ingest</span>
              \${ingestChip}
            </div>
            <div class="slot-runner-row" title="Pre-render Buffer Runner (Daily 02:00 WIB, 3-day window)">
              <span class="slot-runner-label">📦 Buffer</span>
              \${bufferChip}
            </div>
            <div class="slot-runner-row" title="Broadcast & Publish (\${timeText})">
              <span class="slot-runner-label">🚀 Publish</span>
              \${publishChip}
            </div>
          </div>

          <!-- Compact Footer Action / Banner -->
          <div class="slot-footer-actions">
            \${footerKind === 'completed' ? \`
              <button class="slot-action-btn active-btn" onclick="filterCatalogByStory('\${slot.bookSlug}')">
                📚 View Assets ↗
              </button>
            \` : footerKind === 'today' ? \`
              <div class="slot-banner today" title="Active broadcast scheduled for today at \${timeText}.">
                ⚡ Airing Today (\${timeShort})\${todayBufferSuffix}
              </div>
            \` : footerKind === 'buffered' ? \`
              <div class="slot-banner buffered" title="Pre-rendered in Cloudflare R2 bucket. Waiting for broadcast at \${timeText}.">
                🟢 Ready in Buffer (\${timeShort})
              </div>
            \` : footerKind === 'assets' ? \`
              <div class="slot-banner assets" title="Story assets ready. In render queue.">
                🟡 Story Assets Ready
              </div>
            \` : \`
              <div class="slot-banner queued" title="Queued in production roadmap.">
                ⏳ Queued in Pipeline
              </div>
            \`}
          </div>
        </div>
      \`;
    }

    function renderSlotTableRow(slot) {
      const display = resolveSlotDisplayState(slot, getWibDateIso());
      const { statusClass, statusText, isTodayRow } = display;

      const dayName = slot.dayName || 'Hari';
      const dateFormatted = slot.date && slot.date !== 'undefined' ? formatDate(slot.date) : 'Scheduled';
      const timeText = slot.timeSlot || '08:30 WIB';
      const titleId = slot.storyTitleId || 'Dongeng Anak';
      const slotType = slot.slotType || 'Daily Broadcast';
      const theme = slot.theme || 'Pendidikan Karakter Anak';

      return \`
        <tr class="\${isTodayRow ? 'today-row' : ''}">
          <td style="white-space: nowrap; font-weight: 700;">\${dateFormatted}\${isTodayRow ? ' <span class="slot-status-pill today" style="margin-left: 0.3rem; font-size: 0.58rem;">Today</span>' : ''}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;">\${timeText}</td>
          <td>\${dayName}</td>
          <td><span class="slot-status-pill \${statusClass}">\${statusText}</span></td>
          <td>
            <strong>\${titleId}</strong>
            \${slot.storyTitleEn && slot.storyTitleEn !== titleId ? \`<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">\${slot.storyTitleEn}</div>\` : ''}
          </td>
          <td><span class="lang-badge">\${(slot.lang || 'id').toUpperCase()}</span></td>
          <td><span class="format-badge">\${(slot.format || 'Landscape').split(' ')[0]}</span></td>
          <td style="font-size: 0.74rem;">\${slotType}</td>
          <td style="font-size: 0.72rem; color: var(--text-dim);">\${(slot.targetPlatforms || []).join(', ')}</td>
          <td style="font-size: 0.72rem; max-width: 260px; font-style: italic;">\${theme}</td>
        </tr>
      \`;
    }

    // Universal Video Modal Preview (Supports YouTube, Facebook, and Instagram)
    function openPreviewModal(id) {
      const item = RAW_AUDIT_DATA.find(r => r.id === id);
      if (!item) return;

      const modal = document.getElementById('videoModal');
      const frame = document.getElementById('modalPlayerFrame');
      const titleEl = document.getElementById('modalVideoTitle');
      if (titleEl) titleEl.textContent = item.videoTitle;

      if (item.platform === 'YouTube' && item.videoId) {
        frame.innerHTML = \`<iframe src="https://www.youtube-nocookie.com/embed/\${item.videoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\`;
      } else if (item.platform === 'Facebook' && item.videoUrl) {
        const encodedUrl = encodeURIComponent(item.videoUrl);
        frame.innerHTML = \`
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 380px; background: #000; padding: 1.5rem; text-align: center;">
            <iframe src="https://www.facebook.com/plugins/video.php?href=\${encodedUrl}&show_text=0&width=560" width="100%" height="315" style="border:none;overflow:hidden;max-width:560px;border-radius:8px;" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
              <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-card primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;">
                Open on Facebook Watch ↗
              </a>
              <button class="btn-card" onclick="copyToClipboard('\${item.videoUrl}', 'Facebook Link')" style="padding: 0.5rem 1rem; font-size: 0.8rem;">
                📋 Copy Link
              </button>
            </div>
          </div>
        \`;
      } else if (item.platform === 'Instagram' && item.videoUrl) {
        frame.innerHTML = \`
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 380px; background: #111827; padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 0.75rem;">📸</div>
            <h3 style="color: #fff; margin-bottom: 0.5rem; font-size: 1.15rem; max-width: 480px;">\${item.videoTitle}</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">Official Instagram Reel by @zayn.storybook</p>
            <div style="display: flex; gap: 0.5rem;">
              <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-card primary" style="padding: 0.5rem 1.2rem; font-size: 0.85rem;">
                Open Instagram Reel ↗
              </a>
              <button class="btn-card" onclick="copyToClipboard('\${item.videoUrl}', 'Instagram Link')" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                📋 Copy Link
              </button>
            </div>
          </div>
        \`;
      } else {
        frame.innerHTML = \`
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 300px; background: #111827; padding: 2rem; text-align: center;">
            <h3 style="color: #fff; margin-bottom: 1rem;">\${item.videoTitle}</h3>
            <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-card primary">
              Open Video Asset ↗
            </a>
          </div>
        \`;
      }
      modal.classList.add('open');
    }

    // Backwards compatibility alias
    function openYoutubeModal(videoId, title) {
      const modal = document.getElementById('videoModal');
      const frame = document.getElementById('modalPlayerFrame');
      document.getElementById('modalVideoTitle').textContent = title;
      frame.innerHTML = \`<iframe src="https://www.youtube-nocookie.com/embed/\${videoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\`;
      modal.classList.add('open');
    }

    function closeModal() {
      const modal = document.getElementById('videoModal');
      const frame = document.getElementById('modalPlayerFrame');
      frame.innerHTML = '';
      modal.classList.remove('open');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Dynamic CSV Export
    function exportActiveCsv() {
      if (activeTab === 'timeline') {
        exportTimelineCsv();
      } else {
        exportCatalogCsv();
      }
    }

    function exportActiveJson() {
      if (activeTab === 'timeline') {
        exportTimelineJson();
      } else {
        exportCatalogJson();
      }
    }

    function exportCatalogCsv() {
      const headers = ['Audit ID', 'Category', 'Platform', 'Language', 'Format', 'Story Title (ID)', 'Story Title (EN)', 'Published Video Title', 'Platform Video ID', 'Published Date UTC', 'Direct Video URL', 'Status', 'License', 'Author', 'Illustrator', 'Source URL'];
      
      const rows = RAW_AUDIT_DATA.map(item => [
        item.id,
        item.category,
        item.platform,
        item.language.toUpperCase(),
        item.format,
        \`"\${(item.storyTitleId || '').replace(/"/g, '""')}"\`,
        \`"\${(item.storyTitleEn || '').replace(/"/g, '""')}"\`,
        \`"\${(item.videoTitle || '').replace(/"/g, '""')}"\`,
        \`"\${item.videoId}"\`,
        \`"\${item.publishedAt}"\`,
        \`"\${item.videoUrl}"\`,
        item.status,
        \`"\${item.license}"\`,
        \`"\${item.author}"\`,
        \`"\${item.illustrator}"\`,
        \`"\${item.sourceUrl}"\`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', 'zayn-storybook-catalog-audit.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported Catalog CSV!');
    }

    function exportCatalogJson() {
      const jsonContent = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(RAW_AUDIT_DATA, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', jsonContent);
      link.setAttribute('download', 'zayn-storybook-audit-records.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported Catalog JSON!');
    }

    function exportTimelineCsv() {
      const headers = ['Slot ID', 'Date', 'Day', 'Time Slot', 'Status', 'Story Slug', 'Story Title (ID)', 'Story Title (EN)', 'Lang', 'Format', 'Slot Type', 'Theme / Synopsis', 'Target Platforms'];
      
      const rows = RAW_CALENDAR_DATA.map(item => [
        item.id,
        item.date,
        item.dayName,
        \`"\${item.timeSlot}"\`,
        item.status,
        item.bookSlug,
        \`"\${(item.storyTitleId || '').replace(/"/g, '""')}"\`,
        \`"\${(item.storyTitleEn || '').replace(/"/g, '""')}"\`,
        item.lang.toUpperCase(),
        \`"\${item.format}"\`,
        \`"\${item.slotType}"\`,
        \`"\${(item.theme || '').replace(/"/g, '""')}"\`,
        \`"\${(item.targetPlatforms || []).join('; ')}"\`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', 'zayn-storybook-30-day-timeline.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported Timeline CSV!');
    }

    function exportTimelineJson() {
      const jsonContent = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(RAW_CALENDAR_DATA, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', jsonContent);
      link.setAttribute('download', 'zayn-storybook-release-timeline.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported Timeline JSON!');
    }

    // Initial render
    populateStoryDropdown();
    renderKPIs();
    render();
    renderAnalytics();
    updateLiveTodayStatus();
    renderTimeline();
    updatePipelineMonitor();
    setInterval(updatePipelineMonitor, 1000);
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(docsDir, "index.html"), indexHtmlContent);
console.log(`Successfully generated docs/index.html with ${auditRecords.length} records and ${calendarSlots.length} timeline slots!`);
