import fs from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import path from "path";
import { execSync } from "child_process";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { loadR2Config, pushStory } from "./manage-story-storage";
import { auditAndRefineStoryQuality, getGeminiApiKey, QualityAuditResult } from "./audit-story-quality";
import { db } from "./lib/db";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";
import { extractPdfPages } from "./prepare-plates-hybrid";
import { extractStoryDataFromPdfPages } from "./lib/pdf-story-extractor";
import {
  buildCuratedBookFromBudi,
  getWibDateOffsetIso,
  selectUpcomingIngestionQueue,
} from "./lib/batch-queue";
import { notifyTelegramFailure } from "./notify-telegram";

export interface CuratedScene {
  index: number;
  type: string;
  pageNumber: number;
  id: string;
  en: string;
}

export interface CuratedBook {
  slug: string;
  title: string;
  originalTitle: string;
  author: string;
  illustrator: string;
  publisher: string;
  license: string;
  readingLevel: number;
  sourceUrl: string;
  pdfUrl: string;
  coverPage?: number;
  avatarPage?: number;
  theme: string;
  characterBible: {
    protagonists: Array<{
      id: string;
      name: string;
      role: string;
      voice: {
        id: string;
        en: string;
        color: string;
        badge: string;
      };
    }>;
  };
  worldBible: {
    village: string;
    palette: Record<string, string>;
  };
  moral: {
    headlineId: string;
    spokenId: string;
    headlineEn: string;
    spokenEn: string;
  };
  thumbnailConfig: {
    heroImage: string;
    backdropImage: string;
    id: Record<string, string>;
    en: Record<string, string>;
  };
  scenes: CuratedScene[];
}

export interface IngestOptions {
  force?: boolean;
  dryRun?: boolean;
  skipPlates?: boolean;
  skipAudio?: boolean;
  skipThumbnail?: boolean;
  skipUpload?: boolean;
  skipQC?: boolean;
}

/**
 * Downloads a file from remote URL to a local path with automated redirect following.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`⬇️  Downloading source PDF from: ${url}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ZaynStorybookDailyIngestion/1.0 (+https://github.com/ramustha/storybook-video-generator)",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status} ${response.statusText} from ${url}`);
  }

  if (!response.body) {
    throw new Error(`Empty response body from ${url}`);
  }

  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const fileStream = createWriteStream(destPath);
  // @ts-ignore - Readable.fromWeb is supported in Node 18+
  await pipeline(Readable.fromWeb(response.body), fileStream);
  const stats = await fs.stat(destPath);
  if (!(await isValidPdfFile(destPath))) {
    await fs.rm(destPath, { force: true });
    throw new Error(`Downloaded file from ${url} is not a valid PDF (missing %PDF- header).`);
  }
  console.log(`✔ Downloaded: ${(stats.size / (1024 * 1024)).toFixed(2)} MB -> ${destPath}`);
}

async function isValidPdfFile(filePath: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  try {
    const fh = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(5);
      await fh.read(buf, 0, 5, 0);
      return buf.toString("utf8") === "%PDF-";
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

/**
 * Queries Cloudflare R2 to discover which story slugs are already ingested.
 */
async function getExistingR2Stories(): Promise<Set<string>> {
  const existingSlugs = new Set<string>();
  try {
    const r2Config = await loadR2Config();
    const s3 = new S3Client({
      region: "auto",
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });

    let continuationToken: string | undefined = undefined;
    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: r2Config.bucketName,
          Prefix: "stories/",
          Delimiter: "/",
          ContinuationToken: continuationToken,
        })
      );

      for (const prefix of res.CommonPrefixes || []) {
        if (prefix.Prefix) {
          const match = prefix.Prefix.match(/^stories\/([^/]+)\/$/);
          if (match && match[1] && match[1] !== "branding") {
            existingSlugs.add(match[1]);
          }
        }
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);
  } catch (err: any) {
    console.warn(`⚠️ Warning: Could not query Cloudflare R2 catalog (${err.message}). Checking local folders.`);
  }

  return existingSlugs;
}

/**
 * Executes full ingestion lifecycle for a single curated storybook.
 */
