import fs from "fs/promises";
import { existsSync, createReadStream, readdirSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

interface MetaConfig {
  appId: string;
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  pageAccessToken: string;
}

interface R2Config {
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

interface UploadOptions {
  bookSlug: string;
  compilationTheme?: string;
  lang: "id" | "en";
  platform: "instagram" | "facebook" | "both";
  format: "vertical" | "landscape" | "auto";
  dryRun: boolean;
  shareToFeed: boolean;
  force: boolean;
}

/**
 * Parses CLI arguments.
 */
function parseArgs(): UploadOptions {
  const args = process.argv.slice(2);
  const options: UploadOptions = {
    bookSlug: "gara-gara-kucing",
    lang: "id",
    platform: "instagram",
    format: "auto",
    dryRun: false,
    shareToFeed: true,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book" && args[i + 1]) {
      options.bookSlug = args[++i].replace(/^stories\//, "").replace(/\/$/, "");
    } else if (arg === "--compilation" && args[i + 1]) {
      options.compilationTheme = args[++i];
      options.platform = "facebook";
      options.format = "landscape";
    } else if (arg === "--lang" && args[i + 1]) {
      options.lang = args[++i] as "id" | "en";
    } else if (arg === "--platform" && args[i + 1]) {
      options.platform = args[++i] as "instagram" | "facebook" | "both";
    } else if (arg === "--format" && args[i + 1]) {
      options.format = args[++i] as "vertical" | "landscape" | "auto";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-feed") {
      options.shareToFeed = false;
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  // Default format behavior:
  // If platform is instagram, format defaults to vertical (Instagram Reels)
  // If format is auto and platform is facebook, can be either landscape or vertical
  if (options.format === "auto") {
    options.format = options.platform === "instagram" ? "vertical" : "vertical";
  }

  return options;
}

/**
 * Loads and validates Meta credentials from config/meta-config.json and .env.
 */
async function loadMetaConfig(): Promise<MetaConfig> {
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

  const configPath = path.resolve("./config/meta-config.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `Meta configuration not found at ${configPath}. Please check config/meta-config.json.`
    );
  }

  const raw = await fs.readFile(configPath, "utf-8");
  const config: MetaConfig = JSON.parse(raw);

  if (process.env.PERSONAL_META_ACCESS_TOKEN) config.pageAccessToken = process.env.PERSONAL_META_ACCESS_TOKEN;
  if (process.env.META_PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (process.env.PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.PAGE_ACCESS_TOKEN;
  if (process.env.PERSONAL_META_APP_ID) config.appId = process.env.PERSONAL_META_APP_ID;
  if (process.env.META_APP_ID) config.appId = process.env.META_APP_ID;
  if (process.env.FACEBOOK_PAGE_ID) config.facebookPageId = process.env.FACEBOOK_PAGE_ID;
  if (process.env.INSTAGRAM_USER_ID) config.instagramUserId = process.env.INSTAGRAM_USER_ID;

  if (!config.pageAccessToken || !config.instagramUserId || !config.facebookPageId) {
    throw new Error(
      "Incomplete Meta config. Missing pageAccessToken, instagramUserId, or facebookPageId."
    );
  }

  return config;
}

/**
 * Loads Cloudflare R2 configuration from config/r2-config.json.
 */
async function loadR2Config(): Promise<R2Config> {
  const configPath = path.resolve("./config/r2-config.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `R2 configuration not found at ${configPath}. Please check config/r2-config.json.`
    );
  }

  const raw = await fs.readFile(configPath, "utf-8");
  const config: R2Config = JSON.parse(raw);

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName || !config.publicDomain) {
    throw new Error(
      "Incomplete R2 config. Missing accessKeyId, secretAccessKey, bucketName, or publicDomain."
    );
  }

  return config;
}

/**
 * Builds rich, engaging caption adapted to any story.
 */
function buildCaption(story: any, lang: "id" | "en", format: "vertical" | "landscape"): string {
  const isLandscape = format === "landscape";
  if (lang === "id") {
    const rawTitle = (story.title || "Cerita Anak Bergambar").replace(/\(.*\)/, "").trim();
    const hook = story.thumbnailConfig?.id?.hook || story.thumbnailConfig?.id?.headlineTop || "Kisah seru dan penuh tawa!";
    const badge = story.thumbnailConfig?.id?.badge || "Dongeng Animasi Anak";
    const sticker = story.thumbnailConfig?.id?.sticker || "";
    const bedtimeHook = story.thumbnailConfig?.id?.bedtimeHook || "Cerita edukatif untuk menemani si kecil belajar nilai kebaikan.";
    const hashtags = isLandscape
      ? "#CeritaAnak #DongengAnak #Storybook #BukuAnak #AnimasiAnak #BedtimeStory #EdukasiAnak #BukuCeritaAnak #ZaynStorybook #FacebookWatch #VideoAnak"
      : "#CeritaAnak #DongengAnak #Storybook #KidsStory #AnimasiAnak #Reels #FacebookReels #InstagramReels #BedtimeStory #EdukasiAnak #BukuCeritaAnak #ZaynStorybook";

    return `${rawTitle} 🐱📚\n\n${hook} ${sticker}\n\n${bedtimeHook}\n\n${badge}\n\n📖 Seri Cerita & Dongeng Anak Bergambar Zayn Storybook\n✨ Nilai Moral: Selalu jujur, berbuat baik, dan bertanggung jawab atas tugas kita!\n\n${hashtags}`;
  } else {
    const rawTitle = story.originalTitle || story.title || "Kids Storybook";
    const hook = story.thumbnailConfig?.en?.hook || story.thumbnailConfig?.en?.headlineTop || "A wonderful story for kids!";
    const badge = story.thumbnailConfig?.en?.badge || "Animated Children's Book";
    const bedtimeHook = story.thumbnailConfig?.en?.bedtimeHook || "A delightful bedtime tale for children.";
    const hashtags = isLandscape
      ? "#KidsBooks #Storytime #BedtimeStory #Animation #ChildrensBook #KidsAnimation #ZaynStorybook #FacebookWatch #ReadAloud"
      : "#KidsBooks #Storytime #BedtimeStory #Animation #Reels #InstagramReels #FacebookReels #ChildrensBook #KidsAnimation #ZaynStorybook";

    return `${rawTitle} 🐱📚\n\n${hook}\n\n${bedtimeHook}\n\n${badge}\n\n📖 Zayn Storybook Children's Animated Picture Book Series\n✨ Moral: Honesty, kindness, and taking responsibility bring true happiness!\n\n${hashtags}`;
  }
}

/**
 * Uploads video to Cloudflare R2 object storage to provide a high-speed direct public HTTPS URL.
 */
async function uploadVideoToR2(
  videoPath: string,
  bookSlug: string,
  lang: string
): Promise<{ publicVideoUrl: string; cleanup: () => Promise<void> }> {
  const r2 = await loadR2Config();
  const stats = await fs.stat(videoPath);
  const fileSize = stats.size;

  console.log(`\n☁️ Uploading video to Cloudflare R2 bucket [${r2.bucketName}]...`);
  console.log(`📦 File Size : ${(fileSize / (1024 * 1024)).toFixed(2)} MB (${fileSize} bytes)`);

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });

  const fileStream = createReadStream(videoPath);
  const key = `reels/${bookSlug}-${lang}-${Date.now()}.mp4`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: fileStream,
      ContentType: "video/mp4",
      ContentLength: fileSize,
    })
  );

  const publicVideoUrl = `${r2.publicDomain.replace(/\/$/, "")}/${key}`;
  console.log(`   ✔ Video uploaded to Cloudflare R2 successfully!`);
  console.log(`   🌐 Public CDN URL: ${publicVideoUrl}`);

  const cleanup = async () => {
    try {
      console.log(`🧹 Cleaning up temporary video from Cloudflare R2...`);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );
      console.log(`   ✔ R2 temporary object removed.`);
    } catch (err: any) {
      console.warn("   ⚠️ R2 cleanup warning:", err.message);
    }
  };

  return { publicVideoUrl, cleanup };
}

