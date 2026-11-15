import fs from "fs/promises";
import { existsSync, createReadStream, createWriteStream } from "fs";
import { execSync } from "child_process";
import path from "path";
import os from "os";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { VoiceActorRole, getVoiceActor } from "./voice-actors";
import { resolveFfmpegBinaries } from "../motion/render-motion-stage";

export interface DialogueLine {
  speakerRole: VoiceActorRole;
  speakerCustomName?: string;
  text: string;
}

export interface WordTimingItem {
  word: string;
  start: number;
  end: number;
  speaker: string;
  speakerName: string;
  speakerColor: string;
}

export interface SceneSynthesisInput {
  sceneId: string;
  lang: "id" | "en";
  lines: DialogueLine[];
  outputMp3Path: string;
  outputWordsPath: string;
  /** Optional Edge TTS speaking rate override (e.g. "+0%" or "-6%") for gentler child-friendly pacing. */
  rateOverride?: string;
}

export interface SynthesisResult {
  sceneId: string;
  lang: "id" | "en";
  durationSeconds: number;
  wordCount: number;
  outputMp3Path: string;
  outputWordsPath: string;
}

/**
 * Re-attaches punctuation marks (?, !, ., ,, ...) stripped by Azure TTS word boundary telemetry.
 */
export function attachPunctuation(azureWords: string[], originalText: string): string[] {
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

/**
 * Shifts vocal-tract formants & pitch via asetrate+atempo while preserving duration/word timings.
 */
function applyFormantScale(inputMp3Path: string, outputMp3Path: string, formantScale: number): void {
  const { ffmpeg } = resolveFfmpegBinaries();
  const tempo = (1 / formantScale).toFixed(5);
  const scale = formantScale.toFixed(4);
  const filter = `aresample=24000,asetrate=24000*${scale},atempo=${tempo},aresample=24000`;
  execSync(`${ffmpeg} -y -v error -i "${inputMp3Path}" -af "${filter}" -ar 24000 -ac 1 -b:a 96k "${outputMp3Path}"`);
}

/**
 * Probes exact audio duration in seconds across macOS (`afinfo`) and Linux (`ffprobe`).
 */
function measureAudioDurationSec(audioFilePath: string, fallbackDuration: number): number {
  try {
    if (process.platform === "darwin") {
      const afOut = execSync(`afinfo "${audioFilePath}" 2>/dev/null`).toString();
      const m = afOut.match(/estimated duration:\s*([\d.]+)\s*sec/);
      if (m) return parseFloat(m[1]);
    } else {
      const { ffprobe } = resolveFfmpegBinaries();
      const probeOut = execSync(
        `${ffprobe} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFilePath}" 2>/dev/null`
      )
        .toString()
        .trim();
      const parsedDur = parseFloat(probeOut);
      if (Number.isFinite(parsedDur) && parsedDur > 0) {
        return parsedDur;
      }
    }
  } catch {}
  return fallbackDuration;
}

/**
 * Synthesizes a single dialogue line for a given speaker role with telemetry.
 */
async function synthesizeLine(
  line: DialogueLine,
  lang: "id" | "en",
  tempDir: string,
  lineIndex: number,
  rateOverride?: string
): Promise<{
  audioPath: string;
  durationSec: number;
  words: WordTimingItem[];
}> {
  const actor = getVoiceActor(line.speakerRole);
  const voiceConfig = actor.voice[lang];
  const speakerName = line.speakerCustomName || actor.defaultName[lang];
  const speakerColor = actor.signatureColor;

  const cleanText = line.text
    .replace(/&/g, lang === "en" ? "and" : "dan")
    .replace(/[<>]/g, "")
    .trim();

  const edgeVoiceName = voiceConfig.voiceName;
  const edgePitch = voiceConfig.pitch;
  const edgeFormantScale = voiceConfig.formantScale;

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(edgeVoiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true,
        sentenceBoundaryEnabled: true,
      });

      const lineTempDir = path.join(tempDir, `line_${lineIndex}_att${attempt}`);
      await fs.mkdir(lineTempDir, { recursive: true });

      const { audioFilePath: rawAudioPath, metadataFilePath } = await tts.toFile(lineTempDir, cleanText, {
        pitch: edgePitch,
        rate: rateOverride ?? voiceConfig.rate,
      });

      let audioFilePath = rawAudioPath;
      if (edgeFormantScale && Math.abs(edgeFormantScale - 1) > 0.005) {
        const shapedPath = path.join(lineTempDir, "shaped.mp3");
        applyFormantScale(rawAudioPath, shapedPath, edgeFormantScale);
        audioFilePath = shapedPath;
      }

      const words: WordTimingItem[] = [];
      let durationSec = 2.0;

      if (metadataFilePath && existsSync(metadataFilePath)) {
        try {
          const metaRaw = await fs.readFile(metadataFilePath, "utf-8");
          const parsed = JSON.parse(metaRaw);
          const metaItems: any[] = parsed.Metadata || [];
          const wordItems = metaItems.filter((m) => m.Type === "WordBoundary");
          const rawWords = wordItems.map((m) => m.Data?.text?.Text || "");
          const punctuated = attachPunctuation(rawWords, line.text);

          wordItems.forEach((m, idx) => {
            const rawText = punctuated[idx] || m.Data?.text?.Text || "";
            const offsetTicks = m.Data?.Offset || 0;
            const durTicks = m.Data?.Duration || 0;
            const startSec = parseFloat((offsetTicks / 10_000_000).toFixed(2));
            const endSec = parseFloat(((offsetTicks + durTicks) / 10_000_000).toFixed(2));

            words.push({
              word: rawText,
              start: startSec,
              end: endSec,
              speaker: actor.role,
              speakerName,
              speakerColor,
            });

            if (endSec > durationSec) {
              durationSec = endSec;
            }
          });
        } catch (e) {
          console.warn("Telemetry parse error:", e);
        }
      }

      const actualAudioSec = measureAudioDurationSec(audioFilePath, durationSec + 0.5);
      durationSec = parseFloat((actualAudioSec + 0.8).toFixed(2));

      return {
        audioPath: audioFilePath,
        durationSec,
        words,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < 3) {
        console.warn(`   ⚠️ TTS attempt ${attempt}/3 failed: ${err.message}. Retrying in ${attempt}s...`);
        await new Promise((r) => setTimeout(r, attempt * 1200));
      }
    }
  }

  throw lastError;
}

