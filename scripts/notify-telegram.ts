import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramNotifyOptions {
  bookSlug: string;
  lang?: "id" | "en";
  slot?: string;
  dryRun?: boolean;
}

export interface TelegramFailureOptions {
  bookSlug?: string;
  lang?: "id" | "en";
  slot?: string;
  platform?: string;
  error: string | Error;
  runUrl?: string;
  runId?: string;
  dryRun?: boolean;
}

export interface TelegramAnnouncementOptions {
  dateStr?: string;
  wave?: 1 | 2 | 3;
  waveLabel?: string;
  morningBook?: string;
  morningTitle?: string;
  morningLang?: string;
  morningSlotTime?: string;
  morningHook?: string;
  eveningBook?: string;
  eveningTitle?: string;
  eveningLang?: string;
  eveningSlotTime?: string;
  eveningHook?: string;
  portalUrl?: string;
  youtubeUrl?: string;
  relatedTitle?: string;
  relatedUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  threadsUrl?: string;
  photoUrl?: string;
  dryRun?: boolean;
}

export interface PlatformStatsSummary {
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  reach?: number;
  videoCount: number;
}

export interface TopContentItem {
  title: string;
  platform: string;
  format: string;
  views: number;
  likes: number;
  url: string;
}

export interface AnalyticsReportOptions {
  periodLabel?: string;
  youtube?: PlatformStatsSummary & { subscribers?: number; totalChannelViews?: number };
  facebook?: PlatformStatsSummary;
  instagram?: PlatformStatsSummary;
  threads?: PlatformStatsSummary;
  topContent?: TopContentItem[];
  dryRun?: boolean;
}

/**
 * Formats a date into a clean, human-readable Indonesian/English timestamp in Western Indonesia Time (WIB, UTC+7).
 * Example ID: "Minggu, 8 November 2026 pukul 16:54 WIB"
 * Example EN: "Sunday, 8 November 2026 at 16:54 WIB"
 */
export function formatWibTimestamp(date: Date = new Date(), lang: "id" | "en" = "id"): string {
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  if (lang === "en") {
    return `${formatted} WIB`;
  }
  return `${formatted.replace(/\./g, ":")} WIB`;
}

/**
 * Resolves Telegram credentials from environment variables or config/telegram-config.json.
 */
export function getTelegramConfig(): TelegramConfig | null {
  const envToken = process.env.TELEGRAM_BOT_TOKEN || process.env.PERSONAL_TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.TELEGRAM_CHAT_ID || process.env.PERSONAL_TELEGRAM_CHAT_ID;

  if (envToken && envChatId) {
    return {
      botToken: envToken.trim(),
      chatId: envChatId.trim(),
    };
  }

  const configPath = path.resolve("./config/telegram-config.json");
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
      if (parsed.botToken && parsed.chatId) {
        return {
          botToken: String(parsed.botToken).trim(),
          chatId: String(parsed.chatId).trim(),
        };
      }
    } catch (err: any) {
      console.warn("⚠️ Warning reading config/telegram-config.json:", err.message);
    }
  }

  return null;
}

/**
 * Sends a notification message or photo to a Telegram channel/chat.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  captionHtml: string,
  photoUrl?: string
): Promise<boolean> {
  const { botToken, chatId } = config;

  // Try sendPhoto first if a photo URL is available
  if (photoUrl) {
    try {
      const photoEndpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      const res = await fetch(photoEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: captionHtml,
          parse_mode: "HTML",
        }),
      });

      if (res.ok) {
        console.log(`✔ Telegram photo broadcast sent successfully to chat [${chatId}]!`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`⚠️ Telegram sendPhoto returned HTTP ${res.status}: ${errText}. Falling back to text message.`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Telegram sendPhoto error: ${err.message}. Falling back to text message.`);
    }
  }

  // Fallback: standard sendMessage
  try {
    const textEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(textEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: captionHtml,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (res.ok) {
      console.log(`✔ Telegram text broadcast sent successfully to chat [${chatId}]!`);
      return true;
    } else {
      const errText = await res.text();
      console.error(`❌ Telegram sendMessage failed (HTTP ${res.status}): ${errText}`);
      return false;
    }
  } catch (err: any) {
    console.error(`❌ Telegram network error: ${err.message}`);
    return false;
  }
}

/**
 * Dispatches a formatted publication broadcast notification to Telegram.
 */
