import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { generateBilingualSocialKit } from "./generate-social-promo.js";
import { buildSocialEngagementCta } from "./lib/seo-formatter";

const META_CONFIG_PATH = path.resolve("./config/meta-config.json");
const R2_CONFIG_PATH = path.resolve("./config/r2-config.json");

interface MetaConfig {
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  pageAccessToken: string;
}

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

async function loadMetaConfig(): Promise<MetaConfig> {
  const raw = await fs.readFile(META_CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loadR2Config(): Promise<R2Config> {
  const raw = await fs.readFile(R2_CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function uploadImageToR2(
  imagePath: string,
  keyPrefix: string = "ig-posts"
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
  const key = `${keyPrefix}/img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

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
    } catch (err: any) {
      console.warn("   ⚠️ R2 image cleanup warning:", err.message);
    }
  };

  return { publicUrl, cleanup };
}

async function pollInstagramContainer(containerId: string, accessToken: string): Promise<void> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const data = await res.json();
    if (data.status_code === "FINISHED") {
      return;
    }
    if (data.status_code === "ERROR") {
      throw new Error(`Container processing failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for Instagram container ${containerId}`);
}

export function isRetryableInstagramPublishError(error: any): boolean {
  if (!error || typeof error !== "object") return false;
  return (
    error.code === 9007 ||
    error.error_subcode === 2207027 ||
    error.is_transient === true ||
    /not ready to be published|Media ID is not available/i.test(String(error.message || "") + " " + String(error.error_user_msg || ""))
  );
}

export async function publishInstagramContainerWithRetry(params: {
  instagramUserId: string;
  containerId: string;
  accessToken: string;
  label: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  pollFn?: (containerId: string, accessToken: string) => Promise<void>;
}): Promise<string> {
  const {
    instagramUserId,
    containerId,
    accessToken,
    label,
    maxAttempts = 5,
    baseDelayMs = 4000,
    fetchFn = fetch,
    sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
    pollFn = pollInstagramContainer,
  } = params;

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pubRes = await fetchFn(
      `https://graph.facebook.com/v21.0/${instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    const pubData = await pubRes.json();
    if (!pubData.error && pubData.id) {
      return pubData.id;
    }

    lastError = pubData.error || pubData;
    if (!isRetryableInstagramPublishError(pubData.error) || attempt === maxAttempts) {
      throw new Error(`Failed to publish ${label}: ${JSON.stringify(lastError)}`);
    }

    const waitMs = baseDelayMs + (attempt - 1) * 2000;
    console.warn(
      `   ⚠️ Instagram container not ready on publish attempt ${attempt}/${maxAttempts} (code ${pubData.error?.code}/${pubData.error?.error_subcode}). Waiting ${(waitMs / 1000).toFixed(0)}s & re-polling...`
    );
    await sleepFn(waitMs);
    await pollFn(containerId, accessToken);
  }

  throw new Error(`Failed to publish ${label}: ${JSON.stringify(lastError)}`);
}

export const DEFAULT_LAUNCH_CAPTION = `🎉 HOREEE! Rumah Dongeng @zayn.storybook resmi hadir! 🎈✨
Tempat petualangan ceria & pengantar tidur nyenyak buat si kecil tercinta 🌙💤

Halo Ayah, Bunda, dan adik-adik tersayang! 🥰👋
Kabar gembira nih! Mulai hari ini, Zayn Storybook resmi mengudara untuk menemani si kecil dengan dongeng animasi buku bergambar yang super seru, penuh tawa, dan sarat pesan kebaikan budi pekerti.

🍿 6 Cerita Seru yang Sudah Bisa Ditonton:
🐱 1. Gara-Gara Kucing!
🦁 2. Hari Cukur Rambut Sringeri Srinivas!
🌧️ 3. Jas Hujan Merah
🍌 4. Pisang Terlalu Banyak!
👑 5. Raja Gemuk, Anjing Kurus!
🌙 6. Bulan dan Topi Biru

🌟 Tersedia dalam 2 Bahasa: Bahasa Indonesia & English!
Semua video beranimasi halus, warna ceria, suara anak ramah, dan bebas suara kaget bising yang bikin rewel.

🌙 Mau nonton kompilasi maraton 14 menit dongeng pengantar tidur non-stop?
Tonton di YouTube & Facebook Watch resmi kami: Zayn Storybook! 🍿✨

${buildSocialEngagementCta("id", "feed")}

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #ParentingCeria #BukuCeritaAnak #DongengSebelumTidur #EdukasiAnak #BedtimeStories #CeritaBergambar`;

export async function publishInstagramFeedPhoto(options: {
  imagePath: string;
  caption?: string;
  dryRun?: boolean;
}) {
  const meta = await loadMetaConfig();
  const caption = options.caption || DEFAULT_LAUNCH_CAPTION;

  console.log("\n=======================================================");
  console.log("📸 INSTAGRAM FEED PHOTO PUBLISHER (API)");
  console.log("=======================================================");
  console.log(`👤 Target Account : @${meta.instagramUsername || meta.instagramUserId}`);
  console.log(`🖼️ Local Image    : ${options.imagePath}`);
  console.log(`🧪 Dry Run        : ${options.dryRun ? "YES (No upload)" : "NO (Live Post)"}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Caption Preview:\n", caption);
    return { success: true, dryRun: true };
  }

  // 1. Upload to Cloudflare R2
  console.log(`\n☁️ Step 1: Uploading image to Cloudflare R2 CDN...`);
  const { publicUrl, cleanup } = await uploadImageToR2(options.imagePath, "ig-feed");
  console.log(`   ✔ Public Image URL: ${publicUrl}`);

  try {
    // 2. Create Instagram Media Container
    console.log(`\n📦 Step 2: Creating Instagram Media Container via Meta Graph API...`);
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${meta.instagramUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: publicUrl,
          caption: caption,
          access_token: meta.pageAccessToken,
        }),
      }
    );

    const containerData = await containerRes.json();
    if (containerData.error) {
      throw new Error(`Failed to create Instagram container: ${JSON.stringify(containerData.error)}`);
    }

    const containerId = containerData.id;
    console.log(`   ✔ Container ID: ${containerId}`);

    // 3. Poll container
    console.log(`\n⚙️ Step 3: Waiting for Instagram container readiness...`);
    await pollInstagramContainer(containerId, meta.pageAccessToken);

    // 4. Publish Container
    console.log(`\n📢 Step 4: Publishing to Instagram Feed...`);
    const mediaId = await publishInstagramContainerWithRetry({
      instagramUserId: meta.instagramUserId,
      containerId,
      accessToken: meta.pageAccessToken,
      label: "Instagram media",
    });
    console.log(`   ✔ Published Media ID: ${mediaId}`);

    // 5. Query Permalink
    let permalink = `https://www.instagram.com/p/`;
    try {
      const detailRes = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}?fields=id,permalink,shortcode&access_token=${meta.pageAccessToken}`
      );
      const detail = await detailRes.json();
      if (detail.permalink) {
        permalink = detail.permalink;
      }
    } catch {
      // fallback
    }

    console.log(`\n🎉 SUCCESS! INSTAGRAM POST IS LIVE!`);
    console.log(`🔗 Link: ${permalink}\n`);

    return { success: true, mediaId, permalink };
  } finally {
    // 6. Cleanup R2 object
    console.log(`🧹 Cleaning up temporary CDN image...`);
    await cleanup();
    console.log(`   ✔ R2 temporary object removed.`);
  }
}

export async function publishInstagramCarousel(options: {
  imagePaths: string[];
  caption?: string;
  dryRun?: boolean;
}) {
  const meta = await loadMetaConfig();
  const caption = options.caption || DEFAULT_LAUNCH_CAPTION;

  console.log("\n=======================================================");
  console.log("📸 INSTAGRAM CAROUSEL PUBLISHER (API)");
  console.log("=======================================================");
  console.log(`👤 Target Account : @${meta.instagramUsername || meta.instagramUserId}`);
  console.log(`🖼️ Total Slides   : ${options.imagePaths.length}`);
  console.log(`🧪 Dry Run        : ${options.dryRun ? "YES (No upload)" : "NO (Live Post)"}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Caption Preview:\n", caption);
    return { success: true, dryRun: true };
  }

  const cleanups: Array<() => Promise<void>> = [];

  try {
    // 1. Upload all items and create item containers
    const itemContainerIds: string[] = [];

    for (let i = 0; i < options.imagePaths.length; i++) {
      const imgPath = options.imagePaths[i];
      console.log(`\n☁️ Uploading slide ${i + 1}/${options.imagePaths.length}: ${path.basename(imgPath)}...`);
      const { publicUrl, cleanup } = await uploadImageToR2(imgPath, "ig-carousel");
      cleanups.push(cleanup);

      console.log(`   ✔ Uploaded: ${publicUrl}`);
      console.log(`   📦 Creating item container ${i + 1}...`);
      const itemRes = await fetch(
        `https://graph.facebook.com/v21.0/${meta.instagramUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: publicUrl,
            is_carousel_item: true,
            access_token: meta.pageAccessToken,
          }),
        }
      );

      const itemData = await itemRes.json();
      if (itemData.error) {
        throw new Error(`Failed to create carousel item ${i + 1}: ${JSON.stringify(itemData.error)}`);
      }

      itemContainerIds.push(itemData.id);
      console.log(`   ✔ Slide ${i + 1} Container ID: ${itemData.id} — waiting for readiness...`);
      await pollInstagramContainer(itemData.id, meta.pageAccessToken);
    }

    // 2. Create Carousel Container
    console.log(`\n📦 Step 2: Creating Carousel Container with ${itemContainerIds.length} slides...`);
    const carouselRes = await fetch(
      `https://graph.facebook.com/v21.0/${meta.instagramUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: itemContainerIds,
          caption: caption,
          access_token: meta.pageAccessToken,
        }),
      }
    );

    const carouselData = await carouselRes.json();
    if (carouselData.error) {
      throw new Error(`Failed to create carousel container: ${JSON.stringify(carouselData.error)}`);
    }

    const carouselId = carouselData.id;
    console.log(`   ✔ Carousel Container ID: ${carouselId}`);

    // 3. Poll Carousel Container + brief propagation settle pause
    console.log(`\n⚙️ Step 3: Waiting for Carousel container readiness...`);
    await pollInstagramContainer(carouselId, meta.pageAccessToken);
    await new Promise((r) => setTimeout(r, 1500));

    // 4. Publish Carousel (with automatic retry on Meta 9007/2207027 transient readiness lag)
    console.log(`\n📢 Step 4: Publishing Carousel to Instagram Feed...`);
    const mediaId = await publishInstagramContainerWithRetry({
      instagramUserId: meta.instagramUserId,
      containerId: carouselId,
      accessToken: meta.pageAccessToken,
      label: "Instagram Carousel",
    });
    console.log(`   ✔ Published Carousel Media ID: ${mediaId}`);

    // 5. Query Permalink
    let permalink = `https://www.instagram.com/p/`;
    try {
      const detailRes = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}?fields=id,permalink,shortcode&access_token=${meta.pageAccessToken}`
      );
      const detail = await detailRes.json();
      if (detail.permalink) {
        permalink = detail.permalink;
      }
    } catch {
      // fallback
    }

    console.log(`\n🎉 SUCCESS! INSTAGRAM CAROUSEL IS LIVE!`);
    console.log(`🔗 Link: ${permalink}\n`);

    return { success: true, mediaId, permalink };
  } finally {
    console.log(`🧹 Cleaning up temporary CDN images...`);
    for (const c of cleanups) {
      await c();
    }
    console.log(`   ✔ All temporary R2 objects removed.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isDryRun = args.includes("--dry-run");
  const isCarousel = args.includes("--carousel");
  const bookSlug = getArg("--book");
  const langArg = (getArg("--lang") || "id") as "id" | "en";

  let customImagePath = getArg("--image") || path.resolve("./exports/compilations/thumbnail-compilation-bedtime-id.png");
  let captionText = DEFAULT_LAUNCH_CAPTION;
  let carouselSlides: string[] = [];

  if (bookSlug) {
    const storyJsonPath = path.resolve(`./stories/${bookSlug}/story.json`);
    if (existsSync(storyJsonPath)) {
      const story = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
      const kit = generateBilingualSocialKit(story);
      const igMatch = kit.match(/## 📸 1\. INSTAGRAM[\s\S]*?```text\n([\s\S]*?)```/);
      if (igMatch && igMatch[1]) {
        captionText = igMatch[1].trim();
      }

      // Check candidate single photo - PRIORITIZE 4:5 PORTRAIT (1080x1350)
      const candidateSingle = [
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-portrait.png`),
        path.resolve(`./stories/${bookSlug}/exports/id/thumbnail-portrait.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-vertical.png`),
        path.resolve(`./stories/${bookSlug}/exports/id/thumbnail-vertical.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-popular.png`),
        path.resolve(`./stories/${bookSlug}/exports/id/thumbnail-popular.png`),
        path.resolve(`./stories/${bookSlug}/exports/thumbnail.png`),
        path.resolve(`./stories/${bookSlug}/assets/cover.png`),
      ];
      for (const p of candidateSingle) {
        if (existsSync(p)) {
          customImagePath = p;
          break;
        }
      }

      // Check candidate uniform 4:5 carousel slides
      const candidatePortraitSlides = [
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-portrait.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/carousel-slide-1.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/carousel-slide-2.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/carousel-slide-3.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/carousel-slide-4.png`),
      ].filter((p) => existsSync(p));

      if (candidatePortraitSlides.length >= 2) {
        carouselSlides = candidatePortraitSlides;
      }
    }
  }

  if (isCarousel && carouselSlides.length >= 2) {
    await publishInstagramCarousel({
      imagePaths: carouselSlides,
      caption: captionText,
      dryRun: isDryRun,
    });
  } else {
    if (!existsSync(customImagePath)) {
      throw new Error(`Image not found: ${customImagePath}`);
    }

    if (isCarousel && carouselSlides.length < 2) {
      console.log(`ℹ️ Multi-slide 4:5 carousel not found. Publishing high-impact 4:5 Portrait Announcement Photo!`);
    }

    await publishInstagramFeedPhoto({
      imagePath: customImagePath,
      caption: captionText,
      dryRun: isDryRun,
    });
  }
}

if (process.argv[1] && process.argv[1].endsWith("publish-instagram-post.ts")) {
  main().catch((err) => {
    console.error("❌ Instagram publishing failed:", err);
    process.exit(1);
  });
}