/**
 * Combines multiple MP3 files sequentially.
 */
async function concatenateMp3Files(inputPaths: string[], outputPath: string): Promise<void> {
  const writeStream = createWriteStream(outputPath);
  for (const p of inputPaths) {
    const data = await fs.readFile(p);
    writeStream.write(data);
  }
  await new Promise((resolve) => writeStream.end(resolve));
}

/**
 * Synthesizes a scene with one or multiple dialogue lines across different voice actors.
 * Automatically aligns word boundaries and merges audio segments.
 */
export async function synthesizeSceneVoice(input: SceneSynthesisInput): Promise<SynthesisResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `tts-scene-${input.sceneId}-`));

  try {
    const segmentResults = [];
    for (let i = 0; i < input.lines.length; i++) {
      const lineRes = await synthesizeLine(input.lines[i], input.lang, tempDir, i, input.rateOverride);
      segmentResults.push(lineRes);
    }

    // Merge word timings with sequential time offsets
    const mergedWords: WordTimingItem[] = [];
    let currentOffset = 0;

    for (const seg of segmentResults) {
      for (const w of seg.words) {
        mergedWords.push({
          ...w,
          start: parseFloat((w.start + currentOffset).toFixed(2)),
          end: parseFloat((w.end + currentOffset).toFixed(2)),
        });
      }
      currentOffset += seg.durationSec;
    }

    const totalDuration = parseFloat(currentOffset.toFixed(2));

    // Ensure output directories exist
    await fs.mkdir(path.dirname(input.outputMp3Path), { recursive: true });
    await fs.mkdir(path.dirname(input.outputWordsPath), { recursive: true });

    if (segmentResults.length === 1) {
      // Single line direct copy
      await fs.copyFile(segmentResults[0].audioPath, input.outputMp3Path);
    } else {
      // Multi-speaker dialogue concatenation
      const audioFiles = segmentResults.map((s) => s.audioPath);
      await concatenateMp3Files(audioFiles, input.outputMp3Path);
    }

    // Write merged word timings
    await fs.writeFile(input.outputWordsPath, JSON.stringify({ words: mergedWords }, null, 2));

    return {
      sceneId: input.sceneId,
      lang: input.lang,
      durationSeconds: totalDuration,
      wordCount: mergedWords.length,
      outputMp3Path: input.outputMp3Path,
      outputWordsPath: input.outputWordsPath,
    };
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
