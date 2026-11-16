import fs from "fs/promises";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { spawn } from "child_process";
import {
  publishFacebookPhotoPost,
  publishFacebookMultiPhotoPost,
  updateFacebookPostMessage,
} from "./publish-launch-posts";
import { publishInstagramFeedPhoto, publishInstagramCarousel } from "./publish-instagram-post";
import { publishThreadsPhotoPost, publishThreadsCarousel, publishThreadsLinkPost } from "./publish-threads";
import {
  notifyTelegramFailure,
  notifyTelegramAnnouncement,
} from "./notify-telegram";
import { DAILY_CALENDAR_MONTH_1, isFullMotionSlot } from "./content-calendar";
import { db } from "./lib/db";
import { pullStory } from "./manage-story-storage";
import { resolveRelatedPublishedVideos } from "./lib/seo-formatter";
import { loadJsonArraySafe } from "./lib/portal-sync";

export const SOCIAL_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@zayn.storybook";

export interface AnnouncementOptions {
  bookSlug?: string;
  lang?: "id" | "en";
  slot?: "morning" | "evening" | "motion" | "auto" | "all" | "daily";
  dailyLineup?: boolean;
  wave?: 1 | 2 | 3;
  motionPhase?: "before" | "after";
  date?: string;
  dryRun?: boolean;
  force?: boolean;
  edit?: boolean;
}

export interface PlatformPublishResult {
  id?: string;
  postId?: string;
  url?: string;
  publishedAt?: string;
  updatedAt?: string;
  sentAt?: string;
  status?: string;
}

