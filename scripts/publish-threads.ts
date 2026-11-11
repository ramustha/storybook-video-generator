import fs from "fs/promises";
import { createReadStream, existsSync, readdirSync } from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./lib/db";

const META_CONFIG_PATH = path.resolve("./config/meta-config.json");
const R2_CONFIG_PATH = path.resolve("./config/r2-config.json");

export interface ThreadsConfig {
  threadsUserId?: string;
  threadsUsername?: string;
  threadsAccessToken?: string;
  appId?: string;
}

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

export interface StoryManifest {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  thumbnailConfig?: {
    id?: { hook?: string };
    en?: { hook?: string };
  };
  scenes?: Array<{
    type?: string;
    audio?: {
      text?: string;
      en?: { text?: string };
    };
  }>;
  publications?: {
    youtube?: {
      id?: { landscape?: { url?: string; id?: string } };
      en?: { landscape?: { url?: string; id?: string } };
    };
    threads?: {
      id?: {
        id: string;
        url: string;
        publishedAt: string;
        title?: string;
        type: string;
        status: string;
      };
      en?: {
        id: string;
        url: string;
        publishedAt: string;
        title?: string;
        type: string;
        status: string;
      };
    };
  };
}

export async function loadThreadsConfig(): Promise<ThreadsConfig> {
  let fileConfig: any = {};
  if (existsSync(META_CONFIG_PATH)) {
    try {
      const raw = await fs.readFile(META_CONFIG_PATH, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  return {
    threadsUserId: process.env.THREADS_USER_ID || fileConfig.threadsUserId,
    threadsUsername: process.env.THREADS_USERNAME || fileConfig.threadsUsername || fileConfig.instagramUsername,
    threadsAccessToken: process.env.THREADS_ACCESS_TOKEN || fileConfig.threadsAccessToken,
    appId: process.env.THREADS_APP_ID || fileConfig.appId,
  };
}

async function loadR2Config(): Promise<R2Config> {
  const raw = await fs.readFile(R2_CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

/**
 * Upload temporary image to Cloudflare R2 for Threads API consumption
 */
async function uploadImageToR2(
  imagePath: string,
  keyPrefix: string = "threads-posts"
): Promise<{ publicUrl: string; cleanup: () => Promise<void> }> {
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

  const ext = path.extname(imagePath).toLowerCase() === ".jpg" ? "jpg" : "png";
  const contentType = ext === "jpg" ? "image/jpeg" : "image/png";
  const key = `${keyPrefix}/threads-img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: createReadStream(imagePath),
      ContentType: contentType,
      ContentLength: stats.size,
    })
  );

  const publicUrl = `${r2.publicDomain.replace(/\/$/, "")}/${key}`;

  const cleanup = async () => {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );
    } catch {
      // best-effort cleanup
    }
  };

  return { publicUrl, cleanup };
}

/**
 * Upload temporary video to Cloudflare R2 for Threads API consumption
 */
async function uploadVideoToR2(
  videoPath: string,
  keyPrefix: string = "threads-videos"
): Promise<{ publicUrl: string; cleanup: () => Promise<void> }> {
  const r2 = await loadR2Config();
  const stats = await fs.stat(videoPath);

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });

  const key = `${keyPrefix}/threads-vid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: createReadStream(videoPath),
      ContentType: "video/mp4",
      ContentLength: stats.size,
    })
  );

  const publicUrl = `${r2.publicDomain.replace(/\/$/, "")}/${key}`;

  const cleanup = async () => {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );
    } catch {
      // best-effort cleanup
    }
  };

  return { publicUrl, cleanup };
}

/**
 * Verify Threads API Token and retrieve profile info
 */
export async function verifyThreadsProfile(accessToken: string): Promise<any> {
  const url = `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Threads API Error: ${data.error.message} (Code: ${data.error.code})`);
  }
  return data;
}

/**
 * Create Threads media container (Step 1)
 */
