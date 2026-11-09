import sharp from "sharp";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getArtworkBounds, generateDelicateCloudMistSvg } from "./poc-cloud-kacamata-nenek";

/**
 * Generate an Organic Feathered Alpha Mask for Foreground Artwork.
 * Eliminates all straight rectangular box cuts by softly feathering all 4 edges with organic curves.
 */
function generateFeatheredVignetteMask(width: number, height: number): string {
  const pad = Math.round(Math.min(width, height) * 0.035);
  const blurDev = Math.round(Math.min(width, height) * 0.024);
  const rx = Math.round(Math.min(width, height) * 0.065);

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="featherBlur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${blurDev}" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="black" />
    <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${rx}" ry="${rx}" fill="white" filter="url(#featherBlur)" />
  </svg>
  `;
}

/**
 * Generate Soft Elliptical Mask for Ambient Glow Backdrop.
 */
function generateAmbientGlowMask(width: number, height: number): string {
  const blurDev = Math.round(Math.min(width, height) * 0.06);

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ambBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="${blurDev}" />
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="black" />
    <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.42}" ry="${height * 0.40}" fill="white" filter="url(#ambBlur)" />
  </svg>
  `;
}

/**
 * Create a Clean 16:9 Organic Ambient Video Plate (No burned-in static text).
 * Perfectly prepared for Remotion's dynamic KineticSubtitles.
 */
export async function createOrganicVideoPlate16x9(
  inputImagePath: string,
  outPath: string
): Promise<void> {
  const rawImage = await fs.readFile(inputImagePath);
  const targetW = 1920;
  const targetH = 1080;

  // 1. Detect artwork bounds
  const bounds = await getArtworkBounds(rawImage);
  const padX = Math.round(bounds.width * 0.02);
  const padY = Math.round(bounds.height * 0.02);

  const cropL = Math.max(0, bounds.minX - padX);
  const cropT = Math.max(0, bounds.minY - padY);
  const cropW = Math.max(10, Math.min(bounds.imgW - cropL, bounds.width + padX * 2));
  const cropH = Math.max(10, Math.min(bounds.imgH - cropT, bounds.height + padY * 2));

  // 2. Crop active artwork
  const cropped = await sharp(rawImage)
    .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .png()
    .toBuffer();

  // 3. Scaled artwork inside 1680 x 800 safe zone
  const resizedArt = await sharp(cropped)
    .resize({ width: 1680, height: 800, fit: "inside" })
    .png()
    .toBuffer();

  const artMeta = await sharp(resizedArt).metadata();
  const W = artMeta.width || 1680;
  const H = artMeta.height || 800;

  // 4. ORGANIC FEATHERED ALPHA MASK
  const vignetteMaskSvg = generateFeatheredVignetteMask(W, H);
  const featheredArt = await sharp(resizedArt)
    .composite([{ input: Buffer.from(vignetteMaskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  // 5. AMBIENT COLOR BACKDROP (Natural watercolor glow from scene palette)
  const ambW = Math.min(targetW, Math.round(W * 1.30));
  const ambH = Math.min(targetH, Math.round(H * 1.25));
  const ambientGlow = await sharp(cropped)
    .resize(ambW, ambH, { fit: "fill" })
    .blur(50)
    .modulate({ brightness: 1.04, saturation: 0.88 })
    .toBuffer();

  const ambMaskSvg = generateAmbientGlowMask(ambW, ambH);
  const softAmbient = await sharp(ambientGlow)
    .composite([{ input: Buffer.from(ambMaskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  // Dead-center placement
  const artLeft = Math.round((targetW - W) / 2);
  const artTop = Math.round((840 - H) / 2) + 20;
  const artBottom = artTop + H;

  const ambLeft = Math.max(0, Math.round((targetW - ambW) / 2));
  const ambTop = Math.max(0, Math.round(artTop + (H - ambH) / 2));

  // 6. DELICATE CLOUD MIST (Climbs only ~40px so characters are NOT covered!)
  const mistRise = Math.min(Math.round(H * 0.08), 45);
  const cloudStartY = artBottom - mistRise;
  const cloudEndY = Math.min(960, artBottom + 50);

  const cloudSvg = generateDelicateCloudMistSvg({
    width: targetW,
    height: targetH,
    cloudStartY,
    cloudEndY,
    backgroundColor: "#FFFFFF",
    seed: 42,
    isLandscape: true,
  });

  // 7. Base Canvas (NO static burned-in text! Pure clean canvas for Remotion subtitles)
  const baseCanvas = await sharp({
    create: { width: targetW, height: targetH, channels: 4, background: "#FFFFFF" },
  })
    .png()
    .toBuffer();

  const finalVideoPlate = await sharp(baseCanvas)
    .composite([
      { input: softAmbient, top: ambTop, left: ambLeft },
      { input: featheredArt, top: artTop, left: artLeft },
      { input: Buffer.from(cloudSvg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  await fs.writeFile(outPath, finalVideoPlate);
}

/**
 * Main Runner for preparing organic video plates for a book.
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "kacamata-nenek";
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const assetsDir = path.join(storyDir, "assets");
  const backupDir = path.join(assetsDir, "raw_backup");

  console.log("===============================================================");
  console.log(`🎬 PREPARING ORGANIC AMBIENT VIDEO PLATES FOR: ${bookSlug}`);
  console.log("===============================================================\n");

  await fs.mkdir(backupDir, { recursive: true });

  // Read manifest
  const manifest = JSON.parse(await fs.readFile(path.join(storyDir, "story.json"), "utf-8"));
  const scenes = manifest.scenes.filter((s: any) => s.type === "story");

  console.log(`📚 Found ${scenes.length} story scenes to process...`);

  for (const scene of scenes) {
    const imgRel = scene.visual.imagePath;
    const origPath = path.join(storyDir, imgRel);
    const backupPath = path.join(backupDir, path.basename(imgRel));

    // Backup if not backed up
    if (!existsSync(backupPath) && existsSync(origPath)) {
      await fs.copyFile(origPath, backupPath);
      console.log(`   📦 Backed up ${path.basename(imgRel)} -> raw_backup/`);
    }

    // Process from backup to ensure repeatable clean input
    const inputSource = existsSync(backupPath) ? backupPath : origPath;
    console.log(`   🎨 Creating clean organic plate for ${scene.sceneId}...`);
    await createOrganicVideoPlate16x9(inputSource, origPath);
    console.log(`   ✔ Updated: ${imgRel} (Clean Organic Ambient Plate)`);
  }

  console.log("\n🎉 All story scene plates updated with Organic Ambient Vignette & Delicate Cloud Mist!");
}

if (process.argv[1]?.endsWith("prepare-organic-video-plates.ts")) {
  main().catch((err) => {
    console.error("Failed to prepare plates:", err);
    process.exit(1);
  });
}
