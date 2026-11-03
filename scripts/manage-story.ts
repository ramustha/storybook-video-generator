import fs from "fs/promises";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  speaker: string;
  speakerName: string;
  speakerColor: string;
}

function attachPunctuation(azureWords: string[], originalText: string): string[] {
  const originalTokens = originalText.trim().split(/\s+/);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-zA-Z0-9-]/g, "");

  let tokenIdx = 0;
  return azureWords.map((azWord) => {
    for (let i = tokenIdx; i < originalTokens.length; i++) {
      const orig = originalTokens[i];
      if (clean(orig).includes(clean(azWord)) || clean(azWord).includes(clean(orig))) {
        tokenIdx = i + 1;
        return orig;
      }
    }
    return azWord;
  });
}

function assignSpeaker(bookSlug: string, lang: "id" | "en", sceneId: string, word: string, wordIndex: number, totalWords: number): {
  speaker: string;
  speakerName: string;
  speakerColor: string;
} {
  if (sceneId === "cover") {
    return {
      speaker: "narator",
      speakerName: lang === "en" ? "Narrator" : "Narator",
      speakerColor: "#34D399",
    };
  }

  if (sceneId === "moral" || sceneId.startsWith("moral")) {
    return {
      speaker: "moral",
      speakerName: lang === "en" ? "Moral of Story" : "Pesan Moral",
      speakerColor: "#F59E0B",
    };
  }

  if (sceneId === "outro" || sceneId.startsWith("outro")) {
    return {
      speaker: "outro",
      speakerName: lang === "en" ? "Next Story" : "Rekomendasi Cerita",
      speakerColor: "#38BDF8",
    };
  }

  // --- Hari Cukur Rambut Sringeri Srinivas ---
  if (bookSlug === "hari-cukur-rambut") {
    const isEn = lang === "en";
    const sringeriName = "Sringeri";
    const naratorName = isEn ? "Narrator" : "Narator";

    if (sceneId === "scene_02") {
      return { speaker: "barber", speakerName: isEn ? "Barber" : "Tukang Cukur", speakerColor: "#38BDF8" };
    }
    if (sceneId === "scene_03") {
      return { speaker: "wife", speakerName: isEn ? "Wife" : "Istri", speakerColor: "#EC4899" };
    }
    if (sceneId === "scene_04") {
      return { speaker: "tailor", speakerName: isEn ? "Tailor" : "Penjahit", speakerColor: "#A855F7" };
    }
    if (sceneId === "scene_05") {
      return { speaker: "carpenter", speakerName: isEn ? "Carpenter" : "Tukang Kayu", speakerColor: "#F97316" };
    }
    if (sceneId === "scene_08") {
      return { speaker: "tiger", speakerName: isEn ? "Tiger" : "Harimau", speakerColor: "#EF4444" };
    }
    if (["scene_06", "scene_07", "scene_09", "scene_10"].includes(sceneId)) {
      return { speaker: "sringeri", speakerName: sringeriName, speakerColor: "#FDE047" };
    }
    return { speaker: "narator", speakerName: naratorName, speakerColor: "#34D399" };
  }

  // --- Raja Gemuk, Anjing Kurus ---
  if (bookSlug === "raja-gemuk-anjing-kurus" || bookSlug === "raja-gemuk") {
    const isEn = lang === "en";
    const kingName = isEn ? "The King" : "Sang Raja";
    const naratorName = isEn ? "Narrator" : "Narator";

    if (sceneId === "scene_06") {
      return { speaker: "king", speakerName: kingName, speakerColor: "#F59E0B" };
    }
    return { speaker: "narator", speakerName: naratorName, speakerColor: "#34D399" };
  }

  // --- Gara-Gara Kucing ---
  if (bookSlug === "gara-gara-kucing") {
    if (sceneId === "scene_01") {
      if (wordIndex < (lang === "en" ? 6 : 5)) {
        return { speaker: "guru", speakerName: lang === "en" ? "Teacher" : "Ibu Guru", speakerColor: "#38BDF8" };
      }
      return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" };
    }
    if (sceneId === "scene_08") {
      return { speaker: "guru", speakerName: lang === "en" ? "Teacher" : "Ibu Guru", speakerColor: "#38BDF8" };
    }
    return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" };
  }

  // --- Jas Hujan Merah (The Red Raincoat) ---
  if (bookSlug === "jas-hujan-merah") {
    const isEn = lang === "en";
    const manuName = "Manu";
    const ibuName = isEn ? "Ma" : "Ibu";
    const naratorName = isEn ? "Narrator" : "Narator";

    if (sceneId === "scene_01") {
      if (wordIndex < (isEn ? 10 : 12)) {
        return { speaker: "narator", speakerName: naratorName, speakerColor: "#34D399" };
      }
      if (wordIndex < (isEn ? 17 : 18)) {
        return { speaker: "manu", speakerName: manuName, speakerColor: "#FDE047" };
      }
      return { speaker: "ibu", speakerName: ibuName, speakerColor: "#38BDF8" };
    }

    if (["scene_02", "scene_03", "scene_04", "scene_05", "scene_06"].includes(sceneId)) {
      if (wordIndex < (isEn ? 5 : 5)) {
        return { speaker: "narator", speakerName: naratorName, speakerColor: "#34D399" };
      }
      if (wordIndex < (isEn ? 11 : 11)) {
        return { speaker: "manu", speakerName: manuName, speakerColor: "#FDE047" };
      }
      return { speaker: "ibu", speakerName: ibuName, speakerColor: "#38BDF8" };
    }

    if (sceneId === "scene_07") {
      return { speaker: "narator", speakerName: naratorName, speakerColor: "#34D399" };
    }

    if (sceneId === "scene_08") {
      if (wordIndex < (isEn ? 9 : 8)) {
        return { speaker: "manu", speakerName: manuName, speakerColor: "#FDE047" };
      }
      return { speaker: "ibu", speakerName: ibuName, speakerColor: "#38BDF8" };
    }
  }

  // Generic fallback
  return {
    speaker: "protagonist",
    speakerName: lang === "en" ? "Storyteller" : "Tokoh Utama",
    speakerColor: "#FDE047",
  };
}