export async function createThreadsContainer(
  userId: string,
  accessToken: string,
  payload: {
    mediaType: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkAttachment?: string;
    isMadeWithAi?: boolean;
    isCarouselItem?: boolean;
    children?: string[];
  }
): Promise<string> {
  const url = `https://graph.threads.net/v1.0/${userId}/threads`;
  const params = new URLSearchParams();
  params.append("access_token", accessToken);
  params.append("media_type", payload.mediaType);

  if (payload.text) {
    // Hard limit: 500 characters
    params.append("text", payload.text.slice(0, 500));
  }
  if (payload.imageUrl) {
    params.append("image_url", payload.imageUrl);
  }
  if (payload.videoUrl) {
    params.append("video_url", payload.videoUrl);
  }
  if (payload.linkAttachment) {
    params.append("link_attachment", payload.linkAttachment);
  }
  if (payload.isMadeWithAi) {
    params.append("is_made_with_ai", "true");
  }
  if (payload.isCarouselItem) {
    params.append("is_carousel_item", "true");
  }
  if (payload.children && payload.children.length > 0) {
    params.append("children", payload.children.join(","));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Threads Container Creation Failed: ${data.error.message} (Code: ${data.error.code}, Subcode: ${data.error.error_subcode || "N/A"})`);
  }
  return data.id;
}

/**
 * Poll Threads media container status until FINISHED (Step 1.5)
 */
export async function waitForThreadsContainer(
  containerId: string,
  accessToken: string,
  timeoutMs: number = 180000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < timeoutMs) {
    const url = `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      throw new Error(`Threads Status Check Error: ${data.error.message}`);
    }

    const status = data.status;
    if (status === "FINISHED") {
      return;
    }

    if (status === "ERROR") {
      throw new Error(`Threads Container Processing Error: ${data.error_message || "Unknown error"}`);
    }

    if (status === "EXPIRED") {
      throw new Error(`Threads Container Expired before publishing.`);
    }

    console.log(`   ⏳ Container processing status: ${status}... waiting 5s`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Threads container processing timed out after ${timeoutMs / 1000}s`);
}

/**
 * Publish Threads container (Step 2)
 */
export async function publishThreadsContainer(
  userId: string,
  containerId: string,
  accessToken: string
): Promise<string> {
  const url = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
  const params = new URLSearchParams();
  params.append("creation_id", containerId);
  params.append("access_token", accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Threads Publish Failed: ${data.error.message} (Code: ${data.error.code})`);
  }
  return data.id;
}

/**
 * Retrieve published Threads post permalink
 */
export async function getThreadsPostDetails(
  postId: string,
  accessToken: string
): Promise<{ id: string; permalink: string; timestamp?: string }> {
  const url = `https://graph.threads.net/v1.0/${postId}?fields=id,permalink,timestamp,text&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    return { id: postId, permalink: `https://www.threads.net/post/${postId}` };
  }
  return {
    id: data.id,
    permalink: data.permalink || `https://www.threads.net/post/${postId}`,
    timestamp: data.timestamp,
  };
}

/**
 * Generate Threads caption complying with the 500-character limit
 */
export function generateThreadsCaption(
  manifest: StoryManifest,
  lang: "id" | "en",
  youtubeUrl?: string
): string {
  const isId = lang === "id";
  const title = isId ? manifest.title : manifest.originalTitle || manifest.title;
  const hook =
    (isId ? manifest.thumbnailConfig?.id?.hook : manifest.thumbnailConfig?.en?.hook) ||
    (isId ? "Dongeng seru dan penuh pesan kebaikan untuk si kecil!" : "A delightful and meaningful storybook for kids!");

  const moralScene = manifest.scenes?.find((s) => s.type === "moral");
  let rawMoral = isId
    ? moralScene?.audio?.text || "Kisah budi pekerti hangat sebelum tidur."
    : moralScene?.audio?.en?.text || "A gentle tale with a warm bedtime lesson.";

  // Keep moral concise to leave room for CTA and hashtags
  if (rawMoral.length > 130) {
    rawMoral = rawMoral.slice(0, 127).trim() + "...";
  }

  const link = youtubeUrl || "https://youtube.com/@Zayn.Storybook";

  const caption = isId
    ? `HOREEE! 🎈 Cerita baru "${title}" sudah tayang! 📖✨\n\n"${hook}"\n\n💡 Pesan Cerita:\n"${rawMoral}"\n\n🎬 Tonton selengkapnya di kanal YouTube @Zayn.Storybook:\n${link}\n\n#ZaynStorybook #DongengAnak #CeritaAnakBergambar #KidsBedtimeStories`
    : `YAY! 🎈 New storybook "${title}" is now live! 📖✨\n\n"${hook}"\n\n💡 Moral of the story:\n"${rawMoral}"\n\n🎬 Watch full animated story on YouTube @Zayn.Storybook:\n${link}\n\n#ZaynStorybook #KidsBedtimeStories #ReadAloud #ChildrenBooks`;

  if (caption.length <= 500) {
    return caption;
  }

  // Fallback safety truncation
  const sliced = caption.slice(0, 500);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 450 ? sliced.slice(0, lastSpace) : sliced).trim();
}

