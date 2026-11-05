import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

const DEFAULT_LAUNCH_CAPTION = `🎉 HOREEE! Rumah Dongeng @zayn.storybook resmi hadir! 🎈✨
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

💬 Cerita nomor berapa nih yang mau ditonton bareng si kecil malam ini? Tulis di kolom komentar yuk! 👇❤️

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
    const pubRes = await fetch(
      `https://graph.facebook.com/v21.0/${meta.instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: meta.pageAccessToken,
        }),
      }
    );

    const pubData = await pubRes.json();
    if (pubData.error) {
      throw new Error(`Failed to publish Instagram media: ${JSON.stringify(pubData.error)}`);
    }

    const mediaId = pubData.id;
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
      console.log(`   ✔ Slide ${i + 1} Container ID: ${itemData.id}`);
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

    // 3. Poll Carousel Container
    console.log(`\n⚙️ Step 3: Waiting for Carousel container readiness...`);
    await pollInstagramContainer(carouselId, meta.pageAccessToken);

    // 4. Publish Carousel
    console.log(`\n📢 Step 4: Publishing Carousel to Instagram Feed...`);
    const pubRes = await fetch(
      `https://graph.facebook.com/v21.0/${meta.instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: carouselId,
          access_token: meta.pageAccessToken,
        }),
      }
    );

    const pubData = await pubRes.json();
    if (pubData.error) {
      throw new Error(`Failed to publish Instagram Carousel: ${JSON.stringify(pubData.error)}`);
    }

    const mediaId = pubData.id;
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
  const customImagePath = getArg("--image") || path.resolve("./exports/compilations/thumbnail-compilation-bedtime-id.png");

  if (!existsSync(customImagePath) && !isCarousel) {
    throw new Error(`Image not found: ${customImagePath}`);
  }

  if (isCarousel) {
    const defaultSlides = [
      path.resolve("./exports/compilations/thumbnail-compilation-bedtime-id.png"),
      path.resolve("./exports/compilations/chapters/bedtime-id/chapter-04-gara-gara-kucing.png"),
      path.resolve("./exports/compilations/chapters/bedtime-id/chapter-02-hari-cukur-rambut.png"),
      path.resolve("./exports/compilations/chapters/bedtime-id/chapter-03-jas-hujan-merah.png"),
      path.resolve("./exports/compilations/chapters/bedtime-id/chapter-01-pisang-terlalu-banyak.png"),
      path.resolve("./exports/compilations/chapters/bedtime-id/chapter-05-raja-gemuk-anjing-kurus.png"),
      path.resolve("./stories/bulan-dan-topi-biru/exports/id/thumbnail-popular.png"),
    ].filter((p) => existsSync(p));

    await publishInstagramCarousel({
      imagePaths: defaultSlides,
      dryRun: isDryRun,
    });
  } else {
    await publishInstagramFeedPhoto({
      imagePath: customImagePath,
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
