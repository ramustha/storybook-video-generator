import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync, openSync, readSync, closeSync } from "fs";

export interface ThumbnailDimension {
  width: number;
  height: number;
}

export interface ThumbnailItemVerification {
  type: "popular" | "bedtime" | "default" | "vertical";
  orientation: "landscape" | "vertical";
  platformTargets: string[];
  expectedDimensions: ThumbnailDimension;
  actualDimensions?: ThumbnailDimension;
  filePath: string;
  relativePath: string;
  exists: boolean;
  sizeBytes?: number;
  sizeMb?: string;
  isValid: boolean;
  error?: string;
}

export interface StoryThumbnailVerification {
  bookSlug: string;
  title: string;
  lang: "id" | "en";
  isValid: boolean;
  items: ThumbnailItemVerification[];
  missingTypes: string[];
}

export interface OverallThumbnailAudit {
  valid: boolean;
  totalChecked: number;
  totalValid: number;
  totalMissing: number;
  stories: StoryThumbnailVerification[];
}

export interface RenderThumbnailOptions {
  bookSlug: string;
  lang?: "id" | "en" | "all";
  variant?: "popular" | "bedtime" | "all";
  heroImage?: string;
  backdropImage?: string;
  customHeadline?: string;
  customHook?: string;
  silent?: boolean;
}

/**
 * Fast, deterministic byte inspection to read PNG dimensions directly from IHDR chunk.
 */