/**
 * Uploads a local image to Cloudflare R2 temporarily for Instagram Reels cover ingestion.
 */
async function uploadImageToR2(
  imagePath: string,
  bookSlug: string,
  lang: string
): Promise<{ publicImageUrl: string; cleanup: () => Promise<void> }> {
  const r2 = await loadR2Config();
  const stats = await fs.stat(imagePath);

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });

  const fileStream = createReadStream(imagePath);
  const key = `covers/${bookSlug}-${lang}-${Date.now()}.png`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: fileStream,
      ContentType: "image/png",
      ContentLength: stats.size,
    })
  );

  const publicImageUrl = `${r2.publicDomain.replace(/\/$/, "")}/${key}`;
  console.log(`   ✔ Cover image uploaded to Cloudflare R2 for Reel cover: ${publicImageUrl}`);

  const cleanup = async () => {
    try {
      console.log(`🧹 Cleaning up temporary cover image from Cloudflare R2...`);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );
      console.log(`   ✔ R2 cover object removed.`);
    } catch (err: any) {
      console.warn("   ⚠️ R2 cover cleanup warning:", err.message);
    }
  };

  return { publicImageUrl, cleanup };
}

/**
 * Polls Instagram media container status until FINISHED or ERROR.
 */
async function pollInstagramContainer(
  containerId: string,
  pageAccessToken: string,
  timeoutMs = 300000
): Promise<void> {
  const start = Date.now();
  const pollInterval = 5000;

  process.stdout.write("   ⏳ Waiting for Meta server download & transcoding: ");
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${pageAccessToken}`
    );
    const data = await res.json();

    if (data.error) {
      process.stdout.write("\n");
      throw new Error(`Failed to check container status: ${JSON.stringify(data.error)}`);
    }

    const statusCode = data.status_code;
    if (statusCode === "FINISHED" || statusCode === "READY") {
      process.stdout.write(" [READY!]\n");
      return;
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      process.stdout.write("\n");
      throw new Error(
        `Instagram container failed with status: ${statusCode} (${data.status || "Unknown error"})`
      );
    }

    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  process.stdout.write("\n");
  throw new Error(`Instagram video processing timed out after ${timeoutMs / 1000} seconds.`);
}

/**
 * Uploads vertical video to Instagram Reels via Cloudflare R2 CDN URL.
 */
async function uploadToInstagramReels(
  videoSource: { localPath?: string; publicUrl?: string },
  caption: string,
  config: MetaConfig,
  shareToFeed: boolean,
  bookSlug: string,
  lang: string,
  thumbnailPath?: string
): Promise<{ mediaId: string; permalink: string }> {
  console.log(`\n==================================================`);
  console.log(`📸 STARTING INSTAGRAM REELS UPLOAD (CLOUDFLARE R2)`);
  console.log(`==================================================`);
  console.log(`👤 Target Account : @${config.instagramUsername || config.instagramUserId}`);

  let publicVideoUrl = videoSource.publicUrl;
  let localCleanup: (() => Promise<void>) | null = null;

  if (!publicVideoUrl) {
    if (!videoSource.localPath) throw new Error("Neither publicUrl nor localPath provided for Instagram Reel");
    console.log(`📁 Local File     : ${videoSource.localPath}`);
    const r2Result = await uploadVideoToR2(videoSource.localPath, bookSlug, lang);
    publicVideoUrl = r2Result.publicVideoUrl;
    localCleanup = r2Result.cleanup;
  } else {
    console.log(`🌐 Using R2 URL   : ${publicVideoUrl}`);
  }

  // Upload custom cover image to R2 for Reel cover_url if provided
  let publicCoverUrl: string | undefined;
  let coverCleanup: (() => Promise<void>) | null = null;
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      const coverRes = await uploadImageToR2(thumbnailPath, bookSlug, lang);
      publicCoverUrl = coverRes.publicImageUrl;
      coverCleanup = coverRes.cleanup;
    } catch (covErr: any) {
      console.warn(`⚠️ Could not upload Reel cover thumbnail to R2: ${covErr.message}`);
    }
  }

  let containerId: string;
  try {
    // Step 2: Initialize Instagram Reels container using video_url and optional cover_url
    console.log(`\n📡 Step 2: Registering Instagram Reels container with Meta Graph API...`);
    const containerPayload: Record<string, any> = {
      media_type: "REELS",
      video_url: publicVideoUrl,
      caption,
      share_to_feed: shareToFeed,
      access_token: config.pageAccessToken,
    };
    if (publicCoverUrl) {
      containerPayload.cover_url = publicCoverUrl;
      console.log(`   🖼️ Custom Cover URL attached: ${publicCoverUrl}`);
    }

    const initRes = await fetch(`https://graph.facebook.com/v21.0/${config.instagramUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerPayload),
    });

    const initData = await initRes.json();
    if (initData.error) {
      throw new Error(`Failed to initialize Instagram Reels container: ${JSON.stringify(initData.error)}`);
    }

    containerId = initData.id;
    console.log(`   ✔ Container ID: ${containerId}`);

    // Step 3: Wait for Meta to fetch video from Cloudflare CDN and transcode
    console.log(`\n⚙️ Step 3: Waiting for Meta ingestion & transcoding...`);
    await pollInstagramContainer(containerId, config.pageAccessToken);

    // Step 4: Publish Media Container (MUST happen while cover_url and video_url are still live on R2 CDN)
    console.log(`\n📢 Step 4: Publishing Reel to Instagram feed...`);
    const pubRes = await fetch(`https://graph.facebook.com/v21.0/${config.instagramUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: config.pageAccessToken,
      }),
    });

    const pubData = await pubRes.json();
    if (pubData.error) {
      throw new Error(`Failed to publish Instagram Reel: ${JSON.stringify(pubData.error)}`);
    }

    const mediaId = pubData.id;
    console.log(`   ✔ Published Media ID: ${mediaId}`);

    // Step 5: Query Live Reel Details
    let permalink = `https://www.instagram.com/reel/`;
    try {
      const detailRes = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}?fields=id,permalink,shortcode&access_token=${config.pageAccessToken}`
      );
      const detailData = await detailRes.json();
      if (detailData.permalink) {
        permalink = detailData.permalink;
      } else if (detailData.shortcode) {
        permalink = `https://www.instagram.com/reel/${detailData.shortcode}/`;
      }
    } catch (err) {
      console.warn("   ⚠️ Could not fetch live permalink immediately:", err);
    }

    console.log(`\n🎉 INSTAGRAM REEL LIVE!`);
    console.log(`🔗 Link: ${permalink}`);

    return { mediaId, permalink };
  } finally {
    if (localCleanup) {
      await localCleanup();
    }
    if (coverCleanup) {
      await coverCleanup();
    }
  }
}

