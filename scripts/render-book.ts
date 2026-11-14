import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { db } from "./lib/db";
import { getOptimalRenderOptions } from "./lib/render-options";
import { renderEduMotionVideo, resolveFfmpegBinaries } from "../src/motion/render-motion-stage";

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const requestedFormat = getArg("--format") || "all";
  const langArg = (getArg("--lang") || "all") as "id" | "en" | "all";
  const resolution = getArg("--resolution") || "1080p";

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  let rawManifest = existsSync(manifestPath)
    ? JSON.parse(await fs.readFile(manifestPath, "utf-8"))
    : await db.getStory(bookSlug);
  if (!rawManifest) {
    throw new Error(`Storybook manifest for [${bookSlug}] could not be found in local disk or D1.`);
  }

  const languages: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg];

  const formats: Array<"landscape" | "vertical"> =
    requestedFormat === "both" || requestedFormat === "all"
      ? ["landscape", "vertical"]
      : [requestedFormat as "landscape" | "vertical"];

  let serveUrl: string | null = null;

  for (const lang of languages) {
    const motionStageHtml = path.join(storyDir, "motion", lang, "index.html");
    const isEduMotionTrack = rawManifest.pipelineTrack === "edu-motion" || existsSync(motionStageHtml);

    if (isEduMotionTrack && existsSync(motionStageHtml)) {
      console.log(`\n⚡ [Edu-Motion Track] Detected self-contained Motion Stage for "${rawManifest.title}" [${lang.toUpperCase()}]`);
      const exportLangDir = lang === "en" ? path.join(storyDir, "exports/en") : path.join(storyDir, "exports/id");
      await fs.mkdir(exportLangDir, { recursive: true });

      const enSlug = rawManifest.exports?.en?.landscape?.path
        ? path.basename(rawManifest.exports.en.landscape.path, "-16x9.mp4")
        : (rawManifest.originalTitle
            ? rawManifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            : `${bookSlug}-en`);
      const baseName = lang === "en" ? enSlug : bookSlug;

      for (const format of formats) {
        const is4K = resolution === "4k";
        const outputFileName = `${baseName}-${format === "vertical" ? "9x16" : "16x9"}${is4K ? "-4k" : ""}.mp4`;
        const outputLocation = path.join(exportLangDir, outputFileName);

        const res = await renderEduMotionVideo({
          storyDir,
          bookSlug,
          lang,
          format,
          outputLocation,
          fps: 30,
        });

        if (!rawManifest.exports) rawManifest.exports = {};
        if (!rawManifest.exports[lang]) rawManifest.exports[lang] = {};
        rawManifest.exports[lang][format] = {
          status: "rendered",
          resolution: `${res.width}x${res.height}`,
          renderedAt: new Date().toISOString(),
          path: path.relative(storyDir, outputLocation),
        };
      }
      continue;
    }

    if (!serveUrl) {
      console.log(`\n📦 [Original-Illustration Track] Bundling Remotion video composition for "${rawManifest.title}"...`);
      serveUrl = await bundle({
        entryPoint: path.resolve("./src/remotion/index.ts"),
        publicDir: storyDir,
      });
    }
    // Deep clone story data for active language
    const storyData = JSON.parse(JSON.stringify(rawManifest));
    if (lang === "en") {
      storyData.title = rawManifest.originalTitle || rawManifest.title;
      storyData.language = "en-US";
      for (const scene of storyData.scenes) {
        if (scene.audio?.en) {
          scene.audio.text = scene.audio.en.text;
          scene.audio.audioPath = scene.audio.en.audioPath;
          scene.audio.wordsPath = scene.audio.en.wordsPath;
          if (scene.audio.en.durationSeconds) {
            scene.durationSeconds = scene.audio.en.durationSeconds;
          }
        }
        if (scene.moralHeadlineEn) {
          scene.moralHeadline = scene.moralHeadlineEn;
        }
      }
    }

    // Load words json for active language with robust fallbacks
    const wordsMap: Record<string, any[]> = {};
    for (const scene of storyData.scenes) {
      const candidatePaths = [
        scene.audio?.wordsPath,
        `assets/${lang}/${scene.sceneId}_words.json`,
      ].filter(Boolean) as string[];

      let loadedWords: any[] = [];
      for (const relPath of candidatePaths) {
        const wordsFile = path.join(storyDir, relPath);
        if (existsSync(wordsFile)) {
          try {
            const raw = await fs.readFile(wordsFile, "utf-8");
            const parsed = JSON.parse(raw);
            const wordsList = Array.isArray(parsed) ? parsed : (parsed.words || []);
            if (wordsList.length > 0) {
              loadedWords = wordsList;
              break;
            }
          } catch {
            // Try next candidate
          }
        }
      }

      // If no aligned words file exists, synthesize word timings from narration text so subtitles NEVER disappear
      if (loadedWords.length === 0 && scene.audio?.text) {
        const textWords = scene.audio.text.trim().split(/\s+/).filter(Boolean);
        const duration = scene.durationSeconds || scene.audio?.durationSeconds || 6.0;
        const wordDuration = Math.max(0.15, (duration - 0.5) / Math.max(1, textWords.length));
        loadedWords = textWords.map((word: string, i: number) => ({
          word,
          start: Math.max(0, 0.2 + i * wordDuration),
          end: Math.max(0.1, 0.2 + (i + 1) * wordDuration),
          speaker: "narator",
          speakerName: "Narator",
          speakerColor: "#FDE047",
        }));
      }

      wordsMap[scene.sceneId] = loadedWords;
    }

    // Sanitize missing audio / sfx assets to prevent 404 in Remotion
    for (const scene of storyData.scenes) {
      if (scene.audio?.sfxPath) {
        const fullSfx = path.join(storyDir, scene.audio.sfxPath);
        if (!existsSync(fullSfx)) {
          delete scene.audio.sfxPath;
        }
      }
      if (scene.audio?.audioPath) {
        const fullAudio = path.join(storyDir, scene.audio.audioPath);
        if (!existsSync(fullAudio)) {
          console.warn(`⚠️ Warning: Voiceover audio missing for scene ${scene.sceneId}: ${fullAudio}`);
        } else {
          // Guarantee NO audio truncation and provide natural breathing room (1.2s tail buffer)
          try {
            let audioDur = NaN;
            if (process.platform === "darwin") {
              const out = execSync(`afinfo "${fullAudio}" 2>/dev/null`).toString();
              const m = out.match(/estimated duration:\s*([\d.]+)\s*sec/);
              if (m) audioDur = parseFloat(m[1]);
            } else {
              const { ffprobe } = resolveFfmpegBinaries();
              const out = execSync(
                `${ffprobe} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullAudio}" 2>/dev/null`
              )
                .toString()
                .trim();
              audioDur = parseFloat(out);
            }
            if (Number.isFinite(audioDur) && audioDur > 0) {
              const safeDur = parseFloat((audioDur + 1.2).toFixed(2));
              scene.durationSeconds = Math.max(scene.durationSeconds || 0, safeDur);
              if (scene.audio) scene.audio.durationSeconds = audioDur;
            }
          } catch {
            // fallback gracefully
          }
        }
      }
    }

    const exportLangDir = lang === "en" ? path.join(storyDir, "exports/en") : path.join(storyDir, "exports/id");
    await fs.mkdir(exportLangDir, { recursive: true });

    for (const format of formats) {
      const compositionId =
        format === "vertical"
          ? "StorybookVideoComposition-Vertical"
          : "StorybookVideoComposition-Landscape";

      const inputProps = {
        book: storyData,
        orientation: format,
        wordsMap,
      };

      console.log(`\n🎬 Selecting composition: ${compositionId} [${lang.toUpperCase()}]...`);
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
      });

      const is4K = resolution === "4k";
      const width = is4K ? (format === "vertical" ? 2160 : 3840) : composition.width;
      const height = is4K ? (format === "vertical" ? 3840 : 2160) : composition.height;

      const enSlug = rawManifest.exports?.en?.landscape?.path
        ? path.basename(rawManifest.exports.en.landscape.path, "-16x9.mp4")
        : (rawManifest.originalTitle
            ? rawManifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            : `${bookSlug}-en`);
      const baseName = lang === "en" ? enSlug : bookSlug;
      const outputFileName = `${baseName}-${format === "vertical" ? "9x16" : "16x9"}${is4K ? "-4k" : ""}.mp4`;
      const outputLocation = path.join(exportLangDir, outputFileName);

      const renderOpts = getOptimalRenderOptions();
      console.log(
        `🚀 Rendering ${lang.toUpperCase()} ${format.toUpperCase()} video (${width}x${height}, ${composition.durationInFrames} frames @ ${composition.fps}fps, concurrency=${renderOpts.concurrency}, gl=${renderOpts.chromiumOptions.gl}, img=${renderOpts.imageFormat})...`
      );
      const startTime = Date.now();

      let lastLoggedPercent = -1;
      await renderMedia({
        composition: {
          ...composition,
          width,
          height,
        },
        serveUrl,
        codec: "h264",
        outputLocation,
        inputProps,
        ...renderOpts,
        onProgress: ({ renderedFrames, progress }) => {
          const percent = Math.floor(progress * 100);
          if (percent >= lastLoggedPercent + 10 || percent === 100) {
            lastLoggedPercent = percent;
            console.log(`⏳ [${lang.toUpperCase()}-${format}] Progress: ${percent}% (${renderedFrames}/${composition.durationInFrames} frames)`);
          }
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✔ Video exported in ${elapsed}s: ${outputLocation}`);

      if (!rawManifest.exports) rawManifest.exports = {};
      if (!rawManifest.exports[lang]) rawManifest.exports[lang] = {};
      rawManifest.exports[lang][format] = {
        status: "rendered",
        resolution: `${width}x${height}`,
        renderedAt: new Date().toISOString(),
        path: path.relative(storyDir, outputLocation),
      };
    }
  }

  try {
    await fs.writeFile(manifestPath, JSON.stringify(rawManifest, null, 2));
  } catch {}
  try {
    await db.saveStory(rawManifest);
    console.log(`☁️ Cloudflare D1 story manifest synchronized.`);
  } catch (d1Err: any) {
    console.warn("⚠️ Cloudflare D1 sync warning:", d1Err.message);
  }
  console.log(`\n🎉 All renders completed successfully for "${rawManifest.title}"!`);
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
