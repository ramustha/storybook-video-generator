import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import http from "http";
import url from "url";
import readline from "readline";
import { google } from "googleapis";
import { uploadVideoViaBrowser, launchInteractiveLogin } from "./playwright-youtube-uploader";
import { QuotaRotator } from "./quota-rotator";
import { generateSeoMetadata } from "./lib/seo-formatter";
import { db } from "./lib/db";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

interface StoryScene {
  index: number;
  sceneId: string;
  type: string;
  durationSeconds: number;
  audio: {
    text: string;
  };
}

interface StoryManifest {
  title: string;
  originalTitle?: string;
  slug: string;
  moral?: {
    headlineId?: string;
    headlineEn?: string;
    summaryId?: string;
    summaryEn?: string;
  };
  source: {
    repository: string;
    license: string;
    originalAuthor: string;
    originalIllustrator: string;
    sourceUrl: string;
  };
  scenes: StoryScene[];
  exports: {
    landscape?: any;
    vertical?: any;
  };
  [key: string]: any;
}

/**
 * Formats seconds into MM:SS YouTube chapter format.
 */
function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Builds chapter list from story scene durations.
 */
function generateChapters(scenes: StoryScene[]): string {
  let elapsed = 0;
  const lines: string[] = [];

  for (const scene of scenes) {
    const timestamp = formatTimestamp(elapsed);
    if (scene.type === "cover") {
      lines.push(`${timestamp} Pembuka: ${scene.audio.text.slice(0, 30)}...`);
    } else {
      const summary = scene.audio.text.slice(0, 35).replace(/[\r\n]+/g, " ");
      lines.push(`${timestamp} Bagian ${scene.index}: ${summary}...`);
    }
    elapsed += scene.durationSeconds;
  }

  return lines.join("\n");
}

/**
 * Loads .env file if present to populate process.env.
 */
async function loadEnvFiles() {
  const envFiles = [
    path.resolve(".env"),
    path.join(process.env.HOME || "", ".zshenv"),
  ];

  for (const envPath of envFiles) {
    if (existsSync(envPath)) {
      try {
        const envContent = await fs.readFile(envPath, "utf-8");
        envContent.split("\n").forEach((line) => {
          const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let val = (match[2] || "").trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      } catch {}
    }
  }
}

/**
 * Loads OAuth2 client credentials from config or environment.
 */
async function getOAuth2Client() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await loadEnvFiles();

  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

  if (!clientId || !clientSecret) {
    if (process.env.YOUTUBE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.YOUTUBE_CREDENTIALS_JSON);
        const installed = creds.installed || creds.web;
        if (installed) {
          clientId = installed.client_id;
          clientSecret = installed.client_secret;
          redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
        }
      } catch (err: any) {
        console.warn(`⚠️ Failed to parse YOUTUBE_CREDENTIALS_JSON: ${err.message}`);
      }
    } else if (existsSync(CREDENTIALS_PATH)) {
      const credsRaw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
      const creds = JSON.parse(credsRaw);
      const installed = creds.installed || creds.web;
      if (installed) {
        clientId = installed.client_id;
        clientSecret = installed.client_secret;
        redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
      }
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      `❌ YouTube OAuth credentials not found!\n` +
      `Please provide environment variables YOUTUBE_CLIENT_ID & YOUTUBE_CLIENT_SECRET,\n` +
      `or place credentials JSON at: ${CREDENTIALS_PATH}`
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Authorizes OAuth2 client, either from environment secrets, cached tokens, or interactive login.
 */
async function authorizeClient(oauth2Client: any) {
  await loadEnvFiles();

  // 1. Check environment secrets first (CI / Headless / Cloud)
  if (process.env.YOUTUBE_TOKEN_JSON) {
    try {
      const tokens = JSON.parse(process.env.YOUTUBE_TOKEN_JSON);
      oauth2Client.setCredentials(tokens);
      console.log("🔑 Authenticated via YOUTUBE_TOKEN_JSON environment secret.");
      return oauth2Client;
    } catch (err: any) {
      console.warn(`⚠️ Failed to parse YOUTUBE_TOKEN_JSON: ${err.message}`);
    }
  }

  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      access_token: process.env.YOUTUBE_ACCESS_TOKEN || undefined,
    });
    console.log("🔑 Authenticated via YOUTUBE_REFRESH_TOKEN environment secret.");
    return oauth2Client;
  }

  // 2. Check local token file on disk
  if (existsSync(TOKEN_PATH)) {
    const tokenRaw = await fs.readFile(TOKEN_PATH, "utf-8");
    const tokens = JSON.parse(tokenRaw);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on("tokens", async (newTokens: any) => {
      const merged = { ...tokens, ...newTokens };
      try {
        await fs.writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log("🔄 YouTube OAuth tokens refreshed and saved.");
      } catch (err) {
        // Ignore disk write failure in read-only / CI container
      }
    });

    return oauth2Client;
  }

  // Interactive one-time authorization flow
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n=======================================================");
  console.log("🔐 YouTube One-Time Authorization Required");
  console.log("=======================================================");
  console.log("1. Open the following URL in your browser:\n");
  console.log(`   👉 \x1b[36m${authUrl}\x1b[0m\n`);
  console.log("2. Sign in with the Google Account managing @ZaynAdyanRamadhan");
  console.log("3. Grant the requested upload permissions.");
  console.log("=======================================================\n");

  const code = await new Promise<string>((resolve) => {
    // Try spinning up a local callback server first
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url || "", true);
      if (parsedUrl.pathname === "/oauth2callback") {
        const authCode = parsedUrl.query.code as string;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>✅ YouTube Authorization Successful!</h2>
              <p>You can close this tab and return to your terminal.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3000, () => {
      console.log("⏳ Waiting for browser callback on http://localhost:3000/oauth2callback ...");
    });

    server.on("error", () => {
      // Fallback to manual console prompt if port 3000 is occupied
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Paste the authorization code here: ", (manualCode) => {
        rl.close();
        resolve(manualCode.trim());
      });
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✔ Token saved successfully to ${TOKEN_PATH}`);

  return oauth2Client;
}

/**
 * Checks channel identity to ensure we are uploading to @ZaynAdyanRamadhan.
 */
async function verifyChannel(youtube: any) {
  const res = await youtube.channels.list({
    part: ["snippet"],
    mine: true,
  });

  const channel = res.data.items?.[0];
  if (!channel) {
    console.warn("⚠️ Warning: No channel found for authenticated account.");
    return;
  }

  console.log(`\n📺 Authenticated Channel: \x1b[32m${channel.snippet?.title}\x1b[0m`);
  console.log(`   Handle / ID: ${channel.snippet?.customUrl || channel.id}`);
}

/**
 * Uploads a video file with resumable stream.
 */
async function uploadVideo(
  youtube: any,
  filePath: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
    privacyStatus: "public" | "unlisted" | "private";
    isMadeForKids?: boolean;
    publishAt?: string;
  }
): Promise<string> {
  const fileSize = (await fs.stat(filePath)).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);

  console.log(`\n🚀 Uploading video: ${path.basename(filePath)} (${fileSizeMB} MB)...`);
  console.log(`   Title: "${metadata.title}"`);
  if (metadata.publishAt) {
    console.log(`   Privacy: PRIVATE (Scheduled for publication at ${metadata.publishAt})`);
  } else {
    console.log(`   Privacy: ${metadata.privacyStatus.toUpperCase()}`);
  }

  const statusBody: any = {
    selfDeclaredMadeForKids: metadata.isMadeForKids ?? false,
  };
  if (metadata.publishAt) {
    statusBody.privacyStatus = "private";
    statusBody.publishAt = new Date(metadata.publishAt).toISOString();
  } else {
    statusBody.privacyStatus = metadata.privacyStatus;
  }

  const safeTitle = sanitizeTitle(metadata.title, 95);
  let res: any;
  try {
    res = await youtube.videos.insert(
      {
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: safeTitle,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId || "1", // 1 = Film & Animation, 27 = Education
            defaultLanguage: "id",
            defaultAudioLanguage: "id",
          },
          status: statusBody,
        },
        media: {
          body: createReadStream(filePath),
        },
      },
      {
        onUploadProgress: (evt: any) => {
          const progress = Math.round((evt.bytesRead / fileSize) * 100);
          process.stdout.write(`   Uploading... ${progress}%\r`);
        },
      }
    );
  } catch (err: any) {
    const errMsg = err?.message || err?.cause?.message || String(err);
    if (errMsg.includes("exceeded the number of videos") || errMsg.includes("uploadLimitExceeded")) {
      console.error(`\n\n🛑 YOUTUBE UPLOAD VELOCITY CAP REACHED:`);
      console.error(`   The channel has reached YouTube's rolling 24-hour video creation limit.`);
      console.error(`   Local file is safely exported at: ${filePath}`);
      console.error(`   Stopping pipeline for user confirmation / decision card.\n`);
      throw new Error(`[DAILY_UPLOAD_CAP] YouTube daily upload limit exceeded: ${errMsg}`);
    } else if (errMsg.includes("quotaExceeded")) {
      console.error(`\n\n🛑 YOUTUBE GCP API QUOTA EXCEEDED (10,000 units):`);
      console.error(`   Daily GCP project quota depleted. Resets at midnight Pacific Time.`);
      throw new Error(`[GCP_QUOTA_EXCEEDED] YouTube API daily quota exceeded: ${errMsg}`);
    }
    throw err;
  }

  const videoId = res.data.id;
  console.log(`\n✔ Upload complete! Video ID: ${videoId}`);
  return videoId;
}