/**
 * Uploads a custom thumbnail to a Facebook video.
 */
async function uploadThumbnailToFacebook(
  videoId: string,
  thumbnailPath: string,
  pageAccessToken: string
): Promise<void> {
  const uploadUrl = `https://graph.facebook.com/v21.0/${videoId}/thumbnails`;
  await new Promise<void>((resolve, reject) => {
    const curlArgs = [
      "-s",
      "-S",
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      uploadUrl,
      "-F",
      `access_token=${pageAccessToken}`,
      "-F",
      "is_preferred=true",
      "-F",
      `source=@${thumbnailPath}`,
    ];

    const proc = spawn("curl", curlArgs);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      const lines = stdout.trim().split("\n");
      const httpCode = lines.pop()?.trim();
      if (httpCode === "200") {
        resolve();
      } else {
        reject(new Error(`Failed with HTTP ${httpCode}: ${lines.join("\n")}`));
      }
    });
  });
}

/**
 * Verifies if an Instagram Reel video object is currently live and active by querying user's media collection.
 */
async function findLiveInstagramMediaByTitle(
  instagramUserId: string,
  title: string,
  accessToken: string,
  requireVideo: boolean = true
): Promise<{ id: string; permalink: string } | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${instagramUserId}/media?fields=id,permalink,caption,media_type,media_product_type&limit=50&access_token=${accessToken}`
    );
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return null;

    const target = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const item of data.data) {
      if (requireVideo) {
        const isVideo =
          item.media_type === "VIDEO" ||
          item.media_product_type === "REELS" ||
          (typeof item.permalink === "string" && item.permalink.includes("/reel/"));
        if (!isVideo) continue;
      }
      const caption = (item.caption || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
      if (caption.includes(target)) {
        return { id: item.id, permalink: item.permalink };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifies if a Facebook video is currently live by querying Page video collection.
 */
async function findLiveFacebookVideoByTitle(
  facebookPageId: string,
  title: string,
  format: "vertical" | "landscape",
  accessToken: string
): Promise<{ id: string; permalink: string } | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${facebookPageId}/videos?fields=id,title,description,permalink_url&limit=50&access_token=${accessToken}`
    );
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return null;

    const target = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const item of data.data) {
      const itemTitle = (item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
      const itemDesc = (item.description || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
      if (itemTitle.includes(target) || itemDesc.includes(target)) {
        return { id: item.id, permalink: item.permalink_url || `https://www.facebook.com/${item.id}` };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Uploads video to Facebook Page feed using Cloudflare R2 file_url or local multipart form-data.
 * Handles both Normal Videos (16:9 Landscape) and Reels (9:16 Vertical).
 */
async function uploadToFacebookPage(
  videoSource: { localPath?: string; publicUrl?: string },
  title: string,
  caption: string,
  config: MetaConfig,
  format: "vertical" | "landscape",
  thumbnailPath?: string
): Promise<{ videoId: string; permalink: string }> {
  const isLandscape = format === "landscape";
  const postTypeLabel = isLandscape ? "NORMAL VIDEO (16:9 LANDSCAPE / WATCH)" : "FACEBOOK REEL (9:16 VERTICAL)";

  console.log(`\n==================================================`);
  console.log(`📘 STARTING FACEBOOK ${postTypeLabel} UPLOAD`);
  console.log(`==================================================`);
  console.log(`📄 Target Page   : ${config.facebookPageName || config.facebookPageId}`);

  let videoId: string;

  if (videoSource.publicUrl) {
    console.log(`🌐 Ingestion Mode: Cloudflare R2 Edge CDN (Zero local bandwidth upload)`);
    console.log(`🔗 CDN Video URL : ${videoSource.publicUrl}`);

    const res = await fetch(`https://graph.facebook.com/v21.0/${config.facebookPageId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: config.pageAccessToken,
        file_url: videoSource.publicUrl,
        title,
        description: caption,
      }),
    });

    const parsed = await res.json();
    if (parsed.error) {
      throw new Error(`Facebook Page upload via URL failed: ${JSON.stringify(parsed.error)}`);
    }
    videoId = parsed.id;
  } else {
    const videoPath = videoSource.localPath;
    if (!videoPath) throw new Error("Neither localPath nor publicUrl provided for Facebook upload");

    console.log(`📁 Local File    : ${videoPath}`);
    const stats = await fs.stat(videoPath);
    console.log(`📦 Payload Size  : ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size} bytes)`);

    const uploadUrl = `https://graph.facebook.com/v21.0/${config.facebookPageId}/videos`;
    console.log(`\n🚀 Uploading video directly to Facebook Page [${config.facebookPageId}]...`);

    const result = await new Promise<{ id: string }>((resolve, reject) => {
      const curlArgs = [
        "-s",
        "-S",
        "-w",
        "\n%{http_code}",
        "-X",
        "POST",
        uploadUrl,
        "-F",
        `access_token=${config.pageAccessToken}`,
        "-F",
        `title=${title}`,
        "-F",
        `description=${caption}`,
        "-F",
        `source=@${videoPath}`,
      ];

      const proc = spawn("curl", curlArgs);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        const lines = stdout.trim().split("\n");
        const httpCode = lines.pop()?.trim();
        const body = lines.join("\n");

        if (code !== 0) {
          return reject(new Error(`curl failed with exit code ${code}: ${stderr}`));
        }

        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = { text: body };
        }

        if (httpCode !== "200" || parsed.error) {
          return reject(
            new Error(
              `Facebook Page upload failed [HTTP ${httpCode}]: ${JSON.stringify(parsed.error || parsed)}`
            )
          );
        }

        resolve(parsed);
      });
    });
    videoId = result.id;
  }

  console.log(`   ✔ Published Video ID: ${videoId}`);

  // Attach custom thumbnail for videos and Reels if available
  if (thumbnailPath && existsSync(thumbnailPath)) {
    console.log(`\n🖼️ Attaching custom ${isLandscape ? "landscape" : "vertical"} thumbnail: ${thumbnailPath}...`);
    try {
      await uploadThumbnailToFacebook(videoId, thumbnailPath, config.pageAccessToken);
      console.log(`   ✔ Custom thumbnail attached as preferred poster!`);
    } catch (err: any) {
      console.warn(`   ⚠️ Thumbnail attachment warning:`, err.message);
    }
  }

  // Construct absolute permalink
  // Note: We use direct Page Video URL (https://www.facebook.com/{pageId}/videos/{videoId}/)
  // instead of standalone /reel/{videoId}/ because Facebook's web/mobile client-side Reels player
  // automatically falls back and redirects to trending global reels (showing different videos)
  // if the reel is newly uploaded or accessed without page context.
  const pageVideoUrl = `https://www.facebook.com/${config.facebookPageId}/videos/${videoId}/`;
  let permalink = pageVideoUrl;

  console.log(`\n🎉 FACEBOOK ${isLandscape ? "NORMAL VIDEO" : "REEL"} LIVE!`);
  console.log(`🔗 Link: ${permalink}`);

  return { videoId, permalink };
}