/**
 * Helper to locate the best available video for a story
 */
export function findStoryVideo(storyDir: string, lang: string, bookSlug: string): string | null {
  const searchDirs = [
    path.join(storyDir, "exports", lang),
    path.join(storyDir, "exports"),
  ];

  for (const d of searchDirs) {
    if (!existsSync(d)) continue;
    try {
      const files = readdirSync(d);
      // Prioritize vertical 9:16 video
      const vert = files.find(
        (f) =>
          f.endsWith(".mp4") &&
          (f.includes("-9x16") || f.includes("9x16") || f.includes("vertical")) &&
          !f.includes("compilation")
      );
      if (vert) return path.join(d, vert);

      // Next look for landscape 16:9 or any mp4
      const land = files.find(
        (f) =>
          f.endsWith(".mp4") &&
          (f.includes("-16x9") || f.includes("16x9") || f.includes("landscape")) &&
          !f.includes("compilation")
      );
      if (land) return path.join(d, land);

      const anyMp4 = files.find((f) => f.endsWith(".mp4") && !f.includes("compilation"));
      if (anyMp4) return path.join(d, anyMp4);
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Publish the official channel introduction post to Threads
 */
export async function publishIntroductionPost(options: { dryRun?: boolean }): Promise<{
  success: boolean;
  url?: string;
}> {
  const config = await loadThreadsConfig();
  console.log(`\n======================================================`);
  console.log(`🎉 PUBLISHING INAUGURAL INTRODUCTION POST TO THREADS`);
  console.log(`======================================================`);

  if (!config.threadsAccessToken || !config.threadsUserId) {
    throw new Error("Threads credentials not configured.");
  }

  const introText = `Halo Ayah, Bunda & Adik-adik tersayang! 👋✨

Selamat datang di Rumah Dongeng Zayn Storybook di Threads! 📖🎈

Kami hadir menyajikan animasi buku cerita bergambar dwibahasa (Indonesia & Inggris) yang:
💖 Lucu, hangat, dan sarat pesan budi pekerti
🌿 Suara tenang & tanpa bising (ramah untuk anak)
🌙 Musik marimba pengantar tidur nyenyak

Yuk ikuti petualangan seru kami di YouTube & Instagram @zayn.storybook! 🎬🧸

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #BukuAnak #KidsBedtimeStories`;

  console.log(`\n📝 Introduction Caption preview (${introText.length}/500 chars):`);
  console.log(`------------------------------------------------------`);
  console.log(introText);
  console.log(`------------------------------------------------------`);

  if (options.dryRun) {
    console.log(`\n🧪 [DRY RUN] Skipping actual API calls.`);
    return { success: true, url: "https://www.threads.net/@zayn.storybook/post/DRY_RUN_INTRO" };
  }

  const brandingDir = path.resolve("./stories/branding");
  const candidates = [
    path.join(brandingDir, "pfp-master-1080x1080.png"),
    path.join(brandingDir, "pfp-instagram-1080x1080.png"),
    path.join(brandingDir, "cover-facebook-1640x924.png"),
  ];
  const targetImage = candidates.find((p) => existsSync(p));

  let cleanupFn: (() => Promise<void>) | null = null;
  let containerId: string | null = null;

  try {
    if (targetImage) {
      console.log(`📸 Uploading intro visual: ${path.basename(targetImage)}...`);
      const { publicUrl, cleanup } = await uploadImageToR2(targetImage, "threads-intro");
      cleanupFn = cleanup;

      console.log(`📦 Creating IMAGE Threads container...`);
      containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "IMAGE",
        text: introText,
        imageUrl: publicUrl,
        isMadeWithAi: false,
      });
    } else {
      console.log(`📦 Creating TEXT Threads container...`);
      containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "TEXT",
        text: introText,
        linkAttachment: "https://youtube.com/@Zayn.Storybook",
      });
    }

    console.log(`✔ Container created! ID: ${containerId}`);
    console.log(`⏳ Waiting for container processing...`);
    await waitForThreadsContainer(containerId, config.threadsAccessToken);

    console.log(`🚀 Publishing introduction post to Threads...`);
    const postId = await publishThreadsContainer(config.threadsUserId, containerId, config.threadsAccessToken);

    console.log(`🎉 Published successfully! Post ID: ${postId}`);
    const postDetails = await getThreadsPostDetails(postId, config.threadsAccessToken);
    console.log(`🌐 Permalink: ${postDetails.permalink}\n`);

    return { success: true, url: postDetails.permalink };
  } finally {
    if (cleanupFn) {
      await cleanupFn();
    }
  }
}

