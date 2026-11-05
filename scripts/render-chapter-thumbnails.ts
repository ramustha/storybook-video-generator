import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

interface CompilationPreset {
  id: string;
  name: string;
  storySlugs: string[];
  suggestedTitleId: string;
  suggestedTitleEn: string;
}

const COMPILATION_PRESETS: Record<string, CompilationPreset> = {
  bedtime: {
    id: "bedtime",
    name: "Dongeng Pengantar Tidur (Tenang & Budi Pekerti)",
    storySlugs: [
      "gara-gara-kucing",
      "hari-cukur-rambut",
      "jas-hujan-merah",
      "pisang-terlalu-banyak",
      "raja-gemuk-anjing-kurus",
      "bulan-dan-topi-biru",
    ],
    suggestedTitleId: "Kumpulan 6 Dongeng Pengantar Tidur Anak Penuh Pesan Moral 🌙💤 | Non-Stop Cerita Bergambar",
    suggestedTitleEn: "6 Calming Bedtime Stories for Kids Marathon 🌙💤 | Heartwarming Animated Children's Book",
  },
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

async function loadBase64(relPath: string): Promise<string> {
  const full = path.resolve(relPath);
  if (!existsSync(full)) return "";
  const buf = await fs.readFile(full);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const themeArg = getArg("--theme") || "bedtime";
  const rawLang = (getArg("--lang") || "all").toLowerCase();
  const preset = COMPILATION_PRESETS[themeArg];

  if (!preset) {
    throw new Error(`Unknown theme preset: "${themeArg}". Available: ${Object.keys(COMPILATION_PRESETS).join(", ")}`);
  }

  const targetLangs: Array<"id" | "en"> =
    rawLang === "all" || rawLang === "both" || rawLang === "id,en"
      ? ["id", "en"]
      : [rawLang as "id" | "en"];

  console.log(`\n======================================================`);
  console.log(`🎨 COMPILATION CHAPTER THUMBNAILS GENERATOR`);
  console.log(`======================================================`);
  console.log(`🏷️ Theme   : ${preset.name} (${preset.id})`);
  console.log(`🌐 Language: ${targetLangs.map((l) => l.toUpperCase()).join(" & ")}`);
  console.log(`📚 Stories : ${preset.storySlugs.join(", ")}\n`);

  console.log(`📦 Fast bundling Remotion compilation...`);
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: path.resolve("./stories/branding"),
  });

  const fps = 30;
  const bumperDurationFrames = 120; // 4 seconds

  for (const lang of targetLangs) {
    const isEn = lang === "en";
    const outDir = path.resolve(`./exports/compilations/chapters/${preset.id}-${lang}`);
    await fs.mkdir(outDir, { recursive: true });

    console.log(`\n------------------------------------------------------`);
    console.log(`🚀 Processing [${lang.toUpperCase()}] Chapter Thumbnails`);
    console.log(`------------------------------------------------------`);

    const items: any[] = [];
    const chapterDetails: Array<{
      index: number;
      slug: string;
      title: string;
      startFrame: number;
      timeSec: number;
      timestampStr: string;
      outputFile: string;
    }> = [];

    let currentFrame = 0;

    for (let idx = 0; idx < preset.storySlugs.length; idx++) {
      const slug = preset.storySlugs[idx];
      const storyDir = path.resolve(`./stories/${slug}`);
      const storyJsonPath = path.join(storyDir, "story.json");

      if (!existsSync(storyJsonPath)) {
        console.warn(`⚠️ Warning: Story ${slug} not found, skipping.`);
        continue;
      }

      const rawManifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
      const storyData = JSON.parse(JSON.stringify(rawManifest));

      if (isEn) {
        storyData.title = rawManifest.originalTitle || rawManifest.title;
        storyData.language = "en-US";
      }

      // Preload cover as Base64 data URI
      const coverBase64 = await loadBase64(`stories/${slug}/assets/cover.png`);
      storyData.coverImage = coverBase64;
      if (storyData.scenes?.[0]?.visual) {
        storyData.scenes[0].visual.imagePath = coverBase64;
      }

      // Strip audio for fast still rendering without audio 404s
      delete storyData.bgMusicPath;
      delete storyData.ambientPath;
      if (storyData.audio) {
        delete storyData.audio.bgMusicPath;
        delete storyData.audio.ambientPath;
      }
      for (const scene of (storyData.scenes || [])) {
        delete scene.audio;
      }

      const isFirst = idx === 0;
      const isLast = idx === preset.storySlugs.length - 1;
      const storyTitle = isEn ? (storyData.originalTitle || storyData.title) : storyData.title;

      // In the compilation:
      // Chapter 1 (idx 0) starts at frame 0.
      // Subsequent chapters (idx > 0) are announced by the ChapterBumper.
      const chapterStartFrame = isFirst ? 0 : currentFrame;
      const chapterTimeSec = chapterStartFrame / fps;

      const numStr = String(idx + 1).padStart(2, "0");
      const outFileName = `chapter-${numStr}-${slug}.png`;

      chapterDetails.push({
        index: idx + 1,
        slug,
        title: storyTitle,
        startFrame: chapterStartFrame,
        timeSec: chapterTimeSec,
        timestampStr: formatTime(chapterTimeSec),
        outputFile: path.join(outDir, outFileName),
      });

      const activeScenes = (storyData.scenes || []).filter((s: any) => isLast || s.type !== "outro");
      const storyFrames = activeScenes.reduce(
        (acc: number, s: any) => acc + Math.ceil((s.durationSeconds || 5.0) * fps),
        0
      );

      currentFrame += storyFrames;

      if (!isLast) {
        currentFrame += bumperDurationFrames;
      }

      items.push({
        bookSlug: slug,
        book: storyData,
        wordsMap: {},
      });
    }

    const inputProps = {
      title: isEn ? preset.suggestedTitleEn : preset.suggestedTitleId,
      theme: preset.id,
      lang,
      orientation: "landscape",
      bumperDurationFrames,
      items,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "StorybookCompilation-Landscape",
      inputProps,
    });

    for (const ch of chapterDetails) {
      console.log(`📸 Rendering Chapter ${ch.index}: "${ch.title}" at ${ch.timestampStr}...`);
      // Sample 15 frames into the chapter / bumper for full visual bloom
      const sampleFrame = ch.startFrame + 15;

      const startTime = Date.now();
      await renderStill({
        composition,
        serveUrl,
        output: ch.outputFile,
        inputProps,
        frame: sampleFrame,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const stat = await fs.stat(ch.outputFile);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
      console.log(`   ✔ Rendered in ${elapsed}s -> ${path.basename(ch.outputFile)} (${sizeMb} MB)`);
    }

    // Save chapters manifest
    const manifestPath = path.join(outDir, "chapters-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(chapterDetails, null, 2), "utf-8");
    console.log(`\n📋 Saved chapters manifest to: ${manifestPath}`);
  }

  console.log(`\n🎉 ALL CHAPTER THUMBNAILS RENDERED SUCCESSFULLY!\n`);
}

main().catch((err) => {
  console.error("❌ Chapter thumbnails generation failed:", err);
  process.exit(1);
});
