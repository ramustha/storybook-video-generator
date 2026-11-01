import fs from "fs/promises";
import path from "path";
import os from "os";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  speaker: "guru" | "budi" | "narator";
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

function assignSpeaker(sceneId: string, word: string, wordIndex: number, totalWords: number): {
  speaker: "guru" | "budi" | "narator";
  speakerName: string;
  speakerColor: string;
} {
  if (sceneId === "cover") {
    return { speaker: "narator", speakerName: "Narator", speakerColor: "#34D399" };
  }

  if (sceneId === "scene_01") {
    // "Mengapa kamu tidak mengerjakan tugas? Bu, ini semua gara-gara kucing!"
    // First 5 words: Ibu Guru ("Mengapa", "kamu", "tidak", "mengerjakan", "tugas?")
    // Remaining words: Budi ("Bu,", "ini", "semua", "gara-gara", "kucing!")
    if (wordIndex < 5) {
      return { speaker: "guru", speakerName: "Ibu Guru", speakerColor: "#38BDF8" }; // Sky Blue
    } else {
      return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" }; // Golden Yellow
    }
  }

  if (sceneId === "scene_08") {
    // "Oalah, jadi tugas sekolahmu dimakan anjing?!" -> Ibu Guru
    return { speaker: "guru", speakerName: "Ibu Guru", speakerColor: "#38BDF8" };
  }

  // All other narrative lines are Budi recounting what happened
  return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" };
}

async function synthesizeSceneAudio(storyDir: string, scene: any) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata("id-ID-GadisNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
    sentenceBoundaryEnabled: true,
  });

  const audioRelPath = scene.audio.audioPath;
  const wordsRelPath = scene.audio.wordsPath;
  const audioFullPath = path.join(storyDir, audioRelPath);
  const wordsFullPath = path.join(storyDir, wordsRelPath);

  await fs.mkdir(path.dirname(audioFullPath), { recursive: true });

  console.log(`🎙 Synthesizing real audio & word boundaries for Scene ${scene.index} [${scene.sceneId}]: "${scene.audio.text}"`);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-tts-"));
  
  const { audioFilePath, metadataFilePath } = await tts.toFile(tempDir, scene.audio.text, {
    pitch: "+20%",
    rate: "+5%",
  });

  // Copy generated audio file to final path
  await fs.copyFile(audioFilePath, audioFullPath);

  // Parse exact word boundaries from Azure metadata
  const words: WordTiming[] = [];
  if (metadataFilePath) {
    try {
      const metadataRaw = await fs.readFile(metadataFilePath, "utf-8");
      const parsed = JSON.parse(metadataRaw);
      const metaItems: any[] = parsed.Metadata || [];

      const wordItems = metaItems.filter((item) => item.Type === "WordBoundary");
      const totalWords = wordItems.length;
      const rawWordTexts = wordItems.map((item) => item.Data?.text?.Text || "");
      const punctuatedWords = attachPunctuation(rawWordTexts, scene.audio.text);

      wordItems.forEach((item, idx) => {
        const rawText = punctuatedWords[idx] || item.Data?.text?.Text || "";
        const offsetTicks = item.Data?.Offset || 0;
        const durTicks = item.Data?.Duration || 0;

        const startSec = parseFloat((offsetTicks / 10_000_000).toFixed(2));
        const endSec = parseFloat(((offsetTicks + durTicks) / 10_000_000).toFixed(2));

        const speakerMeta = assignSpeaker(scene.sceneId, rawText, idx, totalWords);

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

  // If no words parsed, fallback to word split
  if (words.length === 0) {
    const rawWords = scene.audio.text.split(/\s+/).filter((w: string) => w.length > 0);
    rawWords.forEach((word: string, i: number) => {
      const speakerMeta = assignSpeaker(scene.sceneId, word, i, rawWords.length);
      words.push({
        word,
        start: parseFloat((i * 0.4).toFixed(2)),
        end: parseFloat(((i + 1) * 0.4).toFixed(2)),
        ...speakerMeta,
      });
    });
  }

  // Calculate actual scene duration with comfortable reading tail padding (+0.8s)
  const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 5.0;
  scene.durationSeconds = parseFloat((lastWordEnd + 0.8).toFixed(1));

  // Write exact word timing json
  await fs.writeFile(wordsFullPath, JSON.stringify({ words }, null, 2));
  scene.audio.status = "ready";

  // Clean up temp dir
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  console.log(`✔ Scene ${scene.index} synchronized (${words.length} words, exact duration: ${scene.durationSeconds}s)`);
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

  if (args.includes("--status")) {
    console.log(`\n📖 Project Status: "${story.title}" (${bookSlug})`);
    for (const scene of story.scenes) {
      const imgExists = await fs.access(path.join(storyDir, scene.visual.imagePath)).then(() => true).catch(() => false);
      const audioExists = await fs.access(path.join(storyDir, scene.audio.audioPath)).then(() => true).catch(() => false);
      console.log(`  Scene ${scene.index} [${scene.sceneId}]: Visual: ${imgExists ? "✔" : "❌"} | Audio: ${audioExists ? "✔" : "❌"} | Duration: ${scene.durationSeconds}s`);
    }
    return;
  }

  const sceneIdx = getArg("--scene") ? parseInt(getArg("--scene")!, 10) : undefined;
  const assetType = (getArg("--asset") as "visual" | "audio" | "all") || "all";
  const force = args.includes("--force");

  console.log(`\n⚡ Processing story "${story.title}" (target scene: ${sceneIdx ?? "ALL"}, asset: ${assetType})...`);

  for (const scene of story.scenes) {
    if (sceneIdx !== undefined && scene.index !== sceneIdx) {
      continue;
    }

    const audioPath = path.join(storyDir, scene.audio.audioPath);
    const audioExists = await fs.access(audioPath).then(() => true).catch(() => false);

    if ((assetType === "audio" || assetType === "all") && (!audioExists || force)) {
      await synthesizeSceneAudio(storyDir, scene);
    } else {
      console.log(`⏭ Scene ${scene.index} audio already exists, skipping.`);
    }
  }

  await fs.writeFile(manifestPath, JSON.stringify(story, null, 2));
  console.log(`\n✔ story.json updated successfully with exact word timestamps & speaker assignments.`);
}

main().catch(console.error);