export function getPngDimensions(filePath: string): ThumbnailDimension | null {
  try {
    if (!existsSync(filePath)) return null;
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(24);
    readSync(fd, buf, 0, 24, 0);
    closeSync(fd);

    // PNG signature check (0x89 50 4E 47 0D 0A 1A 0A)
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
      return null;
    }

    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Verifies all required multi-platform thumbnails for a story and language.
 */
export async function verifyStoryThumbnails(
  bookSlug: string,
  lang: "id" | "en" | "all" = "all"
): Promise<StoryThumbnailVerification[]> {
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`Story manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const langsToCheck: Array<"id" | "en"> =
    lang === "all" ? ["id", "en"] : [lang];

  const results: StoryThumbnailVerification[] = [];

  for (const currentLang of langsToCheck) {
    const exportLangDir = path.join(storyDir, `exports/${currentLang}`);
    const items: ThumbnailItemVerification[] = [
      // 1. YouTube & Facebook Landscape High-CTR Comic (1920x1080)
      {
        type: "popular",
        orientation: "landscape",
        platformTargets: ["YouTube Video (16:9)", "Facebook Video (16:9)", "Docs Portal"],
        expectedDimensions: { width: 1920, height: 1080 },
        filePath: path.join(exportLangDir, "thumbnail-popular.png"),
        relativePath: `exports/${currentLang}/thumbnail-popular.png`,
        exists: false,
        isValid: false,
      },
      // 2. YouTube & Facebook Landscape Bedtime Peace (1920x1080)
      {
        type: "bedtime",
        orientation: "landscape",
        platformTargets: ["YouTube Bedtime Niche (16:9)", "Peaceful Read-Aloud Playlists"],
        expectedDimensions: { width: 1920, height: 1080 },
        filePath: path.join(exportLangDir, "thumbnail-bedtime.png"),
        relativePath: `exports/${currentLang}/thumbnail-bedtime.png`,
        exists: false,
        isValid: false,
      },
      // 3. Default Primary Landscape Thumbnail (1920x1080)
      {
        type: "default",
        orientation: "landscape",
        platformTargets: ["Default Fallback", "Facebook Link Card", "SEO OpenGraph"],
        expectedDimensions: { width: 1920, height: 1080 },
        filePath: path.join(exportLangDir, "thumbnail.png"),
        relativePath: `exports/${currentLang}/thumbnail.png`,
        exists: false,
        isValid: false,
      },
      // 4. Shorts, Instagram Reels, Facebook Reels & TikTok Vertical Cover (1080x1920)
      {
        type: "vertical",
        orientation: "vertical",
        platformTargets: [
          "YouTube Shorts (9:16)",
          "Instagram Reels (9:16 + 1:1 Center Grid)",
          "Facebook Reels (9:16)",
          "TikTok Video Poster (9:16)",
        ],
        expectedDimensions: { width: 1080, height: 1920 },
        filePath: path.join(exportLangDir, "thumbnail-vertical.png"),
        relativePath: `exports/${currentLang}/thumbnail-vertical.png`,
        exists: false,
        isValid: false,
      },
    ];

    const missingTypes: string[] = [];

    for (const item of items) {
      if (existsSync(item.filePath)) {
        item.exists = true;
        try {
          const stat = await fs.stat(item.filePath);
          item.sizeBytes = stat.size;
          item.sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

          const dims = getPngDimensions(item.filePath);
          if (dims) {
            item.actualDimensions = dims;
            const matchesDimensions =
              dims.width === item.expectedDimensions.width &&
              dims.height === item.expectedDimensions.height;

            if (!matchesDimensions) {
              item.isValid = false;
              item.error = `Dimension mismatch: expected ${item.expectedDimensions.width}x${item.expectedDimensions.height}, got ${dims.width}x${dims.height}`;
              missingTypes.push(item.type);
            } else if (stat.size < 10240) {
              item.isValid = false;
              item.error = `Corrupt or empty file (< 10 KB): ${stat.size} bytes`;
              missingTypes.push(item.type);
            } else {
              item.isValid = true;
            }
          } else {
            item.isValid = false;
            item.error = "Invalid PNG signature / unable to read dimensions";
            missingTypes.push(item.type);
          }
        } catch (err: any) {
          item.isValid = false;
          item.error = err.message;
          missingTypes.push(item.type);
        }
      } else {
        item.exists = false;
        item.isValid = false;
        item.error = "File does not exist";
        missingTypes.push(item.type);
      }
    }

    const isLangValid = missingTypes.length === 0;
    results.push({
      bookSlug,
      title: manifest.title,
      lang: currentLang,
      isValid: isLangValid,
      items,
      missingTypes,
    });
  }

  return results;
}

/**
 * Renders all required platform thumbnails using Remotion still renderer.
 */
export async function renderStoryThumbnails(
  options: RenderThumbnailOptions
): Promise<Record<string, any>> {
  const {
    bookSlug,
    lang = "all",
    variant = "all",
    heroImage,
    backdropImage,
    customHeadline,
    customHook,
    silent = false,
  } = options;

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`Story manifest not found at ${manifestPath}`);
  }

  const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  if (!silent) {
    console.log(`\n======================================================`);
    console.log(`🎨 MULTI-PLATFORM THUMBNAIL ENGINE: "${rawManifest.title}"`);
    console.log(`======================================================`);
    console.log(`📖 Book Slug  : ${bookSlug}`);
    console.log(`🌐 Language   : ${lang.toUpperCase()}`);
    console.log(`🎭 Variant    : ${variant.toUpperCase()}`);
    console.log(`======================================================\n`);
  }

  // Ensure export directories exist
  await fs.mkdir(path.join(storyDir, "exports/id"), { recursive: true });
  await fs.mkdir(path.join(storyDir, "exports/en"), { recursive: true });

  if (!silent) console.log(`📦 Bundling Remotion Thumbnail compositions...`);
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: storyDir,
  });

  const languages: Array<"id" | "en"> = lang === "all" ? ["id", "en"] : [lang];
  const variants: Array<"popular" | "bedtime"> =
    variant === "all" ? ["popular", "bedtime"] : [variant];

  const generatedThumbnails: Record<string, any> = {};

  for (const currentLang of languages) {
    const exportLangDir = path.join(storyDir, `exports/${currentLang}`);
    if (!generatedThumbnails[currentLang]) generatedThumbnails[currentLang] = {};

    // 1. Render Landscape 16:9 Variants (1920x1080)
    for (const v of variants) {
      const candidateHero =
        heroImage ||
        rawManifest.thumbnailConfig?.heroImage ||
        (v === "popular" ? "assets/cover.png" : "assets/scene_02.png");
      const resolvedHero =
        candidateHero && existsSync(path.join(storyDir, candidateHero))
          ? candidateHero
          : undefined;

      const candidateBg =
        backdropImage ||
        rawManifest.thumbnailConfig?.backdropImage ||
        (v === "popular" ? "assets/scene_02.png" : "assets/cover.png");
      const resolvedBackdrop =
        candidateBg && existsSync(path.join(storyDir, candidateBg))
          ? candidateBg
          : undefined;

      const inputProps = {
        book: rawManifest,
        lang: currentLang,
        variant: v,
        heroImagePath: resolvedHero,
        backdropImagePath: resolvedBackdrop,
        customHeadline,
        customHook,
      };

      if (!silent) {
        console.log(`\n🖼️  Rendering [${currentLang.toUpperCase()}] [${v.toUpperCase()}] 16:9 Landscape (1920x1080)...`);
      }

      const composition = await selectComposition({
        serveUrl,
        id: "StorybookThumbnail",
        inputProps,
      });

      const fileName = `thumbnail-${v}.png`;
      const outputPath = path.join(exportLangDir, fileName);

      const startTime = Date.now();
      await renderStill({
        composition,
        serveUrl,
        output: outputPath,
        inputProps,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const stat = await fs.stat(outputPath);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
      if (!silent) {
        console.log(`   ✔ Rendered in ${elapsed}s -> ${fileName} (${sizeMb} MB) [1920x1080]`);
      }

      generatedThumbnails[currentLang][v] = `exports/${currentLang}/${fileName}`;

      // Default primary thumbnail.png copy
      if (v === "popular") {
        const defaultPath = path.join(exportLangDir, "thumbnail.png");
        await fs.copyFile(outputPath, defaultPath);
        generatedThumbnails[currentLang].primary = `exports/${currentLang}/thumbnail.png`;

        if (currentLang === "id") {
          await fs.copyFile(outputPath, path.join(storyDir, "exports/thumbnail.png"));
        }
      }
    }

    // 2. Render Vertical 9:16 Shorts & Reels Cover (1080x1920)
    if (!silent) {
      console.log(`\n📱 Rendering [${currentLang.toUpperCase()}] 9:16 Vertical Shorts/Reels Cover (1080x1920)...`);
    }

    const candidateHeroVert =
      heroImage || rawManifest.thumbnailConfig?.heroImage || "assets/cover.png";
    const resolvedHeroVert =
      candidateHeroVert && existsSync(path.join(storyDir, candidateHeroVert))
        ? candidateHeroVert
        : undefined;

    const candidateBgVert =
      backdropImage || rawManifest.thumbnailConfig?.backdropImage || "assets/scene_02.png";
    const resolvedBackdropVert =
      candidateBgVert && existsSync(path.join(storyDir, candidateBgVert))
        ? candidateBgVert
        : undefined;

    const verticalProps = {
      book: rawManifest,
      lang: currentLang,
      variant: "popular" as const,
      orientation: "vertical" as const,
      heroImagePath: resolvedHeroVert,
      backdropImagePath: resolvedBackdropVert,
      customHeadline,
      customHook,
    };

    const verticalComposition = await selectComposition({
      serveUrl,
      id: "StorybookThumbnail-Vertical",
      inputProps: verticalProps,
    });

    const verticalFileName = "thumbnail-vertical.png";
    const verticalOutputPath = path.join(exportLangDir, verticalFileName);
    const startVert = Date.now();
    await renderStill({
      composition: verticalComposition,
      serveUrl,
      output: verticalOutputPath,
      inputProps: verticalProps,
    });

    const vertElapsed = ((Date.now() - startVert) / 1000).toFixed(1);
    const vertStat = await fs.stat(verticalOutputPath);
    const vertSizeMb = (vertStat.size / (1024 * 1024)).toFixed(2);
    if (!silent) {
      console.log(`   ✔ Rendered in ${vertElapsed}s -> ${verticalFileName} (${vertSizeMb} MB) [1080x1920]`);
    }

    generatedThumbnails[currentLang].vertical = `exports/${currentLang}/${verticalFileName}`;
  }

  // Update story.json manifest
  if (!rawManifest.thumbnails) rawManifest.thumbnails = {};
  rawManifest.thumbnails = {
    ...rawManifest.thumbnails,
    ...generatedThumbnails,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath, JSON.stringify(rawManifest, null, 2), "utf-8");
  if (!silent) {
    console.log(`\n✔ story.json updated with validated multi-platform thumbnail paths!`);
    console.log(`🎉 All requested thumbnails rendered and synchronized successfully.\n`);
  }

  return generatedThumbnails;
}

/**
 * CLI Main Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isVerify = args.includes("--verify") || args.includes("--check");
  const isRepair = args.includes("--repair") || args.includes("--auto-fix");
  const isAllBooks = args.includes("--all-books") || args.includes("--all");
  const requestedBook = getArg("--book");
  const requestedLang = (getArg("--lang") || "all") as "id" | "en" | "all";
  const requestedVariant = (getArg("--variant") || "all") as "popular" | "bedtime" | "all";

  const booksToProcess: string[] = [];
  if (isAllBooks) {
    const storiesDir = path.resolve("./stories");
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && existsSync(path.join(storiesDir, ent.name, "story.json"))) {
        booksToProcess.push(ent.name);
      }
    }
  } else {
    booksToProcess.push(requestedBook || "gara-gara-kucing");
  }

  // MODE 1: VERIFICATION & AUDIT
  if (isVerify && !isRepair) {
    console.log("\n==================================================================");
    console.log("🔍 MULTI-PLATFORM THUMBNAIL VERIFICATION & SAFE-ZONE AUDIT");
    console.log("==================================================================");

    let allPassed = true;
    for (const slug of booksToProcess) {
      const verifs = await verifyStoryThumbnails(slug, requestedLang);
      console.log(`\n📖 Story: "${slug}"`);
      console.log("------------------------------------------------------------------");

      for (const v of verifs) {
        console.log(`\n  📍 Language: [${v.lang.toUpperCase()}] | Status: ${v.isValid ? "✔ ALL VALID" : "❌ INCOMPLETE"}`);
        for (const item of v.items) {
          const dims = item.actualDimensions
            ? `${item.actualDimensions.width}x${item.actualDimensions.height}`
            : "Missing";
          const statusIcon = item.isValid ? "✔" : "❌";
          const typeLabel = item.type.padEnd(8, " ");
          const orientLabel = `[${item.orientation.toUpperCase()}]`.padEnd(12, " ");
          const dimLabel = dims.padEnd(11, " ");
          const sizeLabel = item.sizeMb ? `(${item.sizeMb} MB)`.padEnd(11, " ") : "(missing)   ";

          console.log(`    ${statusIcon} ${typeLabel} ${orientLabel} ${dimLabel} ${sizeLabel} -> ${item.relativePath}`);
          if (item.error) {
            console.log(`       ⚠️ Error: ${item.error}`);
          }
          console.log(`       🎯 Platforms: ${item.platformTargets.join(", ")}`);
        }

        if (!v.isValid) {
          allPassed = false;
        }
      }
    }

    console.log("\n==================================================================");
    if (allPassed) {
      console.log("🎉 ALL PLATFORM THUMBNAILS VERIFIED AND VALIDATED 100%!");
      console.log("==================================================================\n");
      process.exit(0);
    } else {
      console.error("❌ VERIFICATION FAILED: Some thumbnails are missing or invalid!");
      console.error("   Run with '--repair' to automatically render missing thumbnails.");
      console.log("==================================================================\n");
      process.exit(1);
    }
  }

  // MODE 2: REPAIR (Verify and auto-render only missing/invalid items)
  if (isRepair) {
    console.log("\n==================================================================");
    console.log("🛠️  MULTI-PLATFORM THUMBNAIL REPAIR & AUTO-HEAL");
    console.log("==================================================================");

    for (const slug of booksToProcess) {
      const verifs = await verifyStoryThumbnails(slug, requestedLang);
      for (const v of verifs) {
        if (!v.isValid) {
          console.log(`\n⚠️ Missing thumbnails for "${slug}" [${v.lang.toUpperCase()}]: ${v.missingTypes.join(", ")}`);
          console.log(`   Rendering missing assets now...`);
          await renderStoryThumbnails({
            bookSlug: slug,
            lang: v.lang,
            variant: "all",
          });
        } else {
          console.log(`✔ All thumbnails already valid for "${slug}" [${v.lang.toUpperCase()}]. Skipping.`);
        }
      }
    }

    console.log("\n🎉 ALL REPAIRS COMPLETED SUCCESSFULLY!\n");
    return;
  }

  // MODE 3: STANDARD RENDER
  const targetSlug = requestedBook || "gara-gara-kucing";
  await renderStoryThumbnails({
    bookSlug: targetSlug,
    lang: requestedLang,
    variant: requestedVariant,
    heroImage: getArg("--hero"),
    backdropImage: getArg("--backdrop"),
    customHeadline: getArg("--headline"),
    customHook: getArg("--hook"),
  });
}

if (process.argv[1] && process.argv[1].includes("render-thumbnail")) {
  main().catch((err) => {
    console.error("❌ Thumbnail render/verify failed:", err);
    process.exit(1);
  });
}
