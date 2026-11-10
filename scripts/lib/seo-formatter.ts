/**
 * SEO Metadata Formatter & Generator for Zayn Storybook
 * Generates search-optimized Titles, Descriptions (200+ words), and Tags
 * tailored for high CTR and discovery in Indonesian & English children's storybook niches.
 */

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

  if (isEn) {
    descLines.push(`🌙 Welcome to Zayn Storybook! Tonight's featured animated bedtime story is "${displayTitle}".`);
    descLines.push(`A heartwarming and soothing animated read-aloud picture book designed to help toddlers, preschoolers, and early readers unwind and prepare for a restful night of sleep.`);
    descLines.push(``);
    descLines.push(`💡 MORAL LESSON / VALUE:`);
    descLines.push(`"${moral}"`);
    if (options.moralDescription) {
      descLines.push(`${options.moralDescription}`);
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
    descLines.push(`Cerita bergambar anak animasi yang hangat dan menenangkan, sangat cocok didengarkan bersama si kecil sebelum tidur malam, saat bersantai di rumah, atau sebagai media belajar membaca dan mengasah imajinasi.`);
    descLines.push(``);
    descLines.push(`💡 PESAN MORAL CERITA:`);
    descLines.push(`"${moral}"`);
    if (options.moralDescription) {
      descLines.push(`${options.moralDescription}`);
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

