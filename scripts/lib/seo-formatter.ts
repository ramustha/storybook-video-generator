import fs from "fs";
import path from "path";

/**
 * SEO Metadata Formatter & Generator for Zayn Storybook
 * Generates search-optimized Titles, Descriptions (200+ words), and Tags
 * tailored for high CTR and discovery in Indonesian & English children's storybook niches.
 */

export const CATALOG_PORTAL_BASE = "https://storybook-catalog.pages.dev";

export interface RelatedVideoLink {
  title: string;
  url: string;
}

export interface SeoMetadataOptions {
  bookSlug: string;
  title: string;
  originalTitle?: string;
  lang: "id" | "en";
  format: "landscape" | "vertical";
  author?: string;
  illustrator?: string;
  moralHeadline?: string;
  moralDescription?: string;
  chapters?: string; // Timestamps list
  license?: string;
  publisher?: string;
  portalUrl?: string;
  fullEpisodeUrl?: string;
  playlistUrl?: string;
  relatedVideos?: RelatedVideoLink[];
}

/**
 * Builds canonical deep-link URL for a story landing page on the Cloudflare Pages portal.
 */
export function buildStoryPortalUrl(
  bookSlug: string,
  utm?: { source?: string; medium?: string; campaign?: string }
): string {
  const base = `${CATALOG_PORTAL_BASE}/s/${encodeURIComponent(bookSlug)}`;
  if (!utm) return base;
  const params = new URLSearchParams();
  if (utm.source) params.set("utm_source", utm.source);
  if (utm.medium) params.set("utm_medium", utm.medium);
  if (utm.campaign) params.set("utm_campaign", utm.campaign);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Resolves up to `limit` published YouTube videos from docs/audit-data.json excluding `excludeSlug`.
 */
export function resolveRelatedPublishedVideos(
  excludeSlug: string,
  lang: "id" | "en",
  limit: number = 2
): RelatedVideoLink[] {
  const auditPath = path.resolve("./docs/audit-data.json");
  if (!fs.existsSync(auditPath)) return [];
  try {
    const records = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
    if (!Array.isArray(records)) return [];
    const seen = new Set<string>([excludeSlug]);
    const candidates = records
      .filter(
        (r: any) =>
          r?.platform === "YouTube" &&
          r?.format === "Landscape (16:9)" &&
          r?.language === lang &&
          r?.videoUrl &&
          r?.storySlug &&
          !seen.has(r.storySlug)
      )
      .sort((a: any, b: any) => {
        const tB = new Date(b.publishedAt || 0).getTime();
        const tA = new Date(a.publishedAt || 0).getTime();
        return tB - tA;
      });

    const out: RelatedVideoLink[] = [];
    for (const c of candidates) {
      if (seen.has(c.storySlug)) continue;
      seen.add(c.storySlug);
      const title =
        lang === "en" ? c.storyTitleEn || c.storyTitleId || c.storySlug : c.storyTitleId || c.storySlug;
      out.push({ title, url: c.videoUrl });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export interface SeoMetadataResult {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
}

export function sanitizeTitle(rawTitle: string, maxLen = 95): string {
  const sanitized = rawTitle
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized.length <= maxLen) return sanitized;
  return sanitized.slice(0, maxLen - 1).trim() + "…";
}

export function extractStoryMoral(story: any, lang: "id" | "en"): string {
  const isEn = lang === "en";
  if (isEn) {
    if (story?.moral?.headlineEn) return story.moral.headlineEn;
    const moralScene = story?.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.en?.text) {
      const cleaned = moralScene.audio.en.text.replace(/^The moral of the story:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") || cleaned.endsWith(".") ? cleaned : `${cleaned}!`;
    }
    return "Always be kind, honest, and thoughtful!";
  } else {
    if (story?.moral?.headlineId) return story.moral.headlineId;
    const moralScene = story?.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.text) {
      const cleaned = moralScene.audio.text.replace(/^Pesan moral cerita ini:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") || cleaned.endsWith(".") ? cleaned : `${cleaned}!`;
    }
    return "Belajar hal baik, berbuat jujur, dan saling menyayangi setiap hari!";
  }
}

export function extractStoryMoralDescription(story: any, lang: "id" | "en"): string | undefined {
  const isEn = lang === "en";
  if (isEn) {
    if (story?.moral?.summaryEn) return story.moral.summaryEn;
    const moralScene = story?.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.en?.text) {
      const parts = moralScene.audio.en.text.replace(/^The moral of the story:\s*/i, "").split(".");
      if (parts.length > 1) {
        const desc = parts.slice(1).join(".").trim();
        if (desc) return desc;
      }
    }
    return undefined;
  } else {
    if (story?.moral?.summaryId) return story.moral.summaryId;
    const moralScene = story?.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.text) {
      const parts = moralScene.audio.text.replace(/^Pesan moral cerita ini:\s*/i, "").split(".");
      if (parts.length > 1) {
        const desc = parts.slice(1).join(".").trim();
        if (desc) return desc;
      }
    }
    return undefined;
  }
}

/**
 * Builds high-intent, search-optimized title, description, and tags for YouTube & Meta.
 */
export function generateSeoMetadata(options: SeoMetadataOptions): SeoMetadataResult {
  const isEn = options.lang === "en";
  const isVertical = options.format === "vertical";
  const displayTitle = isEn ? options.originalTitle || options.title : options.title;

  // 1. High-Search-Intent Title Construction (Target <= 95 chars)
  let title = "";
  if (isVertical) {
    if (isEn) {
      title = sanitizeTitle(`Bedtime Story: ${displayTitle}! 📖✨ #Shorts #KidsStories`, 95);
    } else {
      title = sanitizeTitle(`Dongeng Anak Sebelum Tidur: ${displayTitle}! 🌙📖 #Shorts #DongengAnak`, 95);
    }
  } else {
    // Landscape 16:9 Long-form
    if (isEn) {
      title = sanitizeTitle(`Bedtime Story: ${displayTitle} | Animated Read-Aloud Picture Book 🌙✨`, 95);
    } else {
      title = sanitizeTitle(`Dongeng Anak Sebelum Tidur: ${displayTitle} | Cerita Bergambar Penuh Pesan Moral 🌙✨`, 95);
    }
  }

  // 2. High-Density SEO Description (200-300+ words)
  const author = options.author || (isEn ? "Children's Book Author" : "Penulis Buku Cerita Anak");
  const illustrator = options.illustrator || (isEn ? "Book Illustrator" : "Ilustrator Cerita");
  const license = options.license || "Creative Commons Attribution 4.0 (CC BY 4.0)";
  const publisher = options.publisher || (isEn ? "StoryWeaver / Open License Catalog" : "StoryWeaver / Pratham Books");
  const moral = options.moralHeadline || (isEn ? "Always be kind, honest, and thoughtful!" : "Belajar hal baik, berbuat jujur, dan saling menyayangi setiap hari!");

  const descLines: string[] = [];

  const portalUrl =
    options.portalUrl ||
    (!options.bookSlug.startsWith("kompilasi-") && !options.bookSlug.startsWith("bedtime-")
      ? buildStoryPortalUrl(options.bookSlug, { source: "youtube", medium: "description" })
      : CATALOG_PORTAL_BASE);
  const relatedVideos =
    options.relatedVideos ?? resolveRelatedPublishedVideos(options.bookSlug, options.lang, 2);

  if (isEn) {
    descLines.push(`🌙 Welcome to Zayn Storybook! Tonight's featured animated bedtime story is "${displayTitle}".`);
    if (isVertical && options.fullEpisodeUrl) {
      descLines.push(`▶️ WATCH FULL STORY (16:9 HD): ${options.fullEpisodeUrl}`);
    }
    if (options.playlistUrl) {
      descLines.push(`📚 BINGE BEDTIME PLAYLIST: ${options.playlistUrl}`);
    }
    descLines.push(`🔔 Subscribe for free bedtime stories: https://youtube.com/@zayn.storybook?sub_confirmation=1`);
    descLines.push(`A heartwarming and soothing animated read-aloud picture book designed to help toddlers, preschoolers, and early readers unwind and prepare for a restful night of sleep.`);
    descLines.push(``);
    descLines.push(`💡 MORAL LESSON / VALUE:`);
    descLines.push(`"${moral}"`);
    if (options.moralDescription) {
      descLines.push(`${options.moralDescription}`);
    }
    descLines.push(``);
    descLines.push(`🌐 BILINGUAL EDITION & FULL STORY ARCHIVE:`);
    descLines.push(`👉 Read & watch Indonesian/English versions: ${portalUrl}`);
    if (relatedVideos.length > 0) {
      descLines.push(``);
      descLines.push(`📺 WATCH MORE FAVORITE BEDTIME STORIES:`);
      relatedVideos.forEach((rv) => {
        descLines.push(`• ${rv.title}: ${rv.url}`);
      });
    }
    descLines.push(``);
    if (!isVertical && options.chapters) {
      descLines.push(`⏱️ STORY CHAPTERS & TIMESTAMPS:`);
      descLines.push(options.chapters);
      descLines.push(``);
      descLines.push(`---`);
      descLines.push(``);
    }
    descLines.push(`🔔 SUBSCRIBE TO OUR CHANNEL:`);
    descLines.push(`If your child enjoyed this bedtime story, please LIKE, COMMENT, and SUBSCRIBE to @zayn.storybook for more relaxing animated bedtime stories every week!`);
    descLines.push(`👉 Subscribe link: https://youtube.com/@zayn.storybook?sub_confirmation=1`);
    descLines.push(``);
    descLines.push(`📖 ABOUT THIS BOOK & ATTRIBUTION:`);
    descLines.push(`• Story: ${displayTitle}`);
    descLines.push(`• Written by: ${author}`);
    descLines.push(`• Illustrated by: ${illustrator}`);
    descLines.push(`• Published under: ${license}`);
    descLines.push(`• Source & Credits: ${publisher}`);
    descLines.push(``);
    descLines.push(`Special thanks to open-license children's literature initiatives for making quality educational stories accessible to children worldwide.`);
    descLines.push(``);
    descLines.push(`#BedtimeStories #KidsStories #ReadAloud #AnimatedStorybook #ChildrensBooks #KidsAnimation #StorytimeForKids #ZaynStorybook${isVertical ? " #Shorts" : ""}`);
  } else {
    // Indonesian
    descLines.push(`🌙 Selamat datang di Zayn Storybook! Malam ini kita akan mendengarkan dongeng anak sebelum tidur yang seru dan mendidik berjudul "${displayTitle}".`);
    if (isVertical && options.fullEpisodeUrl) {
      descLines.push(`▶️ TONTON VERSI LENGKAP (16:9 HD): ${options.fullEpisodeUrl}`);
    }
    if (options.playlistUrl) {
      descLines.push(`📚 PUTAR MARATON DONGENG NON-STOP: ${options.playlistUrl}`);
    }
    descLines.push(`🔔 Subscribe Gratis untuk dongeng baru setiap hari: https://youtube.com/@zayn.storybook?sub_confirmation=1`);
    descLines.push(`Cerita bergambar anak animasi yang hangat dan menenangkan, sangat cocok didengarkan bersama si kecil sebelum tidur malam, saat bersantai di rumah, atau sebagai media belajar membaca dan mengasah imajinasi.`);
    descLines.push(``);
    descLines.push(`💡 PESAN MORAL CERITA:`);
    descLines.push(`"${moral}"`);
    if (options.moralDescription) {
      descLines.push(`${options.moralDescription}`);
    }
    descLines.push(``);
    descLines.push(`🌐 VERSI BILINGUAL & KATALOG DONGENG:`);
    descLines.push(`👉 Tonton versi Bahasa Indonesia & English di sini: ${portalUrl}`);
    if (relatedVideos.length > 0) {
      descLines.push(``);
      descLines.push(`📺 TONTON JUGA DONGENG SERU LAINNYA:`);
      relatedVideos.forEach((rv) => {
        descLines.push(`• ${rv.title}: ${rv.url}`);
      });
    }
    descLines.push(``);
    if (!isVertical && options.chapters) {
      descLines.push(`⏱️ DAFTAR BAGIAN CERITA (TIMESTAMPS):`);
      descLines.push(options.chapters);
      descLines.push(``);
      descLines.push(`---`);
      descLines.push(``);
    }
    descLines.push(`🔔 DUKUNG CHANNEL INI:`);
    descLines.push(`Bantu kami menghadirkan lebih banyak cerita dongeng animasi berkualitas untuk anak Indonesia dengan cara klik tombol LIKE, tinggalkan KOMENTAR, dan SUBSCRIBE ke @zayn.storybook!`);
    descLines.push(`👉 Subscribe Gratis: https://youtube.com/@zayn.storybook?sub_confirmation=1`);
    descLines.push(``);
    descLines.push(`📖 KREDIT & LISENSI KARYA:`);
    descLines.push(`• Judul: ${displayTitle}`);
    descLines.push(`• Penulis Asli: ${author}`);
    descLines.push(`• Ilustrator: ${illustrator}`);
    descLines.push(`• Lisensi: ${license}`);
    descLines.push(`• Penerbit / Sumber: ${publisher}`);
    descLines.push(``);
    descLines.push(`Terima kasih kepada StoryWeaver dan Pratham Books atas penyediaan buku cerita anak dengan lisensi terbuka Creative Commons untuk pendidikan literasi anak-anak.`);
    descLines.push(``);
    descLines.push(`#DongengAnak #CeritaAnak #DongengSebelumTidur #CeritaBergambar #AnimasiAnak #KartunAnakIndonesia #ZaynStorybook #CeritaPengantarTidur #DongengAnakIndonesia${isVertical ? " #Shorts" : ""}`);
  }

  const description = descLines.join("\n");

  // 3. Exhaustive Keyword Tags
  const tags = isEn
    ? [
        "bedtime story",
        "kids stories",
        "bedtime stories for kids",
        "children storybook",
        "animated storybook",
        "read aloud books",
        "stories for children",
        displayTitle.toLowerCase(),
        "kids cartoon",
        "soothing bedtime story",
        "audiobook for children",
        "storytime",
        "early reader animation",
        "zayn storybook",
        "pratham books",
        "storyweaver",
        ...(isVertical ? ["shorts", "youtube shorts", "kids shorts"] : ["kids video 16:9", "picture book animation"]),
      ]
    : [
        "dongeng anak",
        "cerita anak sebelum tidur",
        "dongeng sebelum tidur",
        "cerita anak bergambar",
        "dongeng anak indonesia",
        "animasi anak indonesia",
        "kartun anak lucu",
        "cerita pengantar tidur",
        "audiobook anak indonesia",
        "cerita edukasi anak",
        "buku cerita bergambar",
        "zayn storybook",
        displayTitle.toLowerCase(),
        "storyweaver indonesia",
        "pratham books",
        "dongeng fabel anak",
        "baca buku cerita",
        ...(isVertical ? ["shorts", "dongeng shorts", "youtube shorts indonesia"] : ["video dongeng 16:9", "film animasi pendek anak"]),
      ];

  const hashtags = isEn
    ? ["#BedtimeStories", "#KidsStories", "#ReadAloud", "#AnimatedStorybook", "#ZaynStorybook"]
    : ["#DongengAnak", "#CeritaAnak", "#DongengSebelumTidur", "#CeritaBergambar", "#ZaynStorybook"];

  return {
    title,
    description,
    tags,
    hashtags,
  };
}

export interface ChapterSceneLike {
  index: number;
  type?: string;
  durationSeconds?: number;
  audio?: {
    text?: string;
    durationSeconds?: number;
    en?: {
      text?: string;
      durationSeconds?: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export function formatChapterTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Builds YouTube chapters adhering strictly to target language and timing.
 */
export function generateStoryChapters(
  scenes: ChapterSceneLike[],
  lang: "id" | "en" = "id"
): string {
  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) return "";
  let elapsed = 0;
  const lines: string[] = [];
  const isEn = lang === "en";

  for (const scene of scenes) {
    const timestamp = formatChapterTimestamp(elapsed);
    const sceneText = (isEn && scene.audio?.en?.text)
      ? scene.audio.en.text
      : scene.audio?.text || "";
    const cleanText = sceneText.replace(/[\r\n]+/g, " ").trim();

    if (scene.type === "cover") {
      const label = isEn ? "Intro" : "Pembuka";
      lines.push(`${timestamp} ${cleanText ? `${label}: ${cleanText.slice(0, 30)}...` : label}`);
    } else if (scene.type === "moral") {
      const label = isEn ? "Moral of the Story" : "Pesan Moral Cerita";
      const stripped = cleanText.replace(/^(The moral of the story:\s*|Pesan moral cerita ini:\s*)/i, "").trim();
      lines.push(`${timestamp} ${stripped ? `${label}: ${stripped.slice(0, 35)}...` : label}`);
    } else if (scene.type === "outro") {
      const label = isEn ? "Outro & Next Story" : "Penutup & Rekomendasi";
      lines.push(`${timestamp} ${label}`);
    } else {
      const label = isEn ? `Chapter ${scene.index}` : `Bagian ${scene.index}`;
      lines.push(`${timestamp} ${cleanText ? `${label}: ${cleanText.slice(0, 35)}...` : label}`);
    }

    const duration = (isEn && scene.audio?.en?.durationSeconds)
      ? scene.audio.en.durationSeconds
      : scene.durationSeconds || scene.audio?.durationSeconds || 5;
    elapsed += duration;
  }

  return lines.join("\n");
}

/**
 * Resolves YouTube snippet language metadata so English uploads target US/global English
 * (`defaultLanguage: "en"`, `defaultAudioLanguage: "en-US"`) instead of hardcoding `"id"`.
 */
export function resolveYoutubeLanguageConfig(lang: "id" | "en" = "en"): {
  defaultLanguage: "id" | "en";
  defaultAudioLanguage: "id" | "en-US";
} {
  if (lang === "en") {
    return { defaultLanguage: "en", defaultAudioLanguage: "en-US" };
  }
  return { defaultLanguage: "id", defaultAudioLanguage: "id" };
}

/**
 * Builds YouTube `localizations` map for the alternate language (`id` on EN videos, `en` on ID videos)
 * so global viewers see localized titles & descriptions matching their YouTube app locale.
 */
export function buildYoutubeLocalizations(
  options: SeoMetadataOptions & {
    alternateMoralHeadline?: string;
    alternateMoralDescription?: string;
    alternateChapters?: string;
  }
): Record<string, { title: string; description: string }> {
  const altLang: "id" | "en" = options.lang === "en" ? "id" : "en";
  const altSeo = generateSeoMetadata({
    bookSlug: options.bookSlug,
    title: options.title,
    originalTitle: options.originalTitle,
    lang: altLang,
    format: options.format,
    author: options.author,
    illustrator: options.illustrator,
    moralHeadline: options.alternateMoralHeadline,
    moralDescription: options.alternateMoralDescription,
    chapters: options.alternateChapters,
    license: options.license,
    publisher: options.publisher,
  });

  return {
    [altLang]: {
      title: altSeo.title,
      description: altSeo.description,
    },
  };
}

/**
 * Shared Save / Follow / Comment CTA block for Instagram & Facebook captions.
 */
export function buildSocialEngagementCta(
  lang: "id" | "en",
  surface: "reel" | "watch" | "feed" | "compilation" = "feed"
): string {
  const isEn = lang === "en";
  if (surface === "reel") {
    return isEn
      ? `🔖 SAVE this Reel for tonight's bedtime routine!\n➕ FOLLOW @zayn.storybook for daily bilingual kids stories.\n💬 What lesson stood out most to your little one? Share below!`
      : `🔖 SIMPAN (Save) Reels ini untuk dongeng sebelum tidur nanti malam!\n➕ FOLLOW @zayn.storybook biar tidak ketinggalan cerita baru setiap hari.\n💬 Pelajaran baik apa nih yang paling diingat si kecil? Yuk tulis di komentar!`;
  }
  if (surface === "watch" || surface === "compilation") {
    return isEn
      ? `🔖 SAVE this story for tonight's family watch list!\n➕ FOLLOW our @ZaynStorybook Facebook Page & SHARE with fellow parents for nightly storytime!\n💬 Which moment made your child smile or wonder most? Tell us in the comments!\n📺 Watch full episodes on Facebook Watch & YouTube @zayn.storybook.`
      : `🔖 SIMPAN video ini ke daftar tonton malam keluarga!\n➕ FOLLOW halaman @ZaynStorybook & BAGIKAN ke Ayah Bunda lain agar tiap malam ada dongeng baru!\n💬 Setelah menonton, bagian mana yang paling disukai si kecil? Tulis di komentar!\n📺 Tonton maraton 16:9 lengkap di Facebook Watch & YouTube @zayn.storybook.`;
  }
  return isEn
    ? `🔖 SAVE this post for tonight's bedtime routine!\n➕ FOLLOW @zayn.storybook for daily bilingual storybooks & family tales.\n💬 Which lesson are you excited to discuss with your child? Share in the comments!`
    : `🔖 SIMPAN (Save) postingan ini agar mudah diputar saat mendongeng malam nanti!\n➕ FOLLOW @zayn.storybook untuk update dongeng & animasi anak setiap hari.\n💬 Nilai baik apa nih yang paling ingin Ayah Bunda bahas bersama si kecil? Tulis di komentar!`;
}