async function processSingleStory(targetBook: CuratedBook, options: IngestOptions): Promise<void> {
  const { slug } = targetBook;
  console.log(`\n======================================================`);
  console.log(`🎯 Processing Story: "${targetBook.title}" (${slug})`);
  console.log(`   Author      : ${targetBook.author}`);
  console.log(`   Illustrator : ${targetBook.illustrator}`);
  console.log(`   Publisher   : ${targetBook.publisher} (${targetBook.license})`);
  console.log(`   PDF Source  : ${targetBook.pdfUrl}`);
  console.log(`======================================================`);

  const storyDir = path.resolve(`./stories/${slug}`);
  const rawDir = path.join(storyDir, "raw");
  const assetsDir = path.join(storyDir, "assets");
  const audioDir = path.join(assetsDir, "audio");
  const sfxDir = path.join(assetsDir, "sfx");
  const idAudioDir = path.join(assetsDir, "id");
  const enAudioDir = path.join(assetsDir, "en");
  const pdfPath = path.join(rawDir, "source-book.pdf");
  const manifestPath = path.join(storyDir, "story.json");

  // 1. Create directories
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(sfxDir, { recursive: true });
  await fs.mkdir(idAudioDir, { recursive: true });
  await fs.mkdir(enAudioDir, { recursive: true });
  await fs.mkdir(path.join(storyDir, "exports/id"), { recursive: true });
  await fs.mkdir(path.join(storyDir, "exports/en"), { recursive: true });

  // 2. Download authentic open-access source PDF
  if (!(await isValidPdfFile(pdfPath)) || options.force) {
    await downloadFile(targetBook.pdfUrl, pdfPath);
  } else {
    console.log(`✔ Source PDF already present at ${pdfPath}`);
  }

  // 2.2 Extract authentic scenes from PDF automatically when metadata has scenes: []
  let resolvedBook: CuratedBook = targetBook;
  if (!resolvedBook.scenes || resolvedBook.scenes.length === 0) {
    console.log(`\n📖 Auto-extracting bilingual story scenes from PDF pages for [${slug}]...`);
    await extractPdfPages(storyDir);
    const geminiKey = getGeminiApiKey();
    if (!geminiKey) {
      throw new Error(`GEMINI_API_KEY is required to extract scenes automatically for [${slug}].`);
    }
    const extracted = await extractStoryDataFromPdfPages({
      pagesDir: path.join(rawDir, "pages"),
      slug,
      title: resolvedBook.title,
      originalTitle: resolvedBook.originalTitle,
      author: resolvedBook.author,
      illustrator: resolvedBook.illustrator,
      theme: resolvedBook.theme,
      apiKey: geminiKey,
    });
    resolvedBook = {
      ...resolvedBook,
      coverPage: extracted.coverPage,
      avatarPage: extracted.avatarPage,
      scenes: extracted.scenes,
      moral: extracted.moral,
      thumbnailConfig: extracted.thumbnailConfig,
    };
    console.log(`✔ Extracted ${resolvedBook.scenes.length} bilingual scenes from source PDF.`);
  }

  // 2.5. AI Quality Control & Moral Audit Gate
  let refinedMoral = { ...resolvedBook.moral };
  let refinedThumbnailConfig = resolvedBook.thumbnailConfig
    ? JSON.parse(JSON.stringify(resolvedBook.thumbnailConfig))
    : undefined;
  let auditReport: QualityAuditResult | null = null;

  if (!options.skipQC) {
    try {
      auditReport = await auditAndRefineStoryQuality(resolvedBook, { force: options.force, dryRun: options.dryRun });
      if (auditReport && (auditReport.overallVerdict === "AUTO_REFINED" || auditReport.overallVerdict === "PASS")) {
        refinedMoral = {
          headlineId: auditReport.moralAudit.refinedHeadlineId || refinedMoral.headlineId,
          spokenId: auditReport.moralAudit.refinedSpokenId || refinedMoral.spokenId,
          headlineEn: auditReport.moralAudit.refinedHeadlineEn || refinedMoral.headlineEn,
          spokenEn: auditReport.moralAudit.refinedSpokenEn || refinedMoral.spokenEn,
        };

        if (auditReport.thumbnailRefinement && refinedThumbnailConfig) {
          if (refinedThumbnailConfig.id) {
            if (auditReport.thumbnailRefinement.hookId) refinedThumbnailConfig.id.hook = auditReport.thumbnailRefinement.hookId;
            if (auditReport.thumbnailRefinement.badgeId) refinedThumbnailConfig.id.badge = auditReport.thumbnailRefinement.badgeId;
            if (auditReport.thumbnailRefinement.stickerId) refinedThumbnailConfig.id.sticker = auditReport.thumbnailRefinement.stickerId;
          }
          if (refinedThumbnailConfig.en) {
            if (auditReport.thumbnailRefinement.hookEn) refinedThumbnailConfig.en.hook = auditReport.thumbnailRefinement.hookEn;
            if (auditReport.thumbnailRefinement.badgeEn) refinedThumbnailConfig.en.badge = auditReport.thumbnailRefinement.badgeEn;
            if (auditReport.thumbnailRefinement.stickerEn) refinedThumbnailConfig.en.sticker = auditReport.thumbnailRefinement.stickerEn;
          }
        }
      }

      if (auditReport && !options.dryRun) {
        await fs.writeFile(
          path.join(storyDir, "qc-audit-report.json"),
          JSON.stringify(auditReport, null, 2),
          "utf-8"
        );
      }
    } catch (err: any) {
      console.warn(`⚠️ Warning in AI Quality Gate: ${err.message}. Continuing with curated defaults.`);
    }
  }

  // 3. Assemble story.json manifest
  console.log(`\n📝 Generating story.json manifest...`);
  const sfxList = [
    "assets/sfx/sfx_01_morning_walk.m4a",
    "assets/sfx/sfx_02_scissors.m4a",
    "assets/sfx/sfx_03_kitchen.m4a",
    "assets/sfx/sfx_04_tailor.m4a",
    "assets/sfx/sfx_05_carpenter.m4a",
    "assets/sfx/sfx_06_forest_leaves.m4a",
    "assets/sfx/sfx_07_cave_rain.m4a",
    "assets/sfx/sfx_08_tiger_thunder.m4a",
    "assets/sfx/sfx_09_hair_pop.m4a",
    "assets/sfx/sfx_10_running.m4a",
    "assets/sfx/sfx_11_head_shine.m4a",
  ];

  const scenesPayload: any[] = [];
  const cleanIdIllustrator = resolvedBook.illustrator.replace(/&/g, "dan");
  const cleanEnIllustrator = resolvedBook.illustrator.replace(/&/g, "and");
  const cleanIdTitle = resolvedBook.title.replace(/!+$/, "");
  const cleanEnTitle = resolvedBook.originalTitle.replace(/!+$/, "");

  // Scene 0: Cover
  scenesPayload.push({
    index: 0,
    sceneId: "cover",
    type: "cover",
    durationSeconds: 8.5,
    visual: {
      imagePath: "assets/cover.png",
      status: "ready",
    },
    audio: {
      text: `${cleanIdTitle}! Karya ${resolvedBook.author}, ilustrasi oleh ${cleanIdIllustrator}.`,
      audioPath: "assets/id/cover.mp3",
      wordsPath: "assets/id/cover_words.json",
      en: {
        text: `${cleanEnTitle}! Written by ${resolvedBook.author}, illustrated by ${cleanEnIllustrator}.`,
        audioPath: "assets/en/cover.mp3",
        wordsPath: "assets/en/cover_words.json",
        durationSeconds: 7.0,
        status: "ready",
      },
      status: "ready",
      sfxPath: "assets/sfx/sfx_00_opener.m4a",
      sfxVolume: 0.65,
    },
  });

  // Story Scenes
  for (let i = 0; i < resolvedBook.scenes.length; i++) {
    const s = resolvedBook.scenes[i];
    const sceneId = `scene_${String(i + 1).padStart(2, "0")}`;
    const sfxPath = sfxList[i % sfxList.length];

    scenesPayload.push({
      index: i + 1,
      sceneId,
      type: "story",
      sourcePage: s.pageNumber,
      durationSeconds: 10.0,
      camera: {
        motion: i % 2 === 0 ? "slow_zoom_in" : "pan_right",
      },
      visual: {
        imagePath: `assets/${sceneId}.png`,
        sourcePage: s.pageNumber,
        status: "ready",
      },
      audio: {
        text: s.id,
        audioPath: `assets/id/${sceneId}.mp3`,
        wordsPath: `assets/id/${sceneId}_words.json`,
        en: {
          text: s.en,
          audioPath: `assets/en/${sceneId}.mp3`,
          wordsPath: `assets/en/${sceneId}_words.json`,
          durationSeconds: 8.0,
          status: "ready",
        },
        status: "ready",
        sfxPath,
        sfxVolume: 0.26,
      },
    });
  }

  // Moral Scene
  const moralIdx = resolvedBook.scenes.length + 1;
  scenesPayload.push({
    index: moralIdx,
    sceneId: "moral",
    type: "moral",
    durationSeconds: 12.0,
    camera: {
      motion: "slow_zoom_in",
    },
    visual: {
      imagePath: "assets/protagonist_avatar.png",
      status: "ready",
    },
    audio: {
      text: `Pesan moral cerita ini: ${refinedMoral.headlineId}. ${refinedMoral.spokenId}`,
      audioPath: "assets/id/moral.mp3",
      wordsPath: "assets/id/moral_words.json",
      en: {
        text: `The moral of the story: ${refinedMoral.headlineEn}. ${refinedMoral.spokenEn}`,
        audioPath: "assets/en/moral.mp3",
        wordsPath: "assets/en/moral_words.json",
        durationSeconds: 11.0,
        status: "ready",
      },
      status: "ready",
      sfxPath: "assets/sfx/sfx_12_moral_sparkle.m4a",
      sfxVolume: 0.5,
    },
  });

  // Outro Scene
  const outroIdx = resolvedBook.scenes.length + 2;
  scenesPayload.push({
    index: outroIdx,
    sceneId: "outro",
    type: "outro",
    durationSeconds: 6.0,
    visual: {
      imagePath: "assets/cover.png",
      status: "ready",
    },
    audio: {
      text: "Terima kasih sudah membaca bersama Zayn Storybook! Jangan lupa klik tombol suka dan langganan untuk cerita seru lainnya setiap hari!",
      audioPath: "assets/id/outro.mp3",
      wordsPath: "assets/id/outro_words.json",
      en: {
        text: "Thank you for reading with Zayn Storybook! Don't forget to like and subscribe for more exciting stories every day!",
        audioPath: "assets/en/outro.mp3",
        wordsPath: "assets/en/outro_words.json",
        durationSeconds: 6.0,
        status: "ready",
      },
      status: "ready",
      sfxPath: "assets/sfx/sfx_13_outro_pop.m4a",
      sfxVolume: 0.5,
    },
  });

  const fullManifest = {
    version: "1.0.0",
    id: slug,
    slug,
    title: resolvedBook.title,
    originalTitle: resolvedBook.originalTitle,
    language: "id-ID",
    coverOrientation: "landscape",
    coverAspectRatio: 1.25,
    coverPage: resolvedBook.coverPage || 1,
    avatarPage: resolvedBook.avatarPage || 2,
    source: {
      repository: `${resolvedBook.publisher} (${resolvedBook.license})`,
      license: resolvedBook.license,
      originalAuthor: resolvedBook.author,
      originalIllustrator: resolvedBook.illustrator,
      sourceUrl: resolvedBook.sourceUrl,
      pdfUrl: resolvedBook.pdfUrl,
    },
    stylePreset: {
      artMedium: `${resolvedBook.illustrator} Authentic Illustration`,
      artistInfluences: resolvedBook.illustrator,
      renderingConstraints:
        "authentic 16:9 plates from open-license source, inpaint typography and page numbers, preserve full illustrator expression",
    },
    thumbnailConfig: refinedThumbnailConfig || resolvedBook.thumbnailConfig,
    characterBible: resolvedBook.characterBible,
    worldBible: resolvedBook.worldBible,
    scenes: scenesPayload,
    audio: {
      bgMusicPath: "assets/audio/bgm_whimsical_story.m4a",
      bgMusicVolume: 0.14,
    },
    publications: {},
  };

  await fs.writeFile(manifestPath, JSON.stringify(fullManifest, null, 2), "utf-8");
  console.log(`✔ Manifest created at ${manifestPath} (${scenesPayload.length} scenes)`);

  // Initial Cloudflare D1 sync (refreshed again after audio/thumbnail paths finalize)
  try {
    await db.saveStory(fullManifest);
    await db.markCuratedBookStatus(slug, "ingested");
    console.log(`☁️ Cloudflare D1 database synchronized for newly ingested book [${slug}].`);
  } catch (d1Err: any) {
    console.warn("⚠️ Cloudflare D1 ingestion sync warning:", d1Err.message);
  }

  // 4. Copy shared templates audio and SFX
  console.log(`\n🎵 Copying shared BGM & SFX audio pack...`);
  const templateAudioPath = path.resolve("./templates/audio/bgm_whimsical_story.m4a");
  const templateSfxDir = path.resolve("./templates/sfx");

  if (existsSync(templateAudioPath)) {
    await fs.copyFile(templateAudioPath, path.join(audioDir, "bgm_whimsical_story.m4a"));
  }

  if (existsSync(templateSfxDir)) {
    const sfxFiles = await fs.readdir(templateSfxDir);
    for (const file of sfxFiles) {
      if (file.endsWith(".m4a")) {
        await fs.copyFile(path.join(templateSfxDir, file), path.join(sfxDir, file));
      }
    }
  }
  console.log(`✔ Standard audio pack copied.`);

  // 5. Plate Extraction & Text Inpainting via Hybrid Engine (Gemini Vision OCR + Smart Centering + Apple Fallback)
  if (!options.skipPlates) {
    console.log(`\n🎨 Executing Hybrid Plate Inpainting & Smart Re-Centering Engine...`);
    execSync(`npx tsx scripts/prepare-plates-hybrid.ts --book ${slug}`, {
      stdio: "inherit",
    });

    console.log(`\n🌿 Applying Organic Ambient Vignette & Delicate Cloud Mist to Plates...`);
    try {
      execSync(`npx tsx scripts/prepare-organic-video-plates.ts --book ${slug}`, {
        stdio: "inherit",
      });
    } catch (plateErr: any) {
      console.warn(`⚠️ Organic plate preparation warning: ${plateErr.message}`);
    }
  } else {
    console.log(`⏩ Skipping plates preparation (--skip-plates).`);
  }

  // 6. Neural Voice Synthesis (Bahasa Indonesia & English)
  if (!options.skipAudio) {
    console.log(`\n🎙️ Synthesizing Neural Audio & Timed Subtitles (ID & EN)...`);
    execSync(`npx tsx scripts/synthesize-story-audio.ts --book ${slug} --lang all`, {
      stdio: "inherit",
    });
  } else {
    console.log(`⏩ Skipping audio synthesis (--skip-audio).`);
  }

  // 7. Render High-CTR Thumbnails via Remotion
  if (!options.skipThumbnail) {
    console.log(`\n🖼️ Rendering High-CTR Multi-Platform Thumbnails...`);
    execSync(`npx tsx scripts/render-thumbnail.ts --book ${slug} --variant all`, {
      stdio: "inherit",
    });
  } else {
    console.log(`⏩ Skipping thumbnail render (--skip-thumbnail).`);
  }

  // 7.5 Persist updated manifest (with audio durations + thumbnail paths) to Cloudflare D1
  try {
    const finalizedManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    await db.saveStory(finalizedManifest);
    await db.markCuratedBookStatus(slug, "ingested");
    console.log(`☁️ Cloudflare D1 updated with final audio/thumbnail manifest for [${slug}].`);
  } catch (d1Err: any) {
    console.warn("⚠️ Cloudflare D1 final sync warning:", d1Err.message);
  }

  // 8. Upload Assets & Manifest to Cloudflare R2
  if (!options.skipUpload) {
    console.log(`\n☁️  Uploading Story Package to Cloudflare R2 (zayn-storybook)...`);
    await pushStory(slug, { force: options.force });
  } else {
    console.log(`⏩ Skipping Cloudflare R2 push (--skip-upload).`);
  }

  // 9. Storage Cleanup: Purge intermediate raw PDF extraction scans
  console.log(`\n🧹 Executing Post-Ingestion Disk Purge...`);
  if (existsSync(rawDir)) {
    await fs.rm(rawDir, { recursive: true, force: true });
    console.log(`✔ Purged intermediate extraction scraps: ${rawDir}`);
  }

  console.log(`✔ Finished processing [${slug}] successfully!`);
}

