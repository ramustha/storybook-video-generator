import fs from "fs/promises";
import { existsSync, readdirSync } from "fs";
import path from "path";
import sharp from "sharp";
import { execSync } from "child_process";
import { getGeminiApiKey } from "./audit-story-quality";

export interface BoundingBox2D {
  text: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  bg_color_hex?: string;
}

export interface PageOcrAnalysis {
  textElements: BoundingBox2D[];
  artwork_box_2d: [number, number, number, number];
  is_off_center: boolean;
  dominant_bg_hex: string;
  durationMs: number;
}

/**
 * Extracts high-resolution PNG pages from raw/source-book.pdf.
 * Uses pdftoppm if available (Ubuntu/Linux standard), or Swift PDFKit (macOS).
 */
export async function extractPdfPages(storyDir: string): Promise<string[]> {
  const rawDir = path.join(storyDir, "raw");
  const pagesDir = path.join(rawDir, "pages");
  const pdfPath = path.join(rawDir, "source-book.pdf");

  await fs.mkdir(pagesDir, { recursive: true });

  const existing = existsSync(pagesDir)
    ? readdirSync(pagesDir).filter((f) => f.endsWith(".png")).sort()
    : [];

  if (existing.length > 0) {
    console.log(`✔ Found ${existing.length} existing extracted pages in ${pagesDir}`);
    return existing.map((f) => path.join(pagesDir, f));
  }

  if (!existsSync(pdfPath)) {
    throw new Error(`PDF source not found at ${pdfPath}`);
  }

  console.log(`📄 Extracting PDF pages from ${pdfPath}...`);

  // 1. Try pdftoppm (standard on Ubuntu Linux with poppler-utils)
  let extractedWithPdftoppm = false;
  try {
    execSync(`pdftoppm -png -r 150 "${pdfPath}" "${path.join(pagesDir, "page")}"`, {
      stdio: "pipe",
    });
    // Rename page-1.png -> page_01.png format
    const generated = readdirSync(pagesDir).filter((f) => f.endsWith(".png"));
    for (const f of generated) {
      const match = f.match(/page[_-](\d+)\.png$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const newName = `page_${String(num).padStart(2, "0")}.png`;
        if (f !== newName) {
          await fs.rename(path.join(pagesDir, f), path.join(pagesDir, newName));
        }
      }
    }
    extractedWithPdftoppm = true;
    console.log(`✔ Extracted pages using pdftoppm (poppler).`);
  } catch {
    extractedWithPdftoppm = false;
  }

  // 2. Fallback to Swift PDFKit on macOS
  if (!extractedWithPdftoppm && process.platform === "darwin") {
    const slug = path.basename(storyDir);
    console.log(`⚙️ Extracting pages using macOS Swift PDFKit engine...`);
    execSync(`swift scripts/prepare-plates.swift --book "${slug}" --skip-inpaint`, {
      stdio: "inherit",
    });
  }

  const finalPages = readdirSync(pagesDir).filter((f) => f.endsWith(".png")).sort();
  if (finalPages.length === 0) {
    throw new Error(`Failed to extract pages from ${pdfPath}`);
  }

  console.log(`✔ Total ${finalPages.length} pages ready in ${pagesDir}`);
  return finalPages.map((f) => path.join(pagesDir, f));
}

/**
 * Analyzes a page image using Google Gemini Vision (1.5 Flash):
 * Detects text to inpaint AND the active artwork boundary to support smart re-centering.
 */
