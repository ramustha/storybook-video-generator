import fs from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import os from "os";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { VoiceActorRole, getVoiceActor } from "./voice-actors";
import { resolveFfmpegBinaries } from "../motion/render-motion-stage";
import {
  RawBoundaryWord,
  AlignedBoundaryWord,
  alignRawWordsToManuscript,
} from "../subtitles/sync-timings";

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
  /** Trims leading and trailing Edge TTS silence for tight sentence-level assembly (e.g. Edu-Motion). */
  trimSilence?: boolean;
}

export interface SynthesisResult {
  sceneId: string;
  lang: "id" | "en";
  durationSeconds: number;
  wordCount: number;
  outputMp3Path: string;
  outputWordsPath: string;
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

/**
 * Re-attaches manuscript punctuation and merges split hyphenated/contracted sub-words from Azure TTS word boundaries.
 */
export function attachPunctuation(azureWords: string[], originalText: string): string[] {
  const dummyRaw: RawBoundaryWord[] = azureWords.map((word, idx) => ({
    word,
    start: idx * 0.3,
    end: (idx + 1) * 0.3,
  }));
  return alignRawWordsToManuscript(dummyRaw, originalText).map((w) => w.word);
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
 * Probes exact audio duration in seconds via ffprobe with macOS afinfo fallback.
 */
function measureAudioDurationSec(audioFilePath: string, fallbackDuration: number): number {
  try {
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
  } catch {}
  try {
    if (process.platform === "darwin") {
      const afOut = execSync(`afinfo "${audioFilePath}" 2>/dev/null`).toString();
      const m = afOut.match(/estimated duration:\s*([\d.]+)\s*sec/);
      if (m) return parseFloat(m[1]);
    }
  } catch {}
  return fallbackDuration;
}

function detectSpeechBoundsSec(audioFilePath: string): {
  speechStartSec: number;
  speechEndSec: number;
  totalSec: number;
} | null {
  try {
    const { ffmpeg } = resolveFfmpegBinaries();
    const pcmBuf = execSync(
      `${ffmpeg} -v error -i "${audioFilePath}" -f s16le -ac 1 -ar 16000 -`,
      { maxBuffer: 64 * 1024 * 1024 }
    );
    const sampleCount = Math.floor(pcmBuf.byteLength / 2);
    if (sampleCount < 160) return null;

    const samples = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, sampleCount);
    const win = 80;
    const rmsDb: number[] = [];
    let peakDb = -100;

    for (let i = 0; i + win <= sampleCount; i += win) {
      let sumSq = 0;
      for (let j = 0; j < win; j++) {
        const v = samples[i + j] / 32768;
        sumSq += v * v;
      }
      const db = sumSq > 1e-12 ? 20 * Math.log10(Math.sqrt(sumSq / win)) : -100;
      rmsDb.push(db);
      if (db > peakDb) peakDb = db;
    }

    if (peakDb < -55) return null;
    const threshold = Math.max(-42, peakDb - 28);
    const firstIdx = rmsDb.findIndex((d) => d >= threshold);
    let lastIdx = -1;
    for (let i = rmsDb.length - 1; i >= 0; i--) {
      if (rmsDb[i] >= threshold) {
        lastIdx = i;
        break;
      }
    }
    if (firstIdx < 0 || lastIdx < firstIdx) return null;

    const totalSec = sampleCount / 16000;
    const speechStartSec = Math.max(0, firstIdx * 0.005 - 0.01);
    const speechEndSec = Math.min(totalSec, (lastIdx + 1) * 0.005 + 0.015);
    return { speechStartSec, speechEndSec, totalSec };
  } catch {
    return null;
  }
}

function calibrateWordsToSpeechEnvelope(
  words: AlignedBoundaryWord[],
  speechStartSec: number,
  speechEndSec: number,
  totalSec: number
): AlignedBoundaryWord[] {
  if (words.length === 0) return words;
  if (words.length === 1) {
    const s = round3(Math.max(0, speechStartSec));
    const e = round3(Math.min(totalSec, Math.max(s + 0.09, speechEndSec)));
    return [{ word: words[0].word, start: s, end: e }];
  }

  const origStart = words[0].start;
  const origEnd = words[words.length - 1].end;
  const origSpan = origEnd - origStart;
  const targetSpan = speechEndSec - speechStartSec;

  if (origSpan < 0.08 || targetSpan < 0.08) return words;

  const rawShift = speechStartSec - origStart;
  const clampedShift = Math.max(-0.22, Math.min(0.35, rawShift));
  const targetStart = Math.max(0, origStart + clampedShift);

  const rawScale = targetSpan / origSpan;
  const clampedScale = Math.max(0.84, Math.min(1.16, rawScale));

  return words.map((w) => {
    const mappedStart = targetStart + (w.start - origStart) * clampedScale;
    const mappedEnd = targetStart + (w.end - origStart) * clampedScale;
    const safeStart = round3(Math.max(0, Math.min(totalSec - 0.02, mappedStart)));
    const safeEnd = round3(Math.min(totalSec, Math.max(safeStart + 0.03, mappedEnd)));
    return {
      word: w.word,
      start: safeStart,
      end: safeEnd,
    };
  });
}

/**
 * Synthesizes a single dialogue line for a given speaker role with acoustic-calibrated word telemetry.
 */
async function synthesizeLine(
  line: DialogueLine,
  lang: "id" | "en",
  tempDir: string,
  lineIndex: number,
  rateOverride?: string,
  trimSilence?: boolean
): Promise<{
  audioPath: string;
  clipDurationSec: number;
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

      let rawBoundaryWords: RawBoundaryWord[] = [];
      let fallbackEndSec = 1.5;

      if (metadataFilePath && existsSync(metadataFilePath)) {
        try {
          const metaRaw = await fs.readFile(metadataFilePath, "utf-8");
          const parsed = JSON.parse(metaRaw);
          const metaItems: any[] = parsed.Metadata || [];
          const wordItems = metaItems.filter((m) => m.Type === "WordBoundary");
          rawBoundaryWords = wordItems.map((m) => {
            const offsetTicks = m.Data?.Offset || 0;
            const durTicks = m.Data?.Duration || 0;
            const startSec = round3(offsetTicks / 10_000_000);
            const endSec = round3((offsetTicks + durTicks) / 10_000_000);
            if (endSec > fallbackEndSec) fallbackEndSec = endSec;
            return {
              word: m.Data?.text?.Text || "",
              start: startSec,
              end: endSec,
            };
          });
        } catch (e) {
          console.warn("Telemetry parse error:", e);
        }
      }

      let alignedWords = alignRawWordsToManuscript(rawBoundaryWords, line.text);
      let clipDurationSec = measureAudioDurationSec(audioFilePath, fallbackEndSec + 0.5);
      let bounds = detectSpeechBoundsSec(audioFilePath);

      if (trimSilence && bounds) {
        const { ffmpeg } = resolveFfmpegBinaries();
        const trimStart = Math.max(0, bounds.speechStartSec - 0.03);
        const trimEnd = Math.min(bounds.totalSec, Math.max(trimStart + 0.12, bounds.speechEndSec + 0.06));
        const trimmedPath = path.join(lineTempDir, "trimmed.mp3");
        execSync(
          `${ffmpeg} -y -v error -ss ${trimStart.toFixed(3)} -to ${trimEnd.toFixed(3)} -i "${audioFilePath}" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${trimmedPath}"`
        );
        alignedWords = alignedWords.map((w) => ({
          word: w.word,
          start: round3(Math.max(0, w.start - trimStart)),
          end: round3(Math.max(0.04, w.end - trimStart)),
        }));
        audioFilePath = trimmedPath;
        clipDurationSec = measureAudioDurationSec(audioFilePath, trimEnd - trimStart);
        bounds = detectSpeechBoundsSec(audioFilePath);
      }

      if (bounds && alignedWords.length > 0) {
        alignedWords = calibrateWordsToSpeechEnvelope(
          alignedWords,
          bounds.speechStartSec,
          bounds.speechEndSec,
          clipDurationSec
        );
      }

      const words: WordTimingItem[] = alignedWords.map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        speaker: actor.role,
        speakerName,
        speakerColor,
      }));

      return {
        audioPath: audioFilePath,
        clipDurationSec,
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
 * Concatenates multiple MP3 dialogue lines via FFmpeg with a natural inter-speaker breath pause.
 */
async function concatenateMp3FilesWithPause(
  inputPaths: string[],
  outputPath: string,
  tempDir: string,
  pauseSec: number
): Promise<number> {
  const { ffmpeg } = resolveFfmpegBinaries();
  const pauseMp3 = path.join(tempDir, "inter_line_pause.mp3");
  execSync(
    `${ffmpeg} -y -v error -f lavfi -i anullsrc=r=24000:cl=mono -t ${pauseSec.toFixed(3)} -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${pauseMp3}"`
  );
  const actualPauseSec = measureAudioDurationSec(pauseMp3, pauseSec);

  const concatEntries: string[] = [];
  for (let i = 0; i < inputPaths.length; i++) {
    const escaped = inputPaths[i].replace(/'/g, "'\\''");
    concatEntries.push(`file '${escaped}'`);
    if (i < inputPaths.length - 1) {
      const escapedPause = pauseMp3.replace(/'/g, "'\\''");
      concatEntries.push(`file '${escapedPause}'`);
    }
  }

  const listPath = path.join(tempDir, "dialogue_concat.txt");
  await fs.writeFile(listPath, concatEntries.join("\n"), "utf-8");
  execSync(
    `${ffmpeg} -y -v error -f concat -safe 0 -i "${listPath}" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${outputPath}"`
  );
  return actualPauseSec;
}

/**
 * Synthesizes a scene with one or multiple dialogue lines across different voice actors.
 * Automatically aligns word boundaries to acoustic speech bounds and merges audio segments without drift.
 */
export async function synthesizeSceneVoice(input: SceneSynthesisInput): Promise<SynthesisResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `tts-scene-${input.sceneId}-`));

  try {
    const segmentResults = [];
    for (let i = 0; i < input.lines.length; i++) {
      const lineRes = await synthesizeLine(
        input.lines[i],
        input.lang,
        tempDir,
        i,
        input.rateOverride,
        input.trimSilence
      );
      segmentResults.push(lineRes);
    }

    await fs.mkdir(path.dirname(input.outputMp3Path), { recursive: true });
    await fs.mkdir(path.dirname(input.outputWordsPath), { recursive: true });

    let interLinePauseSec = 0;
    if (segmentResults.length === 1) {
      await fs.copyFile(segmentResults[0].audioPath, input.outputMp3Path);
    } else {
      const audioFiles = segmentResults.map((s) => s.audioPath);
      interLinePauseSec = await concatenateMp3FilesWithPause(
        audioFiles,
        input.outputMp3Path,
        tempDir,
        0.26
      );
    }

    const mergedWords: WordTimingItem[] = [];
    let currentOffset = 0;

    for (let i = 0; i < segmentResults.length; i++) {
      const seg = segmentResults[i];
      for (const w of seg.words) {
        mergedWords.push({
          ...w,
          start: round3(w.start + currentOffset),
          end: round3(w.end + currentOffset),
        });
      }
      currentOffset += seg.clipDurationSec + (i < segmentResults.length - 1 ? interLinePauseSec : 0);
    }

    const finalClipDur = measureAudioDurationSec(input.outputMp3Path, currentOffset);
    const totalDuration = input.trimSilence
      ? round3(finalClipDur)
      : parseFloat((finalClipDur + 0.8).toFixed(2));

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
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