async function synthesizeSceneAudio(bookSlug: string, storyDir: string, scene: any, lang: "id" | "en") {
  const isEn = lang === "en";
  const sceneAudioCfg = isEn ? (scene.audio?.en || {}) : (scene.audio?.id || scene.audio || {});

  // High-energy childish, attractive, and funny voiceover tuning:
  // id-ID-GadisNeural at pitch +30% & rate +6% creates an authentic, cute, high-energy child narrator voice!
  // id-ID-ArdiNeural at pitch +26% & rate +8% creates a lively, comedic, mischievous boy/cartoon voice!
  const defaultIdVoice = sceneAudioCfg.voice || (scene.speaker === "boy" || scene.speaker === "king" ? "id-ID-ArdiNeural" : "id-ID-GadisNeural");
  const voice = isEn ? (sceneAudioCfg.voice || "en-US-AnaNeural") : defaultIdVoice;

  const defaultIdPitch = defaultIdVoice.includes("Ardi") ? "+26%" : "+30%";
  const defaultIdRate = defaultIdVoice.includes("Ardi") ? "+8%" : "+6%";

  const pitch = sceneAudioCfg.pitch || (isEn ? "+10%" : defaultIdPitch);
  const rate = sceneAudioCfg.rate || (isEn ? "+3%" : defaultIdRate);

  const text = isEn ? (scene.audio.en?.text || scene.audio.text) : scene.audio.text;
  const audioRelPath = isEn ? (scene.audio.en?.audioPath || `assets/en/${scene.sceneId}.mp3`) : scene.audio.audioPath;
  const wordsRelPath = isEn ? (scene.audio.en?.wordsPath || `assets/en/${scene.sceneId}_words.json`) : scene.audio.wordsPath;

  const audioFullPath = path.join(storyDir, audioRelPath);
  const wordsFullPath = path.join(storyDir, wordsRelPath);

  await fs.mkdir(path.dirname(audioFullPath), { recursive: true });
  await fs.mkdir(path.dirname(wordsFullPath), { recursive: true });

  console.log(`🎙 [${lang.toUpperCase()}] Synthesizing audio for Scene ${scene.index} [${scene.sceneId}]: "${text}"`);

  // Sanitize text for SSML to prevent XML parse errors (e.g. unescaped &)
  const ssmlText = text
    .replace(/&/g, isEn ? "and" : "dan")
    .replace(/</g, "")
    .replace(/>/g, "");

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
    sentenceBoundaryEnabled: true,
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `storybook-tts-${lang}-`));

  const { audioFilePath, metadataFilePath } = await tts.toFile(tempDir, ssmlText, {
    pitch,
    rate,
  });

  await fs.copyFile(audioFilePath, audioFullPath);

  const words: WordTiming[] = [];
  if (metadataFilePath) {
    try {
      const metadataRaw = await fs.readFile(metadataFilePath, "utf-8");
      const parsed = JSON.parse(metadataRaw);
      const metaItems: any[] = parsed.Metadata || [];

      const wordItems = metaItems.filter((item) => item.Type === "WordBoundary");
      const totalWords = wordItems.length;
      const rawWordTexts = wordItems.map((item) => item.Data?.text?.Text || "");
      const punctuatedWords = attachPunctuation(rawWordTexts, text);

      wordItems.forEach((item, idx) => {
        const rawText = punctuatedWords[idx] || item.Data?.text?.Text || "";
        const offsetTicks = item.Data?.Offset || 0;
        const durTicks = item.Data?.Duration || 0;

        const startSec = parseFloat((offsetTicks / 10_000_000).toFixed(2));
        const endSec = parseFloat(((offsetTicks + durTicks) / 10_000_000).toFixed(2));

        const speakerMeta = assignSpeaker(bookSlug, lang, scene.sceneId, rawText, idx, totalWords);

        words.push({
          word: rawText,
          start: startSec,
          end: endSec,
          ...speakerMeta,
        });
      });
    } catch (e) {
      console.warn(`Warning: failed to parse metadata for scene ${scene.sceneId}:`, e);
    }
  }

  if (words.length === 0) {
    const rawWords = text.split(/\s+/).filter((w: string) => w.length > 0);
    rawWords.forEach((word: string, i: number) => {
      const speakerMeta = assignSpeaker(bookSlug, lang, scene.sceneId, word, i, rawWords.length);
      words.push({
        word,
        start: parseFloat((i * 0.4).toFixed(2)),
        end: parseFloat(((i + 1) * 0.4).toFixed(2)),
        ...speakerMeta,
      });
    });
  }

  const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 5.0;
  const duration = parseFloat((lastWordEnd + 0.8).toFixed(1));

  if (isEn) {
    if (!scene.audio.en) scene.audio.en = {};
    scene.audio.en.audioPath = audioRelPath;
    scene.audio.en.wordsPath = wordsRelPath;
    scene.audio.en.durationSeconds = duration;
    scene.audio.en.status = "ready";
  } else {
    scene.audio.audioPath = audioRelPath;
    scene.audio.wordsPath = wordsRelPath;
    scene.durationSeconds = duration;
    scene.audio.status = "ready";
  }

  await fs.writeFile(wordsFullPath, JSON.stringify({ words }, null, 2));
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  console.log(`✔ [${lang.toUpperCase()}] Scene ${scene.index} synchronized (${words.length} words, exact duration: ${duration}s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  const manifestRaw = await fs.readFile(manifestPath, "utf-8");
  const story = JSON.parse(manifestRaw);

  const langArg = (getArg("--lang") || "id") as "id" | "en" | "all";
  const languages: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg];

  // 1. Quota & Status Inspection
  if (args.includes("--status") || args.includes("--check-quota") || args.includes("--quota-status")) {
    console.log(`\n📖 Project Status & Visual Quota Monitor: "${story.title}" (${bookSlug})`);
    let readyVisuals = 0;
    let pendingVisuals = 0;
    const pendingScenes: any[] = [];

    for (const scene of story.scenes) {
      const imgPath = path.join(storyDir, scene.visual.imagePath);
      const imgExists = await fs.access(imgPath).then(() => true).catch(() => false);
      const isPlaceholder = scene.visual.status === "placeholder";
      const isQuotaPending = scene.visual.status === "quota_pending" || (!imgExists && !isPlaceholder);

      if (imgExists && !isPlaceholder) {
        readyVisuals++;
      } else {
        pendingVisuals++;
        pendingScenes.push(scene);
      }

      const audioIdExists = scene.audio?.audioPath
        ? await fs.access(path.join(storyDir, scene.audio.audioPath)).then(() => true).catch(() => false)
        : false;
      const audioEnExists = scene.audio?.en?.audioPath
        ? await fs.access(path.join(storyDir, scene.audio.en.audioPath)).then(() => true).catch(() => false)
        : false;

      const visualBadge = imgExists
        ? (isPlaceholder ? "\x1b[33m[PLACEHOLDER]\x1b[0m" : "\x1b[32m✔ READY\x1b[0m")
        : "\x1b[31m❌ MISSING/QUOTA\x1b[0m";

      console.log(
        `  Scene ${scene.index.toString().padStart(2, "0")} [${scene.sceneId}]: Visual: ${visualBadge} | Audio ID: ${audioIdExists ? "✔" : "❌"} | Audio EN: ${audioEnExists ? "✔" : "❌"} | Duration: ${scene.durationSeconds}s`
      );
    }

    console.log(`\n📊 Visual Readiness: ${readyVisuals}/${story.scenes.length} plates ready (${pendingVisuals} pending)`);

    const totalDurationSeconds = story.scenes.reduce((acc: number, s: any) => acc + (s.durationSeconds || 0), 0);
    let durationTier = "tier3";
    let strategyBadge = "DUAL_HYBRID";
    let strategyDesc = "Standard Storybook (60s–180s) -> Dual-Format (16:9 Long-Form & 9:16 Shorts)";

    if (totalDurationSeconds < 20) {
      durationTier = "tier1";
      strategyBadge = "SHORT_ONLY";
      strategyDesc = "Tier 1: Micro-Story (<20s) -> Short-Form Exclusive (Shorts/TikTok/Reels ONLY). Suppress 16:9 standalone.";
    } else if (totalDurationSeconds < 60) {
      durationTier = "tier2";
      strategyBadge = "SHORT_PRIMARY";
      strategyDesc = "Tier 2: Snackable Mini-Story (20s–60s) -> Short-Primary (Shorts/TikTok/Reels); 16:9 optional compilation.";
    } else if (totalDurationSeconds > 180) {
      durationTier = "tier4";
      strategyBadge = "LONG_PRIMARY";
      strategyDesc = "Tier 4: Extended Storybook (>180s) -> Long-Primary (16:9 Master Video + 30-45s Teaser Hook).";
    }

    console.log(`⏱️ Total Runtime: ${totalDurationSeconds.toFixed(1)}s | Platform Strategy: [${strategyBadge}]`);
    console.log(`   Policy: ${strategyDesc}`);

    if (pendingVisuals > 0) {
      console.log(`\n⚠️ ${pendingVisuals} scenes are waiting for visual plates:`);
      for (const p of pendingScenes) {
        console.log(`   • Scene ${p.index}: "${p.visual.prompt.slice(0, 60)}..."`);
      }
      console.log(`\n💡 To continue the rest of the pipeline in Progressive Draft Mode:`);
      console.log(`   npx tsx scripts/manage-story.ts --book ${bookSlug} --generate-placeholders`);
    }
    return;
  }

  // 2. Generate Storyboard Placeholder Plates (Progressive Draft Mode)
  if (args.includes("--generate-placeholders")) {
    console.log(`\n🎨 Generating Storyboard Placeholder Plates for missing visuals in "${story.title}"...`);
    console.log(`   ⚠️ Progressive Draft Mode: Ensure user confirmation has been obtained before rendering video drafts.`);
    let generated = 0;
    const force = process.argv.includes("--force");

    for (const scene of story.scenes) {
      const imgPath = path.join(storyDir, scene.visual.imagePath);
      const imgExists = await fs.access(imgPath).then(() => true).catch(() => false);

      if (!imgExists || force) {
        const svgContent = `
<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B132B" />
      <stop offset="50%" stop-color="#1C2541" />
      <stop offset="100%" stop-color="#0B132B" />
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)" />
  <rect x="80" y="80" width="1760" height="920" rx="32" fill="none" stroke="#38BDF8" stroke-width="4" stroke-dasharray="16 12" opacity="0.6" />
  
  <rect x="760" y="140" width="400" height="54" rx="27" fill="#F59E0B" />
  <text x="960" y="176" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#000000" text-anchor="middle" letter-spacing="2">
    STORYBOARD PLACEHOLDER
  </text>
  
  <text x="960" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" fill="#FFFFFF" text-anchor="middle">
    SCENE ${scene.index} • [${scene.sceneId}]
  </text>

  <text x="960" y="370" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="600" fill="#94A3B8" text-anchor="middle">
    ⏱️ Duration: ${scene.durationSeconds}s • Visual Quota Standby
  </text>

  <rect x="360" y="440" width="1200" height="340" rx="24" fill="#0B1120" stroke="#38BDF8" stroke-width="2" opacity="0.9" />
  <text x="400" y="495" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" fill="#38BDF8">
    PROMPT SPECIFICATION:
  </text>
  <foreignObject x="400" y="520" width="1120" height="240">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; font-size: 22px; color: #E2E8F0; line-height: 1.6; word-break: break-word;">
      ${scene.visual.prompt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
    </div>
  </foreignObject>

  <text x="960" y="870" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="600" fill="#FBBF24" text-anchor="middle">
    ⚡ Audio, Foley &amp; Subtitles Ready • Final Artwork Slots In Upon Quota Reset
  </text>
</svg>`.trim();

        // Save as SVG plate
        const svgPath = imgPath.replace(/\.png$/, ".svg");
        await fs.mkdir(path.dirname(imgPath), { recursive: true });
        await fs.writeFile(svgPath, svgContent);

        // Convert to valid raster PNG so Chromium image decoder does not throw EncodingError
        try {
          if (os.platform() === "darwin") {
            execSync(`sips -s format png "${svgPath}" -o "${imgPath}"`, { stdio: "ignore" });
          } else {
            await fs.writeFile(imgPath, svgContent);
          }
        } catch {
          await fs.writeFile(imgPath, svgContent);
        }

        scene.visual.status = "placeholder";
        scene.visual.placeholderPath = svgPath;
        generated++;
        console.log(`✔ Created storyboard placeholder for Scene ${scene.index} [${scene.sceneId}]`);
      }
    }

    await fs.writeFile(manifestPath, JSON.stringify(story, null, 2));
    console.log(`\n🎉 Generated ${generated} storyboard placeholder plates. Remotion can now render preview video drafts!`);
    return;
  }

  // 3. Resume Quota List
  if (args.includes("--resume-quota") || args.includes("--list-pending")) {
    console.log(`\n📋 Visual Plates Pending Generation in "${story.title}":`);
    const pending = story.scenes.filter((s: any) => s.visual.status === "quota_pending" || s.visual.status === "placeholder");
    if (pending.length === 0) {
      console.log(`✨ All visual plates are already generated and ready!`);
    } else {
      for (const s of pending) {
        console.log(`\n[Scene ${s.index}] ${s.sceneId} (${s.durationSeconds}s):`);
        console.log(`Target Path: ${s.visual.imagePath}`);
        console.log(`Prompt: "${s.visual.prompt}"`);
      }
    }
    return;
  }

  const sceneIdx = getArg("--scene") ? parseInt(getArg("--scene")!, 10) : undefined;
  const assetType = (getArg("--asset") as "visual" | "audio" | "all") || "all";
  const force = args.includes("--force");

  console.log(`\n⚡ Processing story "${story.title}" (target scene: ${sceneIdx ?? "ALL"}, lang: ${langArg}, asset: ${assetType})...`);

  for (const lang of languages) {
    for (const scene of story.scenes) {
      if (sceneIdx !== undefined && scene.index !== sceneIdx) {
        continue;
      }

      const audioPathRel =
        lang === "en"
          ? (scene.audio?.en?.audioPath || `assets/en/${scene.sceneId}.mp3`)
          : (scene.audio?.audioPath || scene.audio?.id?.audioPath || `assets/id/${scene.sceneId}.mp3`);
      const audioPath = path.join(storyDir, audioPathRel);
      const audioExists = await fs.access(audioPath).then(() => true).catch(() => false);

      if ((assetType === "audio" || assetType === "all") && (!audioExists || force)) {
        await synthesizeSceneAudio(bookSlug, storyDir, scene, lang);
      } else {
        console.log(`⏭ [${lang.toUpperCase()}] Scene ${scene.index} audio already exists, skipping.`);
      }
    }
  }

  await fs.writeFile(manifestPath, JSON.stringify(story, null, 2));
  console.log(`\n✔ story.json updated successfully with exact word timestamps & speaker assignments.`);
}

main().catch(console.error);