export async function analyzePageWithGemini(
  imageBuffer: Buffer,
  apiKey: string
): Promise<PageOcrAnalysis> {
  const previewBuffer = await sharp(imageBuffer)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = `
You are an expert children's storybook cinematographer and OCR plate inpainting engine.
Analyze this book page:
1. Detect ALL printed text, narrative paragraphs, headings, page numbers, and publisher marks.
2. Detect "artwork_box_2d": The tight 2D bounding box [ymin, xmin, ymax, xmax] (0-1000) of the actual illustration/drawing/characters (excluding empty whitespace margins or blank areas where text sits).
3. "is_off_center": true if the illustration occupies less than 75% of the frame and is skewed towards one side (top/bottom/left/right), leaving large empty whitespace after text removal.
4. "dominant_bg_hex": Hex code of the canvas/page background color (e.g. "#FFFFFF", "#FDFBF7").
`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: previewBuffer.toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          textElements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                box_2d: { type: "array", items: { type: "number" } },
                bg_color_hex: { type: "string" },
              },
              required: ["text", "box_2d", "bg_color_hex"],
            },
          },
          artwork_box_2d: {
            type: "array",
            items: { type: "number" },
            description: "[ymin, xmin, ymax, xmax] of the illustration subject (0-1000)",
          },
          is_off_center: { type: "boolean" },
          dominant_bg_hex: { type: "string" },
        },
        required: ["textElements", "artwork_box_2d", "is_off_center", "dominant_bg_hex"],
      },
    },
  };

  const candidateModels = [
    "models/gemini-3.5-flash",
    "models/gemini-3.5-flash-lite",
    "models/gemini-flash-lite-latest",
  ];

  let lastError: Error | null = null;
  const t0 = Date.now();

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model ${model} returned HTTP ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty candidate response from Gemini Vision API");

      const parsed = JSON.parse(rawText);
      return {
        textElements: parsed.textElements || [],
        artwork_box_2d: parsed.artwork_box_2d || [0, 0, 1000, 1000],
        is_off_center: Boolean(parsed.is_off_center),
        dominant_bg_hex: parsed.dominant_bg_hex || "#FFFFFF",
        durationMs: Date.now() - t0,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ Gemini model [${model}] attempt failed: ${err.message}. Trying next candidate model...`);
    }
  }

  throw lastError || new Error("All Gemini Vision candidate models failed.");
}

/**
 * Inpaints text boxes and applies smart centering to create a 1920x1080 16:9 plate.
 */
export async function inpaintAndCenterPlate(
  imageBuffer: Buffer,
  analysis: PageOcrAnalysis,
  options: { smartCenter?: boolean } = {}
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 1920;
  const H = meta.height || 1080;
  const padX = 14;
  const padY = 8;
  const smartCenter = options.smartCenter !== false;

  // 1. Inpaint text boxes using Sharp SVG composite
  const rects: string[] = [];
  for (const el of analysis.textElements) {
    const [ymin, xmin, ymax, xmax] = el.box_2d;
    const pxLeft = Math.max(0, Math.floor((xmin / 1000) * W) - padX);
    const pxTop = Math.max(0, Math.floor((ymin / 1000) * H) - padY);
    const pxWidth = Math.min(W - pxLeft, Math.ceil(((xmax - xmin) / 1000) * W) + padX * 2);
    const pxHeight = Math.min(H - pxTop, Math.ceil(((ymax - ymin) / 1000) * H) + padY * 2);
    const fill = el.bg_color_hex || analysis.dominant_bg_hex || "#FFFFFF";
    rects.push(`<rect x="${pxLeft}" y="${pxTop}" width="${pxWidth}" height="${pxHeight}" fill="${fill}" />`);
  }

  let cleanedBuffer = imageBuffer;
  if (rects.length > 0) {
    const svgOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${rects.join("\n      ")}
    </svg>`;
    cleanedBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
      .png()
      .toBuffer();
  }

  const targetW = 1920;
  const targetH = 1080;

  // 2. Smart Re-Centering: if artwork is off-center or has large empty text margins
  if (smartCenter && analysis.is_off_center && analysis.artwork_box_2d) {
    const [artYmin, artXmin, artYmax, artXmax] = analysis.artwork_box_2d;
    const cropPadX = Math.round(W * 0.03);
    const cropPadY = Math.round(H * 0.03);

    const cropLeft = Math.max(0, Math.floor((artXmin / 1000) * W) - cropPadX);
    const cropTop = Math.max(0, Math.floor((artYmin / 1000) * H) - cropPadY);
    const cropWidth = Math.min(W - cropLeft, Math.ceil(((artXmax - artXmin) / 1000) * W) + cropPadX * 2);
    const cropHeight = Math.min(H - cropTop, Math.ceil(((artYmax - artYmin) / 1000) * H) + cropPadY * 2);

    if (cropWidth > 100 && cropHeight > 100) {
      const croppedArtwork = await sharp(cleanedBuffer)
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
        .toBuffer();

      // Create 16:9 canvas with dominant background color
      const canvasBg = await sharp({
        create: {
          width: targetW,
          height: targetH,
          channels: 4,
          background: analysis.dominant_bg_hex || "#FFFFFF",
        },
      })
        .png()
        .toBuffer();

      // Ambient blur backdrop from artwork for cinematic depth
      const ambientBlur = await sharp(cleanedBuffer)
        .resize(targetW, targetH, { fit: "cover" })
        .blur(25)
        .toBuffer();

      const maxArtH = Math.round(targetH * 0.90);
      const maxArtW = Math.round(targetW * 0.90);

      const resizedArt = await sharp(croppedArtwork)
        .resize({ width: maxArtW, height: maxArtH, fit: "inside" })
        .toBuffer();

      // Composite artwork dead-center on ambient backdrop
      return sharp(ambientBlur)
        .composite([{ input: resizedArt, gravity: "center" }])
        .png()
        .toBuffer();
    }
  }

  // 3. Standard Centered Composition with Ambient Blur
  const blurredBg = await sharp(cleanedBuffer)
    .resize(targetW, targetH, { fit: "cover" })
    .blur(20)
    .toBuffer();

  const centerArt = await sharp(cleanedBuffer)
    .resize({ height: targetH, fit: "inside" })
    .toBuffer();

  return sharp(blurredBg)
    .composite([{ input: centerArt, gravity: "center" }])
    .png()
    .toBuffer();
}

