import sharp from "sharp";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  assessArtworkQuality,
  classifyAspectOrientation,
  detectTightArtworkBounds,
  type ArtworkQualityReport,
} from "./lib/artwork-framing";

/**
 * Detect non-white content boundaries inside an illustration canvas.
 */
export async function getArtworkBounds(
  imageBuffer: Buffer,
  threshold: number = 246
): Promise<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  imgW: number;
  imgH: number;
}> {
  const { data, info } = await sharp(imageBuffer).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = info.channels === 4 ? data[idx + 3] : 255;

      if (a > 10 && (r < threshold || g < threshold || b < threshold)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return {
      minX: 0,
      minY: 0,
      maxX: info.width,
      maxY: info.height,
      width: info.width,
      height: info.height,
      imgW: info.width,
      imgH: info.height,
    };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    imgW: info.width,
    imgH: info.height,
  };
}

/**
 * Generate soft, organic cloud mist along the transition seam for white-canvas books.
 */
export function generateDelicateCloudMistSvg(options: {
  width: number;
  height: number;
  cloudStartY: number;
  cloudEndY: number;
  backgroundColor?: string;
  seed?: number;
  isLandscape?: boolean;
}): string {
  const {
    width,
    height,
    cloudStartY,
    cloudEndY,
    backgroundColor = "#FFFFFF",
    seed = 42,
    isLandscape = false,
  } = options;

  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const cloudSpan = Math.max(90, cloudEndY - cloudStartY);
  const midY = cloudStartY + cloudSpan * 0.42;

  const puffs: string[] = [];
  const puffCount = isLandscape ? 16 : 12;
  for (let i = 0; i <= puffCount; i++) {
    const t = i / puffCount;
    const wave =
      Math.sin(t * Math.PI * 2.2) * (cloudSpan * 0.16) +
      Math.cos(t * Math.PI * 4.4) * (cloudSpan * 0.06);
    const cx = t * (width + 80) - 40 + (rnd() - 0.5) * 20;
    const cy = midY + wave + (rnd() - 0.5) * 12;
    const r = width * (isLandscape ? 0.08 : 0.11) + (rnd() - 0.5) * 15;
    puffs.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" />`
    );
  }

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="softPuff" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="${(width * 0.018).toFixed(1)}" />
      </filter>
      <filter id="airyMist" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="${(width * 0.038).toFixed(1)}" />
      </filter>
      <linearGradient id="delicateFade" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${backgroundColor}" stop-opacity="0" />
        <stop offset="35%" stop-color="${backgroundColor}" stop-opacity="0.30" />
        <stop offset="70%" stop-color="${backgroundColor}" stop-opacity="0.80" />
        <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="1" />
      </linearGradient>
    </defs>
    <rect x="0" y="${cloudStartY}" width="${width}" height="${height - cloudStartY}" fill="url(#delicateFade)" />
    <g filter="url(#airyMist)" fill="${backgroundColor}" opacity="0.50">
      ${puffs.join("\n      ")}
    </g>
    <g filter="url(#softPuff)" fill="${backgroundColor}" opacity="0.75">
      ${puffs.join("\n      ")}
    </g>
    <rect x="0" y="${cloudEndY}" width="${width}" height="${height - cloudEndY}" fill="${backgroundColor}" />
  </svg>
  `;
}

/**
 * Generate subtle, atmospheric morning mist & cinematic reading depth for colored/illustrated books.
 * Harmonizes seamlessly with natural backgrounds (forest, night sky, ocean) without opaque white cuts.
 */
export function generateAtmosphericMistSvg(options: {
  width: number;
  height: number;
  cloudStartY: number;
  cloudEndY: number;
  seed?: number;
  isLandscape?: boolean;
}): string {
  const { width, height, cloudStartY, cloudEndY, seed = 42, isLandscape = false } = options;

  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const cloudSpan = Math.max(90, cloudEndY - cloudStartY);
  const midY = cloudStartY + cloudSpan * 0.35;

  const puffs: string[] = [];
  const puffCount = isLandscape ? 14 : 10;
  for (let i = 0; i <= puffCount; i++) {
    const t = i / puffCount;
    const wave =
      Math.sin(t * Math.PI * 2.2) * (cloudSpan * 0.18) +
      Math.cos(t * Math.PI * 4.4) * (cloudSpan * 0.08);
    const cx = t * (width + 100) - 50 + (rnd() - 0.5) * 30;
    const cy = midY + wave + (rnd() - 0.5) * 16;
    const r = width * (isLandscape ? 0.09 : 0.12) + (rnd() - 0.5) * 20;
    puffs.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" />`);
  }

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="atmoBlurWide" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="${(width * 0.045).toFixed(1)}" />
      </filter>
      <filter id="atmoBlurSoft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${(width * 0.025).toFixed(1)}" />
      </filter>
      <linearGradient id="atmoMistGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
        <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.05" />
      </linearGradient>
      <linearGradient id="lowerThirdShade" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#020617" stop-opacity="0" />
        <stop offset="45%" stop-color="#020617" stop-opacity="0.25" />
        <stop offset="80%" stop-color="#020617" stop-opacity="0.65" />
        <stop offset="100%" stop-color="#020617" stop-opacity="0.82" />
      </linearGradient>
    </defs>
    <!-- Soft atmospheric morning mist floating across canopy bottom -->
    <rect x="0" y="${cloudStartY}" width="${width}" height="${height - cloudStartY}" fill="url(#atmoMistGrad)" />
    <g filter="url(#atmoBlurWide)" fill="#FFFFFF" opacity="0.20">
      ${puffs.join("\n      ")}
    </g>
    <g filter="url(#atmoBlurSoft)" fill="#FFFFFF" opacity="0.14">
      ${puffs.join("\n      ")}
    </g>
    <!-- Velvety cinematic lower-third shadow for crystal clear subtitle reading -->
    <rect x="0" y="${Math.round(height * 0.60)}" width="${width}" height="${Math.round(height * 0.40)}" fill="url(#lowerThirdShade)" />
  </svg>
  `;
}

/**
 * Generate Soft Elliptical Mask for Outer Ambient Glow Backdrop (composited strictly behind foreground art).
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
export async function createAlignedOrganicPlates(
  inputImagePath: string,
  out16x9Path: string,
  outPortraitPath?: string
): Promise<ArtworkQualityReport> {
  const rawImage = await fs.readFile(inputImagePath);
  const targetW = 1920;
  const targetH = 1080;

  // 1. Detect tight artwork bounds (strips blank paper margins, hairlines, and corner pagination)
  const bounds = await detectTightArtworkBounds(rawImage, {
    excludeIsolatedText: true,
    paddingRatio: 0.002,
  });

  // 2. Crop active artwork
  const cropped = bounds.wasCropped
    ? await sharp(rawImage)
        .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
        .png()
        .toBuffer()
    : await sharp(rawImage).png().toBuffer();

  if (outPortraitPath) {
    await fs.mkdir(path.dirname(outPortraitPath), { recursive: true });
    await fs.writeFile(outPortraitPath, cropped);
  }

  const quality = assessArtworkQuality({
    croppedWidth: bounds.width,
    croppedHeight: bounds.height,
    rawWidth: bounds.rawWidth,
    rawHeight: bounds.rawHeight,
    isFullBleed: bounds.isFullBleed,
  });

  // 3. Scaled crisp artwork inside 1740 x 850 safe zone (untouched original ink/watercolor pixels)
  const resizedArt = await sharp(cropped)
    .resize({ width: 1740, height: 850, fit: "inside" })
    .png()
    .toBuffer();

  const artMeta = await sharp(resizedArt).metadata();
  const W = artMeta.width || 1740;
  const H = artMeta.height || 850;
  const cornerRx = Math.min(22, Math.round(Math.min(W, H) * 0.03));

  // Crisp rounded-corner alpha clip ONLY (no inward blur bite over original illustration)
  const crispClipMaskSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" rx="${cornerRx}" ry="${cornerRx}" fill="white" />
  </svg>`;
  const crispArt = await sharp(resizedArt)
    .composite([{ input: Buffer.from(crispClipMaskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  // Dead-center placement slightly above lower subtitle strip
  const artLeft = Math.round((targetW - W) / 2);
  const artTop = Math.max(40, Math.round((890 - H) / 2));

  // 4. Outer-only Ambient Theater Backdrop & Watercolor Glow (composited STRICTLY BEHIND foreground art)
  const baseCanvas = await sharp(cropped)
    .resize(targetW, targetH, { fit: "cover" })
    .blur(48)
    .modulate({ brightness: 0.45, saturation: 1.25 })
    .png()
    .toBuffer();

  const ambW = Math.min(targetW, Math.round(W * 1.24));
  const ambH = Math.min(targetH, Math.round(H * 1.22));
  const ambientGlow = await sharp(cropped)
    .resize(ambW, ambH, { fit: "cover" })
    .blur(44)
    .modulate({ brightness: 1.05, saturation: 1.15 })
    .toBuffer();

  const ambMaskSvg = generateAmbientGlowMask(ambW, ambH);
  const softAmbient = await sharp(ambientGlow)
    .composite([{ input: Buffer.from(ambMaskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  const ambLeft = Math.max(0, Math.round((targetW - ambW) / 2));
  const ambTop = Math.max(0, Math.round(artTop + (H - ambH) / 2));

  // Soft outer rim + theater shadow card directly behind crispArt (0px drawn over original illustration)
  const outerBackdropSvg = `<svg width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="theaterVignette" cx="50%" cy="46%" r="65%">
        <stop offset="0%" stop-color="#020617" stop-opacity="0" />
        <stop offset="72%" stop-color="#020617" stop-opacity="0.38" />
        <stop offset="100%" stop-color="#020617" stop-opacity="0.72" />
      </radialGradient>
      <filter id="cardDropShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur stdDeviation="20" />
      </filter>
    </defs>
    <rect width="${targetW}" height="${targetH}" fill="url(#theaterVignette)" />
    <rect x="${artLeft - 4}" y="${artTop + 10}" width="${W + 8}" height="${H + 8}" rx="${cornerRx + 2}" ry="${cornerRx + 2}" fill="#000000" opacity="0.62" filter="url(#cardDropShadow)" />
    <rect x="${artLeft - 2}" y="${artTop - 2}" width="${W + 4}" height="${H + 4}" rx="${cornerRx + 1}" ry="${cornerRx + 1}" fill="none" stroke="rgba(253, 224, 71, 0.35)" stroke-width="2" />
  </svg>`;

  const finalVideoPlate = await sharp(baseCanvas)
    .composite([
      { input: softAmbient, top: ambTop, left: ambLeft },
      { input: Buffer.from(outerBackdropSvg), top: 0, left: 0 },
      { input: crispArt, top: artTop, left: artLeft },
    ])
    .png()
    .toBuffer();

  await fs.writeFile(out16x9Path, finalVideoPlate);
  return quality;
}

/**
 * Create a Clean 16:9 Organic Ambient Video Plate (backward-compatible wrapper).
 */
export async function createOrganicVideoPlate16x9(
  inputImagePath: string,
  outPath: string
): Promise<void> {
  await createAlignedOrganicPlates(inputImagePath, outPath);
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
  const portraitAssetsDir = path.join(assetsDir, "portrait");
  const backupDir = path.join(assetsDir, "raw_backup");

  console.log("===============================================================");
  console.log(`🎬 PREPARING ORGANIC AMBIENT VIDEO PLATES FOR: ${bookSlug}`);
  console.log("===============================================================\n");

  await fs.mkdir(backupDir, { recursive: true });
  await fs.mkdir(portraitAssetsDir, { recursive: true });

  // Read manifest
  const manifestPath = path.join(storyDir, "story.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const scenes = manifest.scenes.filter((s: any) => s.type === "story");

  // Tight-crop cover.png if needed and compute exact coverOrientation / coverAspectRatio
  const coverPath = path.join(assetsDir, "cover.png");
  const coverRawPath = path.join(assetsDir, "cover_raw.png");
  if (existsSync(coverPath)) {
    const coverInput = existsSync(coverRawPath) ? coverRawPath : coverPath;
    const coverBuf = await fs.readFile(coverInput);
    const coverBounds = await detectTightArtworkBounds(coverBuf, {
      excludeIsolatedText: true,
      paddingRatio: 0.002,
    });
    if (coverBounds.wasCropped) {
      if (!existsSync(coverRawPath)) await fs.copyFile(coverPath, coverRawPath);
      const croppedCover = await sharp(coverBuf)
        .extract({ left: coverBounds.left, top: coverBounds.top, width: coverBounds.width, height: coverBounds.height })
        .png()
        .toBuffer();
      await fs.writeFile(coverPath, croppedCover);
    }
    const coverMeta = await sharp(coverPath).metadata();
    const coverClass = classifyAspectOrientation(coverMeta.width || 1200, coverMeta.height || 900);
    manifest.coverOrientation = coverClass.orientation;
    manifest.coverAspectRatio = coverClass.aspectRatio;
    console.log(`🖼️  Cover normalized: ${coverMeta.width}x${coverMeta.height} (${coverClass.orientation}, ratio=${coverClass.aspectRatio})`);
  }

  console.log(`📚 Found ${scenes.length} story scenes to process...`);

  const smallScenes: Array<{ sceneId: string; summary: string }> = [];
  const orientationCounts: Record<string, number> = { portrait: 0, landscape: 0, square: 0 };

  for (const scene of scenes) {
    const imgRel = scene.visual.imagePath;
    const origPath = path.join(storyDir, imgRel);
    const backupPath = path.join(backupDir, path.basename(imgRel));
    const portraitRel = `assets/portrait/${scene.sceneId}.png`;
    const portraitPath = path.join(storyDir, portraitRel);

    const isForce = args.includes("--force");
    // Backup if not backed up or if --force is requested
    if ((isForce || !existsSync(backupPath)) && existsSync(origPath)) {
      await fs.copyFile(origPath, backupPath);
      console.log(`   📦 Backed up ${path.basename(imgRel)} -> raw_backup/`);
    }

    // Prefer already tight-cropped high-res portrait plate from hybrid prep when present, else backup/orig
    const inputSource = existsSync(portraitPath)
      ? portraitPath
      : existsSync(backupPath)
      ? backupPath
      : origPath;

    console.log(`   🎨 Creating aligned organic plates for ${scene.sceneId}...`);
    const quality = await createAlignedOrganicPlates(
      inputSource,
      origPath,
      existsSync(portraitPath) ? undefined : portraitPath
    );

    const finalPortraitMeta = existsSync(portraitPath) ? await sharp(portraitPath).metadata() : null;
    const cls = finalPortraitMeta
      ? classifyAspectOrientation(finalPortraitMeta.width || quality.croppedWidth, finalPortraitMeta.height || quality.croppedHeight)
      : classifyAspectOrientation(quality.croppedWidth, quality.croppedHeight);

    orientationCounts[cls.orientation] = (orientationCounts[cls.orientation] || 0) + 1;
    if (quality.isTooSmall) {
      smallScenes.push({ sceneId: scene.sceneId, summary: quality.summary });
      console.warn(`   ⚠️ [${scene.sceneId}] SMALL ARTWORK WARNING: ${quality.summary}`);
    }

    scene.visual = {
      ...(scene.visual || {}),
      imagePath: imgRel,
      verticalImagePath: portraitRel,
      orientation: cls.orientation,
      aspectRatio: cls.aspectRatio,
      isPortrait: cls.isPortrait,
      croppedWidth: finalPortraitMeta?.width || quality.croppedWidth,
      croppedHeight: finalPortraitMeta?.height || quality.croppedHeight,
      isTooSmall: quality.isTooSmall,
      qualityWarnings: quality.warnings,
    };

    console.log(`   ✔ Updated: ${imgRel} + ${portraitRel} (${cls.orientation}, ratio=${cls.aspectRatio})`);
  }

  manifest.artworkQuality = {
    ...(manifest.artworkQuality || {}),
    coverOrientation: manifest.coverOrientation,
    coverAspectRatio: manifest.coverAspectRatio,
    orientationBreakdown: orientationCounts,
    smallScenesCount: smallScenes.length,
    smallScenes,
    analyzedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log("\n🎉 All story scene plates updated with Tight-Cropped Portrait/Native & Organic Ambient Plates!");
  if (smallScenes.length > 0) {
    console.warn(`⚠️ Small-artwork alerts (${smallScenes.length} scenes): ${smallScenes.map((s) => `${s.sceneId}: ${s.summary}`).join(" | ")}`);
  }
}

if (process.argv[1]?.endsWith("prepare-organic-video-plates.ts")) {
  main().catch((err) => {
    console.error("Failed to prepare plates:", err);
    process.exit(1);
  });
}
