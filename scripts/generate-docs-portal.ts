import fs from "fs";
import path from "path";
import { DAILY_CALENDAR_MONTH_1, ScheduledSlot } from "./content-calendar";

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
}

const workspaceRoot = path.resolve(__dirname, "..");
const storiesDir = path.join(workspaceRoot, "stories");
const docsDir = path.join(workspaceRoot, "docs");
const curatedPath = path.join(workspaceRoot, "config", "curated-books.json");

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// 1. Build Story Titles Map
const storyTitlesMap = new Map<string, { id: string; en: string }>();

const stories = fs.readdirSync(storiesDir).filter((f) => {
  try {
    const stat = fs.statSync(path.join(storiesDir, f));
    return stat.isDirectory() && fs.existsSync(path.join(storiesDir, f, "story.json"));
  } catch {
    return false;
  }
}).sort();

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

function formatSlugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// 2. Build Audit Records
const auditRecords: AuditRecord[] = [];
let counter = 1;

function padId(n: number): string {
  return "AUD-" + String(n).padStart(3, "0");
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
        auditRecords.push({
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
        const fallbackYt = yt[lang]?.[fmt]?.id;
        auditRecords.push({
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
          thumbnailUrl: fallbackYt ? `https://img.youtube.com/vi/${fallbackYt}/hqdefault.jpg` : undefined,
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
      const fallbackYt = yt[lang]?.vertical?.id;
      auditRecords.push({
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
        thumbnailUrl: fallbackYt ? `https://img.youtube.com/vi/${fallbackYt}/hqdefault.jpg` : undefined,
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
      auditRecords.push({
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
        thumbnailUrl: comp.youtube?.videoId ? `https://img.youtube.com/vi/${comp.youtube.videoId}/hqdefault.jpg` : undefined,
        author: "Pratham Books Authors (Various)",
        illustrator: "Pratham Books Illustrators (Various)",
        license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        sourceUrl: "https://storyweaver.org.in"
      });
    }

    if (comp.youtube && comp.youtube.url) {
      auditRecords.push({
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

// 3. Enrich Calendar Slots
const publishedStorySlugs = new Set(auditRecords.map((r) => r.storySlug));
const todayIso = "2026-11-09";

const calendarSlots: EnrichedCalendarSlot[] = DAILY_CALENDAR_MONTH_1.map((slot, idx) => {
  const dateStr = slot.date || "2026-11-07";
  const titles = storyTitlesMap.get(slot.bookSlug) || {
    id: formatSlugToTitle(slot.bookSlug),
    en: formatSlugToTitle(slot.bookSlug),
  };

  let status: "completed" | "today" | "upcoming" = "upcoming";
  let isCompleted = false;

  if (dateStr < todayIso) {
    status = "completed";
    isCompleted = true;
  } else if (dateStr === todayIso) {
    status = "today";
    isCompleted = false;
  } else {
    status = "upcoming";
    isCompleted = false;
  }

  const hasPublishedAsset = publishedStorySlugs.has(slot.bookSlug);

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
    status,
    isCompleted,
    hasPublishedAsset,
  };
});

// Write audit-data.json and calendar-data.json
const auditJsonPath = path.join(docsDir, "audit-data.json");
fs.writeFileSync(auditJsonPath, JSON.stringify(auditRecords, null, 2));
console.log(`Saved ${auditRecords.length} audit records to ${auditJsonPath}`);

const calendarJsonPath = path.join(docsDir, "calendar-data.json");
fs.writeFileSync(calendarJsonPath, JSON.stringify(calendarSlots, null, 2));
console.log(`Saved ${calendarSlots.length} calendar slots to ${calendarJsonPath}`);

// Precompute summary metrics for build-time HTML injection
const initialTotal = auditRecords.length;
const initialYt = auditRecords.filter((r) => r.platform === "YouTube").length;
const initialFb = auditRecords.filter((r) => r.platform === "Facebook").length;
const initialIg = auditRecords.filter((r) => r.platform === "Instagram").length;
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
const initialCalToday = calendarSlots.filter((s) => s.status === "today").length;
const initialCalUpcoming = calendarSlots.filter((s) => s.status === "upcoming").length;
const initialCalProgress = ((initialCalCompleted / initialCalTotal) * 100).toFixed(1);
const nextUpSlot = calendarSlots.find((s) => s.status === "today") || calendarSlots.find((s) => s.status === "upcoming");

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
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.75rem;
      border-bottom: 2px solid var(--card-border);
      padding-bottom: 0.45rem;
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

    /* Next Up Spotlight */
    .next-up-card {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(16, 185, 129, 0.08));
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: var(--radius-md);
      padding: 0.7rem 0.95rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .next-up-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .next-up-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background: #f59e0b;
      color: #0b0f19;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.25rem 0.55rem;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .next-up-title {
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .next-up-meta {
      font-size: 0.74rem;
      color: var(--text-muted);
      margin-top: 0.1rem;
    }

    /* Timeline Day Grouping */
    .timeline-day-group {
      margin-bottom: 1.15rem;
    }

    .timeline-day-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.55rem;
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent-primary);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin-bottom: 0.55rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-main);
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

    .timeline-slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 0.65rem;
    }

    .slot-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 0.7rem 0.85rem;
      display: flex;
      flex-direction: column;
      transition: var(--transition);
      position: relative;
    }

    .slot-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    .slot-card.today-card {
      border-color: rgba(245, 158, 11, 0.45);
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.15);
    }

    .slot-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.45rem;
    }

    .slot-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.1);
      padding: 0.12rem 0.45rem;
      border-radius: var(--radius-xs);
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    .slot-status-pill {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.12rem 0.45rem;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .slot-status-pill.completed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
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

    .slot-title {
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 0.25rem;
      line-height: 1.25;
    }

    .slot-type-label {
      font-size: 0.71rem;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 0.45rem;
    }

    .slot-badges {
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }

    .slot-theme-box {
      font-size: 0.73rem;
      color: var(--text-muted);
      background: var(--bg-primary);
      border-radius: var(--radius-xs);
      padding: 0.4rem 0.55rem;
      border-left: 2px solid var(--accent-primary);
      margin-top: auto;
      margin-bottom: 0.5rem;
      line-height: 1.35;
      font-style: italic;
    }

    .slot-action-btn {
      width: 100%;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      font-size: 0.74rem;
      font-weight: 600;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
      background: var(--bg-secondary);
      color: var(--text-main);
      cursor: pointer;
      text-decoration: none;
      transition: var(--transition);
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

    @media (max-width: 768px) {
      .container { padding: 0.65rem 0.75rem; }
      .brand-heading h1 { font-size: 1.1rem; }
      .cards-grid { grid-template-columns: 1fr; }
      .timeline-slots-grid { grid-template-columns: 1fr; }
      .toolbar { padding: 0.5rem; }
      .search-box { min-width: 100%; }
      footer { flex-direction: column; align-items: flex-start; }
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
        <span>📅</span> 30-Day Release Timeline
        <span class="tab-badge" id="tabTimelineBadge">${initialCalCompleted}/${initialCalTotal} (${initialCalProgress}%)</span>
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
        <div class="stat-card yt">
          <div class="stat-title">YouTube Videos</div>
          <div class="stat-value" id="kpiYt">${initialYt}</div>
          <div class="stat-desc">Landscape, Shorts & Marathons</div>
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
        <div class="stat-card stories">
          <div class="stat-title">Story Books</div>
          <div class="stat-value" id="kpiStories">${initialStoriesCount}</div>
          <div class="stat-desc">Active Children's Titles</div>
        </div>
        <div class="stat-card cc">
          <div class="stat-title">License & Rights</div>
          <div class="stat-value" style="font-size: 1.15rem; color: var(--success-green);">CC BY 4.0</div>
          <div class="stat-desc">StoryWeaver / Pratham Books</div>
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
            <button id="viewCardBtn" class="view-btn active" onclick="setViewMode('card')">
              <span>⊞</span> Grid
            </button>
            <button id="viewTableBtn" class="view-btn" onclick="setViewMode('table')">
              <span>☰</span> Table
            </button>
          </div>
        </div>

        <div class="filter-chips-row">
          <span class="filter-label">Platform:</span>
          <button class="filter-chip active" data-filter="platform" data-value="all" onclick="setPlatformFilter('all', this)">All (${initialTotal})</button>
          <button class="filter-chip" data-filter="platform" data-value="YouTube" onclick="setPlatformFilter('YouTube', this)">YouTube (${initialYt})</button>
          <button class="filter-chip" data-filter="platform" data-value="Facebook" onclick="setPlatformFilter('Facebook', this)">Facebook (${initialFb})</button>
          <button class="filter-chip" data-filter="platform" data-value="Instagram" onclick="setPlatformFilter('Instagram', this)">Instagram (${initialIg})</button>

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
            <div class="stat-desc">30 Days Editorial Roadmap</div>
          </div>
          <div class="stat-card cc">
            <div class="stat-title">Completed</div>
            <div class="stat-value" id="kpiCalCompleted" style="color: var(--success-green);">${initialCalCompleted}</div>
            <div class="stat-desc">Broadcasted & Archived</div>
          </div>
          <div class="stat-card gold">
            <div class="stat-title">Today's Schedule</div>
            <div class="stat-value" id="kpiCalToday" style="color: #f59e0b;">${initialCalToday}</div>
            <div class="stat-desc">Active Production Broadcasts</div>
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
            <span>🚀 Launch: 07 Nov 2026</span>
            <span id="progressBarLabel"><strong>${initialCalCompleted} of ${initialCalTotal} Slots</strong> (${initialCalProgress}%)</span>
            <span>🏁 Finale: 06 Dec 2026</span>
          </div>
        </div>
      </div>

      <!-- Next Up Spotlight Banner -->
      ${
        nextUpSlot
          ? `
      <div class="next-up-card" id="nextUpBanner">
        <div class="next-up-info">
          <span class="next-up-badge">🔥 Next Up Today</span>
          <div>
            <div class="next-up-title">${nextUpSlot.storyTitleId} (${nextUpSlot.lang.toUpperCase()})</div>
            <div class="next-up-meta">
              📅 ${nextUpSlot.dayName}, ${nextUpSlot.date} · ⏰ ${nextUpSlot.timeSlot} · ${nextUpSlot.slotType}
            </div>
          </div>
        </div>
        <div style="font-size: 0.74rem; color: var(--text-muted); font-style: italic; max-width: 480px;">
          "${nextUpSlot.theme}"
        </div>
      </div>
      `
          : ""
      }

      <!-- Timeline Toolbar -->
      <section class="toolbar">
        <div class="search-row">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="timelineSearchInput" class="search-input" placeholder="Search scheduled story, date, theme, or slot type..." oninput="handleTimelineSearch()">
          </div>
          <div class="view-toggles">
            <button id="viewCalFlowBtn" class="view-btn active" onclick="setTimelineViewMode('flow')">
              <span>⊞</span> Day Cards
            </button>
            <button id="viewCalTableBtn" class="view-btn" onclick="setTimelineViewMode('table')">
              <span>☰</span> Schedule Table
            </button>
          </div>
        </div>

        <div class="filter-chips-row">
          <span class="filter-label">Status:</span>
          <button class="filter-chip active" data-cal-filter="status" data-value="all" onclick="setTimelineStatusFilter('all', this)">All (${initialCalTotal})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="today" onclick="setTimelineStatusFilter('today', this)">🔥 Today (${initialCalToday})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="upcoming" onclick="setTimelineStatusFilter('upcoming', this)">⏳ Upcoming (${initialCalUpcoming})</button>
          <button class="filter-chip" data-cal-filter="status" data-value="completed" onclick="setTimelineStatusFilter('completed', this)">✅ Completed (${initialCalCompleted})</button>

          <span class="filter-label" style="margin-left: 0.5rem;">Lang:</span>
          <button class="filter-chip active" data-cal-filter="lang" data-value="all" onclick="setTimelineLangFilter('all', this)">All</button>
          <button class="filter-chip" data-cal-filter="lang" data-value="id" onclick="setTimelineLangFilter('id', this)">🇮🇩 ID</button>
          <button class="filter-chip" data-cal-filter="lang" data-value="en" onclick="setTimelineLangFilter('en', this)">🇬🇧 EN</button>
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

  <script>
    // Embedded Datasets
    let RAW_AUDIT_DATA = ${JSON.stringify(auditRecords)};
    let RAW_CALENDAR_DATA = ${JSON.stringify(calendarSlots)};

    let activeTab = 'catalog'; // 'catalog' | 'timeline'

    let state = {
      searchQuery: '',
      platformFilter: 'all',
      langFilter: 'all',
      storyFilter: 'all',
      viewMode: 'card'
    };

    let timelineState = {
      searchQuery: '',
      statusFilter: 'all',
      langFilter: 'all',
      viewMode: 'flow' // 'flow' | 'table'
    };

    // Tab Navigation
    function switchMainTab(tab) {
      activeTab = tab;
      document.getElementById('tabCatalogBtn').classList.toggle('active', tab === 'catalog');
      document.getElementById('tabTimelineBtn').classList.toggle('active', tab === 'timeline');

      document.getElementById('catalogViewSection').style.display = tab === 'catalog' ? 'block' : 'none';
      document.getElementById('timelineViewSection').style.display = tab === 'timeline' ? 'block' : 'none';

      localStorage.setItem('zayn_main_tab', tab);

      if (tab === 'timeline') {
        renderTimeline();
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

      const elTotalCount = document.getElementById('totalCount');
      if (elTotalCount) elTotalCount.textContent = total;

      const tabCatCount = document.getElementById('tabCatalogCount');
      if (tabCatCount) tabCatCount.textContent = total;

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

    // 3-Tier Robust Hydration System:
    async function hydrateLiveCatalog(manual = false) {
      const pill = document.getElementById('d1-status-pill');
      const text = document.getElementById('d1StatusText');
      const dot = pill ? pill.querySelector('.status-dot') : null;

      if (dot) dot.classList.add('pulsing');
      if (text) text.textContent = 'Syncing...';

      // 1. Try Cloudflare Pages Function /api/catalog
      try {
        const res = await fetch('/api/catalog');
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.auditRecords) && data.auditRecords.length > 0) {
            console.log('⚡ Live D1 hydration successful:', data.auditRecords.length, 'records');
            RAW_AUDIT_DATA = data.auditRecords;
            if (Array.isArray(data.calendarSlots) && data.calendarSlots.length > 0) {
              RAW_CALENDAR_DATA = data.calendarSlots;
            }
            populateStoryDropdown();
            renderKPIs();
            render();
            renderTimeline();
            if (pill) {
              pill.className = 'status-badge status-live';
              pill.title = 'Live from Cloudflare D1 SQLite database (Click to refresh)';
            }
            if (text) text.textContent = '⚡ D1 Live (' + data.auditRecords.length + ')';
            if (dot) dot.classList.remove('pulsing');
            if (manual) showToast('Synchronized ' + data.auditRecords.length + ' records from Cloudflare D1!');
            return;
          }
        }
      } catch (err) {
        console.warn('/api/catalog not reachable, checking static fallback...', err);
      }

      // 2. Try static audit-data.json and calendar-data.json
      try {
        const res = await fetch('./audit-data.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log('📁 Static audit-data.json loaded:', data.length, 'records');
            RAW_AUDIT_DATA = data;

            try {
              const calRes = await fetch('./calendar-data.json');
              if (calRes.ok) {
                const calData = await calRes.json();
                if (Array.isArray(calData) && calData.length > 0) {
                  RAW_CALENDAR_DATA = calData;
                }
              }
            } catch {
              // Ignore
            }

            populateStoryDropdown();
            renderKPIs();
            render();
            renderTimeline();
            if (pill) {
              pill.className = 'status-badge status-snapshot';
              pill.title = 'Snapshot from audit-data.json (Click to refresh)';
            }
            if (text) text.textContent = '📁 Snapshot (' + data.length + ')';
            if (dot) dot.classList.remove('pulsing');
            if (manual) showToast('Loaded ' + data.length + ' records from audit-data.json');
            return;
          }
        }
      } catch (err) {
        console.warn('audit-data.json not reachable, using embedded snapshot...', err);
      }

      // 3. Embedded snapshot fallback
      populateStoryDropdown();
      renderKPIs();
      render();
      renderTimeline();
      if (pill) {
        pill.className = 'status-badge status-embedded';
        pill.title = 'Pre-rendered in HTML bundle (Click to refresh)';
      }
      if (text) text.textContent = '📦 Embedded (' + RAW_AUDIT_DATA.length + ')';
      if (dot) dot.classList.remove('pulsing');
      if (manual) showToast('Using embedded dataset (' + RAW_AUDIT_DATA.length + ' records)');
    }

    function syncCatalog(manual) {
      hydrateLiveCatalog(manual);
    }

    // Auto-hydrate on startup
    hydrateLiveCatalog(false);

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const target = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', target);
      localStorage.setItem('zayn_theme', target);
    }

    const savedTheme = localStorage.getItem('zayn_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedTab = localStorage.getItem('zayn_main_tab');
    if (savedTab === 'timeline') {
      switchMainTab('timeline');
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
      document.getElementById('viewCardBtn').classList.toggle('active', mode === 'card');
      document.getElementById('viewTableBtn').classList.toggle('active', mode === 'table');
      document.getElementById('cardViewContainer').style.display = mode === 'card' ? 'grid' : 'none';
      document.getElementById('tableViewContainer').style.display = mode === 'table' ? 'block' : 'none';
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
      return RAW_AUDIT_DATA.filter(item => {
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
    }

    function formatDate(isoStr) {
      if (!isoStr || isoStr === 'N/A') return 'Published';
      try {
        const d = new Date(isoStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) {
        return isoStr;
      }
    }

    function renderCard(item) {
      const isYt = item.platform === 'YouTube';
      const isFb = item.platform === 'Facebook';
      const isIg = item.platform === 'Instagram';

      const platClass = isYt ? 'yt' : isFb ? 'fb' : 'ig';
      const platIcon = isYt ? '📺' : isFb ? '📘' : '📸';
      const isVertical = item.aspectRatio === '9:16';

      const thumbSrc = item.thumbnailUrl || 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80';

      return \`
        <div class="video-card">
          <div class="card-thumb-wrapper \${isVertical ? 'ratio-vertical' : ''}">
            <img src="\${thumbSrc}" alt="\${item.videoTitle}" class="card-thumb-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80'">
            <div class="thumb-overlay-badge">
              <span class="platform-badge \${platClass}">\${platIcon} \${item.platform}</span>
              <span class="lang-badge">\${item.language.toUpperCase()}</span>
              <span class="format-badge">\${item.format}</span>
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
              \${isYt ? \`
                <button class="btn-card" onclick="openYoutubeModal('\${item.videoId}', '\${item.videoTitle.replace(/'/g, "\\\\'")}')">
                  ▶ Preview
                </button>
              \` : ''}
              <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-card primary">
                Open \${item.platform} ↗
              </a>
            </div>
          </div>
        </div>
      \`;
    }

    function renderTableRow(item) {
      const platClass = item.platform === 'YouTube' ? 'yt' : item.platform === 'Facebook' ? 'fb' : 'ig';
      return \`
        <tr>
          <td><span class="meta-id-tag" onclick="copyToClipboard('\${item.id}', 'Audit ID')">\${item.id}</span></td>
          <td><span class="platform-badge \${platClass}">\${item.platform}</span></td>
          <td><span class="lang-badge">\${item.language.toUpperCase()}</span></td>
          <td><span class="format-badge">\${item.format}</span></td>
          <td><strong>\${item.storyTitleId}</strong></td>
          <td class="table-cell-title">
            \${item.videoTitle}
            <small>By \${item.author}</small>
          </td>
          <td><span class="meta-id-tag" onclick="copyToClipboard('\${item.videoId}', 'Video ID')">\${item.videoId}</span></td>
          <td style="white-space: nowrap; font-size: 0.74rem;">\${formatDate(item.publishedAt)}</td>
          <td><span style="color: var(--success-green); font-weight: 600; font-size: 0.72rem;">\${item.status.toUpperCase()}</span></td>
          <td>
            <a href="\${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="table-link">
              View ↗
            </a>
          </td>
        </tr>
      \`;
    }

    function render() {
      const data = getFilteredData();
      const visibleEl = document.getElementById('visibleCount');
      if (visibleEl) visibleEl.textContent = data.length;

      const noticeEl = document.getElementById('filterNotice');
      if (noticeEl) {
        const isFiltered = state.platformFilter !== 'all' || state.langFilter !== 'all' || state.storyFilter !== 'all' || state.searchQuery;
        noticeEl.textContent = isFiltered ? '(Filters Active)' : '';
      }

      // Card Grid
      const cardsHtml = data.map(renderCard).join('');
      document.getElementById('cardViewContainer').innerHTML = cardsHtml || '<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No published videos match your filter.</div>';

      // Table View
      const rowsHtml = data.map(renderTableRow).join('');
      document.getElementById('tableBody').innerHTML = rowsHtml || '<tr><td colspan="10" style="text-align: center; padding: 1.5rem; color: var(--text-dim); font-size: 0.85rem;">No published videos match your filter.</td></tr>';
    }

    // =========================================================================
    // TIMELINE RENDERING & INTERACTIONS
    // =========================================================================
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

    function handleTimelineSearch() {
      timelineState.searchQuery = document.getElementById('timelineSearchInput').value.trim().toLowerCase();
      renderTimeline();
    }

    function getFilteredTimelineData() {
      return RAW_CALENDAR_DATA.filter(item => {
        if (timelineState.statusFilter !== 'all') {
          if (timelineState.statusFilter === 'completed' && !item.isCompleted && item.status !== 'completed') return false;
          if (timelineState.statusFilter === 'today' && item.status !== 'today') return false;
          if (timelineState.statusFilter === 'upcoming' && item.status !== 'upcoming') return false;
        }

        if (timelineState.langFilter !== 'all' && item.lang !== timelineState.langFilter) {
          return false;
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

    function renderTimeline() {
      const data = getFilteredTimelineData();

      // Update counters
      const total = RAW_CALENDAR_DATA.length;
      const completed = RAW_CALENDAR_DATA.filter(s => s.status === 'completed' || s.isCompleted).length;
      const todayCount = RAW_CALENDAR_DATA.filter(s => s.status === 'today').length;
      const upcoming = RAW_CALENDAR_DATA.filter(s => s.status === 'upcoming').length;
      const progress = ((completed / total) * 100).toFixed(1);

      const elTotal = document.getElementById('kpiCalTotal');
      if (elTotal) elTotal.textContent = total;

      const elCompleted = document.getElementById('kpiCalCompleted');
      if (elCompleted) elCompleted.textContent = completed;

      const elToday = document.getElementById('kpiCalToday');
      if (elToday) elToday.textContent = todayCount;

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

      const elTabBadge = document.getElementById('tabTimelineBadge');
      if (elTabBadge) elTabBadge.textContent = completed + '/' + total + ' (' + progress + '%)';

      const visibleEl = document.getElementById('timelineVisibleCount');
      if (visibleEl) visibleEl.textContent = data.length;

      const totalEl = document.getElementById('timelineTotalCount');
      if (totalEl) totalEl.textContent = total;

      const noticeEl = document.getElementById('timelineFilterNotice');
      if (noticeEl) {
        const isFiltered = timelineState.statusFilter !== 'all' || timelineState.langFilter !== 'all' || timelineState.searchQuery;
        noticeEl.textContent = isFiltered ? '(Filters Active)' : '';
      }

      // Group slots by date for Flow View
      const groups = new Map();
      data.forEach(slot => {
        const key = slot.date;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(slot);
      });

      let flowHtml = '';
      if (groups.size === 0) {
        flowHtml = '<div style="text-align: center; padding: 2.5rem; color: var(--text-dim); font-size: 0.85rem;">No scheduled broadcasts match your filter.</div>';
      } else {
        for (const [dateStr, slots] of groups) {
          const isToday = slots.some(s => s.status === 'today');
          const dayName = slots[0]?.dayName || '';

          flowHtml += \`
            <div class="timeline-day-group">
              <div class="timeline-day-header \${isToday ? 'today' : ''}">
                <span>📅 \${dayName}, \${formatDate(dateStr)}</span>
                \${isToday ? '<span class="day-today-tag">🔥 Hari Ini / Today</span>' : ''}
                <span style="font-size: 0.7rem; color: var(--text-dim); margin-left: auto;">\${slots.length} Broadcast\${slots.length > 1 ? 's' : ''}</span>
              </div>
              <div class="timeline-slots-grid">
                \${slots.map(renderSlotCard).join('')}
              </div>
            </div>
          \`;
        }
      }
      document.getElementById('timelineFlowContainer').innerHTML = flowHtml;

      // Render Schedule Table View
      const rowsHtml = data.map(renderSlotTableRow).join('');
      document.getElementById('timelineTableBody').innerHTML = rowsHtml || '<tr><td colspan="10" style="text-align: center; padding: 1.5rem; color: var(--text-dim); font-size: 0.85rem;">No scheduled broadcasts match your filter.</td></tr>';
    }

    function renderSlotCard(slot) {
      const isToday = slot.status === 'today';
      const isCompleted = slot.status === 'completed' || slot.isCompleted;

      const statusClass = isToday ? 'today' : isCompleted ? 'completed' : 'upcoming';
      const statusText = isToday ? '🔥 Today' : isCompleted ? '✅ Completed' : '⏳ Scheduled';

      return \`
        <div class="slot-card \${isToday ? 'today-card' : ''}">
          <div class="slot-top">
            <span class="slot-time-badge">⏰ \${slot.timeSlot}</span>
            <span class="slot-status-pill \${statusClass}">\${statusText}</span>
          </div>

          <div class="slot-title">\${slot.storyTitleId}</div>
          <div class="slot-type-label">\${slot.slotType}</div>

          <div class="slot-badges">
            <span class="lang-badge" style="background: var(--bg-tertiary); font-size: 0.65rem;">\${slot.lang.toUpperCase()}</span>
            <span class="format-badge" style="font-size: 0.65rem;">\${slot.format}</span>
          </div>

          <div class="slot-theme-box">
            "\${slot.theme}"
          </div>

          \${slot.hasPublishedAsset ? \`
            <button class="slot-action-btn active-btn" onclick="filterCatalogByStory('\${slot.bookSlug}')">
              📚 View Published Assets ↗
            </button>
          \` : isToday ? \`
            <div style="font-size: 0.72rem; color: #f59e0b; font-weight: 700; text-align: center; padding: 0.2rem;">
              ⚡ Scheduled for Prime Bedtime Broadcast Today
            </div>
          \` : \`
            <div style="font-size: 0.72rem; color: var(--text-dim); text-align: center; padding: 0.2rem;">
              ⏳ In Production Queue
            </div>
          \`}
        </div>
      \`;
    }

    function renderSlotTableRow(slot) {
      const isToday = slot.status === 'today';
      const isCompleted = slot.status === 'completed' || slot.isCompleted;
      const statusClass = isToday ? 'today' : isCompleted ? 'completed' : 'upcoming';
      const statusText = isToday ? 'Today' : isCompleted ? 'Done' : 'Upcoming';

      return \`
        <tr>
          <td style="white-space: nowrap; font-weight: 700;">\${formatDate(slot.date)}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;">\${slot.timeSlot}</td>
          <td>\${slot.dayName}</td>
          <td><span class="slot-status-pill \${statusClass}">\${statusText}</span></td>
          <td><strong>\${slot.storyTitleId}</strong></td>
          <td><span class="lang-badge">\${slot.lang.toUpperCase()}</span></td>
          <td><span class="format-badge">\${slot.format.split(' ')[0]}</span></td>
          <td style="font-size: 0.74rem;">\${slot.slotType}</td>
          <td style="font-size: 0.72rem; color: var(--text-dim);">\${(slot.targetPlatforms || []).join(', ')}</td>
          <td style="font-size: 0.72rem; max-width: 260px; font-style: italic;">\${slot.theme}</td>
        </tr>
      \`;
    }

    // Modal Video Player
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
    renderTimeline();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(docsDir, "index.html"), indexHtmlContent);
console.log(`Successfully generated docs/index.html with ${auditRecords.length} records and ${calendarSlots.length} timeline slots!`);
