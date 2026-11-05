import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { synthesizeSceneVoice, DialogueLine } from "../src/audio/tts-engine";
import { VoiceActorRole, getVoiceActor } from "../src/audio/voice-actors";

interface SceneConfig {
  index: number;
  sceneId: string;
  type: string;
  speakerRole?: VoiceActorRole;
  speakerCustomName?: { id: string; en: string };
  audio?: {
    text?: string;
    speakerRole?: VoiceActorRole;
    audioPath?: string;
    wordsPath?: string;
    durationSeconds?: number;
    lines?: { id: DialogueLine[]; en: DialogueLine[] };
    en?: {
      text?: string;
      speakerRole?: VoiceActorRole;
      audioPath?: string;
      wordsPath?: string;
      durationSeconds?: number;
    };
  };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "bulan-dan-topi-biru";
  const langArg = getArg("--lang") || "all";
  const langs: Array<"id" | "en"> = langArg === "all" ? ["id", "en"] : [langArg as "id" | "en"];

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");

  if (!existsSync(manifestPath)) {
    console.error(`❌ Error: Story manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const scenes: SceneConfig[] = manifest.scenes || [];

  console.log(`\n======================================================`);
  console.log(`🎙️ Universal Multi-Speaker Voice Synthesizer`);
  console.log(`   Book: ${manifest.title} (${bookSlug})`);
  console.log(`   Languages: ${langs.map((l) => l.toUpperCase()).join(", ")}`);
  console.log(`   Scenes to Process: ${scenes.length}`);
  console.log(`======================================================\n`);

  for (const lang of langs) {
    console.log(`\n🚀 Synthesizing [${lang.toUpperCase()}] Tracks...`);

    for (const scene of scenes) {
      const sceneId = scene.sceneId;
      const outMp3 = path.join(storyDir, "assets", lang, `${sceneId}.mp3`);
      const outWords = path.join(storyDir, "assets", lang, `${sceneId}_words.json`);

      let lines: DialogueLine[] = [];

      // Check for structured multi-speaker dialogue lines
      if (scene.audio?.lines && scene.audio.lines[lang]) {
        lines = scene.audio.lines[lang];
      } else {
        // Fallback to single text
        const text = lang === "id" ? scene.audio?.text : scene.audio?.en?.text || scene.audio?.text;
        if (!text) {
          console.warn(`   ⚠️ Scene ${sceneId} has no text for ${lang}, skipping.`);
          continue;
        }

        const role: VoiceActorRole =
          (lang === "id" ? scene.audio?.speakerRole : scene.audio?.en?.speakerRole) ||
          scene.speakerRole ||
          "narrator";

        const customName = scene.speakerCustomName?.[lang];

        lines = [
          {
            speakerRole: role,
            speakerCustomName: customName,
            text,
          },
        ];
      }

      const speakerSummary = lines.map((l) => `${getVoiceActor(l.speakerRole).icon} ${l.speakerCustomName || getVoiceActor(l.speakerRole).defaultName[lang]}`).join(" ➔ ");
      console.log(`   [${sceneId}] (${speakerSummary}): "${lines[0].text.slice(0, 40)}..."`);

      const result = await synthesizeSceneVoice({
        sceneId,
        lang,
        lines,
        outputMp3Path: outMp3,
        outputWordsPath: outWords,
      });

      // Update scene duration in manifest
      if (lang === "id") {
        (scene as any).durationSeconds = result.durationSeconds;
        if (scene.audio) {
          scene.audio.audioPath = `assets/id/${sceneId}.mp3`;
          scene.audio.wordsPath = `assets/id/${sceneId}_words.json`;
          (scene.audio as any).durationSeconds = result.durationSeconds;
        }
      } else {
        if (scene.audio) {
          if (!scene.audio.en) scene.audio.en = {};
          scene.audio.en.audioPath = `assets/en/${sceneId}.mp3`;
          scene.audio.en.wordsPath = `assets/en/${sceneId}_words.json`;
          (scene.audio.en as any).durationSeconds = result.durationSeconds;
        }
      }

      console.log(`      ✔ Generated ${result.durationSeconds}s (${result.wordCount} words)`);
    }
  }

  // Save updated story manifest
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n🎉 Voiceover synthesis completed! Manifest updated at ${manifestPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