/**
 * Main Hybrid Plate Preparation Entry Point.
 */
export async function prepareStoryPlatesHybrid(
  slug: string,
  options: {
    engine?: "auto" | "gemini" | "apple";
    smartCenter?: boolean;
    force?: boolean;
  } = {}
): Promise<void> {
  const storyDir = path.resolve(`./stories/${slug}`);
  const manifestPath = path.join(storyDir, "story.json");
  const assetsDir = path.join(storyDir, "assets");
  const rawDir = path.join(storyDir, "raw");

  if (!existsSync(manifestPath)) {
    throw new Error(`story.json not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  await fs.mkdir(assetsDir, { recursive: true });

  console.log("\n=======================================================");
  console.log(`🎨 HYBRID PLATE PREPARATION ENGINE: "${manifest.title}"`);
  console.log(`   Slug         : ${slug}`);
  console.log(`   Engine Mode  : ${(options.engine || "auto").toUpperCase()}`);
  console.log(`   Smart Center : ${options.smartCenter !== false ? "ENABLED" : "DISABLED"}`);
  console.log("=======================================================\n");

  const apiKey = getGeminiApiKey();
  const engine = options.engine || "auto";
  const useGemini = (engine === "gemini" || engine === "auto") && Boolean(apiKey);

  // 1. Ensure high-res pages are extracted
  const pageFiles = await extractPdfPages(storyDir);

  // If engine is explicitly apple and on macOS, delegate to Swift
  if (engine === "apple" && process.platform === "darwin") {
    console.log("🍎 Executing Apple Vision OCR engine (macOS native)...");
    execSync(`swift scripts/prepare-plates.swift --book "${slug}"`, { stdio: "inherit" });
    return;
  }

  if (!useGemini) {
    if (process.platform === "darwin") {
      console.log("⚠️ No Gemini API key found. Falling back to Apple Vision Swift engine...");
      execSync(`swift scripts/prepare-plates.swift --book "${slug}"`, { stdio: "inherit" });
      return;
    } else {
      throw new Error("Gemini API key is required for plate inpainting on Linux/Ubuntu.");
    }
  }

  console.log("🚀 Executing Primary Engine: Gemini Vision OCR + Smart Re-Centering (Sharp)...");

  // Helper to resolve page file for a 1-based page number
  const getPageFile = (pageNumber: number): string => {
    const filename = `page_${String(pageNumber).padStart(2, "0")}.png`;
    const target = path.join(rawDir, "pages", filename);
    if (existsSync(target)) return target;
    return pageFiles[Math.min(pageNumber - 1, pageFiles.length - 1)];
  };

  // 2. Process Cover Plate (Preserve 100% Authentic Original Cover)
  const coverPageNum = manifest.coverPage || 1;
  const coverPageFile = getPageFile(coverPageNum);
  console.log(`\n🖼️  [1/3] Processing Cover Plate from ${path.basename(coverPageFile)} (Preserving Original Book Cover)...`);
  const coverRaw = await fs.readFile(coverPageFile);
  // Keep the cover 100% original without text inpainting (preserves book title lettering & artist styling)
  const originalCover = await sharp(coverRaw).png().toBuffer();
  await fs.writeFile(path.join(assetsDir, "cover.png"), originalCover);
  console.log(`✔ Cover plate saved: assets/cover.png (100% authentic original cover preserved)`);

  // 3. Process Story Scenes
  console.log(`\n🎬 [2/3] Processing 16:9 Scene Plates...`);
  const scenes = manifest.scenes || [];
  let processedCount = 0;

  for (const scene of scenes) {
    if (scene.type === "cover" || scene.type === "outro") continue;

    const sceneId = scene.sceneId || `scene_${String(scene.index).padStart(2, "0")}`;
    const pageNum = scene.sourcePage || scene.pageNumber || scene.index + 1;
    const pageFile = getPageFile(pageNum);
    const outPlatePath = path.join(assetsDir, `${sceneId}.png`);

    if (existsSync(outPlatePath) && !options.force) {
      console.log(`⏩ [${sceneId}] Already exists. Skipping.`);
      continue;
    }

    console.log(`▶️  [${sceneId}] Processing page ${pageNum} (${path.basename(pageFile)})...`);
    const pageRaw = await fs.readFile(pageFile);
    let analysis: PageOcrAnalysis;
    try {
      analysis = await analyzePageWithGemini(pageRaw, apiKey!);
      if (analysis.is_off_center) {
        console.log(`   ✨ Smart Re-Centering triggered! Artwork bounds: [${analysis.artwork_box_2d.join(",")}]`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Scene [${sceneId}] OCR analysis failed: ${err.message}. Using fallback ambient plate.`);
      analysis = {
        textElements: [],
        artwork_box_2d: [0, 0, 1000, 1000],
        is_off_center: false,
        dominant_bg_hex: "#FFFFFF",
        durationMs: 0,
      };
    }

    const finalPlate = await inpaintAndCenterPlate(pageRaw, analysis, {
      smartCenter: options.smartCenter !== false,
    });
    await fs.writeFile(outPlatePath, finalPlate);
    processedCount++;
    console.log(`   ✔ [${sceneId}] 16:9 plate created: ${outPlatePath} (${analysis.textElements.length} text inpainted)`);
  }

  // 4. Extract Protagonist Avatar
  console.log(`\n🧑 [3/3] Extracting Protagonist Avatar...`);
  const avatarPageNum = manifest.avatarPage || 2;
  const avatarPageFile = getPageFile(avatarPageNum);
  const avatarRaw = await fs.readFile(avatarPageFile);
  const avatarMeta = await sharp(avatarRaw).metadata();
  const aW = avatarMeta.width || 1000;
  const aH = avatarMeta.height || 1000;
  const aCropSize = Math.min(aW, aH, 600);

  const avatar = await sharp(avatarRaw)
    .resize(600, 600, { fit: "cover" })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(assetsDir, "protagonist_avatar.png"), avatar);
  console.log(`✔ Protagonist avatar saved: assets/protagonist_avatar.png`);

  console.log(`\n=======================================================`);
  console.log(`🎉 HYBRID PLATE PREPARATION COMPLETE!`);
  console.log(`   Story: ${slug}`);
  console.log(`   Total Plates Created: ${processedCount + 1}`);
  console.log(`=======================================================\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const slug = getArg("--book") || (args[0] && !args[0].startsWith("-") ? args[0] : undefined);
  if (!slug) {
    console.log("Usage: npx tsx scripts/prepare-plates-hybrid.ts --book <slug> [--engine auto|gemini|apple]");
    process.exit(1);
  }

  const engine = (getArg("--engine") as any) || "auto";
  const force = args.includes("--force");
  const noCenter = args.includes("--no-smart-center");

  await prepareStoryPlatesHybrid(slug, {
    engine,
    force,
    smartCenter: !noCenter,
  });
}

if (process.argv[1]?.includes("prepare-plates-hybrid")) {
  main().catch((err) => {
    console.error("❌ Plate preparation failed:", err);
    process.exit(1);
  });
}
