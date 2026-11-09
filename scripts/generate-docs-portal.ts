import fs from "fs";
import path from "path";

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

const workspaceRoot = path.resolve(__dirname, "..");
const storiesDir = path.join(workspaceRoot, "stories");
const docsDir = path.join(workspaceRoot, "docs");

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const stories = fs.readdirSync(storiesDir).filter((f) => {
  try {
    const stat = fs.statSync(path.join(storiesDir, f));
    return stat.isDirectory() && fs.existsSync(path.join(storiesDir, f, "story.json"));
  } catch {
    return false;
  }
}).sort();

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

  // 1. YouTube Publications
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

  // 2. Facebook Publications
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

  // 3. Instagram Publications
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

// 4. Compilation Marathons
const compPath = path.join(workspaceRoot, "exports/compilations/publication-status.json");
if (fs.existsSync(compPath)) {
  const comps = JSON.parse(fs.readFileSync(compPath, "utf-8"));
  for (const [key, comp] of Object.entries(comps) as [string, any][]) {
    const lang: "id" | "en" = key.includes("-en") ? "en" : "id";
    const title = comp.title;

    // Facebook Marathon
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

    // YouTube Marathon
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

// Write audit-data.json
const auditJsonPath = path.join(docsDir, "audit-data.json");
fs.writeFileSync(auditJsonPath, JSON.stringify(auditRecords, null, 2));
console.log(`Saved ${auditRecords.length} audit records to ${auditJsonPath}`);

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

// Generate docs/index.html
const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zayn Storybook — Multi-Platform Publication & Compliance Audit Catalog</title>
  <meta name="description" content="Comprehensive audit directory, live catalog, and licensing tracker of all published storybook videos across YouTube, Facebook, and Instagram by Zayn Storybook.">
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
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.65rem;
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
      margin-top: 0.5rem;
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

    /* Filter dropdowns */
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
            <h1>Zayn Storybook Catalog & Audit</h1>
            <p>Official Multi-Platform Publication Registry & Creative Commons Compliance Tracker</p>
          </div>
        </div>
        <div class="header-actions">
          <span class="status-badge status-live" id="d1-status-pill" onclick="syncCatalog(true)" title="Click to refresh data from Cloudflare D1">
            <span class="status-dot"></span>
            <span id="d1StatusText">⚡ Cloudflare D1</span>
          </span>
          <button class="btn-action" id="themeToggleBtn" onclick="toggleTheme()" title="Switch Light/Dark mode">🌓 Theme</button>
          <button class="btn-action" onclick="exportToCsv()" title="Download complete audit catalog in CSV format">📥 CSV</button>
          <button class="btn-action btn-accent" onclick="exportToJson()" title="Download structured JSON audit dataset">📋 JSON</button>
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
    // Embedded Complete Audit Dataset
    let RAW_AUDIT_DATA = ${JSON.stringify(auditRecords)};

    let state = {
      searchQuery: '',
      platformFilter: 'all',
      langFilter: 'all',
      storyFilter: 'all',
      viewMode: 'card'
    };

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
    // Tier 1: /api/catalog (Cloudflare D1 live database)
    // Tier 2: ./audit-data.json (GitHub Pages / static preview fallback)
    // Tier 3: embedded RAW_AUDIT_DATA (Guaranteed bundle snapshot)
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
            populateStoryDropdown();
            renderKPIs();
            render();
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
        console.warn('/api/catalog not reachable, checking static audit-data.json fallback...', err);
      }

      // 2. Try static audit-data.json (GitHub Pages / local preview fallback)
      try {
        const res = await fetch('./audit-data.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log('📁 Static audit-data.json loaded:', data.length, 'records');
            RAW_AUDIT_DATA = data;
            populateStoryDropdown();
            renderKPIs();
            render();
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

    // Initialize Theme
    const savedTheme = localStorage.getItem('zayn_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

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
        // Platform filter
        if (state.platformFilter !== 'all' && item.platform !== state.platformFilter) {
          return false;
        }

        // Language filter
        if (state.langFilter !== 'all' && item.language !== state.langFilter) {
          return false;
        }

        // Story filter
        if (state.storyFilter !== 'all') {
          if (state.storyFilter === 'compilation') {
            if (item.category !== 'Compilation Marathon') return false;
          } else if (item.storySlug !== state.storyFilter) {
            return false;
          }
        }

        // Search query
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

      // Notice when filters active
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

    // CSV Export for Compliance Audit
    function exportToCsv() {
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
      link.setAttribute('download', 'zayn-storybook-multi-platform-audit-catalog.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported CSV audit file!');
    }

    function exportToJson() {
      const jsonContent = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(RAW_AUDIT_DATA, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', jsonContent);
      link.setAttribute('download', 'zayn-storybook-audit-records.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported JSON audit records!');
    }

    // Initial render
    populateStoryDropdown();
    renderKPIs();
    render();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(docsDir, "index.html"), indexHtmlContent);
console.log(`Successfully generated docs/index.html with ${auditRecords.length} records!`);