export interface AnnouncementRecord {
  scheduledSlot: string;
  announcedAt: string;
  facebook?: PlatformPublishResult;
  instagram?: PlatformPublishResult;
  threads?: PlatformPublishResult;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Returns current hour (0-23) in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

function cleanNarrativeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/([!?])\.+/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function ensureTerminalPunctuation(text: string, fallback: "." | "!" = "."): string {
  const cleaned = cleanNarrativeText(text);
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}${fallback}`;
}

function trimText(text: string, maxChars: number): string {
  const clean = cleanNarrativeText(text);
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars - 1);
  const lastPeriod = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
  if (lastPeriod >= Math.floor(maxChars * 0.5)) {
    return sliced.slice(0, lastPeriod + 1).trim();
  }
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

/**
 * Extracts moral lesson (headline + spoken elaboration when available) across schema versions.
 */
export function extractMoral(story: any, lang: "id" | "en", includeDetail = true): string {
  const moralObj = story?.moral || {};
  const moralScene = story?.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
  const rawSceneText = lang === "en" ? moralScene?.audio?.en?.text : moralScene?.audio?.text;
  const cleanedSceneText = rawSceneText
    ? cleanNarrativeText(rawSceneText.replace(/^(Pesan moral cerita ini|The moral of the story)\s*:\s*/i, ""))
    : "";

  const rawHeadline = (lang === "id" ? moralObj.headlineId : moralObj.headlineEn)?.trim();
  const headline = rawHeadline ? cleanNarrativeText(rawHeadline) : "";
  const rawDetail = (
    lang === "id" ? moralObj.spokenId || moralObj.summaryId : moralObj.spokenEn || moralObj.summaryEn
  )?.trim();
  const detail = rawDetail ? cleanNarrativeText(rawDetail) : "";

  if (headline) {
    if (includeDetail && detail && !detail.toLowerCase().includes(headline.toLowerCase())) {
      return `${ensureTerminalPunctuation(headline, "!")} ${ensureTerminalPunctuation(detail)}`;
    }
    if (includeDetail && !detail && cleanedSceneText && !cleanedSceneText.toLowerCase().includes(headline.toLowerCase())) {
      return trimText(`${ensureTerminalPunctuation(headline, "!")} ${cleanedSceneText}`, 230);
    }
    return ensureTerminalPunctuation(headline, "!");
  }

  if (cleanedSceneText) {
    if (includeDetail) return trimText(cleanedSceneText, 230);
    const first = cleanNarrativeText(cleanedSceneText.split(/[.!?](?:\s|$)/)[0] || cleanedSceneText);
    return ensureTerminalPunctuation(first, "!");
  }

  return lang === "id"
    ? "Belajar kebaikan budi pekerti, kejujuran, dan kehangatan keluarga."
    : "Learning kindness, empathy, and family warmth together.";
}

function splitCleanSentences(text: string): string[] {
  const cleaned = cleanNarrativeText(text);
  if (!cleaned) return [];
  return (cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned])
    .map((s) => cleanNarrativeText(s))
    .filter(Boolean);
}

const SKIP_HOOK_SENTENCE_RE =
  /^(?:cuit|chirp|hap|uh+|eh+|oh+|whoa|yay|hore+|swussh|whoosh|wing|see this|lihat(?:lah)? |what should|apa yang|why (?:do|are|did)|mengapa |don't worry|jangan (?:sedih|takut|khawatir)|suara apa|what could that sound|ya,?\s*ampun|alas|sayangnya|come on|ayo,? )/i;

function pickSceneDigest(sceneText: string, mode: "setup" | "conflict" | "ending"): string {
  const sentences = splitCleanSentences(sceneText);
  if (sentences.length === 0) return "";
  const minChars = 22;
  const substantive = sentences.filter((s) => {
    if (s.length < minChars) return false;
    if (SKIP_HOOK_SENTENCE_RE.test(s) && s.length < 62) return false;
    if (/\?$/.test(s) && s.length < 65) return false;
    return true;
  });
  const pool = substantive.length > 0 ? substantive : sentences;
  if (mode === "ending") {
    return pool.slice(-2).join(" ");
  }
  return pool.slice(0, 2).join(" ");
}

/**
 * Extracts a concise 2-3 sentence story arc summary (setup + conflict + resolution)
 * from manifest metadata or story scenes, filtering sound effects and narrator camera cues.
 */
export function extractStorySummary(story: any, lang: "id" | "en", maxChars = 280): string {
  const explicitSummary = (
    story?.summary?.[lang] ||
    story?.synopsis?.[lang] ||
    story?.description?.[lang]
  )?.trim();
  if (explicitSummary) return trimText(explicitSummary, maxChars);

  const storyScenes: any[] = Array.isArray(story?.scenes)
    ? story.scenes.filter((s: any) => {
        const sid = String(s?.sceneId || "").toLowerCase();
        return (
          s?.type !== "cover" &&
          s?.type !== "moral" &&
          s?.type !== "outro" &&
          sid !== "cover" &&
          sid !== "intro" &&
          sid !== "moral" &&
          sid !== "outro"
        );
      })
    : [];

  const sceneTexts = storyScenes
    .map((s) => (lang === "en" ? s?.audio?.en?.text : s?.audio?.text))
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => cleanNarrativeText(t));

  if (sceneTexts.length > 0) {
    const pickBestInRange = (
      indices: number[],
      mode: "setup" | "conflict" | "ending"
    ): string => {
      for (const idx of indices) {
        if (idx < 0 || idx >= sceneTexts.length) continue;
        const digest = pickSceneDigest(sceneTexts[idx], mode);
        const minAccept = mode === "conflict" ? 36 : 26;
        if (digest && digest.length >= minAccept && !SKIP_HOOK_SENTENCE_RE.test(digest)) {
          return digest;
        }
      }
      const fallbackIdx = indices.find((idx) => idx >= 0 && idx < sceneTexts.length);
      return fallbackIdx !== undefined ? cleanNarrativeText(sceneTexts[fallbackIdx]) : "";
    };

    const n = sceneTexts.length;
    const setupIndices = [0, 1];
    const conflictTarget = Math.min(n - 1, Math.max(1, n <= 6 ? 1 : Math.floor(n * 0.45)));
    const conflictIndices = [conflictTarget, conflictTarget + 1, conflictTarget - 1, Math.floor(n * 0.35)];
    const endingIndices = [n - 1, n - 2];

    const rawParts = [
      pickBestInRange(setupIndices, "setup"),
      pickBestInRange(conflictIndices, "conflict"),
      pickBestInRange(endingIndices, "ending"),
    ].filter(Boolean);

    const parts: string[] = [];
    for (const part of rawParts) {
      if (!parts.some((existing) => existing === part || existing.includes(part))) {
        parts.push(part);
      }
    }

    if (parts.length > 0) {
      // Fit Setup + Conflict + Resolution sequentially, shrinking each beat cleanly if over budget
      const combined = parts.join(" ");
      if (combined.length <= maxChars) return cleanNarrativeText(combined);

      const firstSentences = parts.map((p) => {
        const sents = splitCleanSentences(p);
        if (parts.indexOf(p) === 2 && sents.length > 1) return sents[sents.length - 1];
        return sents[0] || p;
      });
      const compactAll = cleanNarrativeText(firstSentences.join(" "));
      if (compactAll.length <= maxChars) return compactAll;

      // Preserve ending alongside opening when 3 full parts don't fit maxChars (e.g. Threads)
      const setupAndEnd = cleanNarrativeText(
        [firstSentences[0], firstSentences[firstSentences.length - 1]].filter(Boolean).join(" ")
      );
      if (setupAndEnd.length <= maxChars) return setupAndEnd;

      return trimText(compactAll, maxChars);
    }
  }

  const thumbConf = lang === "id" ? story?.thumbnailConfig?.id : story?.thumbnailConfig?.en;
  const fallbackHook = thumbConf?.bedtimeHook || thumbConf?.hook;
  if (fallbackHook) return trimText(String(fallbackHook), maxChars);

  return lang === "id"
    ? "Kisah petualangan hangat penuh imajinasi dan keteladanan untuk menemani waktu santai keluarga."
    : "A warm, imaginative bilingual adventure crafted to inspire young minds and cozy family storytime.";
}

/**
 * Generates engaging, cheerful teaser copy for 1-hour-in-advance announcement feeds.
 * Guarantees 100% single-language consistency matching the language of the attached image.
 */
export interface TailoredTeaserCopies {
  captionSocial: string; // Generic fallback
  captionInstagram: string;
  captionFacebook: string;
  captionThreads: string;
  captionYoutubeCommunity: string;
}

/**
 * Generates engaging, platform-tailored teaser copy for pre-broadcast announcement feeds.
 * Follows best practices:
 * - Instagram: Emotive parenting hook, save prompt, engagement question, focused hashtags.
 * - Facebook: Warm community tone, benefits of mindful bedtime screen-time, family discussion.
 * - Threads: Conversational micro-storytelling, bite-sized curiosity hook, zero hashtag spam.
 * - YouTube Community: Scheduled premiere reminder with clear CTA and live-chat invitation.
 * Guarantees 100% single-language consistency matching the target language.
 */
export function generateTeaserCopy(
  story: any,
  lang: "id" | "en",
  slotTime: string
): TailoredTeaserCopies {
  const isId = lang === "id";
  const rawTitle = isId ? story.title : (story.originalTitle || story.title);
  const cleanTitle = rawTitle.replace(/[!]+$/, "").trim();

  // Extract story summary & moral lesson directly from narrative scenes and manifest
  const thumbConf = isId ? story.thumbnailConfig?.id : story.thumbnailConfig?.en;
  const headlineTop = thumbConf?.headlineTop;
  const headlineBottom = thumbConf?.headlineBottom;
  const storySummary = extractStorySummary(story, lang, 280);
  const moral = extractMoral(story, lang, true);
  const moralShort = extractMoral(story, lang, false);

  // 1. INSTAGRAM FEED CAPTION (Story Summary + Moral Focus, Social Platforms Only)
  const captionInstagram = isId
    ? `⏰ TAYANG 1 JAM LAGI (${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Halo Ayah, Bunda & adik-adik tersayang! 🥰
Tepat pukul ${slotTime} nanti, dongeng animasi "${cleanTitle}" akan tayang perdana di YouTube @zayn.storybook!

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral untuk Si Kecil:
${moral}

🔔 Nyalakan lonceng pengingat di YouTube & ikuti Instagram Reels, Facebook Page, serta Threads @zayn.storybook agar tidak ketinggalan kisah penuh keteladanan ini!
💬 Pelajaran baik apa nih yang ingin Ayah Bunda ajarkan lewat cerita hari ini? 👇❤️

#ZaynStorybook #DongengSebelumTidur #CeritaAnakBergambar #PesanMoralAnak #ParentingIndonesia`
    : `⏰ PREMIERING IN 1 HOUR (${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Hello parents and curious little readers! 🥰
At ${slotTime}, our animated storybook "${cleanTitle}" premieres on YouTube @zayn.storybook!

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

🔔 Set your reminder on YouTube and follow @zayn.storybook across Instagram, Facebook & Threads so your family never misses a story!
💬 What lesson are you excited to talk about with your child after watching? 👇❤️

#ZaynStorybook #KidsStories #ReadAloud #BedtimeStories #MoralStories`;

  // 2. FACEBOOK PAGE CAPTION (Story Summary + Moral Focus, Social Platforms Only)
  const captionFacebook = isId
    ? `⏰ PENGINGAT TAYANG: 1 JAM LAGI (${slotTime}) 🌟✨
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

📺 Tayang perdana pukul ${slotTime} di YouTube Zayn Storybook (${SOCIAL_YOUTUBE_CHANNEL_URL}) serta hadir versi ringkas di Instagram Reels, Facebook Watch & Threads @zayn.storybook!

💬 Setelah menonton nanti, ajak si kecil ngobrol tentang pesan moralnya ya Ayah & Bunda. Tulis pendapat si kecil di komentar! 👇❤️`
    : `⏰ PREMIERE REMINDER: 1 HOUR TO GO (${slotTime}) 🌟✨
📖 "${cleanTitle}"

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

📺 Premiering at ${slotTime} on YouTube Zayn Storybook (${SOCIAL_YOUTUBE_CHANNEL_URL}), with highlights on Instagram Reels, Facebook Watch & Threads @zayn.storybook!

💬 Share your little one's favorite part in the comments below! 👇❤️`;

  // 3. META THREADS CAPTION (< 500 chars)
  const captionThreadsRaw = isId
    ? `⏰ 1 jam lagi (${slotTime}) tayang di YouTube @zayn.storybook: "${cleanTitle}"!

📖 Ringkasan: ${extractStorySummary(story, lang, 150)}
💡 Pesan Moral: ${moralShort}

Tonton bareng di YouTube, Instagram, Facebook & Threads @zayn.storybook 🌙✨`
    : `⏰ In 1 hour (${slotTime}) on YouTube @zayn.storybook: "${cleanTitle}"!

📖 Story: ${extractStorySummary(story, lang, 150)}
💡 Moral: ${moralShort}

Watch with us on YouTube, Instagram, Facebook & Threads @zayn.storybook 🌙✨`;
  const captionThreads = trimText(captionThreadsRaw, 480);

  // 4. YOUTUBE COMMUNITY TAB CAPTION
  const captionYoutubeCommunity = isId
    ? `⏰ TAYANG PERDANA 1 JAM LAGI (${slotTime}) 🌟✨
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

🔔 Klik "Ingatkan Saya" di YouTube @zayn.storybook & follow Instagram / Facebook / Threads @zayn.storybook! Sampai jumpa di live chat! ❤️👇`
    : `⏰ PREMIERING IN 1 HOUR (${slotTime}) 🌟✨
📖 "${cleanTitle}"

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

🔔 Tap "Set Reminder" on YouTube @zayn.storybook and follow us on Instagram, Facebook & Threads! See you in live chat! ❤️👇`;

  return {
    captionSocial: captionInstagram,
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity,
  };
}

/**
 * Executes a child CLI command synchronously.
 */
async function runChild(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

/**
 * Finds the optimal 4:5 portrait or popular cover photo for feed distribution.
 * Strictly guarantees language isolation: only selects images matching target language typography.
 */
function resolveBestPhoto(storyDir: string, lang: "id" | "en"): string {
  const candidates = [
    path.join(storyDir, "exports", lang, "thumbnail-portrait.png"),
    path.join(storyDir, "exports", lang, "thumbnail-popular.png"),
    path.join(storyDir, "exports", lang, "thumbnail.png"),
    path.join(storyDir, "exports", lang, "thumbnail-vertical.png"),
    path.join(storyDir, "exports", lang, "thumbnail-bedtime.png"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback to motion cover or neutral book cover when language exports are missing
  const coverFallbacks = [
    path.join(storyDir, "motion", "cover_16x9.png"),
    path.join(storyDir, "motion", "cover_9x16.png"),
    path.join(storyDir, "assets", "cover.png"),
    path.join(storyDir, "assets", "cover.jpg"),
    path.join(storyDir, "assets", "cover.jpeg"),
  ];
  for (const fallbackPath of coverFallbacks) {
    if (existsSync(fallbackPath)) return fallbackPath;
  }

  throw new Error(`No image asset found for announcement in language [${lang.toUpperCase()}] at ${storyDir}`);
}

/**
 * Generates unified bilingual teaser copy for the single daily announcement ("Menu Dongeng Hari Ini").
 * Covers both Morning English Read-Aloud (08:30 WIB) and Evening Prime Bedtime Story (19:00 WIB).
 */
export function generateDailyLineupCopy(
  morningStory: any,
  morningSlot: any,
  eveningStory: any,
  eveningSlot: any,
  dateStr: string
): TailoredTeaserCopies {
  const morningLang: "id" | "en" = (morningSlot.lang || "en") === "id" ? "id" : "en";
  const morningRawTitle =
    morningLang === "id"
      ? morningStory.title || morningStory.originalTitle || "Cerita Pagi Ceria"
      : morningStory.originalTitle || morningStory.title || "Morning English Story";
  const morningCleanTitle = morningRawTitle.replace(/[!]+$/, "").trim();
  const morningSummary = extractStorySummary(morningStory, morningLang, 210);
  const morningMoral = extractMoral(morningStory, morningLang, false);
  const morningHeaderLabel = morningLang === "id" ? "Cerita Pagi" : "English Read-Aloud";

  const eveningLang: "id" | "en" = (eveningSlot.lang || "id") === "en" ? "en" : "id";
  const eveningRawTitle =
    eveningLang === "id"
      ? eveningStory.title || eveningStory.originalTitle || "Dongeng Pengantar Tidur"
      : eveningStory.originalTitle || eveningStory.title || "Bedtime Story";
  const eveningCleanTitle = eveningRawTitle.replace(/[!]+$/, "").trim();
  const eveningSummary = extractStorySummary(eveningStory, eveningLang, 210);
  const eveningMoral = extractMoral(eveningStory, eveningLang, true);

  const morningTime = morningSlot.time_slot || morningSlot.timeSlot || "08:30 WIB";
  const eveningTime = eveningSlot.time_slot || eveningSlot.timeSlot || "19:00 WIB";

  // 1. INSTAGRAM FEED CAROUSEL CAPTION
  const captionInstagram = `🌟 MENU DONGENG ZAYN HARI INI 🌟
Selamat pagi Ayah, Bunda & Adik-adik tersayang! 🥰

🌅 [PAGI · ${morningTime}] ${morningHeaderLabel}: "${morningCleanTitle}"
📖 Ringkasan: ${morningSummary}
💡 Pesan Moral: ${morningMoral}

🌙 [MALAM · ${eveningTime}] Bedtime Story: "${eveningCleanTitle}"
📖 Ringkasan: ${eveningSummary}
💖 Pesan Moral: ${eveningMoral}

👉 Geser ke kiri untuk preview kedua cerita!
📺 Tonton tayangan lengkapnya di YouTube @zayn.storybook, dan ikuti cuplikannya di Instagram Reels, Facebook Watch & Threads @zayn.storybook!
💬 Pesan moral cerita mana yang paling cocok dibahas bareng si kecil hari ini? 👇❤️

#ZaynStorybook #MenuDongengHariIni #DongengAnak #PesanMoralAnak #BilingualKids`;

  // 2. FACEBOOK PAGE MULTI-PHOTO CAPTION
  const captionFacebook = `🌟 MENU DONGENG ZAYN HARI INI (${dateStr}) 🌟
Selamat pagi Ayah & Bunda! Dua kisah bermakna siap menemani pagi dan waktu tidur si kecil hari ini:

🌅 [PAGI · ${morningTime}] ${morningHeaderLabel}: "${morningCleanTitle}"
📖 Ringkasan Cerita:
${morningSummary}
💡 Pesan Moral:
${morningMoral}

🌙 [MALAM · ${eveningTime}] Prime Bedtime Story: "${eveningCleanTitle}"
📖 Ringkasan Cerita:
${eveningSummary}
💖 Pesan Moral:
${eveningMoral}

📺 Subscribe & nyalakan lonceng di YouTube Zayn Storybook (${SOCIAL_YOUTUBE_CHANNEL_URL}), serta ikuti kami di Instagram, Facebook Page & Threads @zayn.storybook!
💬 Cerita mana nih yang paling dinanti si kecil hari ini? 👇❤️

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #PesanMoral #KeluargaBahagia`;

  // 3. THREADS CAPTION (< 500 chars)
  const captionThreads = trimText(
    `Menu Dongeng @zayn.storybook hari ini 🌟
🌅 ${morningTime}: "${morningCleanTitle}" — ${extractStorySummary(morningStory, morningLang, 95)} (💡 ${morningMoral})
🌙 ${eveningTime}: "${eveningCleanTitle}" — ${extractStorySummary(eveningStory, eveningLang, 95)} (💖 ${extractMoral(eveningStory, eveningLang, false)})

Tonton lengkapnya di YouTube, Instagram & Facebook @zayn.storybook! 👇`,
    480
  );

  return {
    captionSocial: captionInstagram,
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity: captionFacebook,
  };
}

export interface SocialPlatformClients {
  publishFacebookPhotoPost: typeof publishFacebookPhotoPost;
  publishFacebookMultiPhotoPost: typeof publishFacebookMultiPhotoPost;
  updateFacebookPostMessage: typeof updateFacebookPostMessage;
  publishInstagramFeedPhoto: typeof publishInstagramFeedPhoto;
  publishInstagramCarousel: typeof publishInstagramCarousel;
  publishThreadsPhotoPost: typeof publishThreadsPhotoPost;
  publishThreadsCarousel: typeof publishThreadsCarousel;
  publishThreadsLinkPost: typeof publishThreadsLinkPost;
}

const DEFAULT_SOCIAL_CLIENTS: SocialPlatformClients = {
  publishFacebookPhotoPost,
  publishFacebookMultiPhotoPost,
  updateFacebookPostMessage,
  publishInstagramFeedPhoto,
  publishInstagramCarousel,
  publishThreadsPhotoPost,
  publishThreadsCarousel,
  publishThreadsLinkPost,
};

/**
 * Publishes pending announcement platforms and edits existing posts in-place where supported
 * (Facebook supports in-place caption edits; Instagram & Threads skip republish to avoid duplicates).
 */
export async function syncAnnouncementPlatforms(params: {
  label: string;
  imagePaths: string[];
  facebookCaption: string;
  facebookFirstComment?: string;
  facebookFallbackCaption?: string;
  instagramCaption: string;
  threadsText: string;
  threadsLinkUrl?: string;
  existing?: {
    facebook?: PlatformPublishResult;
    instagram?: PlatformPublishResult;
    threads?: PlatformPublishResult;
  };
  allowEdit?: boolean;
  dryRun?: boolean;
  clients?: SocialPlatformClients;
}): Promise<{
  facebook?: PlatformPublishResult;
  instagram?: PlatformPublishResult;
  threads?: PlatformPublishResult;
  errors: string[];
}> {
  const {
    label,
    imagePaths,
    facebookCaption,
    facebookFirstComment,
    facebookFallbackCaption,
    instagramCaption,
    threadsText,
    threadsLinkUrl,
    existing = {},
    allowEdit = false,
    dryRun = false,
    clients = DEFAULT_SOCIAL_CLIENTS,
  } = params;

  const errors: string[] = [];
  let fbResult = existing.facebook;
  let igResult = existing.instagram;
  let thResult = existing.threads;

  const existingFbId = existing.facebook?.postId || existing.facebook?.id;
  if (existingFbId) {
    if (allowEdit) {
      const nextMessage = facebookFallbackCaption || facebookCaption;
      if (dryRun) {
        console.log(`\n🧪 [DRY RUN] Would edit existing Facebook post in-place (${existingFbId}).`);
      } else {
        try {
          console.log(`\n✏️ [1/3] Editing existing Facebook post caption in-place (${existingFbId})...`);
          const ok = await clients.updateFacebookPostMessage(existingFbId, nextMessage);
          if (ok) {
            fbResult = {
              ...existing.facebook,
              updatedAt: new Date().toISOString(),
              status: "updated",
            };
          } else {
            console.warn(`⚠️ [${label}] Facebook edit did not succeed for ${existingFbId}; keeping existing post instead of republishing.`);
          }
        } catch (fbErr: any) {
          console.error(`⚠️ Facebook edit warning (${label}):`, fbErr.message);
          errors.push(`Facebook (${label} edit): ${fbErr.message}`);
        }
      }
    } else {
      console.log(`\n⏩ [1/3] Skipping Facebook Page: Already published (${existingFbId}).`);
    }
  } else {
    try {
      console.log(`\n📘 [1/3] Publishing ${label} to Facebook Page...`);
      if (imagePaths.length > 1) {
        const fbRes = await clients.publishFacebookMultiPhotoPost({
          photoPaths: imagePaths,
          caption: facebookCaption,
          firstComment: facebookFirstComment,
          fallbackCaption: facebookFallbackCaption,
          dryRun,
        });
        if (!dryRun && fbRes.success) {
          fbResult = {
            postId: fbRes.postId,
            url: fbRes.permalink,
            publishedAt: new Date().toISOString(),
            status: "published",
          };
        }
      } else {
        const fbRes = await clients.publishFacebookPhotoPost({
          photoPath: imagePaths[0],
          caption: facebookCaption,
          firstComment: facebookFirstComment,
          fallbackCaption: facebookFallbackCaption,
          dryRun,
        });
        if (!dryRun && fbRes.success) {
          fbResult = {
            id: fbRes.photoId || fbRes.postId,
            postId: fbRes.postId,
            url: fbRes.permalink,
            publishedAt: new Date().toISOString(),
            status: "published",
          };
        }
      }
    } catch (fbErr: any) {
      console.error(`⚠️ Facebook ${label} warning:`, fbErr.message);
      errors.push(`Facebook (${label}): ${fbErr.message}`);
    }
  }

  const existingIgId = existing.instagram?.id;
  if (existingIgId) {
    if (allowEdit) {
      console.log(`\n⏭️ [2/3] Instagram post already live (${existingIgId}) — caption edit not supported by Instagram Graph API; skipping republish.`);
    } else {
      console.log(`\n⏩ [2/3] Skipping Instagram Feed: Already published (${existingIgId}).`);
    }
  } else {
    try {
      console.log(`\n📸 [2/3] Publishing ${label} to Instagram Feed...`);
      const igRes =
        imagePaths.length > 1
          ? await clients.publishInstagramCarousel({ imagePaths, caption: instagramCaption, dryRun })
          : await clients.publishInstagramFeedPhoto({ imagePath: imagePaths[0], caption: instagramCaption, dryRun });
      if (!dryRun && igRes.success) {
        igResult = {
          id: igRes.mediaId || (igRes as any).id,
          url: igRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
      }
    } catch (igErr: any) {
      console.error(`⚠️ Instagram ${label} warning:`, igErr.message);
      errors.push(`Instagram (${label}): ${igErr.message}`);
    }
  }

  const existingThId = existing.threads?.postId || existing.threads?.id;
  if (existingThId) {
    if (allowEdit) {
      console.log(`\n⏭️ [3/3] Threads post already live (${existingThId}) — in-place edit not supported by Threads API; skipping republish.`);
    } else {
      console.log(`\n⏩ [3/3] Skipping Meta Threads: Already published (${existingThId}).`);
    }
  } else {
    try {
      console.log(`\n🧵 [3/3] Publishing ${label} to Meta Threads...`);
      const thRes =
        imagePaths.length > 1
          ? await clients.publishThreadsCarousel({ imagePaths, text: threadsText, dryRun })
          : threadsLinkUrl
            ? await clients.publishThreadsLinkPost({ text: threadsText, linkUrl: threadsLinkUrl, dryRun })
            : await clients.publishThreadsPhotoPost({ imagePath: imagePaths[0], text: threadsText, dryRun });
      if (!dryRun && thRes.success) {
        thResult = {
          id: thRes.postId,
          postId: thRes.postId,
          url: thRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
      }
    } catch (thErr: any) {
      console.error(`⚠️ Threads ${label} warning:`, thErr.message);
      errors.push(`Threads (${label}): ${thErr.message}`);
    }
  }

  return { facebook: fbResult, instagram: igResult, threads: thResult, errors };
}

async function resolveDailyLineupSlots(targetDate: string): Promise<{
  slots: any[];
  morningSlot: any;
  eveningSlot: any;
  morningBook: string;
  eveningBook: string;
} | null> {
  let slots: any[] = [];
  try {
    slots = await db.getCalendar(targetDate);
  } catch (e: any) {
    console.warn("ℹ️ Could not query D1 calendar, falling back to local calendar:", e.message);
  }

  if (!slots || slots.length === 0) {
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
    const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const dayName = dayNames[nowJakarta.getDay()];

    slots = DAILY_CALENDAR_MONTH_1.filter((s) => {
      if (s.date && s.date === targetDate) return true;
      if (!s.date && s.dayName === dayName) return true;
      return false;
    });
  }

  const bookSlots = slots.filter((s) => !isFullMotionSlot(s));
  if (bookSlots.length === 0) {
    return null;
  }

  const morningSlot =
    bookSlots.find((s) => {
      const time = (s.time_slot || s.timeSlot || "").toLowerCase();
      const type = (s.slot_type || s.slotType || "").toLowerCase();
      const lang = s.lang || "";
      return time.includes("08:") || time.includes("07:") || type.includes("morning") || lang === "en";
    }) || bookSlots[0];

  const eveningSlot =
    bookSlots.find((s) => {
      const time = (s.time_slot || s.timeSlot || "").toLowerCase();
      const type = (s.slot_type || s.slotType || "").toLowerCase();
      const lang = s.lang || "";
      return time.includes("19:") || time.includes("18:") || type.includes("prime") || type.includes("bedtime") || (lang === "id" && s !== morningSlot);
    }) || (bookSlots.length > 1 ? bookSlots[1] : bookSlots[0]);

  return {
    slots: bookSlots,
    morningSlot,
    eveningSlot,
    morningBook: morningSlot.book_slug || morningSlot.bookSlug,
    eveningBook: eveningSlot.book_slug || eveningSlot.bookSlug,
  };
}

async function ensureStoryAssetsLocally(
  storyDir: string,
  slug: string,
  dryRun?: boolean
): Promise<string> {
  const storyJsonPath = path.join(storyDir, "story.json");
  const hasVisualAssets =
    existsSync(path.join(storyDir, "exports")) || existsSync(path.join(storyDir, "assets"));

  if (!dryRun) {
    try {
      await pullStory(slug, { manifestOnly: true, force: true });
    } catch {
      // Offline or manifest not yet in R2
    }
  }
  if (!existsSync(storyJsonPath) || !hasVisualAssets) {
    console.log(`📥 Story visual assets not found locally for [${slug}]. Pulling from Cloudflare R2...`);
    await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", slug]);
    if (!dryRun) {
      await pullStory(slug, { manifestOnly: true, force: true }).catch(() => {});
    }
  }
  if (!existsSync(storyJsonPath)) {
    throw new Error(`story.json not found for book '${slug}' at ${storyJsonPath}`);
  }
  return storyJsonPath;
}

/**
 * Publishes a single unified daily bilingual announcement ("Menu Dongeng Hari Ini")
 * featuring both the morning English story and the evening Indonesian story.
 */
export async function publishDailyLineupAnnouncement(options: AnnouncementOptions = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  morningBook?: string;
  eveningBook?: string;
}> {
  const targetDate = options.date || getJakartaDateString();
  const currentHour = getJakartaHour();

  console.log("\n==================================================================");
  console.log("🌟 SINGLE DAILY UNIFIED BILINGUAL ANNOUNCEMENT DISPATCHER");
  console.log("==================================================================");
  console.log(`📅 Target Date (WIB) : ${targetDate}`);
  console.log(`⏰ Current Hour      : ${currentHour}:00 WIB`);
  console.log(`🧪 Dry Run Mode      : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post     : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  // 1. Resolve today's morning and evening slots
  const resolved = await resolveDailyLineupSlots(targetDate);
  if (!resolved) {
    console.log(`🌴 Tidak ada jadwal tayang aktif untuk tanggal (${targetDate}). Lewati pengumuman.`);
    return { success: true, skipped: true };
  }

  const { morningSlot, eveningSlot, morningBook, eveningBook } = resolved;

  console.log(`🌅 Morning Slot  : [${morningBook}] [${morningSlot.lang || "en"}] @ ${morningSlot.time_slot || morningSlot.timeSlot || "08:30 WIB"}`);
  console.log(`🌙 Evening Slot  : [${eveningBook}] [${eveningSlot.lang || "id"}] @ ${eveningSlot.time_slot || eveningSlot.timeSlot || "19:00 WIB"}`);
  console.log("==================================================================\n");

  // 2. Ensure stories exist locally (skip compilation slugs which have no individual story.json)
  const isMorningComp = morningBook.startsWith("kompilasi-");
  const isEveningComp = eveningBook.startsWith("kompilasi-");
  const storiesToEnsure = Array.from(new Set([morningBook, eveningBook])).filter(
    (s) => !s.startsWith("kompilasi-")
  );
  for (const slug of storiesToEnsure) {
    await ensureStoryAssetsLocally(path.resolve("./stories", slug), slug, options.dryRun);
  }

  const morningStoryPath = path.resolve("./stories", morningBook, "story.json");
  const eveningStoryPath = path.resolve("./stories", eveningBook, "story.json");
  const buildCompilationStory = (slug: string, slot: any) => ({
    slug,
    title: slot.theme || slug,
    originalTitle: slot.theme || slug,
    moral: {
      headlineId: "Kumpulan dongeng pilihan penuh kehangatan dan pesan budi pekerti untuk keluarga.",
    },
  });
  const morningStory: any = isMorningComp
    ? buildCompilationStory(morningBook, morningSlot)
    : JSON.parse(await fs.readFile(morningStoryPath, "utf-8"));
  const eveningStory: any = isEveningComp
    ? buildCompilationStory(eveningBook, eveningSlot)
    : JSON.parse(await fs.readFile(eveningStoryPath, "utf-8"));

  // 3. Deduplication Check across platforms
  if (!morningStory.publications) morningStory.publications = {};
  if (!morningStory.publications.announcements) morningStory.publications.announcements = {};
  if (!morningStory.publications.announcements[targetDate]) morningStory.publications.announcements[targetDate] = {};

  const existingLineup = morningStory.publications.announcements[targetDate].dailyLineup || {};
  const hasFb = Boolean(existingLineup.facebook?.id || existingLineup.facebook?.postId);
  const hasIg = Boolean(existingLineup.instagram?.id);
  const hasThreads = Boolean(existingLineup.threads?.id || existingLineup.threads?.postId);

  console.log("🔍 DAILY LINEUP DEDUPLICATION STATUS:");
  console.log(`   - Facebook Page : ${hasFb ? `✔ LIVE (${existingLineup.facebook?.id || existingLineup.facebook?.postId})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed : ${hasIg ? `✔ LIVE (${existingLineup.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads   : ${hasThreads ? `✔ LIVE (${existingLineup.threads?.id || existingLineup.threads?.postId})` : "⏳ PENDING"}`);

  const allowUpdate = Boolean(options.force || options.edit);
  if (hasFb && hasIg && hasThreads && !allowUpdate) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Daily lineup announcement for ${targetDate} has ALREADY been published across ALL public social platforms!`);
    console.log(`   ⏩ Skipping to guarantee ZERO duplicate posts. Pass --edit to update supported platforms in-place.\n`);
    return { success: true, skipped: true, morningBook, eveningBook };
  }

  // 4. Resolve Visual Assets for both books
  const morningLang: "id" | "en" = (morningSlot.lang || "en") === "id" ? "id" : "en";
  const eveningLang: "id" | "en" = (eveningSlot.lang || "id") === "en" ? "en" : "id";
  const morningStoryDir = path.resolve("./stories", morningBook);
  const eveningStoryDir = path.resolve("./stories", eveningBook);
  const morningPhoto = isMorningComp
    ? resolveBestPhoto(eveningStoryDir, eveningLang)
    : resolveBestPhoto(morningStoryDir, morningLang);
  const eveningPhoto = isEveningComp
    ? morningPhoto
    : resolveBestPhoto(eveningStoryDir, eveningLang);
  const imagePaths = morningPhoto === eveningPhoto ? [morningPhoto] : [morningPhoto, eveningPhoto];

  console.log(`\n🖼️ Visual Slides Selected:`);
  console.log(`   - Slide 1 [Morning ${morningLang.toUpperCase()}]: ${path.basename(morningPhoto)}`);
  if (imagePaths.length > 1) {
    console.log(`   - Slide 2 [Evening ${eveningLang.toUpperCase()}]: ${path.basename(eveningPhoto)}`);
  }

  // 5. Generate Tailored Captions
  const captions = generateDailyLineupCopy(morningStory, morningSlot, eveningStory, eveningSlot, targetDate);

  const synced = await syncAnnouncementPlatforms({
    label: "Daily Lineup",
    imagePaths,
    facebookCaption: captions.captionFacebook,
    instagramCaption: captions.captionInstagram,
    threadsText: captions.captionThreads,
    existing: existingLineup,
    allowEdit: allowUpdate,
    dryRun: options.dryRun,
  });
  const errors = synced.errors;
  const fbResult = synced.facebook;
  const igResult = synced.instagram;
  const thResult = synced.threads;

  // 7. Save publication metadata to story.json and Cloudflare R2
  if (!options.dryRun) {
    const updatedLineup = {
      announcedAt: new Date().toISOString(),
      morningBook,
      eveningBook,
      facebook: fbResult,
      instagram: igResult,
      threads: thResult,
    };

    if (!isMorningComp) {
      morningStory.publications.announcements[targetDate].dailyLineup = updatedLineup;
      await fs.writeFile(morningStoryPath, JSON.stringify(morningStory, null, 2), "utf-8");
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", morningBook, "--manifest-only"]);
    }

    if (eveningBook !== morningBook && !isEveningComp) {
      if (!eveningStory.publications) eveningStory.publications = {};
      if (!eveningStory.publications.announcements) eveningStory.publications.announcements = {};
      if (!eveningStory.publications.announcements[targetDate]) eveningStory.publications.announcements[targetDate] = {};
      eveningStory.publications.announcements[targetDate].dailyLineup = updatedLineup;
      await fs.writeFile(eveningStoryPath, JSON.stringify(eveningStory, null, 2), "utf-8");
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", eveningBook, "--manifest-only"]);
    }
    console.log(`✔ story.json manifests updated with daily lineup publication record in R2.`);
  }

  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: `${morningBook}+${eveningBook}`,
        lang: morningLang,
        slot: `Daily Lineup (${targetDate})`,
        platform: "Single Daily Announcement Dispatcher",
        error: errors.join("\n"),
      });
    } catch {}
  } else if (errors.length === 0) {
    try {
      const mTitle = (morningLang === "id"
        ? morningStory.title || morningStory.originalTitle
        : morningStory.originalTitle || morningStory.title || morningBook
      ).replace(/[!]+$/, "").trim();
      const eTitle = (eveningStory.title || eveningStory.originalTitle || eveningBook).replace(/[!]+$/, "").trim();
      const mThumb = morningLang === "id" ? morningStory.thumbnailConfig?.id : morningStory.thumbnailConfig?.en;
      const mHook = mThumb?.hook;
      const eThumb = eveningStory.thumbnailConfig?.id;
      const eHook = eThumb?.hook;
      const mTime = morningSlot.time_slot || morningSlot.timeSlot || "08:30 WIB";
      const eTime = eveningSlot.time_slot || eveningSlot.timeSlot || "19:00 WIB";

      await notifyTelegramAnnouncement({
        dateStr: targetDate,
        morningBook,
        morningTitle: mTitle,
        morningLang,
        morningSlotTime: mTime,
        morningHook: mHook,
        eveningBook,
        eveningTitle: eTitle,
        eveningLang,
        eveningSlotTime: eTime,
        eveningHook: eHook,
        facebookUrl: fbResult?.url,
        instagramUrl: igResult?.url,
        threadsUrl: thResult?.url,
        dryRun: options.dryRun,
      });
    } catch (e: any) {
      console.warn("⚠️ Warning sending Telegram announcement success alert:", e.message);
    }
  }

  console.log("\n🎉 SINGLE DAILY BILINGUAL ANNOUNCEMENT DISPATCH COMPLETE!\n");
  return { success: errors.length === 0, morningBook, eveningBook };
}

/**
 * Resolves a fresh visual still for Wave 2 (Midday) & Wave 3 (Bedtime) so post-publish posts
 * avoid repeating Wave 1's portrait thumbnail verbatim.
 */
function resolveWavePhoto(storyDir: string, lang: "id" | "en", wave: 2 | 3): string {
  const assetsDir = path.join(storyDir, "assets");
  let sceneImages: string[] = [];
  if (existsSync(assetsDir)) {
    sceneImages = readdirSync(assetsDir)
      .filter((f) => /^(scene|page)[_-]?\d+\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort()
      .map((f) => path.join(assetsDir, f));
  }

  const preferredScene =
    wave === 2
      ? sceneImages[1] || sceneImages[0]
      : sceneImages[Math.min(2, Math.max(0, sceneImages.length - 1))] || sceneImages[0];

  const candidates =
    wave === 2
      ? [
          path.join(storyDir, "exports", lang, "thumbnail-popular.png"),
          path.join(storyDir, "exports", lang, "thumbnail.png"),
          preferredScene,
          path.join(storyDir, "exports", lang, "thumbnail-portrait.png"),
          path.join(storyDir, "assets", "cover.png"),
        ]
      : [
          path.join(storyDir, "exports", lang, "thumbnail-bedtime.png"),
          preferredScene,
          path.join(storyDir, "exports", lang, "thumbnail-popular.png"),
          path.join(storyDir, "exports", lang, "thumbnail.png"),
          path.join(storyDir, "assets", "cover.png"),
        ];

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return resolveBestPhoto(storyDir, lang);
}

/**
 * Resolves the live YouTube watch URL and thumbnail URL from story.json, Cloudflare D1, or docs/audit-data.json.
 */
async function resolveLiveYoutubeInfo(
  story: any,
  bookSlug: string,
  lang: "id" | "en"
): Promise<{ youtubeUrl?: string; youtubeId?: string; ytThumbnailUrl?: string }> {
  const altLang: "id" | "en" = lang === "id" ? "en" : "id";
  const yt = story?.publications?.youtube || {};

  const candidates = [
    yt[lang]?.landscape,
    yt[lang]?.shorts,
    yt[altLang]?.landscape,
    yt[altLang]?.shorts,
  ];
  for (const c of candidates) {
    if (c?.url || c?.id) {
      const id = c.id || (typeof c.url === "string" ? c.url.split("/").pop() : undefined);
      return {
        youtubeUrl: c.url || (id ? `https://youtu.be/${id}` : undefined),
        youtubeId: id,
        ytThumbnailUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
      };
    }
  }

  for (const queryLang of [lang, altLang]) {
    try {
      const d1Rows = await db.getPublishedPublicationsForSlot(bookSlug, queryLang);
      const ytRow =
        d1Rows.find((r) => r.platform === "youtube" && r.format === "landscape" && (r.video_url || r.external_id)) ||
        d1Rows.find((r) => r.platform === "youtube" && (r.video_url || r.external_id));
      if (ytRow) {
        const id = ytRow.external_id || (typeof ytRow.video_url === "string" ? ytRow.video_url.split("/").pop() : undefined);
        return {
          youtubeUrl: ytRow.video_url || (id ? `https://youtu.be/${id}` : undefined),
          youtubeId: id,
          ytThumbnailUrl: ytRow.thumbnail_url || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined),
        };
      }
    } catch {
      // Offline or D1 unavailable; continue to audit-data fallback
    }
  }

  const auditRecords = loadJsonArraySafe<any>(path.resolve("./docs/audit-data.json"));
  const matchingYt =
    auditRecords.find((r) => r.storySlug === bookSlug && r.platform === "YouTube" && r.language === lang && r.aspectRatio === "16:9") ||
    auditRecords.find((r) => r.storySlug === bookSlug && r.platform === "YouTube" && r.language === lang) ||
    auditRecords.find((r) => r.storySlug === bookSlug && r.platform === "YouTube");

  if (matchingYt?.videoId || matchingYt?.videoUrl) {
    const id = matchingYt.videoId;
    return {
      youtubeUrl: matchingYt.videoUrl || (id ? `https://youtu.be/${id}` : undefined),
      youtubeId: id,
      ytThumbnailUrl: matchingYt.thumbnailUrl || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined),
    };
  }

  return {};
}

interface WaveCopyPayload {
  facebookCaption: string;
  facebookFallbackCaption: string;
  facebookFirstComment: string;
  instagramCaption: string;
  threadsText: string;
  threadsLinkUrl?: string;
}

export function generatePostPublishWaveCopy(params: {
  wave: 2 | 3;
  bookSlug: string;
  cleanTitle: string;
  lang: "id" | "en";
  summary: string;
  summaryShort?: string;
  moral: string;
  moralShort?: string;
  youtubeUrl?: string;
  related: Array<{ title: string; url: string }>;
}): WaveCopyPayload {
  const { wave, cleanTitle, lang, summary, summaryShort, moral, moralShort, youtubeUrl, related } = params;
  const watchUrl = youtubeUrl || SOCIAL_YOUTUBE_CHANNEL_URL;
  const rel1 = related[0];
  const rel2 = related[1];

  if (wave === 2) {
    // Midday Watch-Now & Catch-Up (12:30 WIB)
    const facebookFirstComment = [
      lang === "en"
        ? `▶️ Watch "${cleanTitle}" on YouTube: ${watchUrl}`
        : `▶️ Tonton "${cleanTitle}" di YouTube: ${watchUrl}`,
      rel1
        ? lang === "en"
          ? `📚 Previous Story on YouTube — "${rel1.title}": ${rel1.url}`
          : `📚 Cerita Sebelumnya di YouTube — "${rel1.title}": ${rel1.url}`
        : "",
      rel2
        ? lang === "en"
          ? `✨ Watch Next on YouTube — "${rel2.title}": ${rel2.url}`
          : `✨ Tonton Juga di YouTube — "${rel2.title}": ${rel2.url}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const buildFbBody = (commentCta: string) =>
      lang === "en"
        ? `☀️ MIDDAY STORYTIME — NOW STREAMING! 🎬✨
📖 "${cleanTitle}" (English Edition)

📖 Story Summary:
${summary}

💖 Moral of the Story:
${moral}

${commentCta}

📺 Catch the full episode on YouTube @zayn.storybook and follow highlights on Instagram Reels, Facebook Watch & Threads @zayn.storybook!
💬 What lesson stood out most for your little one? Share in the comments! ❤️

#ZaynStorybook #MoralStories #EnglishReadAloud #KidsStories #Parenting`
        : `☀️ ISTIRAHAT SIANG BERSAMA SI KECIL — SUDAH TAYANG! 🎬✨
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${summary}

💖 Pesan Moral:
${moral}

${commentCta}

📺 Saksikan cerita lengkapnya di YouTube Zayn Storybook, serta cuplikannya di Instagram Reels, Facebook Watch & Threads @zayn.storybook!
💬 Nilai baik apa yang paling diingat si kecil dari kisah ini? Tulis di komentar ya Ayah & Bunda! ❤️

#ZaynStorybook #DongengAnak #PesanMoralAnak #CeritaAnakBergambar #ParentingIndonesia`;

    const facebookCaption = buildFbBody(
      lang === "en"
        ? `▶️ Direct YouTube watch links are pinned in the FIRST COMMENT below! 👇💬`
        : `▶️ Tautan langsung YouTube sudah kami sematkan di KOMENTAR PERTAMA di bawah ya! 👇💬`
    );
    const facebookFallbackCaption = buildFbBody(facebookFirstComment);

    const instagramCaption =
      lang === "en"
        ? `☀️ NOW STREAMING ON YOUTUBE! 🎬🌟
📖 "${cleanTitle}"

📖 Story Summary:
${summary}

💖 Moral of the Story:
${moral}

📺 Watch full episode on YouTube @zayn.storybook, and catch moments on Instagram Reels, Facebook Watch & Threads @zayn.storybook!
🔖 Save this post so it's easy to find for storytime tonight! ❤️

#ZaynStorybook #KidsStories #ReadAloud #MoralOfTheStory #FamilyStorytime`
        : `☀️ SUDAH TAYANG DI YOUTUBE! 🎬🌟
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${summary}

💖 Pesan Moral:
${moral}

📺 Tonton versi penuhnya di YouTube @zayn.storybook, serta hadir di Instagram Reels, Facebook Watch & Threads @zayn.storybook!
🔖 Simpan postingan ini biar gampang diputar ulang bersama si kecil! ❤️

#ZaynStorybook #DongengAnak #PesanMoral #CeritaAnakBergambar #ParentingIndonesia`;

    const threadsText = trimText(
      lang === "en"
        ? `☀️ Now live on YouTube @zayn.storybook: "${cleanTitle}" 📖✨
📖 Story: ${summaryShort || trimText(summary, 150)}
💖 Moral: ${moralShort || moral}
${youtubeUrl ? `▶️ ${youtubeUrl}` : "Watch & follow @zayn.storybook on YouTube, IG & FB!"} #ZaynStorybook`
        : `☀️ Sudah tayang di YouTube @zayn.storybook: "${cleanTitle}" 📖✨
📖 Ringkasan: ${summaryShort || trimText(summary, 150)}
💖 Pesan Moral: ${moralShort || moral}
${youtubeUrl ? `▶️ ${youtubeUrl}` : "Tonton & ikuti @zayn.storybook di YouTube, IG & FB!"} #ZaynStorybook`,
      480
    );

    return {
      facebookCaption,
      facebookFallbackCaption,
      facebookFirstComment,
      instagramCaption,
      threadsText,
      threadsLinkUrl: youtubeUrl,
    };
  }

  // Wave 3: Bedtime Highlight & Watch-Next (20:30 WIB)
  const facebookFirstComment = [
    `🌙 Putar "${cleanTitle}" di YouTube: ${watchUrl}`,
    rel1 ? `📖 Dongeng Pengantar Tidur Berikutnya di YouTube — "${rel1.title}": ${rel1.url}` : "",
    rel2 ? `🌟 Favorit Keluarga di YouTube — "${rel2.title}": ${rel2.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const buildBedtimeFbBody = (linkBlock: string) => `🌙 DONGENG PENGANTAR TIDUR MALAM INI! ✨🛌
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${summary}

💖 Pesan Moral Malam Ini:
${moral}

${rel1 ? `✨ Mau lanjut nonton sebelum bobo? Putar juga "${rel1.title}" di YouTube Zayn Storybook!\n` : ""}${linkBlock}

📺 Hadir di YouTube, Instagram Reels, Facebook Watch & Threads @zayn.storybook.
💬 Setelah menonton, nilai baik apa yang paling diingat si kecil malam ini? Ceritakan yuk! ❤️

#ZaynStorybook #DongengSebelumTidur #PesanMoral #ParentingIndonesia #KeluargaBahagia`;

  const facebookCaption = buildBedtimeFbBody(`▶️ Tautan YouTube sudah terpasang di KOMENTAR PERTAMA di bawah!`);
  const facebookFallbackCaption = buildBedtimeFbBody(facebookFirstComment);

  const instagramCaption = `🌙 DONGENG PENGANTAR TIDUR MALAM INI! ✨🛌
📖 "${cleanTitle}"

📖 Ringkasan Cerita:
${summary}

💖 Pesan Moral:
${moral}

🔖 SAVE postingan ini untuk menemani rutinitas tidur si kecil!
📺 Tonton tayangan lengkapnya di YouTube @zayn.storybook serta ikuti cuplikan hangatnya di Instagram Reels, Facebook Watch & Threads @zayn.storybook!

💬 Nilai baik apa yang ingin Ayah Bunda bahas bersama si kecil malam ini? ❤️

#ZaynStorybook #DongengSebelumTidur #PesanMoralAnak #CeritaAnak #TidurNyenyak`;

  const threadsText = trimText(
    `🌙 Waktunya dongeng sebelum tidur: "${cleanTitle}" ✨📖
📖 Ringkasan: ${summaryShort || trimText(summary, 150)}
💖 Pesan Moral: ${moralShort || moral}
${youtubeUrl ? `▶️ ${youtubeUrl}` : "Tonton di YouTube, IG & FB @zayn.storybook!"} #ZaynStorybook`,
    480
  );

  return {
    facebookCaption,
    facebookFallbackCaption,
    facebookFirstComment,
    instagramCaption,
    threadsText,
    threadsLinkUrl: youtubeUrl,
  };
}

/**
 * Publishes Wave 2 (12:30 WIB Midday Watch-Now) or Wave 3 (20:30 WIB Bedtime Highlight)
 * post-publish social & SEO distribution announcements.
 */
export async function publishPostPublishWaveAnnouncement(
  options: AnnouncementOptions & { wave: 2 | 3 }
): Promise<{ success: boolean; skipped?: boolean; targetBook?: string; lang?: string }> {
  const wave = options.wave;
  const waveKey = `wave${wave}` as "wave2" | "wave3";
  const waveLabel = wave === 2 ? "Midday Watch-Now & Catch-Up" : "Bedtime Highlight & Watch-Next";
  const targetDate = options.date || getJakartaDateString();

  console.log("\n==================================================================");
  console.log(`🌊 POST-PUBLISH SOCIAL WAVE ${wave} DISPATCHER (${waveLabel.toUpperCase()})`);
  console.log("==================================================================");
  console.log(`📅 Target Date (WIB) : ${targetDate}`);
  console.log(`🧪 Dry Run Mode      : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post     : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  const resolved = await resolveDailyLineupSlots(targetDate);
  let targetBook = options.bookSlug;
  let targetLang: "id" | "en" = options.lang || (wave === 2 ? "en" : "id");

  if (!targetBook && resolved) {
    const primarySlot = wave === 2 ? resolved.morningSlot : resolved.eveningSlot;
    const secondarySlot = wave === 2 ? resolved.eveningSlot : resolved.morningSlot;
    const primarySlug = primarySlot?.book_slug || primarySlot?.bookSlug;
    const secondarySlug = secondarySlot?.book_slug || secondarySlot?.bookSlug;

    if (primarySlug && !primarySlug.startsWith("kompilasi-")) {
      targetBook = primarySlug;
      targetLang = options.lang || ((primarySlot.lang === "id" || primarySlot.lang === "en") ? primarySlot.lang : targetLang);
    } else if (secondarySlug && !secondarySlug.startsWith("kompilasi-")) {
      targetBook = secondarySlug;
      targetLang = options.lang || ((secondarySlot.lang === "id" || secondarySlot.lang === "en") ? secondarySlot.lang : targetLang);
    }
  }

  if (!targetBook) {
    const auditRecords = loadJsonArraySafe<any>(path.resolve("./docs/audit-data.json"));
    const latestPublished = auditRecords.find((r) => r.storySlug && !r.storySlug.startsWith("kompilasi-") && r.platform === "YouTube");
    if (latestPublished) {
      targetBook = latestPublished.storySlug;
      targetLang = options.lang || (latestPublished.language === "en" ? "en" : "id");
    }
  }

  if (!targetBook) {
    console.log(`🌴 Tidak ada buku standalone untuk Wave ${wave} pada tanggal ${targetDate}. Lewati.`);
    return { success: true, skipped: true };
  }

  const storyDir = path.resolve("./stories", targetBook);
  const storyJsonPath = await ensureStoryAssetsLocally(storyDir, targetBook, options.dryRun);

  const story: any = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  if (!story.publications) story.publications = {};
  if (!story.publications.announcements) story.publications.announcements = {};
  if (!story.publications.announcements[targetDate]) story.publications.announcements[targetDate] = {};

  const existingWave = story.publications.announcements[targetDate][waveKey] || {};
  const hasFb = Boolean(existingWave.facebook?.id || existingWave.facebook?.postId);
  const hasIg = Boolean(existingWave.instagram?.id);
  const hasThreads = Boolean(existingWave.threads?.id || existingWave.threads?.postId);

  console.log(`🎯 Featured Story    : [${targetBook}] [${targetLang.toUpperCase()}]`);
  console.log(`   - Facebook Page   : ${hasFb ? `✔ LIVE (${existingWave.facebook?.postId || existingWave.facebook?.id})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed  : ${hasIg ? `✔ LIVE (${existingWave.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads    : ${hasThreads ? `✔ LIVE (${existingWave.threads?.postId || existingWave.threads?.id})` : "⏳ PENDING"}`);

  const allowUpdate = Boolean(options.force || options.edit);
  if (hasFb && hasIg && hasThreads && !allowUpdate) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Wave ${wave} for ${targetBook} (${targetDate}) already live across all channels. Skipping.`);
    return { success: true, skipped: true, targetBook, lang: targetLang };
  }

  const rawTitle = targetLang === "id" ? story.title || story.originalTitle : story.originalTitle || story.title || targetBook;
  const cleanTitle = String(rawTitle || targetBook).replace(/[!]+$/, "").trim();
  const summary = extractStorySummary(story, targetLang, 280);
  const summaryShort = extractStorySummary(story, targetLang, 150);
  const moral = extractMoral(story, targetLang, true);
  const moralShort = extractMoral(story, targetLang, false);

  const { youtubeUrl, ytThumbnailUrl } = await resolveLiveYoutubeInfo(story, targetBook, targetLang);
  const related = resolveRelatedPublishedVideos(targetBook, targetLang, 2);
  const wavePhoto = resolveWavePhoto(storyDir, targetLang, wave);
  const copy = generatePostPublishWaveCopy({
    wave,
    bookSlug: targetBook,
    cleanTitle,
    lang: targetLang,
    summary,
    summaryShort,
    moral,
    moralShort,
    youtubeUrl,
    related,
  });

  console.log(`🖼️ Selected Visual   : ${path.basename(wavePhoto)}`);
  console.log(`▶️ YouTube Link      : ${youtubeUrl || "(Not yet indexed — referencing channel handle)"}`);
  if (related.length > 0) {
    console.log(`📚 Watch Next        : ${related.map((r) => r.title).join(" | ")}`);
  }

  const synced = await syncAnnouncementPlatforms({
    label: `Wave ${wave}`,
    imagePaths: [wavePhoto],
    facebookCaption: copy.facebookCaption,
    facebookFirstComment: copy.facebookFirstComment,
    facebookFallbackCaption: copy.facebookFallbackCaption,
    instagramCaption: copy.instagramCaption,
    threadsText: copy.threadsText,
    threadsLinkUrl: copy.threadsLinkUrl,
    existing: existingWave,
    allowEdit: allowUpdate,
    dryRun: options.dryRun,
  });
  const errors = synced.errors;
  const fbResult = synced.facebook;
  const igResult = synced.instagram;
  const thResult = synced.threads;

  if (!options.dryRun) {
    story.publications.announcements[targetDate][waveKey] = {
      announcedAt: new Date().toISOString(),
      wave,
      lang: targetLang,
      youtubeUrl,
      facebook: fbResult,
      instagram: igResult,
      threads: thResult,
    };
    await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2), "utf-8");
    try {
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", targetBook, "--manifest-only"]);
      console.log(`✔ story.json & R2 manifest updated for Wave ${wave}.`);
    } catch (pushErr: any) {
      console.warn(`⚠️ Warning syncing manifest to R2:`, pushErr.message);
    }
  }

  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: targetBook,
        lang: targetLang,
        slot: `Wave ${wave} (${waveLabel})`,
        platform: `Post-Publish Announcement Wave ${wave}`,
        error: errors.join("\n"),
      });
    } catch {}
  } else if (errors.length === 0) {
    try {
      await notifyTelegramAnnouncement({
        dateStr: targetDate,
        wave,
        waveLabel,
        morningBook: wave === 2 ? targetBook : undefined,
        morningTitle: wave === 2 ? cleanTitle : undefined,
        morningLang: wave === 2 ? targetLang : undefined,
        morningHook: wave === 2 ? summary : undefined,
        eveningBook: wave === 3 ? targetBook : undefined,
        eveningTitle: wave === 3 ? cleanTitle : undefined,
        eveningLang: wave === 3 ? targetLang : undefined,
        eveningHook: wave === 3 ? summary : undefined,
        youtubeUrl,
        relatedTitle: related[0]?.title,
        relatedUrl: related[0]?.url,
        photoUrl: ytThumbnailUrl,
        facebookUrl: fbResult?.url,
        instagramUrl: igResult?.url,
        threadsUrl: thResult?.url,
        dryRun: options.dryRun,
      });
    } catch (e: any) {
      console.warn(`⚠️ Warning sending Telegram Wave ${wave} notification:`, e.message);
    }
  }

  console.log(`\n🎉 POST-PUBLISH WAVE ${wave} DISPATCH COMPLETE!\n`);
  return { success: errors.length === 0, targetBook, lang: targetLang };
}

/**
 * Resolves dedicated Sunday Full-Motion slots for a given date without mixing regular book slots.
 */
async function resolveFullMotionSlots(targetDate: string, bookSlug?: string, lang?: string): Promise<any[]> {
  const merged = new Map<string, any>();
  for (const s of DAILY_CALENDAR_MONTH_1) {
    if (s.date !== targetDate || !isFullMotionSlot(s)) continue;
    merged.set(`${s.date}::${s.timeSlot}::${s.lang}`, s);
  }
  try {
    const d1Slots = await db.getCalendar(targetDate);
    for (const row of d1Slots || []) {
      if (!isFullMotionSlot(row)) continue;
      const key = `${row.scheduled_date}::${row.time_slot}::${row.lang}`;
      if (!merged.has(key)) merged.set(key, row);
    }
  } catch (e: any) {
    console.warn("ℹ️ D1 Full-Motion lookup warning:", e.message);
  }

  let all = Array.from(merged.values());
  if (lang === "id" || lang === "en") {
    const langFiltered = all.filter((s) => s.lang === lang);
    if (langFiltered.length > 0) all = langFiltered;
  }
  if (bookSlug) {
    const filtered = all.filter((s) => (s.book_slug || s.bookSlug) === bookSlug);
    return filtered.length > 0 ? filtered : [{ bookSlug, timeSlot: "15:00 WIB", lang: lang || "id" }];
  }
  return all;
}

export interface FullMotionCopyPayload {
  displayTitle: string;
  afterLangBanner: string;
  captionIg: string;
  captionFb: string;
  captionTh: string;
  facebookFirstComment?: string;
}

export function generateFullMotionCopy(params: {
  story: any;
  targetBook: string;
  phase: "before" | "after";
  slotTime: string;
  slotLang: "id" | "en";
  dayHeadingEn: "SUNDAY" | "WEDNESDAY";
  dayLabelId: "Minggu" | "Rabu";
  ytIdUrl?: string;
  ytEnUrl?: string;
  hasEnLive?: boolean;
  hasIdLive?: boolean;
}): FullMotionCopyPayload {
  const {
    story,
    targetBook,
    phase,
    slotTime,
    slotLang,
    dayHeadingEn,
    dayLabelId,
    ytIdUrl,
    ytEnUrl,
    hasEnLive = Boolean(ytEnUrl),
    hasIdLive = Boolean(ytIdUrl),
  } = params;

  const isEn = slotLang === "en";
  const slotLangBanner = isEn ? "English Edition 🇬🇧" : "Bahasa Indonesia 🇮🇩";
  const cleanTitleId = (story?.title || targetBook).replace(/[!]+$/, "").trim();
  const cleanTitleEn = (story?.originalTitle || cleanTitleId).replace(/[!]+$/, "").trim();
  const displayTitle = isEn ? cleanTitleEn : cleanTitleId;
  const storySummary = extractStorySummary(story, slotLang, 280);
  const moral = extractMoral(story, slotLang, true);
  const moralShort = extractMoral(story, slotLang, false);

  const afterLangBanner =
    hasEnLive && hasIdLive
      ? "Bahasa Indonesia & English 🇮🇩🇬🇧"
      : hasEnLive
        ? "English Edition 🇬🇧"
        : hasIdLive
          ? "Bahasa Indonesia 🇮🇩"
          : slotLangBanner;

  const primaryYtUrl = (isEn ? ytEnUrl || ytIdUrl : ytIdUrl || ytEnUrl) || SOCIAL_YOUTUBE_CHANNEL_URL;
  const youtubeWatchLines = [
    ytEnUrl ? `🇬🇧 YouTube Full-Motion (EN): ${ytEnUrl}` : "",
    ytIdUrl ? `🇮🇩 YouTube Full-Motion (ID): ${ytIdUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const captionIg =
    phase === "before"
      ? isEn
        ? `🎬✨ SPECIAL ${dayHeadingEn} FULL-MOTION PREMIERE (${slotLangBanner}) — 1 HOUR TO GO (${slotTime})!

📖 "${displayTitle}"

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

🎭 Featuring Full-Motion character animation + expressive child voice acting!
📺 Watch the premiere on YouTube @zayn.storybook and follow Instagram Reels, Facebook Watch & Threads @zayn.storybook!

#ZaynStorybook #FullMotionKids #KidsStories #MoralOfTheStory #${dayHeadingEn === "WEDNESDAY" ? "WednesdayPremiere" : "SundayPremiere"}`
        : `🎬✨ SPECIAL ${dayHeadingEn} FULL-MOTION PREMIERE (${slotLangBanner}) — 1 JAM LAGI (${slotTime})!

📖 "${displayTitle}"

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

🎭 Edisi spesial Full-Motion Animasi dengan karakter bergerak & sulih suara anak ekspresif!
📺 Saksikan tayang perdananya di YouTube @zayn.storybook dan ikuti Instagram Reels, Facebook Watch & Threads @zayn.storybook!

#ZaynStorybook #FullMotionKids #DongengAnak #PesanMoralAnak #${dayHeadingEn === "WEDNESDAY" ? "WednesdayPremiere" : "SundayPremiere"}`
      : isEn
        ? `🎬🌟 FULL-MOTION EDITION (${afterLangBanner}) — NOW STREAMING!

📖 "${cleanTitleEn}"

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

▶️ Watch Full HD (16:9) on YouTube @zayn.storybook, and catch Shorts/Reels on Instagram, Facebook Watch & Threads @zayn.storybook!
💬 What part of "${cleanTitleEn}" did your child talk about most? Share below! ❤️

#ZaynStorybook #FullMotionKids #KidsStories #MoralStories #FamilyStorytime`
        : `🎬🌟 FULL-MOTION EDITION (${afterLangBanner}) — SUDAH TAYANG!

📖 "${cleanTitleId}" / "${cleanTitleEn}"

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

▶️ Tonton Full HD (16:9) di YouTube @zayn.storybook serta Shorts/Reels di Instagram, Facebook Watch & Threads @zayn.storybook!
💬 Pelajaran baik apa nih yang paling diingat si kecil setelah menonton? Tulis di komentar! ❤️

#ZaynStorybook #FullMotionKids #Dongeng${dayLabelId} #PesanMoral #CeritaAnak`;

  const captionFb =
    phase === "before"
      ? isEn
        ? `🎬 SPECIAL ${dayHeadingEn} FULL-MOTION PREMIERE (${slotLangBanner}, ${slotTime}) — 1 Hour to Go!

📖 "${displayTitle}"

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

🎭 Enjoy lively character animation, playful sound design & expressive child narration!
📺 Tune in on YouTube Zayn Storybook (${SOCIAL_YOUTUBE_CHANNEL_URL}) plus Instagram Reels, Facebook Watch & Threads @zayn.storybook!`
        : `🎬 SPECIAL ${dayHeadingEn} FULL-MOTION PREMIERE (${slotLangBanner}, ${slotTime}) — 1 Jam Lagi!

📖 "${displayTitle}"

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

🎭 Nikmati animasi karakter bergerak, efek suara ceria & sulih suara anak yang ekspresif!
📺 Tonton di YouTube Zayn Storybook (${SOCIAL_YOUTUBE_CHANNEL_URL}), serta ikuti Instagram Reels, Facebook Watch & Threads @zayn.storybook!`
      : isEn
        ? `🎬✨ FULL-MOTION EDITION — NOW STREAMING! (${cleanTitleEn} — ${afterLangBanner})

📖 Story Summary:
${storySummary}

💡 Moral of the Story:
${moral}

${youtubeWatchLines ? `${youtubeWatchLines}\n` : `📺 Watch Full HD on YouTube Zayn Storybook: ${SOCIAL_YOUTUBE_CHANNEL_URL}\n`}📱 Also catch Shorts/Reels and updates on Instagram Reels, Facebook Watch & Threads @zayn.storybook!
💬 What lesson stood out most for your child in this story? Share in the comments! ❤️

#ZaynStorybook #FullMotionKids #KidsStories #MoralOfTheStory #FamilyStorytime`
        : `🎬✨ FULL-MOTION EDITION SUDAH TAYANG! (${displayTitle} — ${afterLangBanner})

📖 Ringkasan Cerita:
${storySummary}

💡 Pesan Moral:
${moral}

${youtubeWatchLines ? `${youtubeWatchLines}\n` : `📺 Tonton Full HD di YouTube Zayn Storybook: ${SOCIAL_YOUTUBE_CHANNEL_URL}\n`}📱 Ikuti juga cuplikannya di Instagram Reels, Facebook Watch & Threads @zayn.storybook!
💬 Pesan moral apa yang paling berkesan untuk si kecil dari cerita ini? Yuk bagikan di komentar! ❤️

#ZaynStorybook #FullMotionKids #Dongeng${dayLabelId} #PesanMoral #CeritaAnak`;

  const captionTh = trimText(
    phase === "before"
      ? isEn
        ? `🎬 In 1 hour (${slotTime}): Full-Motion "${displayTitle}" (${slotLangBanner}) on YouTube @zayn.storybook!
📖 ${trimText(storySummary, 150)}
💡 Moral: ${moralShort}
Watch & follow on YouTube, Instagram & Facebook @zayn.storybook ✨`
        : `🎬 1 jam lagi (${slotTime}): Full-Motion "${displayTitle}" (${slotLangBanner}) di YouTube @zayn.storybook!
📖 ${trimText(storySummary, 150)}
💡 Moral: ${moralShort}
Tonton & ikuti di YouTube, Instagram & Facebook @zayn.storybook ✨`
      : isEn
        ? `✨ Full-Motion "${displayTitle}" (${afterLangBanner}) IS LIVE!
📖 ${trimText(storySummary, 140)}
💡 Moral: ${moralShort}
▶️ ${primaryYtUrl} (also on IG, FB & Threads @zayn.storybook)`
        : `✨ Full-Motion "${displayTitle}" (${afterLangBanner}) SUDAH TAYANG!
📖 ${trimText(storySummary, 140)}
💡 Moral: ${moralShort}
▶️ ${primaryYtUrl} (juga di IG, FB & Threads @zayn.storybook)`,
    480
  );

  const facebookFirstComment =
    phase === "after"
      ? youtubeWatchLines ||
        (isEn
          ? `▶️ Watch on YouTube Zayn Storybook: ${SOCIAL_YOUTUBE_CHANNEL_URL}`
          : `▶️ Tonton di YouTube Zayn Storybook: ${SOCIAL_YOUTUBE_CHANNEL_URL}`)
      : undefined;

  return { displayTitle, afterLangBanner, captionIg, captionFb, captionTh, facebookFirstComment };
}

/**
 * Publishes dedicated BEFORE (14:00 WIB teaser) or AFTER (17:00 WIB watch-now recap) announcements
 * for Sunday (EN) and Wednesday (ID) Full-Motion Premieres, separate from illustration schedules.
 */
export async function publishFullMotionAnnouncement(
  options: AnnouncementOptions & { motionPhase: "before" | "after" }
): Promise<{ success: boolean; skipped?: boolean; targetBook?: string; lang?: string }> {
  const phase = options.motionPhase;
  const targetDate = options.date || getJakartaDateString();
  const phaseKey = phase === "before" ? "fullMotionBefore" : "fullMotionAfter";
  const isWed = new Date(`${targetDate}T12:00:00Z`).getUTCDay() === 3;
  const dayHeadingEn: "SUNDAY" | "WEDNESDAY" = isWed ? "WEDNESDAY" : "SUNDAY";
  const dayLabelId: "Minggu" | "Rabu" = isWed ? "Rabu" : "Minggu";

  console.log("\n==================================================================");
  console.log(`🎬 ${dayHeadingEn} FULL-MOTION ANNOUNCEMENT (${phase.toUpperCase()})`);
  console.log("==================================================================");
  console.log(`📅 Target Date (WIB) : ${targetDate}`);
  console.log(`🧪 Dry Run Mode      : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);

  const motionSlots = await resolveFullMotionSlots(targetDate, options.bookSlug, options.lang);
  if (motionSlots.length === 0) {
    console.log(`🌴 Tidak ada jadwal Full-Motion Premiere pada ${targetDate}. Lewati.`);
    return { success: true, skipped: true };
  }

  const primarySlot = motionSlots[0];
  const targetBook = primarySlot.book_slug || primarySlot.bookSlug;
  const slotTime = primarySlot.time_slot || primarySlot.timeSlot || "15:00 WIB";
  const slotLang: "id" | "en" =
    primarySlot.lang === "id" || primarySlot.lang === "en"
      ? primarySlot.lang
      : options.lang === "id" || options.lang === "en"
        ? options.lang
        : isWed
          ? "id"
          : "en";
  const storyDir = path.resolve("./stories", targetBook);
  const storyJsonPath = path.join(storyDir, "story.json");

  if (!existsSync(storyJsonPath)) {
    console.log(`📥 Story assets missing locally for [${targetBook}]. Pulling from Cloudflare R2...`);
    await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", targetBook]);
  }

  const story = existsSync(storyJsonPath)
    ? JSON.parse(await fs.readFile(storyJsonPath, "utf-8"))
    : { slug: targetBook, title: targetBook, originalTitle: targetBook };

  if (!story.publications) story.publications = {};
  if (!story.publications.announcements) story.publications.announcements = {};
  if (!story.publications.announcements[targetDate]) story.publications.announcements[targetDate] = {};

  const existing = story.publications.announcements[targetDate][phaseKey] || {};
  const hasFb = Boolean(existing.facebook?.id || existing.facebook?.postId);
  const hasIg = Boolean(existing.instagram?.id);
  const hasThreads = Boolean(existing.threads?.id || existing.threads?.postId);
  const allowUpdate = Boolean(options.force || options.edit);

  if (hasFb && hasIg && hasThreads && !allowUpdate) {
    console.log(`🛡️ [ZERO DUPLICATE GATE] Full-Motion ${phase.toUpperCase()} for [${targetBook}] (${targetDate}) already posted.`);
    return { success: true, skipped: true, targetBook, lang: slotLang };
  }

  const visualPath = resolveBestPhoto(storyDir, slotLang);
  const pickYtUrl = (entry: any): string | undefined =>
    typeof entry === "string" ? entry : entry?.url || (entry?.id ? `https://youtu.be/${entry.id}` : undefined);
  const ytIdUrl =
    pickYtUrl(story.publications?.youtube?.id?.landscape) ||
    pickYtUrl(story.publications?.youtube?.id?.vertical);
  const ytEnUrl =
    pickYtUrl(story.publications?.youtube?.en?.landscape) ||
    pickYtUrl(story.publications?.youtube?.en?.vertical);

  const hasEnLive = Boolean(ytEnUrl || story.publications?.instagram?.en?.id || story.publications?.facebook?.en?.landscape?.id);
  const hasIdLive = Boolean(ytIdUrl || story.publications?.instagram?.id?.id || story.publications?.facebook?.id?.landscape?.id);

  const { displayTitle, captionIg, captionFb, captionTh, facebookFirstComment } = generateFullMotionCopy({
    story,
    targetBook,
    phase,
    slotTime,
    slotLang,
    dayHeadingEn,
    dayLabelId,
    ytIdUrl,
    ytEnUrl,
    hasEnLive,
    hasIdLive,
  });

  console.log(`📖 Story  : ${displayTitle} (${targetBook}, ${slotLang.toUpperCase()})`);
  console.log(`🖼️ Visual : ${path.basename(visualPath)}`);

  if (options.dryRun) {
    console.log(`\n🧪 [DRY RUN] Preview Full-Motion ${phase.toUpperCase()} Captions:`);
    console.log(`--- INSTAGRAM ---\n${captionIg}\n--- FACEBOOK ---\n${captionFb}\n--- THREADS ---\n${captionTh}\n`);
    if (facebookFirstComment) {
      console.log(`--- FACEBOOK FIRST COMMENT ---\n${facebookFirstComment}\n`);
    }
    return { success: true, targetBook, lang: slotLang };
  }

  const synced = await syncAnnouncementPlatforms({
    label: `Full-Motion ${phase.toUpperCase()}`,
    imagePaths: [visualPath],
    facebookCaption: captionFb,
    facebookFirstComment,
    facebookFallbackCaption: captionFb,
    instagramCaption: captionIg,
    threadsText: captionTh,
    existing,
    allowEdit: allowUpdate,
    dryRun: options.dryRun,
  });
  const errors = synced.errors;
  const fbResult = synced.facebook;
  const igResult = synced.instagram;
  const thResult = synced.threads;

  story.publications.announcements[targetDate][phaseKey] = {
    scheduledSlot: slotTime,
    announcedAt: existing.announcedAt || new Date().toISOString(),
    ...(allowUpdate ? { updatedAt: new Date().toISOString() } : {}),
    phase,
    facebook: fbResult,
    instagram: igResult,
    threads: thResult,
  };
  await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2), "utf-8");
  await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", targetBook, "--manifest-only"]).catch(() => {});

  if (errors.length > 0) {
    await notifyTelegramFailure({
      bookSlug: targetBook,
      lang: slotLang,
      slot: `${dayLabelId} Full-Motion ${phase.toUpperCase()} (${slotTime})`,
      platform: "Full-Motion Announcement Dispatcher",
      error: errors.join("\n"),
    }).catch(() => {});
  } else {
    await notifyTelegramAnnouncement({
      dateStr: targetDate,
      morningBook: targetBook,
      morningTitle: `${displayTitle} [Full-Motion ${phase.toUpperCase()}]`,
      morningLang: slotLang,
      morningSlotTime: slotTime,
      morningHook: extractStorySummary(story, slotLang, 160),
      youtubeUrl: slotLang === "en" ? ytEnUrl || ytIdUrl : ytIdUrl || ytEnUrl,
      facebookUrl: fbResult?.url,
      instagramUrl: igResult?.url,
      threadsUrl: thResult?.url,
    }).catch(() => {});
  }

  return { success: errors.length === 0, targetBook, lang: slotLang };
}

/**
 * Main routine: Publishes deduplicated announcement feeds across Facebook, Instagram, and Threads.
 * Note: Telegram is strictly an internal creator notification tool and skipped from public feeds.
 */
export async function publishAnnouncement(options: AnnouncementOptions = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  targetBook?: string;
  lang?: string;
}> {
  if (options.motionPhase) {
    return publishFullMotionAnnouncement({ ...options, motionPhase: options.motionPhase });
  }
  if (options.wave === 2 || options.wave === 3) {
    return publishPostPublishWaveAnnouncement({ ...options, wave: options.wave });
  }

  // If daily lineup mode is requested, or if slot is "daily" or "all", or default in morning without explicit book:
  const isDailyLineup =
    options.dailyLineup ||
    options.slot === "daily" ||
    options.slot === "all" ||
    (!options.bookSlug && options.slot !== "morning" && options.slot !== "evening");

  if (isDailyLineup) {
    const res = await publishDailyLineupAnnouncement(options);
    return {
      success: res.success,
      skipped: res.skipped,
      targetBook: `${res.morningBook}+${res.eveningBook}`,
      lang: "bilingual",
    };
  }

  const todayDate = options.date || getJakartaDateString();
  const currentHour = getJakartaHour();

  console.log("\n==================================================================");
  console.log("📢 PRE-BROADCAST ANNOUNCEMENT FEED DISPATCHER (1 HOUR PRIOR)");
  console.log("==================================================================");
  console.log(`📅 Date (WIB)     : ${todayDate}`);
  console.log(`⏰ Current Hour   : ${currentHour}:00 WIB`);
  console.log(`🧪 Dry Run Mode   : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post  : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  // 1. Determine Target Book & Slot
  let targetBook = options.bookSlug;
  let targetLang = options.lang;
  let slotTime = "19:00 WIB";
  let slotLabel = "Prime Bedtime Story";

  if (!targetBook) {
    const isEvening = options.slot === "evening" || (options.slot !== "morning" && currentHour >= 12);
    let matchingSlot: any = null;

    // Check Cloudflare D1 content_calendar first
    try {
      const d1Slots = await db.getCalendar(todayDate);
      if (d1Slots && d1Slots.length > 0) {
        matchingSlot = d1Slots.find((s) => {
          const isMorningSlot =
            s.time_slot.includes("07:") ||
            s.time_slot.includes("08:") ||
            s.slot_type.toLowerCase().includes("morning");
          return isEvening ? !isMorningSlot : isMorningSlot;
        }) || d1Slots[0];
      }
    } catch (e: any) {
      console.warn("ℹ️ Could not query D1 calendar, falling back to local calendar:", e.message);
    }

    if (!matchingSlot) {
      const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
      const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const dayName = dayNames[nowJakarta.getDay()];

      const todaySlots = DAILY_CALENDAR_MONTH_1.filter((s) => {
        if (s.date && s.date === todayDate) return true;
        if (!s.date && s.dayName === dayName) return true;
        return false;
      });

      matchingSlot = todaySlots.find((s) => {
        const isMorningSlot =
          s.timeSlot.includes("07:") ||
          s.timeSlot.includes("08:") ||
          s.slotType.toLowerCase().includes("morning");
        return isEvening ? !isMorningSlot : isMorningSlot;
      }) || todaySlots[0];
    }

    if (!matchingSlot) {
      console.log(`🌴 Hari ini (${todayDate}) tidak ada jadwal tayang aktif. Lewati pengumuman.`);
      return { success: true, skipped: true };
    }

    targetBook = matchingSlot.book_slug || matchingSlot.bookSlug;
    targetLang = targetLang || matchingSlot.lang;
    slotTime = matchingSlot.time_slot || matchingSlot.timeSlot;
    slotLabel = matchingSlot.slot_type || matchingSlot.slotType;
  }

  const lang = targetLang || "id";
  console.log(`📖 Target Story   : ${targetBook} [${lang.toUpperCase()}]`);
  console.log(`🎯 Upcoming Slot  : ${slotTime} (${slotLabel})`);
  console.log("==================================================================\n");

  // 2. Ensure Story Exists Locally (pull from R2 if missing)
  const storyDir = path.resolve("./stories", targetBook);
  const storyJsonPath = path.join(storyDir, "story.json");
  if (!existsSync(storyJsonPath)) {
    console.log(`📥 Story assets not found locally for [${targetBook}]. Pulling from Cloudflare R2...`);
    await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", targetBook]);
  }

  if (!existsSync(storyJsonPath)) {
    throw new Error(`story.json not found for book '${targetBook}' at ${storyJsonPath}`);
  }

  const story = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  if (!story.publications) story.publications = {};
  if (!story.publications.announcements) story.publications.announcements = {};
  if (!story.publications.announcements[todayDate]) story.publications.announcements[todayDate] = {};

  const existingAnn: AnnouncementRecord = story.publications.announcements[todayDate][lang] || {
    scheduledSlot: slotTime,
    announcedAt: new Date().toISOString(),
  };

  // 3. Strict Deduplication Gate (Public Platforms: Facebook, Instagram, Threads)
  // Note: Telegram is strictly reserved for internal creator notifications/alerts and skipped from public feeds.
  const hasFb = Boolean(existingAnn.facebook?.id || existingAnn.facebook?.postId);
  const hasIg = Boolean(existingAnn.instagram?.id);
  const hasThreads = Boolean(existingAnn.threads?.id || existingAnn.threads?.postId);

  console.log("🔍 ANNOUNCEMENT DEDUPLICATION STATUS (PUBLIC SOCIAL FEEDS):");
  console.log(`   - Facebook Page Feed : ${hasFb ? `✔ LIVE (${existingAnn.facebook?.postId || existingAnn.facebook?.id})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed     : ${hasIg ? `✔ LIVE (${existingAnn.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads       : ${hasThreads ? `✔ LIVE (${existingAnn.threads?.id})` : "⏳ PENDING"}`);

  const allowUpdate = Boolean(options.force || options.edit);
  const isAllPublished = hasFb && hasIg && hasThreads;
  if (isAllPublished && !allowUpdate) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Announcement for "${story.title}" [${lang.toUpperCase()}] on ${todayDate} has ALREADY been published across ALL public social platforms!`);
    console.log(`   ⏩ Skipping announcement feed to guarantee ZERO duplicate posts.`);
    console.log(`   💡 Tip: Pass --edit to update supported platforms in-place.\n`);
    return { success: true, skipped: true, targetBook, lang };
  }

  // 4. Resolve Image & Copy
  const photoPath = resolveBestPhoto(storyDir, lang);
  console.log(`\n🖼️ Visual Asset Selected: ${path.basename(photoPath)} (${photoPath})`);

  const {
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionYoutubeCommunity,
  } = generateTeaserCopy(story, lang, slotTime);

  const synced = await syncAnnouncementPlatforms({
    label: `Single Slot ${slotTime}`,
    imagePaths: [photoPath],
    facebookCaption: captionFacebook,
    instagramCaption: captionInstagram,
    threadsText: captionThreads,
    existing: existingAnn,
    allowEdit: allowUpdate,
    dryRun: options.dryRun,
  });
  const errors = synced.errors;
  existingAnn.facebook = synced.facebook;
  existingAnn.instagram = synced.instagram;
  existingAnn.threads = synced.threads;

  if (options.dryRun) {
    console.log("\n[DRY RUN] YouTube Community Announcement Preview:\n", captionYoutubeCommunity);
  }

  // 6. Save Manifest & Push Back to Cloudflare R2
  if (!options.dryRun) {
    story.publications.announcements[todayDate][lang] = existingAnn;
    await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2), "utf-8");
    console.log(`\n✔ story.json updated with announcement publication record.`);

    try {
      console.log(`☁️ Syncing updated manifest to Cloudflare R2...`);
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", targetBook, "--manifest-only"]);
      console.log(`✔ Cloudflare R2 manifest synchronized.`);
    } catch (pushErr: any) {
      console.warn(`⚠️ Warning syncing manifest to Cloudflare R2:`, pushErr.message);
    }
  }

  // 7. Alert Telegram if errors occurred, or notify success
  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: targetBook,
        lang,
        slot: `${slotTime} (${slotLabel})`,
        platform: "Pre-Broadcast Announcement Feed",
        error: errors.join("\n"),
      });
    } catch {}
  } else if (errors.length === 0) {
    try {
      await notifyTelegramAnnouncement({
        dateStr: todayDate,
        morningBook: targetBook,
        morningTitle: story.title,
        morningLang: lang,
        morningSlotTime: slotTime,
        morningHook: story.thumbnailConfig?.[lang]?.hook || story.title,
        facebookUrl: existingAnn.facebook?.url,
        instagramUrl: existingAnn.instagram?.url,
        threadsUrl: existingAnn.threads?.url,
        dryRun: options.dryRun,
      });
    } catch (e: any) {
      console.warn("⚠️ Warning sending Telegram announcement success alert:", e.message);
    }
  }

  console.log("\n🎉 ANNOUNCEMENT FEED DISPATCH COMPLETE!\n");
  return { success: errors.length === 0, targetBook, lang };
}

// ── CLI Runner ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const edit = args.includes("--edit");
  const dailyLineup = args.includes("--daily-lineup");
  const waveArg = getArg("--wave");
  const wave: 1 | 2 | 3 | undefined = waveArg === "2" ? 2 : waveArg === "3" ? 3 : waveArg === "1" ? 1 : undefined;
  const motionPhaseArg = getArg("--motion-phase");
  const motionPhase: "before" | "after" | undefined =
    motionPhaseArg === "before" || motionPhaseArg === "after" ? motionPhaseArg : undefined;
  const dateArg = getArg("--date");
  const bookSlug = getArg("--book");
  const langArg = getArg("--lang") as "id" | "en" | undefined;
  const slotArg = getArg("--slot") as "morning" | "evening" | "motion" | "auto" | "daily" | "all" | undefined;

  await publishAnnouncement({
    bookSlug,
    lang: langArg,
    slot: slotArg,
    dailyLineup,
    wave,
    motionPhase,
    date: dateArg,
    dryRun,
    force,
    edit,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error("❌ Fatal error in Announcement Publisher:", err);
    process.exit(1);
  });
}
