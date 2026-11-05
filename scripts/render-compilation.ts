import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync, readdirSync, readFileSync } from "fs";

interface CompilationStoryConfig {
  slug: string;
  titleId: string;
  titleEn: string;
  durationSecId: number;
  durationSecEn: number;
  themes: string[];
}

interface CompilationPreset {
  id: string;
  name: string;
  description: string;
  targetAudience: string;
  storySlugs: string[];
  suggestedTitleId: string;
  suggestedTitleEn: string;
}

const THEME_PRESETS: CompilationPreset[] = [
  {
    id: "bedtime",
    name: "🌙 Paket Pengantar Tidur Nyenyak (Bedtime Stories Marathon)",
    description: "Kumpulan dongeng bertempo santai dan menenangkan untuk menemani anak tidur nyenyak.",
    targetAudience: "Balita, anak usia 3-8 tahun sebelum tidur malam (Set-and-Forget untuk orang tua).",
    storySlugs: [
      "gara-gara-kucing",
      "hari-cukur-rambut",
      "jas-hujan-merah",
      "pisang-terlalu-banyak",
      "raja-gemuk-anjing-kurus",
    ],
    suggestedTitleId: "Kumpulan Dongeng Anak Sebelum Tidur (12 Menit Non-Stop) | Cerita Bergambar Penuh Pesan Moral 🌙✨",
    suggestedTitleEn: "Bedtime Stories Marathon for Kids (12 Mins Non-Stop) | Calming Animated Picture Books 🌙✨",
  },
  {
    id: "sringeri",
    name: "🍌 Paket Petualangan Jenaka Pak Srinivas (Sringeri Srinivas & Funny Tales)",
    description: "Kompilasi kisah lucu dan cerdik Pak Sringeri Srinivas menghadapi masalah unik sehari-hari.",
    targetAudience: "Anak-anak usia 4-9 tahun, tontonan keluarga akhir pekan yang penuh gelak tawa.",
    storySlugs: [
      "hari-cukur-rambut",
      "pisang-terlalu-banyak",
      "gara-gara-kucing",
    ],
    suggestedTitleId: "Petualangan Seru Pak Srinivas & Kawan-Kawan! 🍌🤣 | Dongeng Animasi Anak Penuh Tawa",
    suggestedTitleEn: "The Hilarious Adventures of Sringeri Srinivas! 🍌🤣 | Funny Kids Animated Marathon",
  },
  {
    id: "animals",
    name: "🐱 Paket Kisah Binatang Cerdik & Lucu (Funny Animals & Wit)",
    description: "Kompilasi cerita humor penuh keceriaan hewan peliharaan dan binatang rimba.",
    targetAudience: "Pagi hari, akhir pekan, atau tontonan ceria keluarga.",
    storySlugs: [
      "gara-gara-kucing",
      "hari-cukur-rambut",
      "pisang-terlalu-banyak",
      "raja-gemuk-anjing-kurus",
    ],
    suggestedTitleId: "Kompilasi Cerita Binatang Lucu & Bikin Ngakak! 🐱🐶 | Dongeng Animasi Anak Bergambar",
    suggestedTitleEn: "Funny Animal Tales for Kids! 🐱🐶 | Hilarious Animated Bedtime Stories Marathon",
  },
  {
    id: "moral",
    name: "💖 Paket Budi Pekerti & Nilai Kebaikan (Character & Moral Values)",
    description: "Kompilasi fokus pembelajaran karakter: kejujuran, kesabaran, kreativitas, dan saling berbagi.",
    targetAudience: "Orang tua & pendidik PAUD/TK yang mengutamakan pesan moral cerita.",
    storySlugs: [
      "jas-hujan-merah",
      "hari-cukur-rambut",
      "pisang-terlalu-banyak",
      "raja-gemuk-anjing-kurus",
    ],
    suggestedTitleId: "Kumpulan Cerita Budi Pekerti Anak | Belajar Kreatif, Sabar & Saling Berbagi 💖✨",
    suggestedTitleEn: "Character Building Stories for Kids | Learning Creativity, Patience & Sharing 💖✨",
  },
];

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function scanAvailableStories(): CompilationStoryConfig[] {
  const storiesDir = path.resolve("./stories");
  if (!existsSync(storiesDir)) return [];

  const dirs = readdirSync(storiesDir).filter((d) => {
    const full = path.join(storiesDir, d);
    return (
      existsSync(path.join(full, "story.json")) &&
      d !== "branding" &&
      d !== "test-no-image" &&
      d !== "raja-gemuk-remotion"
    );
  });

  const configs: CompilationStoryConfig[] = [];

  for (const slug of dirs) {
    const storyJsonPath = path.join(storiesDir, slug, "story.json");
    try {
      const raw = JSON.parse(readFileSync(storyJsonPath, "utf-8"));
      const scenes = raw.scenes || [];

      let durId = 0;
      let durEn = 0;

      for (const sc of scenes) {
        durId += sc.durationSeconds || 5.0;
        durEn += sc.audio?.en?.durationSeconds || sc.durationSeconds || 5.0;
      }

      configs.push({
        slug,
        titleId: raw.title || slug,
        titleEn: raw.originalTitle || raw.title || slug,
        durationSecId: durId,
        durationSecEn: durEn,
        themes: ["bedtime", "moral", ...(slug.includes("kucing") || slug.includes("anjing") ? ["animals"] : [])],
      });
    } catch (e) {
      // skip invalid
    }
  }

  return configs;
}