/**
 * Publishes a single image post to Meta Threads (e.g. for teaser announcements).
 */
export async function publishThreadsPhotoPost(options: {
  imagePath: string;
  text: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  postId?: string;
  permalink?: string;
  dryRun?: boolean;
}> {
  const config = await loadThreadsConfig();
  if (!config.threadsAccessToken || !config.threadsUserId) {
    throw new Error("Threads credentials not configured (missing threadsUserId or threadsAccessToken).");
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Threads Announcement Caption:\n", options.text);
    return { success: true, dryRun: true };
  }

  const { publicUrl, cleanup } = await uploadImageToR2(options.imagePath, "threads-announcements");
  try {
    const containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
      mediaType: "IMAGE",
      text: options.text,
      imageUrl: publicUrl,
      isMadeWithAi: true,
    });
    await waitForThreadsContainer(containerId, config.threadsAccessToken);
    const postId = await publishThreadsContainer(config.threadsUserId, containerId, config.threadsAccessToken);
    const postDetails = await getThreadsPostDetails(postId, config.threadsAccessToken);
    return { success: true, postId, permalink: postDetails.permalink };
  } finally {
    await cleanup();
  }
}

/**
 * Publishes a multi-image carousel post to Meta Threads (e.g. for bilingual daily lineup announcements).
 */
export async function publishThreadsCarousel(options: {
  imagePaths: string[];
  text: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  postId?: string;
  permalink?: string;
  dryRun?: boolean;
}> {
  const config = await loadThreadsConfig();
  if (!config.threadsAccessToken || !config.threadsUserId) {
    throw new Error("Threads credentials not configured (missing threadsUserId or threadsAccessToken).");
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Threads Carousel Caption:\n", options.text);
    console.log(`[DRY RUN] Attached Images (${options.imagePaths.length}):`, options.imagePaths);
    return { success: true, dryRun: true };
  }

  if (!options.imagePaths || options.imagePaths.length <= 1) {
    return publishThreadsPhotoPost({
      imagePath: options.imagePaths?.[0] || "",
      text: options.text,
      dryRun: options.dryRun,
    });
  }

  const cleanups: Array<() => Promise<void>> = [];
  const itemIds: string[] = [];

  try {
    for (let i = 0; i < options.imagePaths.length; i++) {
      const imgPath = options.imagePaths[i];
      console.log(`📸 Uploading Threads slide ${i + 1}/${options.imagePaths.length}: ${path.basename(imgPath)}...`);
      const { publicUrl, cleanup } = await uploadImageToR2(imgPath, "threads-carousel");
      cleanups.push(cleanup);

      const itemId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "IMAGE",
        imageUrl: publicUrl,
        isCarouselItem: true,
        isMadeWithAi: true,
      });
      console.log(`   ✔ Threads Carousel Item ${i + 1} ID: ${itemId}`);
      itemIds.push(itemId);
    }

    // Wait for all item containers to process
    for (const itemId of itemIds) {
      await waitForThreadsContainer(itemId, config.threadsAccessToken);
    }

    // Create CAROUSEL container
    console.log(`📦 Creating Threads CAROUSEL parent container with ${itemIds.length} items...`);
    const containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
      mediaType: "CAROUSEL",
      text: options.text,
      children: itemIds,
    });

    await waitForThreadsContainer(containerId, config.threadsAccessToken);

    const postId = await publishThreadsContainer(config.threadsUserId, containerId, config.threadsAccessToken);
    const postDetails = await getThreadsPostDetails(postId, config.threadsAccessToken);
    console.log(`🎉 SUCCESS! THREADS CAROUSEL IS LIVE: ${postDetails.permalink}`);
    return { success: true, postId, permalink: postDetails.permalink };
  } finally {
    for (const c of cleanups) {
      try {
        await c();
      } catch {}
    }
  }
}