/**
 * Main automated storybook ingestion engine supporting single, next, and batch processing.
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const requestedSlug = getArg("--book") || (args[0] && !args[0].startsWith("--") ? args[0] : undefined);
  const autoNext = args.includes("--next");
  const allFlag = args.includes("--all");
  const limitArg = getArg("--limit") || getArg("--batch");
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const skipPlates = args.includes("--skip-plates");
  const skipAudio = args.includes("--skip-audio");
  const skipThumbnail = args.includes("--skip-thumbnail");
  const skipUpload = args.includes("--skip-upload");
  const skipQC = args.includes("--skip-qc");

  console.log(`\n======================================================`);
  console.log(`📖 Zayn Storybook Batch & Daily Ingestion Engine`);
  console.log(`======================================================`);

  const poolPath = path.resolve("./config/curated-books.json");
  if (!existsSync(poolPath)) {
    throw new Error(`Curated pool file not found at ${poolPath}`);
  }

  const curatedPool: CuratedBook[] = JSON.parse(await fs.readFile(poolPath, "utf-8"));
  console.log(`📚 Curated Ingestion Pool: ${curatedPool.length} authentic titles available.`);

  const r2Slugs = await getExistingR2Stories();
  console.log(`☁️  Cloudflare R2 Catalog : ${r2Slugs.size} existing stories found.`);

  const budiPath = path.resolve("./config/budi-catalog.json");
  let budiBooks: any[] = [];
  if (existsSync(budiPath)) {
    try {
      const budiCat = JSON.parse(await fs.readFile(budiPath, "utf-8"));
      budiBooks = budiCat.books || [];
    } catch (e) {
      console.warn("BUDI catalog parse warning:", e);
    }
  }

  const booksToProcess: CuratedBook[] = [];

  if (requestedSlug) {
    let found = curatedPool.find((b) => b.slug === requestedSlug);
    if (!found) {
      const b = budiBooks.find((x: any) => x.slug === requestedSlug);
      if (b) {
        found = buildCuratedBookFromBudi(b) as CuratedBook;
        console.log(`   ✔ Resolved "${requestedSlug}" dynamically from BUDI catalog.`);
      }
    }
    if (!found) {
      throw new Error(`Requested book slug "${requestedSlug}" not found in config/curated-books.json or config/budi-catalog.json!`);
    }
    booksToProcess.push(found);
  } else if (allFlag || autoNext || limitArg) {
    let d1Slots: Array<{ date?: string; bookSlug: string; lang: string; format?: string }> = [];
    try {
      const remoteCal = await db.getCalendar();
      d1Slots = remoteCal.map((r) => ({
        date: r.scheduled_date,
        bookSlug: r.book_slug,
        lang: r.lang,
        format: r.format,
      }));
    } catch (err: any) {
      console.warn(`⚠️ D1 calendar lookup skipped (${err.message}); using local Month-1 schedule.`);
    }

    // Merge local DAILY_CALENDAR_MONTH_1 (authoritative for Month-1 dates) + future D1 slots
    const month1Dates = new Set(DAILY_CALENDAR_MONTH_1.map((s) => s.date).filter(Boolean));
    const mergedCalendar = [
      ...DAILY_CALENDAR_MONTH_1.map((s) => ({
        date: s.date,
        bookSlug: s.bookSlug,
        lang: s.lang,
        format: s.format,
      })),
      ...d1Slots.filter((s) => s.date && !month1Dates.has(s.date)),
    ];

    const count = limitArg ? Math.max(1, parseInt(limitArg, 10)) : 1;
    const { queue, uncuratedUpcomingSlugs } = selectUpcomingIngestionQueue({
      calendarSlots: mergedCalendar,
      curatedBooks: curatedPool,
      budiBooks,
      r2Slugs,
      startDateIso: getWibDateOffsetIso(0),
      limit: count,
      includeAll: allFlag,
      force,
    });

    if (uncuratedUpcomingSlugs.length > 0) {
      console.warn(
        `⚠️ Upcoming scheduled books missing from curated/BUDI catalog: ${uncuratedUpcomingSlugs.join(", ")}`
      );
    }

    if (queue.length === 0) {
      console.log(`\n🎉 All upcoming scheduled stories and curated pool items are already ingested in Cloudflare R2!`);
      console.log(`   Buffer is 100% full. Exiting cleanly.`);
      process.exit(0);
    }

    booksToProcess.push(...queue);
  } else {
    console.log(`
Usage:
  npx tsx scripts/ingest-story.ts --next                     Auto-ingest the next 1 un-ingested story from curated pool
  npx tsx scripts/ingest-story.ts --limit <N>                Batch ingest the next N stories (e.g. --limit 5)
  npx tsx scripts/ingest-story.ts --all                      Batch ingest ALL remaining stories in the pool
  npx tsx scripts/ingest-story.ts --book <slug>             Ingest a specific curated story
  npx tsx scripts/ingest-story.ts --limit <N> --dry-run     Preview queue without executing changes

Options:
  --force             Re-download and re-process even if story already exists
  --skip-plates       Skip Swift Apple Vision plate extraction and inpainting
  --skip-audio        Skip Edge TTS voice synthesis
  --skip-thumbnail    Skip Remotion thumbnail rendering
  --skip-upload       Process locally without pushing to Cloudflare R2
  --skip-qc           Skip AI Quality Control and moral validation gate
    `);
    process.exit(0);
  }

  console.log(`\n📋 Target Ingestion Queue (${booksToProcess.length} books):`);
  booksToProcess.forEach((b, idx) => {
    console.log(`   ${idx + 1}. [${b.slug}] "${b.title}" (${b.author})`);
  });

  if (dryRun) {
    console.log(`\n[DRY RUN] All ${booksToProcess.length} books verified in plan. No changes made.`);
    process.exit(0);
  }

  const options: IngestOptions = {
    force,
    dryRun,
    skipPlates,
    skipAudio,
    skipThumbnail,
    skipUpload,
    skipQC,
  };

  const startTime = Date.now();
  let successCount = 0;
  const failures: Array<{ slug: string; error: string }> = [];

  for (let i = 0; i < booksToProcess.length; i++) {
    const book = booksToProcess[i];
    console.log(`\n▶️  [${i + 1}/${booksToProcess.length}] Processing "${book.title}"...`);
    try {
      await processSingleStory(book, options);
      successCount++;
    } catch (err: any) {
      console.error(`\n❌ Error processing [${book.slug}]:`, err.message);
      failures.push({ slug: book.slug, error: err.message });
      try {
        await notifyTelegramFailure({
          bookSlug: book.slug,
          platform: "Batch Story Ingestion",
          error: err,
          dryRun,
        });
      } catch {}
    }
  }

  const totalMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`🎉 BATCH INGESTION RUN FINISHED!`);
  console.log(`   Processed : ${successCount}/${booksToProcess.length} books succeeded`);
  console.log(`   Failed    : ${failures.length} books`);
  console.log(`   Duration  : ${totalMin} minutes`);
  console.log(`   Buffer in R2 is now expanded and ready for broadcast.`);
  console.log(`======================================================\n`);

  if (failures.length > 0) {
    throw new Error(
      `Batch ingestion failed for ${failures.length} book(s): ${failures.map((f) => `${f.slug} (${f.error})`).join("; ")}`
    );
  }
}

if (process.argv[1]?.includes("ingest-story")) {
  main().catch((err) => {
    console.error("\n❌ Error during story ingestion:", err);
    process.exit(1);
  });
}