function showRecommendations() {
  const available = scanAvailableStories();
  console.log("\n==================================================================");
  console.log("🌟 AUTO-RECOMMENDATION ENGINE: STORYBOOK COMPILATIONS");
  console.log("==================================================================");
  console.log(`Ditemukan ${available.length} buku cerita aktif di katalog:\n`);

  available.forEach((st, i) => {
    console.log(
      `  ${i + 1}. [${st.slug}] "${st.titleId}" (ID: ${formatTime(st.durationSecId)} | EN: ${formatTime(st.durationSecEn)})`
    );
  });

  console.log("\n------------------------------------------------------------------");
  console.log("📦 PAKET KOMPILASI YANG MEMENUHI SYARAT (MIN. 3 BUKU / >8 MENIT):");
  console.log("------------------------------------------------------------------");

  THEME_PRESETS.forEach((preset, pIdx) => {
    const matchedStories = preset.storySlugs
      .map((slug) => available.find((a) => a.slug === slug))
      .filter((s): s is CompilationStoryConfig => Boolean(s));

    const totalSecId = matchedStories.reduce((acc, s) => acc + s.durationSecId, 0) + (matchedStories.length - 1) * 4.0;
    const totalSecEn = matchedStories.reduce((acc, s) => acc + s.durationSecEn, 0) + (matchedStories.length - 1) * 4.0;
    const isMidRollEligible = totalSecId >= 480; // >= 8 minutes

    console.log(`\n${pIdx + 1}. ${preset.name}`);
    console.log(`   🎯 Target   : ${preset.targetAudience}`);
    console.log(`   📚 Cerita   : ${matchedStories.map((m) => m.titleId).join(" ➔ ")}`);
    console.log(`   ⏱️ Durasi ID : ${formatTime(totalSecId)} (${(totalSecId / 60).toFixed(1)} menit) ${isMidRollEligible ? "✔ MID-ROLL ADS AKTIF (>8 MIN)" : "⚠️ <8 Min"}`);
    console.log(`   ⏱️ Durasi EN : ${formatTime(totalSecEn)} (${(totalSecEn / 60).toFixed(1)} menit)`);
    console.log(`   💡 Judul ID : "${preset.suggestedTitleId}"`);
    console.log(`   🚀 Perintah : npm run compilation:render -- --theme ${preset.id} --lang id`);
  });

  console.log("\n==================================================================\n");
}

