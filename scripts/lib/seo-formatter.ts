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
  const author = options.author || "Penulis Buku Cerita Anak";
  const illustrator = options.illustrator || "Ilustrator Cerita";
  const license = options.license || "Creative Commons Attribution 4.0 (CC BY 4.0)";
  const publisher = options.publisher || "StoryWeaver / Pratham Books";
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
