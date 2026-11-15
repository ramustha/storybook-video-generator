import fs from "fs";
import path from "path";
import { CATALOG_PORTAL_BASE } from "./seo-formatter";

export interface StoryPageAuditRecord {
  id: string;
  storySlug: string;
  storyTitleId: string;
  storyTitleEn: string;
  category: string;
  platform: string;
  language: "id" | "en";
  format: string;
  aspectRatio: "16:9" | "9:16";
  videoTitle: string;
  videoId: string;
  videoUrl: string;
  publishedAt: string;
  thumbnailUrl?: string;
  author?: string;
  illustrator?: string;
  license?: string;
  sourceUrl?: string;
}

export interface StoryPageCalendarSlot {
  bookSlug: string;
  storyTitleId?: string;
  storyTitleEn?: string;
  date?: string;
}

interface StoryLangMedia {
  youtubeLandscapeId?: string;
  youtubeLandscapeUrl?: string;
  youtubeShortsId?: string;
  youtubeShortsUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
}

interface StoryLandingData {
  slug: string;
  titleId: string;
  titleEn: string;
  hookId?: string;
  hookEn?: string;
  moralId?: string;
  moralEn?: string;
  author: string;
  illustrator: string;
  license: string;
  sourceUrl: string;
  ogImage: string;
  latestPublishedAt: string;
  media: {
    id: StoryLangMedia;
    en: StoryLangMedia;
  };
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readLocalStoryManifest(storiesDir: string, slug: string): any | null {
  const jsonPath = path.join(storiesDir, slug, "story.json");
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } catch {
    return null;
  }
}

function mergeStoryLangMedia(target: StoryLangMedia, rec: StoryPageAuditRecord): void {
  const isLandscape = rec.aspectRatio === "16:9" || rec.format.toLowerCase().includes("landscape");
  if (rec.platform === "YouTube") {
    if (isLandscape && !target.youtubeLandscapeId) {
      target.youtubeLandscapeId = rec.videoId;
      target.youtubeLandscapeUrl = rec.videoUrl;
    } else if (!isLandscape && !target.youtubeShortsId) {
      target.youtubeShortsId = rec.videoId;
      target.youtubeShortsUrl = rec.videoUrl;
    }
  } else if (rec.platform === "Facebook" && !target.facebookUrl) {
    target.facebookUrl = rec.videoUrl;
  } else if (rec.platform === "Instagram" && !target.instagramUrl) {
    target.instagramUrl = rec.videoUrl;
  }
}

function pickPrimaryEmbed(data: StoryLandingData): {
  defaultLang: "id" | "en";
  idEmbedId?: string;
  enEmbedId?: string;
  primaryWatchUrl: string;
} {
  const idEmbedId = data.media.id.youtubeLandscapeId || data.media.id.youtubeShortsId;
  const enEmbedId = data.media.en.youtubeLandscapeId || data.media.en.youtubeShortsId;
  const defaultLang: "id" | "en" = idEmbedId ? "id" : "en";
  const primaryWatchUrl =
    data.media.id.youtubeLandscapeUrl ||
    data.media.en.youtubeLandscapeUrl ||
    data.media.id.youtubeShortsUrl ||
    data.media.en.youtubeShortsUrl ||
    `${CATALOG_PORTAL_BASE}/s/${encodeURIComponent(data.slug)}`;
  return { defaultLang, idEmbedId, enEmbedId, primaryWatchUrl };
}