export async function notifyTelegramPublish(options: TelegramNotifyOptions): Promise<boolean> {
  const config = getTelegramConfig();
  const lang = options.lang || "id";

  if (!config) {
    console.log("\nℹ️  Telegram notification skipped: Credentials not configured.");
    console.log("👉 To enable Telegram publication alerts, set GitHub Secrets or .env:");
    console.log("   - TELEGRAM_BOT_TOKEN : Bot API Token from @BotFather");
    console.log("   - TELEGRAM_CHAT_ID   : Target Channel (@channel_name) or Chat ID (-100xxxx)\n");
    return false;
  }

  const storyDir = path.resolve("./stories", options.bookSlug);
  const storyPath = path.join(storyDir, "story.json");
  if (!existsSync(storyPath)) {
    console.warn(`⚠️ Cannot send Telegram notification: story.json not found for [${options.bookSlug}]`);
    return false;
  }

  const story = JSON.parse(await fs.readFile(storyPath, "utf-8"));
  const pub = story.publications || {};

  // Extract Links
  const ytLandscape = pub.youtube?.[lang]?.landscape?.url;
  const ytVertical = pub.youtube?.[lang]?.vertical?.url;
  const igUrl = pub.instagram?.[lang]?.url || pub.instagram?.url;
  const fbLandUrl = pub.facebook?.[lang]?.landscape?.url;
  const fbVertUrl = pub.facebook?.[lang]?.vertical?.url;
  const fbUrl = fbVertUrl || fbLandUrl;
  const threadsUrl = pub.threads?.[lang]?.url || pub.threads?.url;

  const title = lang === "en" ? (story.originalTitle || story.title) : story.title;
  const moralText =
    lang === "en"
      ? (story.moral?.headlineEn || "Be kind, learn, and grow together!")
      : (story.moral?.headlineId || "Belajar hal baru dan berbuat baik setiap hari!");

  // Build message HTML
  const isEn = lang === "en";
  const wibTime = formatWibTimestamp(new Date(), lang);
  const header = isEn
    ? `🚀 <b>Zayn Storybook: New Story Now Streaming!</b> 🌟\n`
    : `🚀 <b>Zayn Storybook: Cerita Baru Mengudara!</b> 🌟\n`;
  const titleLabel = isEn ? "Title" : "Judul";
  const moralLabel = isEn ? "Moral Lesson" : "Pesan Moral";
  const timeLabel = isEn ? "Broadcast Time" : "Waktu Tayang";
  const watchLabel = isEn ? "Watch & Enjoy Together" : "Tonton & Nikmati Bersama";
  const footer = isEn
    ? `\n✨ <i>Happy watching and storytelling with your little one!</i> 🌙`
    : `\n✨ <i>Selamat menonton dan mendongeng bersama si kecil!</i> 🌙`;

  const lines: string[] = [
    header,
    `📖 <b>${titleLabel}:</b> <i>${title}</i> [${lang.toUpperCase()}]`,
    `💡 <b>${moralLabel}:</b> ${moralText}`,
    `⏰ <b>${timeLabel}:</b> ${wibTime}${options.slot ? ` • ${options.slot}` : ""}`,
  ];

  lines.push(`\n🔗 <b>${watchLabel}:</b>`);
  if (ytLandscape) lines.push(isEn ? `▶️ <a href="${ytLandscape}">YouTube (16:9 Full HD Video)</a>` : `▶️ <a href="${ytLandscape}">YouTube (Video 16:9 Full HD)</a>`);
  if (ytVertical) lines.push(`📱 <a href="${ytVertical}">YouTube Shorts (9:16)</a>`);
  if (igUrl) lines.push(`📸 <a href="${igUrl}">Instagram Reels</a>`);
  if (fbUrl) lines.push(`📘 <a href="${fbUrl}">Facebook Video</a>`);
  if (threadsUrl) lines.push(`🧵 <a href="${threadsUrl}">Meta Threads</a>`);

  lines.push(footer);
  const captionHtml = lines.join("\n");

  // Determine public cover / thumbnail URL if R2 config exists
  let photoUrl: string | undefined = undefined;
  const r2ConfigPath = path.resolve("./config/r2-config.json");
  if (existsSync(r2ConfigPath)) {
    try {
      const r2 = JSON.parse(readFileSync(r2ConfigPath, "utf-8"));
      if (r2.publicDomain) {
        photoUrl = `${r2.publicDomain}/stories/${options.bookSlug}/assets/cover.png`;
      }
    } catch {
      // ignore
    }
  }

  if (options.dryRun) {
    console.log("\n=======================================================");
    console.log("✈️  [DRY RUN] TELEGRAM PUBLICATION NOTIFICATION PREVIEW");
    console.log("=======================================================");
    console.log(`Chat ID   : ${config.chatId}`);
    console.log(`Photo URL : ${photoUrl || "(No photo)"}`);
    console.log("Message   :\n" + captionHtml);
    console.log("=======================================================\n");
    return true;
  }

  const success = await sendTelegramMessage(config, captionHtml, photoUrl);
  if (success && !options.dryRun) {
    try {
      const storyJsonPath = path.resolve(`./stories/${options.bookSlug}/story.json`);
      if (existsSync(storyJsonPath)) {
        const raw = await fs.readFile(storyJsonPath, "utf-8");
        const manifest = JSON.parse(raw);
        if (!manifest.publications) manifest.publications = {};
        if (!manifest.publications.telegram) manifest.publications.telegram = {};
        const lang = options.lang || "id";
        const title = lang === "en" ? (manifest.originalTitle || manifest.title) : manifest.title;
        manifest.publications.telegram[lang] = {
          id: `${config.chatId}-${options.bookSlug}-${lang}`,
          url: `https://t.me/c/${config.chatId.replace(/^-100/, "")}`,
          publishedAt: new Date().toISOString(),
          title: `Telegram Broadcast: ${title} [${lang.toUpperCase()}]`,
          status: "published",
        };
        await fs.writeFile(storyJsonPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

        // Persist directly to Cloudflare D1 (Single Source of Truth)
        const { db } = await import("./lib/db");
        await db.saveStory(manifest);
      }
    } catch (tgSyncErr: any) {
      console.warn(`⚠️ Telegram publication DB sync warning: ${tgSyncErr.message}`);
    }
  }

  return success;
}

/**
 * Dispatches an urgent failure alert to Telegram when publishing, rendering, or scheduling fails.
 */
export async function notifyTelegramFailure(options: TelegramFailureOptions): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("⚠️ Cannot send Telegram failure alert: Credentials not configured.");
    return false;
  }

  const lang = options.lang || "id";
  const errorMessage =
    typeof options.error === "string" ? options.error : options.error?.message || String(options.error);
  const wibTime = formatWibTimestamp(new Date(), lang);

  // Construct GitHub Actions Run URL if runId is available or running in CI
  let runUrl = options.runUrl;
  if (!runUrl && options.runId) {
    runUrl = `https://github.com/ramustha/storybook-video-generator/actions/runs/${options.runId}`;
  } else if (!runUrl && process.env.GITHUB_RUN_ID) {
    const server = process.env.GITHUB_SERVER_URL || "https://github.com";
    const repo = process.env.GITHUB_REPOSITORY || "ramustha/storybook-video-generator";
    runUrl = `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }

  const isAnalytics = options.platform?.toLowerCase().includes("analytic");
  const headerTitle = isAnalytics ? "Laporan Analitik Gagal!" : "Publikasi Gagal!";
  const headerDesc = isAnalytics
    ? "Terjadi kendala saat pengumpulan data analitik atau pembuatan laporan performa."
    : "Terjadi kendala saat proses publikasi atau rendering video cerita anak.";

  const lines: string[] = [
    `🚨 <b>Zayn Storybook: ${headerTitle}</b> ⚠️\n`,
    `${headerDesc}`,
    `\n⏰ <b>Waktu Kejadian:</b> ${wibTime}`,
  ];

  if (options.bookSlug && options.bookSlug !== "auto") {
    lines.push(`📖 <b>Target Buku:</b> <code>${options.bookSlug}</code> [${lang.toUpperCase()}]`);
  }
  if (options.slot && options.slot !== "auto") {
    lines.push(`🎯 <b>Jadwal Slot:</b> ${options.slot}`);
  }
  if (options.platform) {
    lines.push(`🛑 <b>Komponen / Platform:</b> ${options.platform}`);
  }

  // Sanitize and trim error message for Telegram HTML
  const safeError = errorMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 600);

  lines.push(`\n❌ <b>Pesan Error:</b>\n<pre>${safeError}</pre>`);

  // Actionable automated suggestions
  const lowerErr = errorMessage.toLowerCase();
  if (lowerErr.includes("quota") || lowerErr.includes("quotaexceeded")) {
    lines.push(
      `\n💡 <b>Saran Tindakan:</b> Kuota YouTube Data API harian (10.000 unit) habis. Tambahkan project cadangan via <code>npm run project:add</code> atau tunggu reset kuota pada pukul 15:00 WIB.`
    );
  } else if (
    lowerErr.includes("token") ||
    lowerErr.includes("invalid_grant") ||
    lowerErr.includes("expired") ||
    lowerErr.includes("revoked")
  ) {
    lines.push(
      `\n💡 <b>Saran Tindakan:</b> Token autentikasi kedaluwarsa atau dicabut. Jalankan <code>npm run auth:youtube</code> atau <code>npm run refresh:meta</code> untuk memperbarui kredensial.`
    );
  } else if (lowerErr.includes("remotion") || lowerErr.includes("render")) {
    lines.push(
      `\n💡 <b>Saran Tindakan:</b> Remotion video render gagal. Periksa integritas file audio/gambar di <code>stories/${options.bookSlug || ""}/</code> atau memori runner.`
    );
  }

  if (runUrl) {
    lines.push(`\n🔗 <a href="${runUrl}">Lihat Detail Log di GitHub Actions ➔</a>`);
  }

  const alertHtml = lines.join("\n");

  if (options.dryRun) {
    console.log("\n=======================================================");
    console.log("✈️  [DRY RUN] TELEGRAM FAILURE NOTIFICATION PREVIEW");
    console.log("=======================================================");
    console.log(`Chat ID   : ${config.chatId}`);
    console.log("Message   :\n" + alertHtml);
    console.log("=======================================================\n");
    return true;
  }

  return await sendTelegramMessage(config, alertHtml);
}

/**
 * Dispatches a success notification to Telegram when daily social teaser announcement is published.
 */
export async function notifyTelegramAnnouncement(
  options: TelegramAnnouncementOptions
): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("⚠️ Cannot send Telegram announcement notification: Credentials not configured.");
    return false;
  }

  const wibTime = formatWibTimestamp(new Date(), "id");
  const targetDate =
    options.dateStr ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const wave = options.wave || 1;
  const headerText =
    wave === 1
      ? `📣 <b>Zayn Storybook: Menu Dongeng Hari Ini Mengudara!</b> 🌟\n`
      : `📣 <b>Zayn Storybook: Gelombang ${wave} (${options.waveLabel || (wave === 2 ? "Midday Watch-Now" : "Bedtime Highlight")}) Mengudara!</b> 🌟\n`;
  const introText =
    wave === 1
      ? `Teaser & jadwal tayang harian telah berhasil dipublikasikan ke seluruh media sosial!`
      : `Post-publish distribusi & ajakan menonton cerita terbaru + katalog telah berhasil diterbitkan!`;

  const lines: string[] = [
    headerText,
    introText,
    `\n📅 <b>Jadwal Tayang:</b> ${targetDate}`,
    `⏰ <b>Waktu Terbit:</b> ${wibTime}`,
  ];

  if (options.morningBook && options.morningTitle) {
    lines.push(
      `\n🌅 <b>[Pagi · ${options.morningSlotTime || "08:30 WIB"}]</b> <i>${options.morningTitle}</i> [${(options.morningLang || "EN").toUpperCase()}]`
    );
    if (options.morningHook) {
      lines.push(`✨ <i>${options.morningHook}</i>`);
    }
  }

  if (options.eveningBook && options.eveningTitle) {
    lines.push(
      `\n🌙 <b>[Malam · ${options.eveningSlotTime || "19:00 WIB"}]</b> <i>${options.eveningTitle}</i> [${(options.eveningLang || "ID").toUpperCase()}]`
    );
    if (options.eveningHook) {
      lines.push(`✨ <i>${options.eveningHook}</i>`);
    }
  }

  if (options.youtubeUrl || options.portalUrl || options.relatedUrl) {
    lines.push(`\n🎯 <b>Tautan Tayangan & Funnel:</b>`);
    if (options.youtubeUrl) {
      lines.push(`▶️ <a href="${options.youtubeUrl}">Tonton di YouTube</a>`);
    }
    if (options.portalUrl) {
      lines.push(`🌐 <a href="${options.portalUrl}">Halaman Portal Cerita</a>`);
    }
    if (options.relatedUrl && options.relatedTitle) {
      lines.push(`🌙 <b>Watch Next:</b> <a href="${options.relatedUrl}">${options.relatedTitle}</a>`);
    }
  }

  lines.push(`\n🔗 <b>Lihat Feed Media Sosial:</b>`);
  if (options.facebookUrl) {
    lines.push(`📘 <a href="${options.facebookUrl}">Facebook Page Post</a>`);
  }
  if (options.instagramUrl) {
    lines.push(`📸 <a href="${options.instagramUrl}">Instagram Feed</a>`);
  }
  if (options.threadsUrl) {
    lines.push(`🧵 <a href="${options.threadsUrl}">Meta Threads</a>`);
  }

  lines.push(`\n✨ <i>Nyalakan lonceng notifikasi di YouTube @zayn.storybook!</i> 🌙`);
  const captionHtml = lines.join("\n");

  let photoUrl = options.photoUrl;
  const fallbackSlug = options.morningBook || options.eveningBook;
  if (!photoUrl && fallbackSlug) {
    const fallbackLang = (options.morningBook ? options.morningLang : options.eveningLang)?.toLowerCase() === "en" ? "en" : "id";
    const r2ConfigPath = path.resolve("./config/r2-config.json");
    if (existsSync(r2ConfigPath)) {
      try {
        const r2 = JSON.parse(readFileSync(r2ConfigPath, "utf-8"));
        if (r2.publicDomain) {
          photoUrl = `${r2.publicDomain}/stories/${fallbackSlug}/exports/${fallbackLang}/thumbnail-popular.png`;
        }
      } catch {}
    }
  }

  if (options.dryRun) {
    console.log("\n=======================================================");
    console.log("✈️  [DRY RUN] TELEGRAM ANNOUNCEMENT NOTIFICATION PREVIEW");
    console.log("=======================================================");
    console.log(`Chat ID   : ${config.chatId}`);
    console.log(`Photo URL : ${photoUrl || "(No photo)"}`);
    console.log("Message   :\n" + captionHtml);
    console.log("=======================================================\n");
    return true;
  }

  return await sendTelegramMessage(config, captionHtml, photoUrl);
}

/**
 * Dispatches an executive multi-platform weekly/daily performance report to Telegram.
 */
export async function notifyTelegramAnalytics(options: AnalyticsReportOptions): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("⚠️ Cannot send Telegram analytics: Credentials not configured.");
    return false;
  }

  const period = options.periodLabel || "Laporan Kinerja Mingguan (Weekly Analytics)";
  const wibTime = formatWibTimestamp(new Date(), "id");

  // Calculate Aggregates
  const totalViews =
    (options.youtube?.views || 0) +
    (options.facebook?.views || 0) +
    (options.instagram?.views || 0) +
    (options.threads?.views || 0);

  const totalLikes =
    (options.youtube?.likes || 0) +
    (options.facebook?.likes || 0) +
    (options.instagram?.likes || 0) +
    (options.threads?.likes || 0);

  const totalComments =
    (options.youtube?.comments || 0) +
    (options.facebook?.comments || 0) +
    (options.instagram?.comments || 0) +
    (options.threads?.comments || 0);

  const totalVideos =
    (options.youtube?.videoCount || 0) +
    (options.facebook?.videoCount || 0) +
    (options.instagram?.videoCount || 0) +
    (options.threads?.videoCount || 0);

  const lines: string[] = [
    `📊 <b>Zayn Storybook: ${period}</b> 📈\n`,
    `🗓️ <b>Waktu Laporan:</b> ${wibTime}`,
    `\n🌐 <b>Ringkasan Kinerja Agregat:</b>`,
    `👀 <b>Total Tayangan / Views:</b> <b>${totalViews.toLocaleString("id-ID")}</b>`,
    `❤️ <b>Total Suka / Likes:</b> <b>${totalLikes.toLocaleString("id-ID")}</b>`,
    `💬 <b>Total Komentar:</b> <b>${totalComments.toLocaleString("id-ID")}</b>`,
    `🎬 <b>Total Aset Terpublikasi:</b> ${totalVideos} konten`,
  ];

  // Breakdown Per Platform
  lines.push(`\n📱 <b>Rincian Per Platform:</b>`);

  if (options.youtube) {
    const ytSub = options.youtube.subscribers !== undefined ? ` • ${options.youtube.subscribers} subs` : "";
    lines.push(
      `▶️ <b>YouTube:</b> ${options.youtube.views.toLocaleString("id-ID")} views • ${options.youtube.likes} likes • ${options.youtube.comments} komentar (${options.youtube.videoCount} video${ytSub})`
    );
  }

  if (options.facebook) {
    lines.push(
      `📘 <b>Facebook:</b> ${options.facebook.views.toLocaleString("id-ID")} views • ${options.facebook.likes} likes • ${options.facebook.comments} komentar (${options.facebook.videoCount} video/reel)`
    );
  }

  if (options.instagram) {
    lines.push(
      `📸 <b>Instagram:</b> ${options.instagram.views.toLocaleString("id-ID")} plays • ${options.instagram.likes} likes • ${options.instagram.comments} komentar (${options.instagram.videoCount} reel)`
    );
  }

  if (options.threads) {
    lines.push(
      `🧵 <b>Threads:</b> ${options.threads.views.toLocaleString("id-ID")} views • ${options.threads.likes} likes (${options.threads.videoCount} post)`
    );
  }

  // Top Performing Videos
  if (options.topContent && options.topContent.length > 0) {
    lines.push(`\n🏆 <b>Top Konten Terpopuler Pekan Ini:</b>`);
    options.topContent.slice(0, 5).forEach((item, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "⭐";
      const icon = item.platform.toLowerCase().includes("youtube")
        ? "▶️"
        : item.platform.toLowerCase().includes("facebook")
        ? "📘"
        : item.platform.toLowerCase().includes("instagram")
        ? "📸"
        : "🧵";
      lines.push(
        `${medal} <b>${item.title}</b> (${icon} ${item.platform} ${item.format})`
      );
      lines.push(
        `    👀 ${item.views.toLocaleString("id-ID")} views • ❤️ ${item.likes} likes • <a href="${item.url}">Tonton ➔</a>`
      );
    });
  }

  lines.push(`\n✨ <i>Laporan dikirim otomatis oleh GitHub Actions & Cloudflare Scheduler.</i> 🌙`);
  const captionHtml = lines.join("\n");

  if (options.dryRun) {
    console.log("\n=======================================================");
    console.log("✈️  [DRY RUN] TELEGRAM ANALYTICS NOTIFICATION PREVIEW");
    console.log("=======================================================");
    console.log(`Chat ID : ${config.chatId}`);
    console.log("Message :\n" + captionHtml);
    console.log("=======================================================\n");
    return true;
  }

  return await sendTelegramMessage(config, captionHtml);
}

export interface IngestSummaryOptions {
  succeeded: Array<{ slug: string; title: string }>;
  failures: Array<{ slug: string; error: string }>;
  skippedDuplicateTitles?: Array<{ slug: string; title: string }>;
  durationMin: string;
  bufferFull?: boolean;
  dryRun?: boolean;
}

export interface TokenRotationIssue {
  platform: string;
  status: "EXPIRED" | "EXPIRING_SOON" | "INVALID";
  detail: string;
  actionCommand: string;
}

/**
 * Dispatches a daily ingestion status summary (success, buffer-full, or failure) to Telegram.
 */
export async function notifyTelegramIngestSummary(options: IngestSummaryOptions): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("⚠️ Cannot send Telegram ingestion summary: Credentials not configured.");
    return false;
  }

  const wibTime = formatWibTimestamp(new Date(), "id");
  const total = options.succeeded.length + options.failures.length;
  const header = options.bufferFull
    ? "✅ <b>Zayn Storybook: Daily Ingestion — Buffer Penuh!</b>"
    : options.failures.length === 0
    ? "✅ <b>Zayn Storybook: Daily Ingestion Berhasil!</b>"
    : options.succeeded.length > 0
    ? "⚠️ <b>Zayn Storybook: Daily Ingestion Parsial</b>"
    : "🚨 <b>Zayn Storybook: Daily Ingestion Gagal!</b>";

  const lines: string[] = [
    header,
    `\n⏰ <b>Waktu:</b> ${wibTime}`,
    `📚 <b>Hasil:</b> ${options.succeeded.length}/${total} buku berhasil (${options.durationMin} menit)`,
  ];

  if (options.bufferFull) {
    lines.push(`🟢 Semua jadwal mendatang & katalog kurasi sudah ter-ingest di R2.`);
  }

  if (options.succeeded.length > 0) {
    lines.push(`\n<b>Buku Ter-ingest:</b>`);
    options.succeeded.slice(0, 8).forEach((b) => {
      lines.push(`  • ${b.title} (<code>${b.slug}</code>)`);
    });
  }

  if (options.skippedDuplicateTitles && options.skippedDuplicateTitles.length > 0) {
    lines.push(`\n⏭️ <b>Duplikat Judul Dilewati (${options.skippedDuplicateTitles.length}):</b>`);
    options.skippedDuplicateTitles.slice(0, 5).forEach((d) => {
      lines.push(`  • ${d.title} (<code>${d.slug}</code>)`);
    });
  }

  if (options.failures.length > 0) {
    lines.push(`\n❌ <b>Gagal (${options.failures.length}):</b>`);
    options.failures.slice(0, 5).forEach((f) => {
      const safeErr = f.error.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 140);
      lines.push(`  • <code>${f.slug}</code>: ${safeErr}`);
    });
  }

  const msgHtml = lines.join("\n");
  if (options.dryRun) {
    console.log("\n[DRY RUN] TELEGRAM INGEST SUMMARY:\n" + msgHtml + "\n");
    return true;
  }
  return await sendTelegramMessage(config, msgHtml);
}

/**
 * Alerts Telegram when any OAuth/platform token is expired, invalid, or expiring soon.
 */
export async function notifyTelegramTokenRotation(
  issues: TokenRotationIssue[],
  dryRun = false
): Promise<boolean> {
  if (issues.length === 0) return true;
  const config = getTelegramConfig();
  if (!config) {
    console.warn("⚠️ Cannot send Telegram token rotation alert: Credentials not configured.");
    return false;
  }

  const wibTime = formatWibTimestamp(new Date(), "id");
  const lines: string[] = [
    `🔑 <b>Zayn Storybook: Rotasi Token Diperlukan!</b> ⚠️\n`,
    `⏰ <b>Waktu Cek:</b> ${wibTime}`,
    `Ditemukan kredensial API yang kedaluwarsa atau akan segera habis masa berlakunya:\n`,
  ];

  for (const issue of issues) {
    const icon = issue.status === "EXPIRING_SOON" ? "⏳" : "🚨";
    const safeDetail = issue.detail.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    lines.push(`${icon} <b>${issue.platform}</b> [${issue.status}]`);
    lines.push(`   • Info: ${safeDetail}`);
    lines.push(`   • Aksi: <code>${issue.actionCommand}</code>\n`);
  }

  lines.push(`💡 Setelah rotasi di lokal, jalankan <code>npx tsx scripts/sync-github-secrets.ts</code> atau update secret di GitHub Actions.`);
  const msgHtml = lines.join("\n");

  if (dryRun) {
    console.log("\n[DRY RUN] TELEGRAM TOKEN ROTATION ALERT:\n" + msgHtml + "\n");
    return true;
  }
  return await sendTelegramMessage(config, msgHtml);
}

// ── CLI Runner ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--test")) {
    const config = getTelegramConfig();
    if (!config) {
      console.error("❌ Cannot run test: Telegram credentials not found in env or config/telegram-config.json");
      process.exit(1);
    }

    console.log(`📡 Sending test message to Telegram chat [${config.chatId}]...`);
    const testHtml = [
      `🤖 <b>Zayn Storybook Bot: Uji Koneksi Berhasil!</b> ✅`,
      `\nBot notifikasi publikasi cerita anak kini telah terhubung secara resmi ke Telegram.`,
      `Setiap kali video cerita tayang di YouTube, Instagram, Facebook, atau Threads, notifikasi instan akan dikirimkan ke sini! 🚀`,
      `\n⏰ <b>Waktu Sistem:</b> ${formatWibTimestamp(new Date(), "id")}`,
    ].join("\n");

    const success = await sendTelegramMessage(config, testHtml);
    if (!success) process.exit(1);
    return;
  }

  if (args.includes("--failure") || args.includes("--fail") || args.includes("--error")) {
    const errorIdx = args.indexOf("--error");
    const errorMsg = errorIdx !== -1 && args[errorIdx + 1] ? args[errorIdx + 1] : "Unknown pipeline error occurred";
    const bookIdx = args.indexOf("--book");
    const bookSlug = bookIdx !== -1 && args[bookIdx + 1] ? args[bookIdx + 1] : undefined;
    const langIdx = args.indexOf("--lang");
    const lang =
      langIdx !== -1 && (args[langIdx + 1] === "en" || args[langIdx + 1] === "id")
        ? (args[langIdx + 1] as "id" | "en")
        : "id";
    const slotIdx = args.indexOf("--slot");
    const slot = slotIdx !== -1 ? args[slotIdx + 1] : undefined;
    const platformIdx = args.indexOf("--platform");
    const platform = platformIdx !== -1 ? args[platformIdx + 1] : undefined;
    const runIdIdx = args.indexOf("--run-id");
    const runId = runIdIdx !== -1 ? args[runIdIdx + 1] : undefined;
    const dryRun = args.includes("--dry-run");

    const ok = await notifyTelegramFailure({
      bookSlug,
      lang,
      slot,
      platform,
      error: errorMsg,
      runId,
      dryRun,
    });
    if (!ok && !dryRun) process.exit(1);
    return;
  }

  if (args.includes("--announcement") || args.includes("--teaser")) {
    const waveIdx = args.indexOf("--wave");
    const parsedWave = waveIdx !== -1 ? Number(args[waveIdx + 1]) : 1;
    const wave: 1 | 2 | 3 = parsedWave === 2 ? 2 : parsedWave === 3 ? 3 : 1;
    const morningBook = (args.indexOf("--morning-book") !== -1 ? args[args.indexOf("--morning-book") + 1] : undefined) || "ayo-berayun-momo";
    const eveningBook = (args.indexOf("--evening-book") !== -1 ? args[args.indexOf("--evening-book") + 1] : undefined) || "ayo-berayun-momo";
    const morningTitle = (args.indexOf("--morning-title") !== -1 ? args[args.indexOf("--morning-title") + 1] : undefined) || "Swing High, Momo";
    const eveningTitle = (args.indexOf("--evening-title") !== -1 ? args[args.indexOf("--evening-title") + 1] : undefined) || "Ayo, Berayun, Momo";
    const dryRun = args.includes("--dry-run");

    const ok = await notifyTelegramAnnouncement({
      wave,
      morningBook,
      morningTitle,
      morningLang: "en",
      morningSlotTime: "08:30 WIB",
      eveningBook,
      eveningTitle,
      eveningLang: "id",
      eveningSlotTime: "19:00 WIB",
      dryRun,
    });
    if (!ok && !dryRun) process.exit(1);
    return;
  }

  const bookIdx = args.indexOf("--book");
  const bookSlug = bookIdx !== -1 && args[bookIdx + 1] ? args[bookIdx + 1] : "jangan-sekarang";
  const langIdx = args.indexOf("--lang");
  const lang = langIdx !== -1 && (args[langIdx + 1] === "en" || args[langIdx + 1] === "id") ? (args[langIdx + 1] as "id" | "en") : "id";
  const dryRun = args.includes("--dry-run");

  await notifyTelegramPublish({
    bookSlug,
    lang,
    dryRun,
  });
}

if (process.argv[1]?.includes("notify-telegram")) {
  main().catch((err) => {
    console.error("❌ Telegram notification error:", err);
    process.exit(1);
  });
}