/**
 * Uploads custom thumbnail to a video.
 * For YouTube Shorts, waiting until processing finishes guarantees YouTube generates the 9:16 'shortsAspectRatio' representation.
 */
async function uploadThumbnail(youtube: any, videoId: string, thumbnailPath: string, waitForProcessing: boolean = false) {
  if (!existsSync(thumbnailPath)) {
    console.log(`⏭ No thumbnail found at ${thumbnailPath}, skipping.`);
    return;
  }

  if (waitForProcessing) {
    console.log(`⏳ Waiting for YouTube to process video ${videoId} so thumbnail can attach properly...`);
    for (let i = 0; i < 12; i++) {
      try {
        const check = await youtube.videos.list({
          part: ["status", "processingDetails"],
          id: [videoId],
        });
        const item = check.data.items?.[0];
        const isProcessed = item?.status?.uploadStatus === "processed";
        const thumbsReady = item?.processingDetails?.thumbnailsAvailability === "available";
        if (isProcessed || thumbsReady) {
          console.log(`✔ Video processing complete (${i * 5}s)! Applying thumbnail...`);
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`🖼 Uploading custom thumbnail from ${path.basename(thumbnailPath)}...`);
  try {
    const res = await youtube.thumbnails.set({
      videoId,
      media: {
        body: createReadStream(thumbnailPath),
      },
    });
    console.log(`✔ Thumbnail uploaded successfully for video ${videoId}`);
    const sar = res.data?.items?.[0]?.shortsAspectRatio;
    if (sar) {
      console.log(`   📱 Shorts 9:16 Aspect Ratio Thumbnail confirmed: ${sar.url} (${sar.width}x${sar.height})`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Thumbnail upload warning: ${err.message}`);
  }
}

/**
 * Checks remote video existence and live status on YouTube.
 */
async function checkRemoteVideoStatus(
  youtube: any,
  videoId: string
): Promise<{ exists: boolean; title?: string; status?: string; privacy?: string }> {
  try {
    const res = await youtube.videos.list({
      part: ["snippet", "status"],
      id: [videoId],
    });
    if (res.data.items && res.data.items.length > 0) {
      const item = res.data.items[0];
      return {
        exists: true,
        title: item.snippet?.title || "",
        status: item.status?.uploadStatus || "unknown",
        privacy: item.status?.privacyStatus || "unknown",
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Searches channel videos to detect untracked duplicates by title/keyword.
 */
async function searchChannelForDuplicate(
  youtube: any,
  searchTitle: string
): Promise<{ videoId: string; title: string } | null> {
  try {
    const res = await youtube.search.list({
      part: ["snippet"],
      forMine: true,
      type: ["video"],
      q: searchTitle.slice(0, 32),
      maxResults: 5,
    });
    if (res.data.items && res.data.items.length > 0) {
      for (const item of res.data.items) {
        if (item.id?.videoId && item.snippet?.title) {
          const cleanItem = item.snippet.title.toLowerCase().replace(/[^a-z0-9]/g, "");
          const cleanSearch = searchTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            cleanItem.includes(cleanSearch.slice(0, 16)) ||
            cleanSearch.includes(cleanItem.slice(0, 16))
          ) {
            return {
              videoId: item.id.videoId,
              title: item.snippet.title,
            };
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Updates video metadata (title, description, tags) on YouTube without re-uploading file.
 */
async function updateVideoMetadata(
  youtube: any,
  videoId: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
  }
) {
  const safeTitle = sanitizeTitle(metadata.title, 95);
  console.log(`📝 Updating metadata on YouTube for video ${videoId}...`);
  try {
    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: videoId,
        snippet: {
          title: safeTitle,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId || "1",
        },
      },
    });
    console.log(`✔ Video metadata updated successfully for ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Video metadata update error: ${err.message}`);
  }
}

/**
 * Deletes remote video on YouTube before replacement.
 */
async function deleteRemoteVideo(youtube: any, videoId: string) {
  console.log(`🗑️ Deleting remote video ${videoId} to prevent duplicate content...`);
  try {
    await youtube.videos.delete({ id: videoId });
    console.log(`✔ Deleted old remote video ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Remote deletion failed: ${err.message}`);
  }
}

/**
 * Updates video visibility status (public, unlisted, private) or schedules publication.
 */
async function updateVideoPrivacy(
  youtube: any,
  videoId: string,
  privacyStatus: "public" | "unlisted" | "private",
  publishAt?: string
) {
  console.log(
    `🔒 Updating privacy status on YouTube for video ${videoId} to [${
      publishAt ? `PRIVATE (Scheduled: ${publishAt})` : privacyStatus.toUpperCase()
    }]...`
  );
  try {
    const statusBody: any = {
      selfDeclaredMadeForKids: false,
    };
    if (publishAt) {
      statusBody.privacyStatus = "private"; // YouTube API requires privacyStatus to be 'private' when publishAt is set
      statusBody.publishAt = new Date(publishAt).toISOString();
    } else {
      statusBody.privacyStatus = privacyStatus;
    }

    await youtube.videos.update({
      part: ["status"],
      requestBody: {
        id: videoId,
        status: statusBody,
      },
    });
    console.log(`✔ Video privacy updated successfully for ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Video privacy update error: ${err.message}`);
  }
}

/**
 * Sanitizes and truncates video titles to strictly comply with YouTube API's 100-character ceiling.
 */
function sanitizeTitle(title: string, maxLength = 95): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const sliced = trimmed.slice(0, maxLength - 3);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced) + "...";
}

/**
 * Parses pre-formatted title and description from exports/youtube-upload-metadata.md
 */
function parseMetadataKit(mdContent: string, lang: "id" | "en") {
  const isEn = lang === "en";
  const landscapeHeader = isEn ? "English Edition - 16:9" : "Indonesian Edition - 16:9";
  const shortsHeader = isEn ? "English Edition - 9:16" : "Indonesian Edition - 9:16";

  const sections = mdContent.split(/## .*?FORMAT/u);
  const landscapeSec = sections.find((s) => s.includes(landscapeHeader));
  const shortsSec = sections.find((s) => s.includes(shortsHeader));

  let landscapeTitle: string | undefined;
  let landscapeDesc: string | undefined;
  if (landscapeSec) {
    const titleMatch = landscapeSec.match(/\* \*\*Option 1[^*]*\*\*\s*[\r\n]+\s*`([^`]+)`/);
    landscapeTitle = titleMatch ? sanitizeTitle(titleMatch[1].trim()) : undefined;
    const descMatch = landscapeSec.match(/### 2\. Video Description[^\n]*\s*[\r\n]+```(?:markdown)?\s*([\s\S]*?)```/);
    landscapeDesc = descMatch ? descMatch[1].trim() : undefined;
  }

  let shortsTitle: string | undefined;
  let shortsDesc: string | undefined;
  if (shortsSec) {
    const shortsTitleMatch = shortsSec.match(/### 1\. Title[^\n]*\s*[\r\n]+\s*`([^`]+)`/);
    shortsTitle = shortsTitleMatch ? sanitizeTitle(shortsTitleMatch[1].trim()) : undefined;
    const shortsDescMatch = shortsSec.match(/### 2\. Description[^\n]*\s*[\r\n]+```(?:markdown)?\s*([\s\S]*?)```/);
    shortsDesc = shortsDescMatch ? shortsDescMatch[1].trim() : undefined;
  }

  return { landscapeTitle, landscapeDesc, shortsTitle, shortsDesc };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const compilationTheme = getArg("--compilation");
  const isDryRun = args.includes("--dry-run");
  const format = (getArg("--format") as "landscape" | "vertical" | "all") || "all";
  const privacy = (getArg("--privacy") as "public" | "unlisted" | "private") || "public";
  const setPrivacy = getArg("--set-privacy") as "public" | "unlisted" | "private" | undefined;
  const scheduleTime = getArg("--schedule") || getArg("--publish-at");
  const isMadeForKids = args.includes("--made-for-kids");
  const requestedLang = (getArg("--lang") || "all") as "id" | "en" | "all" | "both";
  const isForceReplace = args.includes("--force") || args.includes("--replace");
  const isUpdateMetadata = args.includes("--update-metadata") || args.includes("--resync-all");
  const isUpdateThumbnailsOnly = args.includes("--update-thumbnails") || args.includes("--thumbnail-only");
  const allowShortLandscape = args.includes("--allow-short-landscape") || args.includes("--force-landscape");
  const autoCleanup = args.includes("--auto-cleanup") || args.includes("--cleanup");
  const engine = (getArg("--engine") as "auto" | "playwright" | "api") || "api";
  const isHeadful = args.includes("--headful") || args.includes("--headed");

  if (args.includes("--login") || args.includes("--auth-browser")) {
    const loginOk = await launchInteractiveLogin();
    process.exit(loginOk ? 0 : 1);
  }

  let manifest: StoryManifest | null = null;
  let totalDurationSeconds = 0;
  let durationTier: "tier1" | "tier2" | "tier3" | "tier4" = "tier3";
  let strategyCode = "dual-hybrid";
  let strategyDescription = "Standard Storybook (Dual Format: 16:9 Long-Form & 9:16 Shorts)";
  let effectiveFormat = format;
  let storyDir = path.resolve(`./stories/${bookSlug}`);
  let manifestPath = path.join(storyDir, "story.json");

  if (!compilationTheme) {
    if (!existsSync(manifestPath)) {
      console.error(`Error: Story manifest not found at ${manifestPath}`);
      process.exit(1);
    }

    manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

    // Calculate total story duration & determine 4-tier publication strategy
    if (manifest.scenes && manifest.scenes.length > 0) {
      totalDurationSeconds = manifest.scenes.reduce((acc, s: any) => {
        if (requestedLang === "en") {
          return acc + (s.audio?.en?.durationSeconds || s.audio?.en?.duration || s.durationSeconds || 0);
        } else if (requestedLang === "id") {
          return acc + (s.audio?.id?.durationSeconds || s.audio?.id?.duration || s.durationSeconds || 0);
        }
        return acc + (s.durationSeconds || 0);
      }, 0);
    }

    if (totalDurationSeconds > 0 && totalDurationSeconds < 20) {
      durationTier = "tier1";
      strategyCode = "short-only";
      strategyDescription = "Tier 1: Micro-Story / Teaser (<20s) -> Short-Form Exclusive (Shorts/TikTok/Reels ONLY)";
    } else if (totalDurationSeconds >= 20 && totalDurationSeconds < 60) {
      durationTier = "tier2";
      strategyCode = "short-primary";
      strategyDescription = "Tier 2: Snackable Mini-Story (20-60s) -> Short-Primary (Shorts/TikTok/Reels)";
    } else if (totalDurationSeconds >= 60 && totalDurationSeconds <= 180) {
      durationTier = "tier3";
      strategyCode = "dual-hybrid";
      strategyDescription = "Tier 3: Standard Storybook (60-180s) -> Dual-Format (16:9 Widescreen & 9:16 Shorts)";
    } else if (totalDurationSeconds > 180) {
      durationTier = "tier4";
      strategyCode = "long-primary";
      strategyDescription = "Tier 4: Extended Storybook (>180s) -> Long-Primary (16:9 Widescreen Master + Teaser Hook)";
    }

    console.log(`\n⏱️ Total Story Duration: ${totalDurationSeconds.toFixed(1)}s`);
    console.log(`🎯 Strategy Classification: ${strategyDescription}`);

    // Automatically enforce short-only for Tier 1 (<20s) if format is "all"
    if (durationTier === "tier1" && format === "all" && !allowShortLandscape) {
      console.log(`\n💡 DURATION POLICY APPLIED: Storybook is <20s (${totalDurationSeconds.toFixed(1)}s).`);
      console.log(`   Automatically routing to Short-Form Exclusive (format: "vertical").`);
      console.log(`   Standalone 16:9 upload suppressed to protect channel watch time.`);
      console.log(`   (Use --allow-short-landscape to override).`);
      effectiveFormat = "vertical";
    }

    // Automatically enforce landscape-only for Tier 4 (>180s) when format is "all"
    if (durationTier === "tier4" && format === "all") {
      console.log(`\n💡 DURATION POLICY APPLIED: Storybook is >180s (${totalDurationSeconds.toFixed(1)}s).`);
      console.log(`   YouTube Shorts strictly limits vertical videos to <=180s (anything longer is forced into Long Video section).`);
      console.log(`   Automatically routing to Landscape-Only (format: "landscape") to prevent channel video duplication.`);
      effectiveFormat = "landscape";
    }
  }

  // 1. Authorize YouTube API Client (Multi-Project Quota Rotator or Fallback)
  let rotator: QuotaRotator | null = null;
  let oauth2Client: any = null;
  let youtube: any = null;
  if (engine !== "playwright") {
    try {
      rotator = new QuotaRotator();
      await rotator.init();
      const client = await rotator.getActiveClient();
      youtube = client.youtube;
      oauth2Client = client.oauth2Client;
      await verifyChannel(youtube);
      const report = rotator.getStatusReport();
      console.log(`🌐 Google Cloud Multi-Project Pool: ${report.availableCount}/${report.configuredCount} available (Active: [${client.projectId.toUpperCase()}])`);
    } catch (rotatorErr: any) {
      try {
        oauth2Client = await getOAuth2Client();
        await authorizeClient(oauth2Client);
        youtube = google.youtube({ version: "v3", auth: oauth2Client });
        await verifyChannel(youtube);
      } catch (apiAuthErr: any) {
        if (engine === "api") throw apiAuthErr;
        console.warn(`⚠️ Official Google API credentials not configured: ${apiAuthErr.message}. Operating in Playwright browser mode.`);
      }
    }
  }

  // If user only wanted to authenticate
  if (args.includes("--auth-only")) {
    console.log("\n✅ Authorization successful! Exiting.");
    return;
  }

  // Handle compilation upload if requested
  if (compilationTheme) {
    const compilationLangs: Array<"id" | "en"> =
      requestedLang === "all" || requestedLang === "both" ? ["id", "en"] : [requestedLang as "id" | "en"];
    const outDir = path.resolve("./exports/compilations");

    for (const lang of compilationLangs) {
      const isEn = lang === "en";
      const videoFilename = `kompilasi-${compilationTheme}-${lang}-16x9.mp4`;
      const metaFilename = `kompilasi-${compilationTheme}-${lang}-metadata.txt`;
      const videoPath = path.join(outDir, videoFilename);
      const metaPath = path.join(outDir, metaFilename);

      if (!existsSync(videoPath)) {
        console.warn(`⚠️ Warning: Compilation video not found at ${videoPath}, skipping ${lang.toUpperCase()}.`);
        continue;
      }

      let title = isEn
        ? "Bedtime Stories Marathon for Kids (12 Mins Non-Stop) | Calming Animated Picture Books 🌙✨"
        : "Kumpulan Dongeng Anak Sebelum Tidur (12 Menit Non-Stop) | Cerita Bergambar Penuh Pesan Moral 🌙✨";
      let description = isEn
        ? "Enjoy a magical bedtime story marathon with Zayn Storybook! Delightful, calming animated storybooks full of humor, friendship, and positive moral lessons."
        : "Dengarkan dongeng anak bergambar penuh pesan moral dalam satu video non-stop! Cocok untuk menemani si kecil tidur nyenyak, santai akhir pekan, atau waktu bermain tanpa gangguan.";

      if (existsSync(metaPath)) {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        const titleMatch = metaContent.match(/JUDUL:\s*\n([^\n]+)/);
        if (titleMatch) title = titleMatch[1].trim();
        const descMatch = metaContent.match(/DESKRIPSI:\s*\n([\s\S]+?)(?=\n===|$)/);
        if (descMatch) description = descMatch[1].trim();
      }

      const thumbnailCandidates = [
        path.join(outDir, `thumbnail-compilation-${compilationTheme}-${lang}.png`),
        path.resolve(`./stories/pisang-terlalu-banyak/exports/${lang}/thumbnail-bedtime.png`),
        path.resolve(`./stories/hari-cukur-rambut/exports/${lang}/thumbnail-bedtime.png`),
        path.resolve(`./stories/jas-hujan-merah/exports/${lang}/thumbnail-popular.png`),
      ];
      const thumbnailPath = thumbnailCandidates.find((p) => existsSync(p));

      console.log(`\n======================================================`);
      console.log(`🎬 YOUTUBE COMPILATION MARATHON UPLOADER [${lang.toUpperCase()}]`);
      console.log(`======================================================`);
      console.log(`🏷️ Theme      : ${compilationTheme}`);
      console.log(`🌐 Language   : ${lang}`);
      console.log(`📁 Video File : ${videoPath}`);
      console.log(`📌 Title      : ${title}`);
      if (thumbnailPath) console.log(`🖼️ Thumbnail  : ${thumbnailPath}`);
      console.log(`🔒 Privacy    : ${privacy.toUpperCase()}`);
      console.log(`🧪 Mode       : ${isDryRun ? "DRY RUN" : "LIVE UPLOAD"}`);
      console.log("------------------------------------------------------");
      console.log(description);
      console.log("------------------------------------------------------\n");

      if (isDryRun) {
        console.log(`✔ DRY RUN [${lang.toUpperCase()}] COMPLETED! YouTube compilation payload verified.`);
        continue;
      }

      const pubRecordPath = path.join(outDir, "publication-status.json");
      let existingId: string | undefined;
      if (existsSync(pubRecordPath)) {
        try {
          const pubData = JSON.parse(await fs.readFile(pubRecordPath, "utf-8"));
          existingId = pubData[`${compilationTheme}-${lang}`]?.youtube?.videoId;
        } catch {}
      }

      if (isUpdateThumbnailsOnly) {
        if (existingId && thumbnailPath) {
          console.log(`🖼️ Updating YouTube thumbnail for compilation [${lang.toUpperCase()}] (${existingId})...`);
          await uploadThumbnail(youtube, existingId, thumbnailPath);
          console.log(`✔ Compilation thumbnail updated successfully for ${existingId}!`);
        } else {
          console.warn(`⚠️ Could not find live YouTube videoId for ${compilationTheme}-${lang} in publication-status.json`);
        }
        continue;
      }

      if (existingId) {
        if (isForceReplace) {
          console.log(`⚠️ --force / --replace active! Deleting older compilation video ${existingId} from YouTube first...`);
          try {
            await deleteRemoteVideo(youtube, existingId);
            console.log(`✔ Successfully deleted old compilation video ${existingId}!`);
          } catch (delErr: any) {
            console.warn(`⚠️ Warning when deleting old compilation video: ${delErr.message}`);
          }
        } else {
          console.log(`🛑 DUPLICATE DETECTED: Compilation [${lang.toUpperCase()}] is ALREADY LIVE on YouTube (${existingId})!`);
          console.log(`   • Live URL: https://youtu.be/${existingId}`);
          console.log(`   💡 Tip: Use --force to replace with the new extended marathon.`);
          continue;
        }
      }

      const compilationTags = isEn
        ? [
            "Bedtime Stories",
            "Children Storybook",
            "Kids Stories Marathon",
            "Animated Storybook",
            "Zayn Storybook",
            "Picture Books",
            "English Stories for Kids",
            "Calming Stories",
            "Audiobook for Kids",
            "Moral Stories for Kids",
            "Read Aloud Books",
          ]
        : [
            "Dongeng Anak",
            "Cerita Anak",
            "Bedtime Story",
            "Kompilasi Dongeng",
            "Zayn Storybook",
            "Cerita Bergambar",
            "Video Edukasi Anak",
            "Dongeng Sebelum Tidur",
            "Dongeng Pengantar Tidur",
          ];

      const videoId = await uploadVideo(youtube, videoPath, {
        title: sanitizeTitle(title, 100),
        description,
        tags: compilationTags,
        categoryId: "27",
        privacyStatus: privacy,
        isMadeForKids: false,
        publishAt: scheduleTime ? new Date(scheduleTime).toISOString() : undefined,
      });
      if (thumbnailPath) {
        await uploadThumbnail(youtube, videoId, thumbnailPath);
      }

      let pubRecord: Record<string, any> = {};
      if (existsSync(pubRecordPath)) {
        try {
          pubRecord = JSON.parse(await fs.readFile(pubRecordPath, "utf-8"));
        } catch {}
      }
      const key = `${compilationTheme}-${lang}`;
      pubRecord[key] = {
        ...(pubRecord[key] || {}),
        title,
        youtube: {
          videoId,
          url: `https://youtu.be/${videoId}`,
          publishedAt: new Date().toISOString(),
          privacy,
        },
      };
      await fs.writeFile(pubRecordPath, JSON.stringify(pubRecord, null, 2), "utf-8");

      console.log(`\n🎉 COMPILATION VIDEO [${lang.toUpperCase()}] LIVE ON YOUTUBE!`);
      console.log(`🔗 Link: https://youtu.be/${videoId}`);
    }
    return;
  }

  const languages: Array<"id" | "en"> =
    requestedLang === "all" || requestedLang === "both" ? ["id", "en"] : [requestedLang as "id" | "en"];

  // If user only wants to update visibility status or schedule publishing
  if (setPrivacy || scheduleTime) {
    console.log(`\n======================================================`);
    console.log(`🔒 Updating YouTube Visibility for [${bookSlug.toUpperCase()}]`);
    console.log(`   Target Setting: ${scheduleTime ? `Scheduled release at ${scheduleTime}` : setPrivacy?.toUpperCase()}`);
    console.log(`======================================================`);

    for (const lang of languages) {
      const isEn = lang === "en";
      const landscapeId =
        (manifest as any).publications?.youtube?.[lang]?.landscape?.id ||
        (manifest.exports as any)?.[lang]?.landscape?.youtubeId ||
        (isEn
          ? (manifest.exports as any)?.en?.landscape?.youtubeId
          : (manifest.exports as any)?.landscape?.youtubeId);

      const verticalId =
        (manifest as any).publications?.youtube?.[lang]?.vertical?.id ||
        (manifest.exports as any)?.[lang]?.vertical?.youtubeId ||
        (isEn
          ? (manifest.exports as any)?.en?.vertical?.youtubeId
          : (manifest.exports as any)?.vertical?.youtubeId);

      if ((format === "landscape" || format === "all") && landscapeId) {
        await updateVideoPrivacy(youtube, landscapeId, setPrivacy || "unlisted", scheduleTime);
        if (!(manifest as any).publications) (manifest as any).publications = {};
        if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
        if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
        if (!(manifest as any).publications.youtube[lang].landscape) {
          (manifest as any).publications.youtube[lang].landscape = { id: landscapeId };
        }
        (manifest as any).publications.youtube[lang].landscape.privacy = scheduleTime ? "scheduled" : setPrivacy;
        if (scheduleTime) (manifest as any).publications.youtube[lang].landscape.scheduledAt = scheduleTime;
      }

      if ((format === "vertical" || format === "all") && verticalId) {
        await updateVideoPrivacy(youtube, verticalId, setPrivacy || "unlisted", scheduleTime);
        if (!(manifest as any).publications) (manifest as any).publications = {};
        if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
        if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
        if (!(manifest as any).publications.youtube[lang].vertical) {
          (manifest as any).publications.youtube[lang].vertical = { id: verticalId };
        }
        (manifest as any).publications.youtube[lang].vertical.privacy = scheduleTime ? "scheduled" : setPrivacy;
        if (scheduleTime) (manifest as any).publications.youtube[lang].vertical.scheduledAt = scheduleTime;
      }
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n✔ story.json updated with new visibility settings.`);
    return;
  }

  // If user only wants to update thumbnails across all formats (Landscape + Shorts)
  if (isUpdateThumbnailsOnly && !isUpdateMetadata) {
    for (const lang of languages) {
      console.log(`\n🖼️ Updating YouTube thumbnails for [${lang.toUpperCase()}] videos & shorts...`);
      const langPopularThumb = path.join(storyDir, `exports/${lang}/thumbnail-popular.png`);
      const langLandscapeThumb = existsSync(langPopularThumb)
        ? langPopularThumb
        : path.join(storyDir, `exports/${lang}/thumbnail.png`);
      const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
      const fallbackThumb = path.join(storyDir, "exports/thumbnail.png");

      const landscapeThumbPath = existsSync(langLandscapeThumb) ? langLandscapeThumb : fallbackThumb;
      const verticalThumbPath = existsSync(langVerticalThumb) ? langVerticalThumb : landscapeThumbPath;

      const landscapeId =
        (manifest as any).publications?.youtube?.[lang]?.landscape?.id ||
        (manifest.exports as any)?.[lang]?.landscape?.youtubeId ||
        (lang === "en"
          ? (manifest as any).exports?.en?.landscape?.youtubeId
          : (manifest as any).exports?.landscape?.youtubeId);

      const verticalId =
        (manifest as any).publications?.youtube?.[lang]?.vertical?.id ||
        (manifest.exports as any)?.[lang]?.vertical?.youtubeId ||
        (lang === "en"
          ? (manifest as any).exports?.en?.vertical?.youtubeId
          : (manifest as any).exports?.vertical?.youtubeId);

      if (landscapeId && existsSync(landscapeThumbPath)) {
        console.log(`Setting 16:9 Landscape thumbnail for ${lang.toUpperCase()} (${landscapeId})...`);
        await uploadThumbnail(youtube, landscapeId, landscapeThumbPath);
      }

      if (verticalId && existsSync(verticalThumbPath)) {
        console.log(`Setting 9:16 Shorts vertical thumbnail for ${lang.toUpperCase()} (${verticalId})...`);
        await uploadThumbnail(youtube, verticalId, verticalThumbPath);
      }
    }
    console.log(`\n✔ Thumbnails updated successfully for all formats.`);
    return;
  }

  for (const lang of languages) {
    const isEn = lang === "en";
    const exportsDir = path.join(storyDir, "exports", lang);
    const landscapeRel = (manifest.exports as any)?.[lang]?.landscape?.path;
    const verticalRel = (manifest.exports as any)?.[lang]?.vertical?.path;
    const candidateLandscapeVideos = [
      landscapeRel ? path.join(storyDir, landscapeRel) : null,
      path.join(exportsDir, `${bookSlug}-16x9.mp4`),
      path.join(storyDir, "exports", `${bookSlug}-16x9.mp4`),
      isEn && manifest.originalTitle
        ? path.join(exportsDir, `${manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-16x9.mp4`)
        : null,
    ].filter(Boolean) as string[];
    const landscapeVideo = candidateLandscapeVideos.find((p) => existsSync(p)) || path.join(exportsDir, `${bookSlug}-16x9.mp4`);

    const candidateVerticalVideos = [
      verticalRel ? path.join(storyDir, verticalRel) : null,
      path.join(exportsDir, `${bookSlug}-9x16.mp4`),
      path.join(storyDir, "exports", `${bookSlug}-9x16.mp4`),
      isEn && manifest.originalTitle
        ? path.join(exportsDir, `${manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-9x16.mp4`)
        : null,
    ].filter(Boolean) as string[];
    const verticalVideo = candidateVerticalVideos.find((p) => existsSync(p)) || path.join(exportsDir, `${bookSlug}-9x16.mp4`);

    const popularThumbRel =
      (manifest as any).thumbnails?.[lang]?.popular ||
      (manifest as any).thumbnails?.[lang]?.primary;
    const verticalThumbRel = (manifest as any).thumbnails?.[lang]?.vertical;
    let currentLandscapeId =
      (manifest.exports as any)?.[lang]?.landscape?.youtubeId ||
      (isEn
        ? (manifest.exports as any)?.en?.landscape?.youtubeId
        : (manifest.exports as any)?.landscape?.youtubeId);
    const langDirectPopularThumb = path.join(storyDir, `exports/${lang}/thumbnail-popular.png`);
    const langLandscapeThumb = existsSync(langDirectPopularThumb)
      ? langDirectPopularThumb
      : popularThumbRel
      ? path.join(storyDir, popularThumbRel)
      : path.join(storyDir, `exports/${lang}/thumbnail.png`);
    const fallbackThumb = path.join(storyDir, "exports/thumbnail.png");
    const thumbnailPath = existsSync(langLandscapeThumb) ? langLandscapeThumb : fallbackThumb;
    const langVerticalThumb = verticalThumbRel
      ? path.join(storyDir, verticalThumbRel)
      : path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
    const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;

    console.log(`\n======================================================`);
    console.log(`🚀 Uploading [${lang.toUpperCase()}] Edition to YouTube`);
    console.log(`======================================================`);

    const metadataKitPath = path.join(storyDir, "exports/youtube-upload-metadata.md");
    let kitMeta: ReturnType<typeof parseMetadataKit> = null;
    if (existsSync(metadataKitPath)) {
      const kitContent = await fs.readFile(metadataKitPath, "utf-8");
      kitMeta = parseMetadataKit(kitContent, lang);
    }

    const displayTitle = isEn ? (manifest.originalTitle || manifest.title) : manifest.title;
    const chapters: string = generateChapters(manifest.scenes);

    // High-CTR, High-Intent SEO Metadata
    const seoLandscape = generateSeoMetadata({
      bookSlug,
      title: manifest.title,
      originalTitle: manifest.originalTitle,
      lang,
      format: "landscape",
      author: manifest.source.originalAuthor,
      illustrator: manifest.source.originalIllustrator,
      moralHeadline: isEn ? manifest.moral?.headlineEn : manifest.moral?.headlineId,
      moralDescription: isEn ? manifest.moral?.summaryEn : manifest.moral?.summaryId,
      chapters,
      license: manifest.source.license,
      publisher: manifest.source.repository,
    });

    const seoVertical = generateSeoMetadata({
      bookSlug,
      title: manifest.title,
      originalTitle: manifest.originalTitle,
      lang,
      format: "vertical",
      author: manifest.source.originalAuthor,
      illustrator: manifest.source.originalIllustrator,
      moralHeadline: isEn ? manifest.moral?.headlineEn : manifest.moral?.headlineId,
      moralDescription: isEn ? manifest.moral?.summaryEn : manifest.moral?.summaryId,
      license: manifest.source.license,
      publisher: manifest.source.repository,
    });

    let coreTags: string[] = (kitMeta as any)?.tags || seoLandscape.tags;
    let landscapeTitle: string = sanitizeTitle(kitMeta?.landscapeTitle || seoLandscape.title);
    let landscapeDesc: string = kitMeta?.landscapeDesc || seoLandscape.description;
    let shortsTitle: string = sanitizeTitle(kitMeta?.shortsTitle || seoVertical.title);
    let shortsDesc: string = kitMeta?.shortsDesc || seoVertical.description;

    // 4. Upload Landscape (16:9) with Duration Policy & Pre-Upload Deduplication Check
    if ((effectiveFormat === "landscape" || effectiveFormat === "all") && !existsSync(landscapeVideo)) {
      console.warn(`\n⚠️ [YOUTUBE] Landscape video file not found at: ${landscapeVideo}. Skipping 16:9 upload.`);
    } else if ((effectiveFormat === "landscape" || effectiveFormat === "all") && existsSync(landscapeVideo)) {
      if (durationTier === "tier1" && !allowShortLandscape) {
        console.log(`\n🛑 DURATION POLICY: Total duration is ${totalDurationSeconds.toFixed(1)}s (< 20s).`);
        console.log(`   Best practices recommend publishing <20s videos ONLY as YouTube Shorts / Reels / TikTok (9:16).`);
        console.log(`   Standalone horizontal 16:9 upload is SUPPRESSED to protect channel watch time and retention.`);
        console.log(`   💡 Tip: Pass --allow-short-landscape to override this policy if standalone 16:9 is truly desired.`);
      } else {
        console.log(`\n🎬 Checking Landscape (16:9) publication status for ${lang.toUpperCase()}...`);

        let targetVideoId =
          (manifest.exports as any)?.[lang]?.landscape?.youtubeId ||
          (isEn
            ? (manifest.exports as any)?.en?.landscape?.youtubeId
            : (manifest.exports as any)?.landscape?.youtubeId);

        let remoteCheck = targetVideoId
          ? await checkRemoteVideoStatus(youtube, targetVideoId)
          : { exists: false };

        // Fallback search across channel to detect unindexed remote duplicate
        if (!remoteCheck.exists) {
          const duplicateOnChannel = await searchChannelForDuplicate(youtube, landscapeTitle);
          if (duplicateOnChannel) {
            const verifyStatus = await checkRemoteVideoStatus(youtube, duplicateOnChannel.videoId);
            if (verifyStatus.exists) {
              targetVideoId = duplicateOnChannel.videoId;
              remoteCheck = verifyStatus;
            }
          }
        }

        if (remoteCheck.exists && targetVideoId) {
          console.log(`\n🛑 DUPLICATE DETECTED: [${lang.toUpperCase()}] Landscape video is ALREADY LIVE on YouTube!`);
          console.log(`   • Video ID: \x1b[33m${targetVideoId}\x1b[0m`);
          console.log(`   • Title: "${remoteCheck.title}"`);
          console.log(`   • Live URL: https://youtu.be/${targetVideoId}`);
          console.log(`   • Status: ${remoteCheck.status} (${remoteCheck.privacy})`);

          if (isForceReplace) {
            console.log(`⚠️ --force / --replace flag active! Deleting remote video ${targetVideoId} first...`);
            await deleteRemoteVideo(youtube, targetVideoId);
            targetVideoId = undefined; // Proceed to upload fresh video
          } else if (isUpdateMetadata) {
            console.log(`ℹ️ --update-metadata flag active. Updating metadata & thumbnail only...`);
            await updateVideoMetadata(youtube, targetVideoId, {
              title: landscapeTitle,
              description: landscapeDesc,
              tags: coreTags,
            });
            await uploadThumbnail(youtube, targetVideoId, thumbnailPath);
          } else {
            console.log(`⏭️  SKIPPING VIDEO UPLOAD to prevent duplicate content on channel.`);
            console.log(`   💡 Tip: Use --force to replace, or --update-metadata to update title/description.`);
            // Sync thumbnail just in case
            await uploadThumbnail(youtube, targetVideoId, thumbnailPath);
          }
        }

        // Upload if no remote video exists or if old one was deleted via --force
        if (!remoteCheck.exists || (isForceReplace && !targetVideoId)) {
          let videoId: string | undefined;
          let videoUrl: string | undefined;

          // Strategy 1: Attempt Zero-Quota Playwright Browser Upload
          if (engine === "playwright" || engine === "auto") {
            try {
              console.log(`\n🌐 [${lang.toUpperCase()}] Attempting Playwright Zero-Quota Browser Upload...`);
              const browserRes = await uploadVideoViaBrowser({
                videoPath: landscapeVideo,
                title: landscapeTitle,
                description: landscapeDesc,
                thumbnailPath,
                isMadeForKids,
                privacy,
                headless: !isHeadful,
              });

              if (browserRes.success) {
                videoId = browserRes.videoId;
                videoUrl = browserRes.videoUrl || (videoId ? `https://youtu.be/${videoId}` : undefined);
                console.log(`🎉 Playwright Browser Upload Successful! Link: ${videoUrl || "Live in YouTube Studio"}`);
              } else {
                console.warn(`⚠️ Playwright browser upload: ${browserRes.error}`);
                if (engine === "playwright") {
                  throw new Error(browserRes.error);
                }
                console.log(`🔄 Falling back to official YouTube Data API v3...`);
              }
            } catch (pErr: any) {
              if (engine === "playwright") throw pErr;
              console.warn(`⚠️ Playwright error (${pErr.message}). Falling back to official YouTube Data API v3...`);
            }
          }

          // Strategy 2: Official YouTube Data API v3 (Multi-Project Auto-Rotation)
          if (!videoId && rotator) {
            await rotator.executeWithAutoRotation(
              `Upload Landscape (${lang.toUpperCase()})`,
              async (client) => {
                videoId = await uploadVideo(client.youtube, landscapeVideo, {
                  title: landscapeTitle,
                  description: landscapeDesc,
                  tags: coreTags,
                  privacyStatus: privacy,
                  isMadeForKids,
                  publishAt: scheduleTime,
                });

                await uploadThumbnail(client.youtube, videoId, thumbnailPath);
              }
            );
            videoUrl = `https://youtu.be/${videoId}`;
            console.log(`\n🎉 Landscape Video (${lang.toUpperCase()}) Live at: \x1b[36m${videoUrl}\x1b[0m`);
          } else if (!videoId && youtube) {
            videoId = await uploadVideo(youtube, landscapeVideo, {
              title: landscapeTitle,
              description: landscapeDesc,
              tags: coreTags,
              privacyStatus: privacy,
              isMadeForKids,
              publishAt: scheduleTime,
            });

            await uploadThumbnail(youtube, videoId, thumbnailPath);
            videoUrl = `https://youtu.be/${videoId}`;
            console.log(`\n🎉 Landscape Video (${lang.toUpperCase()}) Live at: \x1b[36m${videoUrl}\x1b[0m`);
          }

          if (!videoId) {
            throw new Error(`Failed to upload landscape video via both Playwright and YouTube API v3.`);
          }

          targetVideoId = videoId;
          currentLandscapeId = targetVideoId;
        }

        if (targetVideoId) {
          if (!manifest.exports) manifest.exports = {};
          if ((manifest.exports as any)[lang]) {
            if (!(manifest.exports as any)[lang].landscape) (manifest.exports as any)[lang].landscape = {};
            (manifest.exports as any)[lang].landscape.youtubeId = targetVideoId;
            (manifest.exports as any)[lang].landscape.youtubeUrl = `https://youtu.be/${targetVideoId}`;
          } else if (isEn) {
            if (!(manifest.exports as any).en) (manifest.exports as any).en = {};
            if (!(manifest.exports as any).en.landscape) (manifest.exports as any).en.landscape = {};
            (manifest.exports as any).en.landscape.youtubeId = targetVideoId;
            (manifest.exports as any).en.landscape.youtubeUrl = `https://youtu.be/${targetVideoId}`;
          } else {
            if (!manifest.exports.landscape) manifest.exports.landscape = {};
            manifest.exports.landscape.youtubeId = targetVideoId;
            manifest.exports.landscape.youtubeUrl = `https://youtu.be/${targetVideoId}`;
          }

          // Record in unified multi-platform publications registry
          if (!(manifest as any).publications) (manifest as any).publications = {};
          if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
          if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
          (manifest as any).publications.youtube[lang].landscape = {
            id: targetVideoId,
            url: `https://youtu.be/${targetVideoId}`,
            publishedAt: new Date().toISOString(),
            title: landscapeTitle,
            status: "published",
          };

          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        // Sync to Cloudflare D1 (Single Source of Truth)
        try {
          await db.saveStory(manifest);
          console.log(`   ☁️ Synchronized YouTube Shorts publication to Cloudflare D1.`);
        } catch (d1Err: any) {
          console.warn(`   ⚠️ Cloudflare D1 sync warning: ${d1Err.message}`);
        }

          // Sync to Cloudflare D1 (Single Source of Truth)
          try {
            await db.saveStory(manifest);
            console.log(`   ☁️ Synchronized YouTube landscape publication to Cloudflare D1.`);
          } catch (d1Err: any) {
            console.warn(`   ⚠️ Cloudflare D1 sync warning: ${d1Err.message}`);
          }

          if (autoCleanup && existsSync(landscapeVideo)) {
            await fs.unlink(landscapeVideo);
            console.log(`   🧹 Auto-cleanup: Removed local 16:9 MP4 (${path.basename(landscapeVideo)}) after verified upload.`);
          }
        }
      }
    }

    // 5. Upload Vertical Shorts (9:16) with Pre-Upload Deduplication Check
    const langDuration = manifest.scenes
      ? manifest.scenes.reduce((acc: number, s: any) => {
          if (lang === "en") {
            return acc + (s.audio?.en?.durationSeconds || s.audio?.en?.duration || s.durationSeconds || 0);
          }
          return acc + (s.audio?.id?.durationSeconds || s.audio?.id?.duration || s.durationSeconds || 0);
        }, 0)
      : totalDurationSeconds;

    if ((effectiveFormat === "vertical" || effectiveFormat === "all") && langDuration > 180) {
      console.log(`\n🛑 DURATION POLICY: [${lang.toUpperCase()}] Story duration is ${langDuration.toFixed(1)}s (> 180s).`);
      console.log(`   YouTube Shorts strictly limits vertical videos to <=180s (anything longer is forced into the Videos tab).`);
      console.log(`   Skipping Shorts upload for this edition to prevent channel video duplication.`);
    } else if ((effectiveFormat === "vertical" || effectiveFormat === "all") && !existsSync(verticalVideo)) {
      console.warn(`\n⚠️ [YOUTUBE] Vertical Shorts video file not found at: ${verticalVideo}. Skipping 9:16 Shorts upload.`);
    } else if ((effectiveFormat === "vertical" || effectiveFormat === "all") && existsSync(verticalVideo)) {
      console.log(`\n📱 Checking Shorts (9:16) publication status for ${lang.toUpperCase()}...`);

      let targetShortsId =
        (manifest.exports as any)?.[lang]?.vertical?.youtubeId ||
        (isEn
          ? (manifest.exports as any)?.en?.vertical?.youtubeId
          : (manifest.exports as any)?.vertical?.youtubeId);

      let remoteShortsCheck = targetShortsId
        ? await checkRemoteVideoStatus(youtube, targetShortsId)
        : { exists: false };

      if (!remoteShortsCheck.exists) {
        const duplicateShorts = await searchChannelForDuplicate(youtube, shortsTitle);
        // Ensure the duplicate detected is NOT the landscape video that was just uploaded
        if (duplicateShorts && duplicateShorts.videoId !== currentLandscapeId) {
          const verifyStatus = await checkRemoteVideoStatus(youtube, duplicateShorts.videoId);
          if (verifyStatus.exists) {
            targetShortsId = duplicateShorts.videoId;
            remoteShortsCheck = verifyStatus;
          }
        }
      }

      if (remoteShortsCheck.exists && targetShortsId) {
        console.log(`\n🛑 DUPLICATE DETECTED: [${lang.toUpperCase()}] Shorts video is ALREADY LIVE on YouTube!`);
        console.log(`   • Video ID: \x1b[33m${targetShortsId}\x1b[0m`);
        console.log(`   • Title: "${remoteShortsCheck.title}"`);
        console.log(`   • Live URL: https://youtube.com/shorts/${targetShortsId}`);
        console.log(`   • Status: ${remoteShortsCheck.status} (${remoteShortsCheck.privacy})`);

        if (isForceReplace) {
          console.log(`⚠️ --force / --replace flag active! Deleting remote shorts ${targetShortsId} first...`);
          await deleteRemoteVideo(youtube, targetShortsId);
          targetShortsId = undefined; // Proceed to upload fresh video
        } else if (isUpdateMetadata) {
          console.log(`ℹ️ --update-metadata flag active. Updating metadata & vertical thumbnail for Shorts...`);
          await updateVideoMetadata(youtube, targetShortsId, {
            title: shortsTitle,
            description: shortsDesc,
            tags: [...coreTags, "shorts", "youtubeshorts"],
          });
          const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
          const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;
          await uploadThumbnail(youtube, targetShortsId, verticalThumbnailPath);
        } else {
          console.log(`⏭️  SKIPPING SHORTS UPLOAD to prevent duplicate content on channel.`);
          console.log(`   💡 Tip: Use --force to replace, or --update-metadata to update title/description.`);
          const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
          const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;
          await uploadThumbnail(youtube, targetShortsId, verticalThumbnailPath);
        }
      }

      if (!remoteShortsCheck.exists || (isForceReplace && !targetShortsId)) {
        let shortsVideoId: string | undefined;
        let shortsUrl: string | undefined;
        const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
        const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;

        // Strategy 1: Attempt Zero-Quota Playwright Browser Upload
        if (engine === "playwright" || engine === "auto") {
          try {
            console.log(`\n🌐 [${lang.toUpperCase()}] Attempting Playwright Zero-Quota Shorts Upload...`);
            const browserRes = await uploadVideoViaBrowser({
              videoPath: verticalVideo,
              title: shortsTitle,
              description: shortsDesc,
              thumbnailPath: verticalThumbnailPath,
              isMadeForKids,
              privacy,
              headless: !isHeadful,
            });

            if (browserRes.success) {
              shortsVideoId = browserRes.videoId;
              shortsUrl = browserRes.videoUrl || (shortsVideoId ? `https://youtube.com/shorts/${shortsVideoId}` : undefined);
              console.log(`🎉 Playwright Shorts Upload Successful! Link: ${shortsUrl || "Live in YouTube Studio"}`);

              // Guarantee custom vertical thumbnail is set via official YouTube API for desktop/channel views
              if (shortsVideoId && youtube && verticalThumbnailPath && existsSync(verticalThumbnailPath)) {
                try {
                  console.log(`🖼️ Syncing vertical thumbnail to YouTube Shorts via API...`);
                  await uploadThumbnail(youtube, shortsVideoId, verticalThumbnailPath);
                } catch (tErr: any) {
                  console.warn(`⚠️ Post-browser thumbnail sync warning: ${tErr.message}`);
                }
              }
            } else {
              console.warn(`⚠️ Playwright browser upload: ${browserRes.error}`);
              if (engine === "playwright") {
                throw new Error(browserRes.error);
              }
              console.log(`🔄 Falling back to official YouTube Data API v3...`);
            }
          } catch (pErr: any) {
            if (engine === "playwright") throw pErr;
            console.warn(`⚠️ Playwright error (${pErr.message}). Falling back to official YouTube Data API v3...`);
          }
        }

        // Strategy 2: Official YouTube Data API v3 (Multi-Project Auto-Rotation)
        if (!shortsVideoId && rotator) {
          await rotator.executeWithAutoRotation(
            `Upload Shorts (${lang.toUpperCase()})`,
            async (client) => {
              shortsVideoId = await uploadVideo(client.youtube, verticalVideo, {
                title: shortsTitle,
                description: shortsDesc,
                tags: [...coreTags, "shorts", "youtubeshorts"],
                privacyStatus: privacy,
                isMadeForKids,
                publishAt: scheduleTime,
              });

              await uploadThumbnail(client.youtube, shortsVideoId, verticalThumbnailPath, true);
            }
          );
          shortsUrl = `https://youtube.com/shorts/${shortsVideoId}`;
          console.log(`\n🎉 Shorts Video (${lang.toUpperCase()}) Live at: \x1b[36m${shortsUrl}\x1b[0m`);
        } else if (!shortsVideoId && youtube) {
          shortsVideoId = await uploadVideo(youtube, verticalVideo, {
            title: shortsTitle,
            description: shortsDesc,
            tags: [...coreTags, "shorts", "youtubeshorts"],
            privacyStatus: privacy,
            isMadeForKids,
            publishAt: scheduleTime,
          });

          await uploadThumbnail(youtube, shortsVideoId, verticalThumbnailPath, true);
          shortsUrl = `https://youtube.com/shorts/${shortsVideoId}`;
          console.log(`\n🎉 Shorts Video (${lang.toUpperCase()}) Live at: \x1b[36m${shortsUrl}\x1b[0m`);
        }

        if (!shortsVideoId) {
          throw new Error(`Failed to upload Shorts video via both Playwright and YouTube API v3.`);
        }

        targetShortsId = shortsVideoId;
      }

      if (targetShortsId) {
        if (!manifest.exports) manifest.exports = {};
        if ((manifest.exports as any)[lang]) {
          if (!(manifest.exports as any)[lang].vertical) (manifest.exports as any)[lang].vertical = {};
          (manifest.exports as any)[lang].vertical.youtubeId = targetShortsId;
          (manifest.exports as any)[lang].vertical.youtubeUrl = `https://youtube.com/shorts/${targetShortsId}`;
        } else if (isEn) {
          if (!(manifest.exports as any).en) (manifest.exports as any).en = {};
          if (!(manifest.exports as any).en.vertical) (manifest.exports as any).en.vertical = {};
          (manifest.exports as any).en.vertical.youtubeId = targetShortsId;
          (manifest.exports as any).en.vertical.youtubeUrl = `https://youtube.com/shorts/${targetShortsId}`;
        } else {
          if (!manifest.exports.vertical) manifest.exports.vertical = {};
          manifest.exports.vertical.youtubeId = targetShortsId;
          manifest.exports.vertical.youtubeUrl = `https://youtube.com/shorts/${targetShortsId}`;
        }

        // Record in unified multi-platform publications registry
        if (!(manifest as any).publications) (manifest as any).publications = {};
        if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
        if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
        (manifest as any).publications.youtube[lang].vertical = {
          id: targetShortsId,
          url: `https://youtube.com/shorts/${targetShortsId}`,
          publishedAt: new Date().toISOString(),
          title: shortsTitle,
          status: "published",
        };

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        // Sync to Cloudflare D1 (Single Source of Truth)
        try {
          await db.saveStory(manifest);
          console.log(`   ☁️ Synchronized YouTube Shorts publication to Cloudflare D1.`);
        } catch (d1Err: any) {
          console.warn(`   ⚠️ Cloudflare D1 sync warning: ${d1Err.message}`);
        }

        if (autoCleanup && existsSync(verticalVideo)) {
          await fs.unlink(verticalVideo);
          console.log(`   🧹 Auto-cleanup: Removed local 9:16 Shorts MP4 (${path.basename(verticalVideo)}) after verified upload.`);
        }
      }
    }
  }

  if (autoCleanup) {
    const rawPagesDir = path.join(storyDir, "raw/pages");
    if (existsSync(rawPagesDir)) {
      await fs.rm(rawPagesDir, { recursive: true, force: true });
      console.log(`🧹 Auto-cleanup: Removed intermediate raw PDF pages folder.`);
    }
  }

  console.log(`\n✔ story.json updated with newly uploaded YouTube video links.`);
  console.log(`\n💡 Note: Videos are uploaded as [${privacy.toUpperCase()}] by default for review.`);
  console.log(`   To change visibility to PUBLIC:  npm run upload -- --book ${bookSlug} --set-privacy public`);
  console.log(`   To SCHEDULE release for later:  npm run upload -- --book ${bookSlug} --schedule "2026-11-03T10:00:00Z"`);
}

main().catch(console.error);
