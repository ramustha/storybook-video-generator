import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

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
  const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  const languages: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg];

  console.log(`\n📦 Bundling Remotion video composition for "${rawManifest.title}"...`);
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: storyDir,
  });

  const formats: Array<"landscape" | "vertical"> =
    requestedFormat === "both" || requestedFormat === "all"
      ? ["landscape", "vertical"]
      : [requestedFormat as "landscape" | "vertical"];

  for (const lang of languages) {
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

    // Load words json for active language
    const wordsMap: Record<string, any[]> = {};
    for (const scene of storyData.scenes) {
      const wordsRelPath = scene.audio?.wordsPath;
      if (wordsRelPath) {
        const wordsFile = path.join(storyDir, wordsRelPath);
        try {
          const raw = await fs.readFile(wordsFile, "utf-8");
          const parsed = JSON.parse(raw);
          wordsMap[scene.sceneId] = Array.isArray(parsed) ? parsed : (parsed.words || []);
        } catch (err) {
          wordsMap[scene.sceneId] = [];
        }
      }
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

      console.log(
        `🚀 Rendering ${lang.toUpperCase()} ${format.toUpperCase()} video (${width}x${height}, ${composition.durationInFrames} frames @ ${composition.fps}fps)...`
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
        concurrency: 2,
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

  await fs.writeFile(manifestPath, JSON.stringify(rawManifest, null, 2));
  console.log(`\n🎉 All renders completed successfully for "${rawManifest.title}"!`);
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