function renderStoryHtml(data: StoryLandingData, relatedStories: StoryLandingData[]): string {
  const canonicalUrl = `${CATALOG_PORTAL_BASE}/s/${encodeURIComponent(data.slug)}`;
  const embedInfo = pickPrimaryEmbed(data);
  const initialVideoId = embedInfo.defaultLang === "id" ? embedInfo.idEmbedId : embedInfo.enEmbedId;

  const displayTitle = data.titleId && data.titleEn && data.titleId !== data.titleEn
    ? `${data.titleId} (${data.titleEn})`
    : data.titleId || data.titleEn || data.slug;
  const pageTitle = `${displayTitle} — Zayn Storybook`;
  const description = [
    data.moralId || `Dongeng anak bergambar bilingual: ${data.titleId}.`,
    data.moralEn || `Bilingual children's animated storybook: ${data.titleEn}.`,
    "Watch free ad-safe family bedtime stories on Zayn Storybook.",
  ].join(" ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: displayTitle,
    description,
    thumbnailUrl: [data.ogImage],
    uploadDate: data.latestPublishedAt || new Date().toISOString(),
    embedUrl: initialVideoId ? `https://www.youtube.com/embed/${initialVideoId}` : canonicalUrl,
    contentUrl: embedInfo.primaryWatchUrl,
    inLanguage: [
      ...(embedInfo.idEmbedId ? ["id"] : []),
      ...(embedInfo.enEmbedId ? ["en"] : []),
    ],
    publisher: {
      "@type": "Organization",
      name: "Zayn Storybook",
      url: CATALOG_PORTAL_BASE,
    },
  };

  const linkPills: Array<{ label: string; url: string; cls: string }> = [];
  if (data.media.id.youtubeLandscapeUrl) {
    linkPills.push({ label: "▶ YouTube Full (ID)", url: data.media.id.youtubeLandscapeUrl, cls: "pill-yt" });
  }
  if (data.media.en.youtubeLandscapeUrl) {
    linkPills.push({ label: "▶ YouTube Full (EN)", url: data.media.en.youtubeLandscapeUrl, cls: "pill-yt" });
  }
  if (data.media.id.youtubeShortsUrl) {
    linkPills.push({ label: "⚡ Shorts (ID)", url: data.media.id.youtubeShortsUrl, cls: "pill-sec" });
  }
  if (data.media.en.youtubeShortsUrl) {
    linkPills.push({ label: "⚡ Shorts (EN)", url: data.media.en.youtubeShortsUrl, cls: "pill-sec" });
  }
  const fbUrl = data.media.id.facebookUrl || data.media.en.facebookUrl;
  const igUrl = data.media.id.instagramUrl || data.media.en.instagramUrl;
  if (fbUrl) linkPills.push({ label: "📘 Facebook", url: fbUrl, cls: "pill-sec" });
  if (igUrl) linkPills.push({ label: "📸 Instagram", url: igUrl, cls: "pill-sec" });

  const relatedHtml = relatedStories
    .map(
      (rel) => `
      <a class="related-card" href="${CATALOG_PORTAL_BASE}/s/${encodeURIComponent(rel.slug)}">
        <img src="${escapeHtml(rel.ogImage)}" alt="${escapeHtml(rel.titleId)}" loading="lazy">
        <div class="related-meta">
          <div class="related-title">${escapeHtml(rel.titleId)}</div>
          <div class="related-sub">${escapeHtml(rel.titleEn)}</div>
        </div>
      </a>`
    )
    .join("\n");

  const hasBothLangs = Boolean(embedInfo.idEmbedId && embedInfo.enEmbedId);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="Zayn Storybook">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(data.ogImage)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(data.ogImage)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { --bg:#0f172a; --card:#1e293b; --muted:#94a3b8; --text:#f8fafc; --accent:#f59e0b; --border:#334155; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:'Plus Jakarta Sans',system-ui,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }
    .wrap { max-width:960px; margin:0 auto; padding:24px 16px 56px; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
    .brand { color:var(--accent); font-weight:800; text-decoration:none; font-size:1.05rem; }
    .back-link { color:var(--text); text-decoration:none; border:1px solid var(--border); padding:8px 14px; border-radius:999px; font-size:0.875rem; font-weight:600; }
    .back-link:hover { border-color:var(--accent); color:var(--accent); }
    .hero { background:var(--card); border:1px solid var(--border); border-radius:20px; padding:20px; }
    h1 { margin:0 0 4px; font-size:clamp(1.5rem,3vw,2.1rem); line-height:1.25; }
    .subtitle { color:var(--muted); margin:0 0 16px; font-size:1rem; }
    .lang-tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
    .lang-btn { cursor:pointer; border:1px solid var(--border); background:#0f172a; color:var(--text); padding:7px 14px; border-radius:999px; font-weight:600; font-size:0.85rem; }
    .lang-btn.active { background:var(--accent); color:#0f172a; border-color:var(--accent); }
    .player { position:relative; width:100%; aspect-ratio:16/9; border-radius:14px; overflow:hidden; background:#020617; border:1px solid var(--border); }
    .player iframe, .player img { width:100%; height:100%; border:0; object-fit:cover; display:block; }
    .pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    .pill { display:inline-flex; align-items:center; gap:6px; padding:9px 15px; border-radius:999px; text-decoration:none; font-weight:700; font-size:0.875rem; }
    .pill-yt { background:#ef4444; color:#fff; }
    .pill-sec { background:#0f172a; color:var(--text); border:1px solid var(--border); }
    .pill-sec:hover { border-color:var(--accent); }
    .details { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:18px; }
    .box { background:#0f172a; border:1px solid var(--border); border-radius:14px; padding:14px 16px; }
    .box-label { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent); font-weight:700; margin-bottom:6px; }
    .credits { margin-top:14px; color:var(--muted); font-size:0.85rem; }
    .credits a { color:#cbd5e1; }
    .related-sec { margin-top:34px; }
    .related-sec h2 { font-size:1.25rem; margin:0 0 14px; }
    .related-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; }
    .related-card { display:block; text-decoration:none; color:var(--text); background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; transition:transform 0.15s ease,border-color 0.15s ease; }
    .related-card:hover { transform:translateY(-2px); border-color:var(--accent); }
    .related-card img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
    .related-meta { padding:12px; }
    .related-title { font-weight:700; font-size:0.95rem; }
    .related-sub { color:var(--muted); font-size:0.82rem; margin-top:2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <a class="brand" href="${CATALOG_PORTAL_BASE}/">✨ Zayn Storybook</a>
      <a class="back-link" href="${CATALOG_PORTAL_BASE}/">← Lihat Semua Dongeng / Full Catalog</a>
    </div>

    <div class="hero">
      <h1>${escapeHtml(data.titleId)}</h1>
      ${data.titleEn && data.titleEn !== data.titleId ? `<p class="subtitle">English Edition: <strong>${escapeHtml(data.titleEn)}</strong></p>` : ""}

      ${
        hasBothLangs
          ? `<div class="lang-tabs">
        <button class="lang-btn ${embedInfo.defaultLang === "id" ? "active" : ""}" onclick="switchLang('id', '${escapeHtml(embedInfo.idEmbedId!)}', this)">🇮🇩 Bahasa Indonesia</button>
        <button class="lang-btn ${embedInfo.defaultLang === "en" ? "active" : ""}" onclick="switchLang('en', '${escapeHtml(embedInfo.enEmbedId!)}', this)">🇬🇧 English</button>
      </div>`
          : ""
      }

      <div class="player">
        ${
          initialVideoId
            ? `<iframe id="story-player" src="https://www.youtube.com/embed/${escapeHtml(initialVideoId)}?rel=0" title="${escapeHtml(displayTitle)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
            : `<img src="${escapeHtml(data.ogImage)}" alt="${escapeHtml(displayTitle)}">`
        }
      </div>

      ${
        linkPills.length > 0
          ? `<div class="pills">${linkPills
              .map((p) => `<a class="pill ${p.cls}" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.label)}</a>`)
              .join("")}</div>`
          : ""
      }

      <div class="details">
        <div class="box">
          <div class="box-label">🇮🇩 Pesan Moral &amp; Ringkasan</div>
          <div>${escapeHtml(data.moralId || `Dongeng hangat ${data.titleId} untuk menemani waktu bermain dan tidur anak.`)}</div>
        </div>
        <div class="box">
          <div class="box-label">🇬🇧 Story Moral &amp; Summary</div>
          <div>${escapeHtml(data.moralEn || `A gentle bilingual family story: ${data.titleEn || data.titleId}.`)}</div>
        </div>
      </div>

      <div class="credits">
        ✍️ Story: ${escapeHtml(data.author)} · 🎨 Art: ${escapeHtml(data.illustrator)} · 📄 License: ${escapeHtml(data.license)}
        ${data.sourceUrl ? ` · <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener">Original Source</a>` : ""}
      </div>
    </div>

    ${
      relatedStories.length > 0
        ? `<section class="related-sec">
      <h2>🌙 Cerita Pilihan Lainnya / Watch Next</h2>
      <div class="related-grid">
        ${relatedHtml}
      </div>
    </section>`
        : ""
    }
  </div>

  <script>
    function switchLang(lang, videoId, btn) {
      var frame = document.getElementById('story-player');
      if (frame && videoId) {
        frame.src = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?rel=0';
      }
      document.querySelectorAll('.lang-btn').forEach(function(b) { b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
    }
  </script>
</body>
</html>
`;
}

/**
 * Generates static SEO & OpenGraph deep-link pages (`docs/s/<slug>/index.html`) and `docs/sitemap.xml`.
 */
export function generateStoryLandingPages(options: {
  docsDir: string;
  storiesDir: string;
  auditRecords: StoryPageAuditRecord[];
  storyTitlesMap: Map<string, { id: string; en: string }>;
}): { storyCount: number; sitemapPath: string } {
  const { docsDir, storiesDir, auditRecords, storyTitlesMap } = options;
  const storiesMap = new Map<string, StoryLandingData>();

  const ensureEntry = (slug: string): StoryLandingData => {
    let entry = storiesMap.get(slug);
    if (!entry) {
      const titles = storyTitlesMap.get(slug);
      const manifest = readLocalStoryManifest(storiesDir, slug);
      entry = {
        slug,
        titleId: titles?.id || manifest?.title?.id || manifest?.title || slug,
        titleEn: titles?.en || manifest?.originalTitle || titles?.id || slug,
        hookId: manifest?.thumbnailConfig?.id?.hook,
        hookEn: manifest?.thumbnailConfig?.en?.hook,
        moralId: manifest?.moral?.headlineId,
        moralEn: manifest?.moral?.headlineEn,
        author: manifest?.source?.originalAuthor || "Pratham Books Community",
        illustrator: manifest?.source?.originalIllustrator || "Various Illustrators",
        license: manifest?.source?.license || "CC BY 4.0",
        sourceUrl: manifest?.source?.url || "",
        ogImage: `${CATALOG_PORTAL_BASE}/branding/cover-facebook-1640x924.png`,
        latestPublishedAt: "",
        media: { id: {}, en: {} },
      };
      storiesMap.set(slug, entry);
    }
    return entry;
  };

  for (const slug of storyTitlesMap.keys()) {
    if (!slug.startsWith("kompilasi-")) {
      ensureEntry(slug);
    }
  }

  for (const rec of auditRecords) {
    if (!rec.storySlug || rec.storySlug.startsWith("kompilasi-")) continue;
    const entry = ensureEntry(rec.storySlug);
    if (rec.storyTitleId) entry.titleId = rec.storyTitleId;
    if (rec.storyTitleEn) entry.titleEn = rec.storyTitleEn;
    if (rec.author) entry.author = rec.author;
    if (rec.illustrator) entry.illustrator = rec.illustrator;
    if (rec.license) entry.license = rec.license;
    if (rec.sourceUrl) entry.sourceUrl = rec.sourceUrl;
    if (rec.publishedAt && rec.publishedAt > entry.latestPublishedAt) {
      entry.latestPublishedAt = rec.publishedAt;
    }

    const langBucket = rec.language === "en" ? entry.media.en : entry.media.id;
    mergeStoryLangMedia(langBucket, rec);
  }

  for (const entry of storiesMap.values()) {
    const heroYtId =
      entry.media.id.youtubeLandscapeId ||
      entry.media.en.youtubeLandscapeId ||
      entry.media.id.youtubeShortsId ||
      entry.media.en.youtubeShortsId;
    if (heroYtId) {
      entry.ogImage = `https://img.youtube.com/vi/${heroYtId}/hqdefault.jpg`;
    }
  }

  const allEntries = Array.from(storiesMap.values()).sort((a, b) =>
    (b.latestPublishedAt || "").localeCompare(a.latestPublishedAt || "") || a.slug.localeCompare(b.slug)
  );
  const publishedEntries = allEntries.filter(
    (e) => e.media.id.youtubeLandscapeId || e.media.en.youtubeLandscapeId || e.media.id.youtubeShortsId || e.media.en.youtubeShortsId
  );
  const fallbackPool = publishedEntries.length > 0 ? publishedEntries : allEntries;

  const sRoot = path.join(docsDir, "s");
  fs.mkdirSync(sRoot, { recursive: true });

  for (const entry of allEntries) {
    const related = fallbackPool.filter((other) => other.slug !== entry.slug).slice(0, 3);
    const outDir = path.join(sRoot, entry.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), renderStoryHtml(entry, related), "utf-8");
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const urlNodes = [
    `  <url>\n    <loc>${CATALOG_PORTAL_BASE}/</loc>\n    <lastmod>${todayIso}</lastmod>\n    <priority>1.0</priority>\n  </url>`,
    ...allEntries.map((entry) => {
      const lastmod = entry.latestPublishedAt ? entry.latestPublishedAt.slice(0, 10) : todayIso;
      return `  <url>\n    <loc>${CATALOG_PORTAL_BASE}/s/${encodeURIComponent(entry.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`;
    }),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes.join("\n")}\n</urlset>\n`;
  const sitemapPath = path.join(docsDir, "sitemap.xml");
  fs.writeFileSync(sitemapPath, sitemapXml, "utf-8");

  console.log(`Generated ${allEntries.length} story SEO landing pages under ${sRoot} and sitemap.xml`);
  return { storyCount: allEntries.length, sitemapPath };
}
