import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
        type: string;
        status: string;
      };
      en?: {
        id: string;
        url: string;
        publishedAt: string;
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
    mediaType: "TEXT" | "IMAGE" | "VIDEO";
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkAttachment?: string;
    isMadeWithAi?: boolean;
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

  const link = youtubeUrl || "https://youtube.com/@ZaynStorybook";

  const caption = isId
    ? `HOREEE! 🎈 Cerita baru "${title}" sudah tayang! 📖✨\n\n"${hook}"\n\n💡 Pesan Cerita:\n"${rawMoral}"\n\n🎬 Tonton selengkapnya di YouTube:\n${link}\n\n#ZaynStorybook #DongengAnak #CeritaAnakBergambar #KidsBedtimeStories`
    : `YAY! 🎈 New storybook "${title}" is now live! 📖✨\n\n"${hook}"\n\n💡 Moral of the story:\n"${rawMoral}"\n\n🎬 Watch full animated story on YouTube:\n${link}\n\n#ZaynStorybook #KidsBedtimeStories #ReadAloud #ChildrenBooks`;

  if (caption.length <= 500) {
    return caption;
  }

  // Fallback safety truncation
  const sliced = caption.slice(0, 500);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 450 ? sliced.slice(0, lastSpace) : sliced).trim();
}

/**
 * Main execution routine for publishing to Threads
 */
export async function publishStoryToThreads(options: {
  bookSlug: string;
  lang?: "id" | "en";
  mode?: "image" | "video" | "text";
  dryRun?: boolean;
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
    throw new Error(`Manifest not found at ${storyJsonPath}`);
  }

  const manifest: StoryManifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  const ytUrl =
    (lang === "id"
      ? manifest.publications?.youtube?.id?.landscape?.url
      : manifest.publications?.youtube?.en?.landscape?.url) || "https://youtube.com/@ZaynStorybook";

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
      // Look for vertical shorts/reels MP4 first, then story MP4
      const shortVideoPath = path.join(storyDir, "exports", lang, "short-vertical.mp4");
      const storyVideoPath = path.join(storyDir, "exports", lang, "story.mp4");
      const targetVideo = existsSync(shortVideoPath) ? shortVideoPath : storyVideoPath;

      if (!existsSync(targetVideo)) {
        throw new Error(`No video found for Threads publish at ${targetVideo}`);
      }

      console.log(`🎬 Uploading video to R2: ${path.basename(targetVideo)}...`);
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
    manifest.publications.threads[lang] = {
      id: postId,
      url: postDetails.permalink,
      publishedAt: new Date().toISOString(),
      type: mode,
      status: "published",
    };

    await fs.writeFile(storyJsonPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`💾 Saved Threads publication record to story.json`);

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
  const isDryRun = args.includes("--dry-run");
  const bookSlug = getArg("--book") || "terlalu-banyak-suara";
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

  const langsToRun: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg];
  for (const l of langsToRun) {
    await publishStoryToThreads({
      bookSlug,
      lang: l,
      mode: modeArg,
      dryRun: isDryRun,
    });
  }
}

if (process.argv[1] && process.argv[1].includes("publish-threads")) {
  main().catch((err) => {
    console.error("❌ Fatal Threads publisher error:", err);
    process.exit(1);
  });
}
