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
  const lines: string[] = [
    `🚀 <b>Zayn Storybook: Cerita Baru Mengudara!</b> 🌟\n`,
    `📖 <b>Judul:</b> <i>${title}</i> [${lang.toUpperCase()}]`,
    `💡 <b>Pesan Moral:</b> ${moralText}`,
  ];

  if (options.slot) {
    lines.push(`⏰ <b>Slot Tayang:</b> ${options.slot}`);
  }

  lines.push(`\n🔗 <b>Tonton & Nikmati Bersama:</b>`);
  if (ytLandscape) lines.push(`▶️ <a href="${ytLandscape}">YouTube (Video 16:9 Full HD)</a>`);
  if (ytVertical) lines.push(`📱 <a href="${ytVertical}">YouTube Shorts (9:16)</a>`);
  if (igUrl) lines.push(`📸 <a href="${igUrl}">Instagram Reels</a>`);
  if (fbUrl) lines.push(`📘 <a href="${fbUrl}">Facebook Video</a>`);
  if (threadsUrl) lines.push(`🧵 <a href="${threadsUrl}">Meta Threads</a>`);

  lines.push(`\n✨ <i>Selamat menonton dan mendongeng bersama si kecil!</i> 🌙`);
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

  return await sendTelegramMessage(config, captionHtml, photoUrl);
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
      `\n⏰ <i>Timestamp: ${new Date().toISOString()}</i>`,
    ].join("\n");

    const success = await sendTelegramMessage(config, testHtml);
    if (!success) process.exit(1);
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
