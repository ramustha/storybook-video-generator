import fs from "fs/promises";
import path from "path";
import os from "os";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { alignRawWordsToManuscript } from "../src/subtitles/sync-timings";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  speaker: "guru" | "budi" | "narator";
  speakerName: string;
  speakerColor: string;
}

function assignSpeaker(sceneId: string, word: string, wordIndex: number): {
  speaker: "guru" | "budi" | "narator";
  speakerName: string;
  speakerColor: string;
} {
  if (sceneId === "cover") {
    return { speaker: "narator", speakerName: "Narrator", speakerColor: "#34D399" };
  }

  if (sceneId === "scene_01") {
    // "Why haven't you done your homework? Ma'am, it's all the cat's fault!"
    // First 6 words are Teacher / Ibu Guru
    if (wordIndex < 6) {
      return { speaker: "guru", speakerName: "Teacher", speakerColor: "#38BDF8" };
    } else {
      return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" };
    }
  }

  if (sceneId === "scene_08") {
    // "So your homework was eaten by a dog?!" -> Teacher
    return { speaker: "guru", speakerName: "Teacher", speakerColor: "#38BDF8" };
  }

  // All other narrative lines are Budi
  return { speaker: "budi", speakerName: "Budi", speakerColor: "#FDE047" };
}

const ENGLISH_SCENES = [
  {
    sceneId: "cover",
    text: "It's All the Cat's Fault! Written by Anushka Ravishankar, Illustrated by Priya Kuriyan.",
  },
  {
    sceneId: "scene_01",
    text: "Why haven't you done your homework? Ma'am, it's all the cat's fault!",
  },
  {
    sceneId: "scene_02",
    text: "If the cat hadn't climbed up the tree, I wouldn't have gone to fetch the ladder.",
  },
  {
    sceneId: "scene_03",
    text: "If I hadn't climbed the ladder, I wouldn't have known it was broken. If I hadn't mended the ladder, I wouldn't have woken the baby.",
  },
  {
    sceneId: "scene_04",
    text: "If the baby hadn't woken up, my mother wouldn't have run out of the kitchen. If mother hadn't left the kitchen, the monkey wouldn't have got in.",
  },
  {
    sceneId: "scene_05",
    text: "If the monkey hadn't got in, it wouldn't have eaten all the food. If it hadn't eaten all the food, my father wouldn't have gone to buy bread and chicken curry.",
  },
  {
    sceneId: "scene_06",
    text: "If father hadn't bought bread and curry, the dog wouldn't have followed him home.",
  },
  {
    sceneId: "scene_07",
    text: "If the dog hadn't followed him home, it wouldn't have eaten my homework!",
  },
  {
    sceneId: "scene_08",
    text: "So your homework was eaten by a dog?!",
  },
  {
    sceneId: "scene_09",
    text: "Yes, ma'am! It was all the cat's fault!",
  },
];

async function main() {
  const storyDir = path.resolve("./stories/gara-gara-kucing");
  const enAssetsDir = path.join(storyDir, "assets/en");
  await fs.mkdir(enAssetsDir, { recursive: true });

  const manifestPath = path.join(storyDir, "story.json");
  const story = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-AnaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
    sentenceBoundaryEnabled: true,
  });

  console.log("🎙 Starting English speech synthesis with voice: en-US-AnaNeural...");

  for (let i = 0; i < ENGLISH_SCENES.length; i++) {
    const item = ENGLISH_SCENES[i];
    const audioPath = path.join(enAssetsDir, `${item.sceneId}.mp3`);
    const wordsPath = path.join(enAssetsDir, `${item.sceneId}_words.json`);

    console.log(`\n🎙 Synthesizing [${item.sceneId}]: "${item.text}"`);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-en-"));
    const { audioFilePath, metadataFilePath } = await tts.toFile(tempDir, item.text, {
      pitch: "+10%",
      rate: "+2%",
    });

    await fs.copyFile(audioFilePath, audioPath);

    const words: WordTiming[] = [];
    if (metadataFilePath) {
      try {
        const metadataRaw = await fs.readFile(metadataFilePath, "utf-8");
        const parsed = JSON.parse(metadataRaw);
        const metaItems: any[] = parsed.Metadata || [];

        const wordItems = metaItems.filter((m) => m.Type === "WordBoundary");
        const rawBoundary = wordItems.map((m) => {
          const offsetTicks = m.Data?.Offset || 0;
          const durTicks = m.Data?.Duration || 0;
          return {
            word: m.Data?.text?.Text || "",
            start: Math.round((offsetTicks / 10_000_000) * 1000) / 1000,
            end: Math.round(((offsetTicks + durTicks) / 10_000_000) * 1000) / 1000,
          };
        });
        const aligned = alignRawWordsToManuscript(rawBoundary, item.text);

        aligned.forEach((w, idx) => {
          const speakerMeta = assignSpeaker(item.sceneId, w.word, idx);
          words.push({
            word: w.word,
            start: w.start,
            end: w.end,
            ...speakerMeta,
          });
        });
      } catch (err) {
        console.warn(`Warning parsing metadata for ${item.sceneId}:`, err);
      }
    }

    if (words.length === 0) {
      const rawWords = item.text.split(/\s+/).filter((w) => w.length > 0);
      rawWords.forEach((word, wIdx) => {
        const speakerMeta = assignSpeaker(item.sceneId, word, wIdx);
        words.push({
          word,
          start: parseFloat((wIdx * 0.35).toFixed(2)),
          end: parseFloat(((wIdx + 1) * 0.35).toFixed(2)),
          ...speakerMeta,
        });
      });
    }

    await fs.writeFile(wordsPath, JSON.stringify({ words }, null, 2));
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 5.0;
    const durationSeconds = parseFloat((lastWordEnd + 0.8).toFixed(1));

    // Update story.json scene object with English audio info
    const sceneObj = story.scenes.find((s: any) => s.sceneId === item.sceneId);
    if (sceneObj) {
      if (!sceneObj.audio.en) sceneObj.audio.en = {};
      sceneObj.audio.en.text = item.text;
      sceneObj.audio.en.audioPath = `assets/en/${item.sceneId}.mp3`;
      sceneObj.audio.en.wordsPath = `assets/en/${item.sceneId}_words.json`;
      sceneObj.audio.en.durationSeconds = durationSeconds;
    }

    console.log(`✔ [${item.sceneId}] Done: ${words.length} words, duration: ${durationSeconds}s`);
  }

  await fs.writeFile(manifestPath, JSON.stringify(story, null, 2));
  console.log("\n✔ story.json updated successfully with English tracks!");
}

main().catch(console.error);