/**
 * Main execution routine.
 */
async function main() {
  const options = parseArgs();
  console.log("\n=======================================================");
  console.log("🎬 STORYBOOK META UPLOADER (INSTAGRAM & FACEBOOK)");
  console.log("=======================================================");
  console.log(`📖 Book Slug  : ${options.bookSlug}`);
  console.log(`🌐 Language   : ${options.lang}`);
  console.log(`📱 Platform   : ${options.platform}`);
  console.log(`📐 Format     : ${options.format.toUpperCase()}`);
  console.log(`🧪 Dry Run    : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);

  // Load config
  const config = await loadMetaConfig();

  // Handle compilation upload if requested
  if (options.compilationTheme) {
    const outDir = path.resolve("./exports/compilations");
    const videoFilename = `kompilasi-${options.compilationTheme}-${options.lang}-16x9.mp4`;
    const metaFilename = `kompilasi-${options.compilationTheme}-${options.lang}-metadata.txt`;
    const videoPath = path.join(outDir, videoFilename);
    const metaPath = path.join(outDir, metaFilename);

    if (!existsSync(videoPath)) {
      throw new Error(`Compilation video not found at ${videoPath}`);
    }

    const isEn = options.lang === "en";
    let title = isEn
      ? "Bedtime Stories Marathon for Kids (12 Mins Non-Stop) | Calming Animated Picture Books 🌙✨"
      : "Kumpulan Dongeng Pengantar Tidur Anak 🌙✨";
    let caption = "Kompilasi dongeng anak bergambar non-stop...";
    if (existsSync(metaPath)) {
      const metaContent = await fs.readFile(metaPath, "utf-8");
      const titleMatch = metaContent.match(/JUDUL:\s*\n([^\n]+)/);
      if (titleMatch) title = titleMatch[1].trim();
      const descMatch = metaContent.match(/DESKRIPSI:\s*\n([\s\S]+?)(?=\n⏳ TIMESTAMPS|\n===|$)/);
      const descPart = descMatch ? descMatch[1].trim() : "";
      const timestampsMatch = metaContent.match(/(⏳ TIMESTAMPS[\s\S]+?)(?=\n===|$)/);
      const timestampsPart = timestampsMatch ? timestampsMatch[1].trim() : "";
      const hashtags = isEn
        ? "#BedtimeStories #KidsStories #StorybookAnimation #ChildrenBooks #ZaynStorybook #PictureBooks #FacebookWatch #KidsAnimation"
        : "#DongengAnak #CeritaAnak #BedtimeStory #KompilasiDongeng #ZaynStorybook #CeritaBergambar #FacebookWatch #VideoAnak";
      caption = `${title}\n\n${descPart}\n\n${timestampsPart}\n\n${hashtags}`;
    }

    const thumbnailCandidates = [
      path.join(outDir, `thumbnail-compilation-${options.compilationTheme}-${options.lang}.png`),
      path.resolve(`./stories/pisang-terlalu-banyak/exports/${options.lang}/thumbnail-bedtime.png`),
      path.resolve(`./stories/hari-cukur-rambut/exports/${options.lang}/thumbnail-bedtime.png`),
      path.resolve(`./stories/jas-hujan-merah/exports/${options.lang}/thumbnail-popular.png`),
    ];
    const thumbnailPath = thumbnailCandidates.find((p) => existsSync(p));

    console.log(`\n=======================================================`);
    console.log(`🎬 COMPILATION FACEBOOK WATCH UPLOADER [${options.lang.toUpperCase()}]`);
    console.log(`=======================================================`);
    console.log(`🏷️ Theme      : ${options.compilationTheme}`);
    console.log(`🌐 Language   : ${options.lang}`);
    console.log(`📁 Video File : ${videoPath}`);
    console.log(`📌 Title      : ${title}`);
    if (thumbnailPath) console.log(`🖼️ Thumbnail  : ${thumbnailPath}`);
    console.log("-------------------------------------------------------");
    console.log(caption);
    console.log("-------------------------------------------------------\n");

    if (options.dryRun) {
      console.log(`✔ DRY RUN [${options.lang.toUpperCase()}] COMPLETED! Compilation payload and metadata verified.`);
      return;
    }

    const { publicVideoUrl, cleanup } = await uploadVideoToR2(
      videoPath,
      `kompilasi-${options.compilationTheme}`,
      options.lang
    );

    try {
      const fbResult = await uploadToFacebookPage(
        { publicUrl: publicVideoUrl },
        title,
        caption,
        config,
        "landscape",
        thumbnailPath
      );

      console.log(`\n🎉 COMPILATION VIDEO [${options.lang.toUpperCase()}] LIVE ON FACEBOOK WATCH!`);
      console.log(`🔗 Link: ${fbResult.permalink}`);

      // Save compilation publication metadata
      const pubRecordPath = path.join(outDir, "publication-status.json");
      let pubRecord: Record<string, any> = {};
      if (existsSync(pubRecordPath)) {
        try {
          pubRecord = JSON.parse(await fs.readFile(pubRecordPath, "utf-8"));
        } catch {}
      }
      const key = `${options.compilationTheme}-${options.lang}`;
      pubRecord[key] = {
        ...(pubRecord[key] || {}),
        title,
        videoId: fbResult.videoId,
        permalink: fbResult.permalink,
        facebookPublishedAt: new Date().toISOString(),
      };
      await fs.writeFile(pubRecordPath, JSON.stringify(pubRecord, null, 2), "utf-8");
    } finally {
      await cleanup();
    }

    return;
  }

  // Load story manifest
  const storyDir = path.resolve("./stories", options.bookSlug);
  const storyJsonPath = path.join(storyDir, "story.json");
  if (!existsSync(storyJsonPath)) {
    throw new Error(`Story manifest not found at ${storyJsonPath}`);
  }

  const rawStory = await fs.readFile(storyJsonPath, "utf-8");
  const story = JSON.parse(rawStory);

  // Target video path resolution (checks story.json exports map first, then falls back to file conventions)
  const isLandscape = options.format === "landscape";
  const targetExtension = isLandscape ? "16x9.mp4" : "9x16.mp4";
  const formatKey = isLandscape ? "landscape" : "vertical";

  const manifestPathRel =
    story.exports?.[options.lang]?.[formatKey]?.path ||
    story.exports?.[formatKey]?.path;
  let videoPath = manifestPathRel ? path.join(storyDir, manifestPathRel) : "";

  if (!videoPath || !existsSync(videoPath)) {
    videoPath = path.join(
      storyDir,
      "exports",
      options.lang,
      `${options.bookSlug}-${targetExtension}`
    );
  }

  if (!existsSync(videoPath) && options.lang === "id") {
    videoPath = path.join(storyDir, "exports", `${options.bookSlug}-${targetExtension}`);
  }

  if (!existsSync(videoPath)) {
    const langExportDir = path.join(storyDir, "exports", options.lang);
    if (existsSync(langExportDir)) {
      const files = readdirSync(langExportDir);
      const matched = files.find((f) => f.endsWith(targetExtension));
      if (matched) {
        videoPath = path.join(langExportDir, matched);
      }
    }
  }

  if (!existsSync(videoPath)) {
    throw new Error(
      `Video with format ${targetExtension} not found for ${options.bookSlug} under exports/`
    );
  }

  // Thumbnail path resolution (vertical for Reels / landscape for normal videos)
  let thumbnailPath = "";
  if (!isLandscape) {
    const vertThumbRel = story.thumbnails?.[options.lang]?.vertical;
    if (vertThumbRel && existsSync(path.join(storyDir, vertThumbRel))) {
      thumbnailPath = path.join(storyDir, vertThumbRel);
    } else if (existsSync(path.join(storyDir, "exports", options.lang, "thumbnail-vertical.png"))) {
      thumbnailPath = path.join(storyDir, "exports", options.lang, "thumbnail-vertical.png");
    }
  }

  if (!thumbnailPath) {
    const popularThumbRel =
      story.thumbnails?.[options.lang]?.popular ||
      story.thumbnails?.[options.lang]?.primary;
    thumbnailPath = popularThumbRel ? path.join(storyDir, popularThumbRel) : "";
  }

  if (!thumbnailPath || !existsSync(thumbnailPath)) {
    thumbnailPath = path.join(storyDir, "exports", options.lang, "thumbnail.png");
  }
  if (!existsSync(thumbnailPath)) {
    thumbnailPath = path.join(storyDir, "exports", "thumbnail.png");
  }
  if (!existsSync(thumbnailPath)) {
    thumbnailPath = path.join(storyDir, "assets", "cover.png");
  }

  // Generate caption and title
  const caption = buildCaption(story, options.lang, options.format as "vertical" | "landscape");
  const rawTitle = options.lang === "en" ? (story.originalTitle || story.title) : story.title;
  const title = (rawTitle || "Cerita Anak").replace(/\(.*\)/, "").trim();

  console.log("\n📝 GENERATED METADATA:");
  console.log(`📌 Title      : ${title}`);
  console.log(`📁 Video File : ${videoPath}`);
  console.log(`🖼️ Thumbnail  : ${thumbnailPath || "(none)"}`);
  console.log("-------------------------------------------------------");
  console.log(caption);
  console.log("-------------------------------------------------------\n");

  if (options.dryRun) {
    console.log("✔ DRY RUN COMPLETED! Payload, files, and config verified.");
    return;
  }

  if (!story.publications) {
    story.publications = {};
  }

  // --- PRE-UPLOAD DEDUPLICATION & IDEMPOTENCY CHECK ---
  let skipFacebook = false;
  let skipInstagram = false;

  // 1. Check Instagram live status
  if (options.platform === "instagram" || options.platform === "both") {
    const localIg = story.publications?.instagram?.[options.lang];
    const liveIg = await findLiveInstagramMediaByTitle(config.instagramUserId, title, config.pageAccessToken);

    if (liveIg || localIg?.id) {
      const activeUrl = liveIg?.permalink || localIg?.url || "https://www.instagram.com/reel/";
      const activeId = liveIg?.id || localIg?.id;
      if (!options.force) {
        console.log(`\n🛑 DUPLICATE DETECTED: "${title}" is ALREADY LIVE on Instagram!`);
        console.log(`   🔗 Live URL    : ${activeUrl}`);
        console.log(`   🆔 Media ID    : ${activeId}`);
        console.log(`   🛡️ Safe Skip   : Skipping Instagram upload to prevent duplicate Reels.`);
        console.log(`      (Pass --force to publish a new post despite existing Reel)`);
        skipInstagram = true;
      } else {
        console.warn(`\n⚠️ FORCE OVERRIDE: Proceeding with fresh Instagram Reel upload despite existing post.`);
        console.warn(`   Note: Meta Graph API does not support remote media deletion.`);
        console.warn(`   Please delete the old Reel (${activeUrl}) manually in Instagram app if needed.`);
      }
    }
  }

  // 2. Check Facebook live status
  if (options.platform === "facebook" || options.platform === "both") {
    const localFb = story.publications?.facebook?.[options.lang]?.[options.format];
    const liveFb = await findLiveFacebookVideoByTitle(
      config.facebookPageId,
      title,
      options.format as "vertical" | "landscape",
      config.pageAccessToken
    );

    if (liveFb || localFb?.id) {
      const activeUrl = liveFb?.permalink || localFb?.url || "https://www.facebook.com/";
      const activeId = liveFb?.id || localFb?.id;
      if (!options.force) {
        console.log(`\n🛑 DUPLICATE DETECTED: "${title}" is ALREADY LIVE on Facebook (${options.format})!`);
        console.log(`   🔗 Live URL    : ${activeUrl}`);
        console.log(`   🆔 Video ID    : ${activeId}`);
        console.log(`   🛡️ Safe Skip   : Skipping Facebook upload to prevent duplicate video.`);
        console.log(`      (Pass --force to re-upload)`);
        skipFacebook = true;
      } else {
        console.warn(`\n⚠️ FORCE OVERRIDE: Proceeding with fresh Facebook upload.`);
      }
    }
  }

  if (options.platform === "instagram" && skipInstagram) {
    console.log("\n✔ Instagram upload skipped safely. Zero duplicates created! Exiting.\n");
    return;
  }
  if (options.platform === "facebook" && skipFacebook) {
    console.log("\n✔ Facebook upload skipped safely. Zero duplicates created! Exiting.\n");
    return;
  }
  if (options.platform === "both" && skipInstagram && skipFacebook) {
    console.log("\n✔ Video already published on both Facebook and Instagram. Zero duplicates allowed. Exiting cleanly.\n");
    return;
  }

  // --- UNIFIED CLOUDFLARE R2 FAN-OUT (FOR BOTH PLATFORMS) ---
  if (options.platform === "both") {
    console.log(`\n======================================================`);
    console.log(`🚀 UNIFIED R2 FAN-OUT: UPLOADING ONCE FOR BOTH FB & IG`);
    console.log(`======================================================`);
    const { publicVideoUrl, cleanup } = await uploadVideoToR2(videoPath, options.bookSlug, options.lang);

    let fbError: Error | null = null;
    let igError: Error | null = null;

    try {
      // 1. Facebook Page Video / Reel Ingestion via R2 URL
      if (!skipFacebook) {
        try {
          const fbResult = await uploadToFacebookPage(
            { publicUrl: publicVideoUrl },
            title,
            caption,
            config,
            options.format as "vertical" | "landscape",
            thumbnailPath
          );

          if (!story.publications.facebook) story.publications.facebook = {};
          if (!story.publications.facebook[options.lang]) story.publications.facebook[options.lang] = {};

          story.publications.facebook[options.lang][options.format] = {
            id: fbResult.videoId,
            url: fbResult.permalink,
            publishedAt: new Date().toISOString(),
            title: story.title,
            status: "published",
          };
        } catch (err: any) {
          fbError = err;
          console.error("\n❌ Facebook Upload Failed:", err.message);
        }
      } else {
        const existingFbUrl = story.publications?.facebook?.[options.lang]?.[options.format]?.url || "Facebook";
        console.log(`\n⏩ Skipping Facebook upload (already live: ${existingFbUrl})`);
      }

      // 2. Instagram Reels Ingestion via same R2 URL
      if (!skipInstagram) {
        try {
          const igResult = await uploadToInstagramReels(
            { publicUrl: publicVideoUrl },
            caption,
            config,
            options.shareToFeed,
            options.bookSlug,
            options.lang,
            thumbnailPath
          );

          if (!story.publications.instagram) story.publications.instagram = {};
          story.publications.instagram[options.lang] = {
            id: igResult.mediaId,
            url: igResult.permalink,
            publishedAt: new Date().toISOString(),
            title: story.title,
            status: "published",
          };
        } catch (err: any) {
          igError = err;
          console.error("\n❌ Instagram Reels Upload Failed:", err.message);
        }
      } else {
        const existingIgUrl = story.publications?.instagram?.[options.lang]?.url || "Instagram";
        console.log(`\n⏩ Skipping Instagram upload (already live: ${existingIgUrl})`);
      }
    } finally {
      // Always cleanup R2 buffer object immediately after both finish
      await cleanup();
    }

    if (fbError || igError) {
      await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2) + "\n", "utf-8");
      throw new Error(
        `Upload incomplete for platform 'both'. Facebook: ${fbError ? fbError.message : "OK"}, Instagram: ${
          igError ? igError.message : "OK"
        }`
      );
    }
  } else if (options.platform === "facebook") {
    // Standalone Facebook upload
    const fbResult = await uploadToFacebookPage(
      { localPath: videoPath },
      title,
      caption,
      config,
      options.format as "vertical" | "landscape",
      thumbnailPath
    );

    if (!story.publications.facebook) story.publications.facebook = {};
    if (!story.publications.facebook[options.lang]) story.publications.facebook[options.lang] = {};

    story.publications.facebook[options.lang][options.format] = {
      id: fbResult.videoId,
      url: fbResult.permalink,
      publishedAt: new Date().toISOString(),
      title: story.title,
      status: "published",
    };
  } else if (options.platform === "instagram") {
    // Standalone Instagram upload
    const igResult = await uploadToInstagramReels(
      { localPath: videoPath },
      caption,
      config,
      options.shareToFeed,
      options.bookSlug,
      options.lang,
      thumbnailPath
    );

    if (!story.publications.instagram) story.publications.instagram = {};
    story.publications.instagram[options.lang] = {
      id: igResult.mediaId,
      url: igResult.permalink,
      publishedAt: new Date().toISOString(),
      title: story.title,
      status: "published",
    };
  }

  // Save publications update to story.json
  await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2) + "\n", "utf-8");
  console.log(`\n💾 Saved publication metadata to ${storyJsonPath}`);

  console.log("\n✨ ALL COMPLETED SUCCESSFULLY! ✨\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal error in Meta Uploader:", err);
  process.exit(1);
});