async function renderCompilation() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  if (args.includes("--recommend") || args.includes("-r")) {
    showRecommendations();
    return;
  }

  const themeArg = getArg("--theme") || "bedtime";
  const langArg = (getArg("--lang") || "id") as "id" | "en";
  const formatArg = getArg("--format") || "landscape";
  const customBooksArg = getArg("--books");
  const dryRun = args.includes("--dry-run");

  const preset = THEME_PRESETS.find((p) => p.id === themeArg) || THEME_PRESETS[0];
  const targetSlugs = customBooksArg
    ? customBooksArg.split(",").map((s) => s.trim().replace(/^stories\//, ""))
    : preset.storySlugs;

  console.log("\n==================================================================");
  console.log("🎬 STORYBOOK COMPILATION & MARATHON RENDERER");
  console.log("==================================================================");
  console.log(`🏷️ Tema Kompilasi : ${preset.name}`);
  console.log(`🌐 Bahasa         : ${langArg.toUpperCase()}`);
  console.log(`📐 Format         : ${formatArg.toUpperCase()}`);
  console.log(`📚 Cerita (${targetSlugs.length})    : ${targetSlugs.join(", ")}`);
  console.log(`🧪 Mode Eksekusi  : ${dryRun ? "DRY RUN (Simulasi & Chapters Only)" : "LIVE VIDEO RENDER"}`);
  console.log("==================================================================\n");

  const items: any[] = [];
  const fps = 30;
  const bumperDurationFrames = 120; // 4s

  // Chapter markers for YouTube description
  const chaptersList: Array<{ title: string; timeSec: number }> = [];
  let currentRunningSec = 0;

  for (let idx = 0; idx < targetSlugs.length; idx++) {
    const slug = targetSlugs[idx];
    const storyDir = path.resolve(`./stories/${slug}`);
    const storyJsonPath = path.join(storyDir, "story.json");

    if (!existsSync(storyJsonPath)) {
      console.warn(`⚠️ Warning: Story ${slug} not found at ${storyJsonPath}, skipping.`);
      continue;
    }

    const rawManifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
    const storyData = JSON.parse(JSON.stringify(rawManifest));

    // Resolve language fields
    if (langArg === "en") {
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

    // Prefix all relative paths with "stories/${slug}/" so bundle(publicDir: ".") resolves correctly
    const prefixAsset = (p?: string) => {
      if (!p) return undefined;
      if (p.startsWith("http") || p.startsWith("stories/")) return p;
      return `stories/${slug}/${p.replace(/^\//, "")}`;
    };

    if (storyData.coverImage) storyData.coverImage = prefixAsset(storyData.coverImage);
    if (storyData.audio?.bgMusicPath) storyData.audio.bgMusicPath = prefixAsset(storyData.audio.bgMusicPath);
    if (storyData.bgMusicPath) storyData.bgMusicPath = prefixAsset(storyData.bgMusicPath);
    if (storyData.audio?.ambientPath) storyData.audio.ambientPath = prefixAsset(storyData.audio.ambientPath);
    if (storyData.ambientPath) storyData.ambientPath = prefixAsset(storyData.ambientPath);

    // Sanitize and prefix scene assets
    for (const scene of storyData.scenes) {
      if (scene.visual?.imagePath) {
        scene.visual.imagePath = prefixAsset(scene.visual.imagePath);
      }
      if (scene.audio?.audioPath) {
        const fullAudio = path.join(storyDir, scene.audio.audioPath);
        if (existsSync(fullAudio)) {
          scene.audio.audioPath = prefixAsset(scene.audio.audioPath);
        } else {
          delete scene.audio.audioPath;
        }
      }
      if (scene.audio?.sfxPath) {
        const fullSfx = path.join(storyDir, scene.audio.sfxPath);
        if (existsSync(fullSfx)) {
          scene.audio.sfxPath = prefixAsset(scene.audio.sfxPath);
        } else {
          delete scene.audio.sfxPath;
        }
      }
    }

    // Load words timing
    const wordsMap: Record<string, any[]> = {};
    for (const scene of storyData.scenes) {
      const wordsRelPath = scene.audio?.wordsPath;
      if (wordsRelPath) {
        const wordsFile = path.join(storyDir, wordsRelPath);
        try {
          const rawW = await fs.readFile(wordsFile, "utf-8");
          const parsedW = JSON.parse(rawW);
          wordsMap[scene.sceneId] = parsedW.words || [];
        } catch {
          wordsMap[scene.sceneId] = [];
        }
      }
    }

    // Record chapter timestamp for this story
    const isFirst = idx === 0;
    const isLast = idx === targetSlugs.length - 1;
    const storyTitle = langArg === "en" ? (storyData.originalTitle || storyData.title) : storyData.title;

    chaptersList.push({
      title: `Cerita ${idx + 1}: ${storyTitle}`,
      timeSec: currentRunningSec,
    });

    // Compute story duration in seconds (excluding outro if not last)
    const activeScenes = storyData.scenes.filter((s: any) => isLast || s.type !== "outro");
    const storyDurSec = activeScenes.reduce((acc: number, s: any) => acc + (s.durationSeconds || 5.0), 0);

    currentRunningSec += storyDurSec;

    // Add bumper duration between stories
    if (!isLast) {
      currentRunningSec += bumperDurationFrames / fps; // +4s
    }

    items.push({
      bookSlug: slug,
      book: storyData,
      wordsMap,
    });
  }

  // Final outro chapter
  chaptersList.push({
    title: langArg === "en" ? "Bedtime Wish & Goodnight" : "Pesan Moral & Ucapan Selamat Tidur",
    timeSec: Math.max(0, currentRunningSec - 15),
  });

  const totalDurationSec = currentRunningSec;
  console.log(`⏱️ Total Durasi Kompilasi: ${formatTime(totalDurationSec)} (${(totalDurationSec / 60).toFixed(1)} menit)`);
  console.log(`📊 Status Mid-Roll: ${totalDurationSec >= 480 ? "✔ MEMENUHI SYARAT (>8 MENIT - MID-ROLL ADS AKTIF!)" : "⚠️ <8 MENIT"}\n`);

  // Generate Chapters & Metadata text file
  const outDir = path.resolve("./exports/compilations");
  await fs.mkdir(outDir, { recursive: true });

  const chaptersText = [
    `==================================================================`,
    `📖 ZAYN STORYBOOK: DESKRIPSI & CHAPTERS YOUTUBE`,
    `==================================================================`,
    `JUDUL:`,
    langArg === "en" ? preset.suggestedTitleEn : preset.suggestedTitleId,
    ``,
    `DESKRIPSI:`,
    langArg === "en"
      ? `Enjoy a magical bedtime story marathon with Zayn Storybook! 4 delightful, calming animated storybooks full of humor, friendship, and positive moral lessons.`
      : `Dengarkan 4 dongeng anak bergambar penuh pesan moral dalam satu video non-stop! Cocok untuk menemani si kecil tidur nyenyak, santai akhir pekan, atau waktu bermain tanpa gangguan.`,
    ``,
    `⏳ TIMESTAMPS / DAFTAR CERITA:`,
    ...chaptersList.map((ch) => `${formatTime(ch.timeSec)} - ${ch.title}`),
    ``,
    `📖 Seri Cerita & Dongeng Anak Bergambar Zayn Storybook`,
    `✨ Nilai yang dipelajari: Kejujuran, kesabaran, keberanian, dan tolong-menolong.`,
    `🔔 Jangan lupa klik SUBSCRIBE untuk mendengarkan dongeng seru baru setiap minggu!`,
    ``,
    `#DongengAnak #CeritaAnak #BedtimeStory #KompilasiDongeng #ZaynStorybook #CeritaBergambar #VideoEdukasiAnak`,
    `==================================================================`,
  ].join("\n");

  const metaFilename = `kompilasi-${preset.id}-${langArg}-metadata.txt`;
  const metaFilePath = path.join(outDir, metaFilename);
  await fs.writeFile(metaFilePath, chaptersText, "utf-8");
  console.log(`📝 File Deskripsi & Chapters tersimpan: ${metaFilePath}\n`);
  console.log("📋 PREVIEW TIMESTAMPS YOUTUBE:");
  chaptersList.forEach((ch) => {
    console.log(`   ${formatTime(ch.timeSec)} - ${ch.title}`);
  });
  console.log("");

  if (dryRun) {
    console.log("🧪 DRY RUN SELESAI! Struktur komposisi dan chapters berhasil divalidasi.");
    return;
  }

  // Live Remotion Render
  console.log("📦 Bundling Remotion video composition dari project root...");
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: path.resolve("."), // Root allows accessing stories/<slug>/assets/...
  });

  const compositionId =
    formatArg === "vertical"
      ? "StorybookCompilation-Vertical"
      : "StorybookCompilation-Landscape";

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: {
      title: langArg === "en" ? preset.suggestedTitleEn : preset.suggestedTitleId,
      theme: preset.id,
      lang: langArg,
      orientation: formatArg,
      bumperDurationFrames,
      items,
    },
  });

  const outputFilename = `kompilasi-${preset.id}-${langArg}-${formatArg === "vertical" ? "9x16" : "16x9"}.mp4`;
  const outputPath = path.join(outDir, outputFilename);

  console.log(`\n🚀 Memulai render video kompilasi: ${compositionId}`);
  console.log(`📁 Target File : ${outputPath}`);
  console.log(`⏳ Total Frame : ${composition.durationInFrames} frames (~${(composition.durationInFrames / fps / 60).toFixed(1)} menit)\n`);

  const startTime = Date.now();

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: {
      title: langArg === "en" ? preset.suggestedTitleEn : preset.suggestedTitleId,
      theme: preset.id,
      lang: langArg,
      orientation: formatArg,
      bumperDurationFrames,
      items,
    },
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      process.stdout.write(`\r⚙️  Rendering Kompilasi: ${pct}% [${"█".repeat(Math.floor(pct / 5))}${"-".repeat(20 - Math.floor(pct / 5))}]`);
    },
  });

  const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\n🎉 RENDER SELESAI dalam ${durationMin} menit!`);
  console.log(`✔ File Video : ${outputPath}`);
  console.log(`✔ Chapters   : ${metaFilePath}\n`);
}

renderCompilation().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