/**
 * Main execution routine for publishing to Threads
 */
export async function publishStoryToThreads(options: {
  bookSlug: string;
  lang?: "id" | "en";
  mode?: "image" | "video" | "text";
  dryRun?: boolean;
  force?: boolean;
}): Promise<{ success: boolean; url?: string; skipped?: boolean; reason?: string }> {
  const lang = options.lang || "id";
  const mode = options.mode || "image";
  const config = await loadThreadsConfig();

  console.log(`\n======================================================`);
  console.log(`🧵 META THREADS PUBLISHER: "${options.bookSlug}" [${lang.toUpperCase()}]`);
  console.log(`======================================================`);

  if (!config.threadsAccessToken || !config.threadsUserId) {
    const reason =
      "Threads credentials not configured (missing threadsUserId or threadsAccessToken in config/meta-config.json or environment variables).";
    console.log(`ℹ️ ${reason}`);
    console.log(`👉 Please refer to the setup guide in the artifacts to obtain a Threads User Access Token.`);
    return { success: false, skipped: true, reason };
  }

  const storyDir = path.resolve("./stories", options.bookSlug);
  const storyJsonPath = path.join(storyDir, "story.json");
  if (!existsSync(storyJsonPath)) {
    console.log(`📥 Story manifest not found locally for "${options.bookSlug}". Pulling from Cloudflare R2...`);
    try {
      const { spawnSync } = await import("child_process");
      spawnSync("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", options.bookSlug], { stdio: "inherit" });
    } catch {
      // Ignore if R2 pull fails, will error below
    }
  }

  if (!existsSync(storyJsonPath)) {
    throw new Error(`Manifest not found at ${storyJsonPath}`);
  }

  const manifest: StoryManifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  const existingPub = manifest.publications?.threads?.[lang];
  if (!options.force && existingPub?.id) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Already published to Threads at ${existingPub.url} (ID: ${existingPub.id})`);
    console.log(`   💡 Tip: Pass --force to republish.`);
    return { success: true, url: existingPub.url, skipped: true, reason: "Already published" };
  }
  const ytUrl =
    (lang === "id"
      ? manifest.publications?.youtube?.id?.landscape?.url
      : manifest.publications?.youtube?.en?.landscape?.url) || "https://youtube.com/@Zayn.Storybook";

  const caption = generateThreadsCaption(manifest, lang, ytUrl);
  console.log(`\n📝 Caption preview (${caption.length}/500 chars):`);
  console.log(`------------------------------------------------------`);
  console.log(caption);
  console.log(`------------------------------------------------------`);

  if (options.dryRun) {
    console.log(`\n🧪 [DRY RUN] Skipping actual API calls.`);
    return { success: true, url: "https://www.threads.net/@zayn.storybook/post/DRY_RUN" };
  }

  let cleanupFn: (() => Promise<void>) | null = null;
  let containerId: string | null = null;

  try {
    if (mode === "image") {
      // Look for 4:5 portrait cover first, then 16:9 popular cover
      const portraitPath = path.join(storyDir, "exports", lang, "thumbnail-portrait.png");
      const popularPath = path.join(storyDir, "exports", lang, "thumbnail-popular.png");
      const targetImage = existsSync(portraitPath) ? portraitPath : popularPath;

      if (!existsSync(targetImage)) {
        throw new Error(`No thumbnail found for Threads publish at ${targetImage}`);
      }

      console.log(`📸 Uploading image to R2: ${path.basename(targetImage)}...`);
      const { publicUrl, cleanup } = await uploadImageToR2(targetImage);
      cleanupFn = cleanup;

      console.log(`📦 Creating IMAGE Threads container...`);
      containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "IMAGE",
        text: caption,
        imageUrl: publicUrl,
        isMadeWithAi: true,
      });
    } else if (mode === "video") {
      let targetVideo = findStoryVideo(storyDir, lang, options.bookSlug);

      if (!targetVideo && !options.dryRun) {
        console.log(`⚙️ Video not found on disk. Rendering 9:16 vertical video for "${options.bookSlug}"...`);
        try {
          const { spawnSync } = await import("child_process");
          spawnSync("npx", ["tsx", "scripts/render-book.ts", "--book", options.bookSlug, "--lang", lang, "--format", "vertical"], { stdio: "inherit" });
          targetVideo = findStoryVideo(storyDir, lang, options.bookSlug);
        } catch (err: any) {
          console.warn("⚠️ Warning rendering vertical video:", err.message);
        }
      }

      if (!targetVideo) {
        console.log(`⏩ No MP4 video rendered for "${options.bookSlug}". Skipping video publish.`);
        return { success: false, skipped: true, reason: "No video found" };
      }

      console.log(`🎬 Found story video: ${path.basename(targetVideo)}`);
      console.log(`☁️ Uploading video to R2 for Threads...`);
      const { publicUrl, cleanup } = await uploadVideoToR2(targetVideo);
      cleanupFn = cleanup;

      console.log(`📦 Creating VIDEO Threads container...`);
      containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "VIDEO",
        text: caption,
        videoUrl: publicUrl,
        isMadeWithAi: true,
      });
    } else {
      // TEXT mode
      console.log(`📦 Creating TEXT Threads container with link attachment...`);
      containerId = await createThreadsContainer(config.threadsUserId, config.threadsAccessToken, {
        mediaType: "TEXT",
        text: caption,
        linkAttachment: ytUrl,
      });
    }

    console.log(`✔ Container created! ID: ${containerId}`);
    console.log(`⏳ Waiting for Threads media container processing...`);
    await waitForThreadsContainer(containerId, config.threadsAccessToken);

    console.log(`🚀 Publishing Threads container...`);
    const postId = await publishThreadsContainer(config.threadsUserId, containerId, config.threadsAccessToken);

    console.log(`✔ Published successfully! Post ID: ${postId}`);
    const postDetails = await getThreadsPostDetails(postId, config.threadsAccessToken);
    console.log(`🌐 Permalink: ${postDetails.permalink}`);

    // Update manifest publications
    if (!manifest.publications) manifest.publications = {};
    if (!manifest.publications.threads) manifest.publications.threads = {};
    const storyTitle = lang === "en" ? (manifest.originalTitle || manifest.title) : manifest.title;
    manifest.publications.threads[lang] = {
      id: postId,
      url: postDetails.permalink,
      publishedAt: new Date().toISOString(),
      title: storyTitle,
      type: mode,
      status: "published",
    };

    await fs.writeFile(storyJsonPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`💾 Saved Threads publication record to story.json`);

    // Sync to Cloudflare D1 database (Single Source of Truth)
    try {
      await db.saveStory(manifest);
      console.log(`☁️ Synchronized Threads publication to Cloudflare D1 database.`);
    } catch (d1Err: any) {
      console.warn(`⚠️ Cloudflare D1 sync warning: ${d1Err.message}`);
    }

    // Sync updated manifest back to Cloudflare R2
    if (!options.dryRun) {
      try {
        const { spawnSync } = await import("child_process");
        spawnSync("npx", ["tsx", "scripts/manage-story-storage.ts", "push", options.bookSlug, "--manifest-only"], { stdio: "inherit" });
      } catch {
        // Ignore R2 push error
      }
    }

    return { success: true, url: postDetails.permalink };
  } finally {
    if (cleanupFn) {
      await cleanupFn();
    }
  }
}

/**
 * CLI Entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isVerify = args.includes("--verify-token") || args.includes("--verify");
  const isIntro = args.includes("--intro");
  const isAllBooks = args.includes("--all-books") || args.includes("--all");
  const isDryRun = args.includes("--dry-run");
  const isForce = args.includes("--force");
  const requestedBook = getArg("--book") || "terlalu-banyak-suara";
  const langArg = (getArg("--lang") || "id") as "id" | "en" | "all";
  const modeArg = (getArg("--mode") || "image") as "image" | "video" | "text";

  if (isVerify) {
    const config = await loadThreadsConfig();
    console.log(`\n======================================================`);
    console.log(`🔍 THREADS API CONNECTION VERIFICATION`);
    console.log(`======================================================`);
    console.log(`User ID   : ${config.threadsUserId || "(not set)"}`);
    console.log(`Username  : ${config.threadsUsername || "(not set)"}`);
    console.log(`Token     : ${config.threadsAccessToken ? config.threadsAccessToken.substring(0, 12) + "..." : "(not set)"}`);

    if (!config.threadsAccessToken) {
      console.log(`❌ No Threads Access Token configured.`);
      process.exit(1);
    }

    try {
      const profile = await verifyThreadsProfile(config.threadsAccessToken);
      console.log(`✔ Successfully connected to Threads API!`);
      console.log(`  Name / ID  : ${profile.username} (${profile.id})`);
      console.log(`  Biography  : ${profile.threads_biography || "(empty)"}`);
      process.exit(0);
    } catch (err: any) {
      console.error(`❌ Connection failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Handle Introduction Post
  if (isIntro) {
    await publishIntroductionPost({ dryRun: isDryRun });
    return;
  }

  const storiesDir = path.resolve("./stories");
  const booksToProcess: string[] = [];

  if (isAllBooks) {
    // If stories directory has fewer than 2 books, pull all from R2
    const currentStories = existsSync(storiesDir) ? await fs.readdir(storiesDir) : [];
    if (currentStories.filter((s) => s !== "branding" && !s.startsWith(".")).length < 2) {
      console.log(`📥 Pulling all stories from Cloudflare R2...`);
      try {
        const { spawnSync } = await import("child_process");
        spawnSync("npx", ["tsx", "scripts/manage-story-storage.ts", "pull-all"], { stdio: "inherit" });
      } catch {
        // ignore
      }
    }

    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && ent.name !== "branding" && ent.name !== "test-no-image") {
        const manifestPath = path.join(storiesDir, ent.name, "story.json");
        if (existsSync(manifestPath)) {
          booksToProcess.push(ent.name);
        }
      }
    }
  } else {
    booksToProcess.push(requestedBook);
  }

  const langsToRun: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg];

  for (let bIdx = 0; bIdx < booksToProcess.length; bIdx++) {
    const b = booksToProcess[bIdx];
    for (const l of langsToRun) {
      await publishStoryToThreads({
        bookSlug: b,
        lang: l,
        mode: modeArg,
        dryRun: isDryRun,
        force: isForce,
      });

      // Stagger slightly between posts to be gentle on API rate limit
      if (!isDryRun && (booksToProcess.length > 1 || langsToRun.length > 1)) {
        console.log(`\n⏳ Cooling down 6 seconds before next publish...`);
        await new Promise((r) => setTimeout(r, 6000));
      }
    }
  }
}

if (process.argv[1] && process.argv[1].includes("publish-threads")) {
  main().catch((err) => {
    console.error("❌ Fatal Threads publisher error:", err);
    process.exit(1);
  });
}
