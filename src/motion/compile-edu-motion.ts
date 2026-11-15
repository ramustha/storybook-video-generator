/**
 * Deterministic Universal Edu-Motion Compiler
 *
 * Compiles any validated `StoryMotionSpec` into:
 *  1. Official cover art asset (`assets/cover.jpg|png`) downloaded from `book.coverUrl`
 *  2. Child-friendly sentence-split Edge TTS audio (`sentencePauseSec` between sentences)
 *  3. Deterministic duration budget enforcement (`<= maxVerticalDurationSec`, default 88.0s)
 *  4. Ambient bed + authentic SFX mix (`vo_combined.mp3`) via bundled FFmpeg
 *  5. Self-contained GSAP + Alt-1 Cinema Focus interactive stage (`motion/{id,en}/index.html`)
 *  6. Bilingual thumbnails (`16x9`, `9x16`, `4x5`) + unified `story.json` manifest
 */

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { chromium } from "playwright";
import { synthesizeSceneVoice, DialogueLine } from "../audio/tts-engine";
import { resolveChromiumExecutable, resolveFfmpegBinaries } from "./render-motion-stage";
import {
  CalloutSpec,
  HostCharacterId,
  HostPoseName,
  HostThemeOverride,
  PacingConfig,
  ProceduralLoopSpec,
  StoryChapterSpec,
  StoryMotionSpec,
  StorySectionKind,
  validateStoryMotionSpec,
} from "./edu-motion-spec";
import { buildHostCircularBadgeSvg } from "./character-registry";
import { buildStageWorldSvg } from "./actor-prefabs";
import { buildOverlayScenesCss, buildOverlayScenesHtml } from "./overlay-scenes";

export interface ShiftedWord {
  word: string;
  start: number;
  end: number;
}

export interface CompiledChapter {
  id: string;
  section: StorySectionKind;
  pose: HostPoseName;
  poseSwitchTo?: HostPoseName;
  poseSwitchDelay?: number;
  callout?: CalloutSpec;
  text: string;
  start: number;
  end: number;
  audioDur: number;
  words: ShiftedWord[];
}

export interface CompiledTimelineData {
  archetype: string;
  characterId: HostCharacterId;
  lang: "id" | "en";
  scriptHash: string;
  totalDuration: number;
  pacing: Required<PacingConfig>;
  tempoScale: number;
  chapters: CompiledChapter[];
}

export const DEFAULT_PACING: Required<PacingConfig> = {
  rateOverride: "+0%",
  leadSilenceSec: 0.3,
  sentencePauseSec: 0.65,
  chapterPauseSec: 0.78,
  introPauseSec: 0.75,
  outroPauseSec: 0.65,
  maxVerticalDurationSec: 88.0,
};

export function resolvePacingConfig(pacing?: PacingConfig): Required<PacingConfig> {
  return {
    rateOverride: pacing?.rateOverride ?? DEFAULT_PACING.rateOverride,
    leadSilenceSec: pacing?.leadSilenceSec ?? DEFAULT_PACING.leadSilenceSec,
    sentencePauseSec: pacing?.sentencePauseSec ?? DEFAULT_PACING.sentencePauseSec,
    chapterPauseSec: pacing?.chapterPauseSec ?? DEFAULT_PACING.chapterPauseSec,
    introPauseSec: pacing?.introPauseSec ?? DEFAULT_PACING.introPauseSec,
    outroPauseSec: pacing?.outroPauseSec ?? DEFAULT_PACING.outroPauseSec,
    maxVerticalDurationSec: pacing?.maxVerticalDurationSec ?? DEFAULT_PACING.maxVerticalDurationSec,
  };
}

/** Splits chapter narration into child-friendly sentences while keeping punctuation intact. */
export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const rawParts = normalized.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length < 3 && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${trimmed}`;
    } else {
      out.push(trimmed);
    }
  }
  return out.length > 0 ? out : [normalized];
}

export interface DurationSegmentInput {
  speechDurSec: number;
  pauseAfterSec: number;
  minPauseAfterSec: number;
}

export interface DurationBudgetPlan {
  naturalTotalSec: number;
  fittedTotalSec: number;
  speechTempo: number;
  segments: Array<{
    targetSpeechDurSec: number;
    fittedPauseAfterSec: number;
  }>;
}

/**
 * Deterministically solves sentence pause compression + gentle speech tempo scaling
 * so every story satisfies the vertical Shorts/Reels ceiling (`<= maxDurationSec`).
 */
export function solveDurationBudget(
  leadSilenceSec: number,
  segments: DurationSegmentInput[],
  maxDurationSec: number
): DurationBudgetPlan {
  const totalSpeech = segments.reduce((sum, s) => sum + s.speechDurSec, 0);
  const totalPause = segments.reduce((sum, s) => sum + s.pauseAfterSec, 0);
  const naturalTotalSec = Number((leadSilenceSec + totalSpeech + totalPause).toFixed(3));

  if (naturalTotalSec <= maxDurationSec) {
    return {
      naturalTotalSec,
      fittedTotalSec: naturalTotalSec,
      speechTempo: 1.0,
      segments: segments.map((s) => ({
        targetSpeechDurSec: s.speechDurSec,
        fittedPauseAfterSec: Number(s.pauseAfterSec.toFixed(3)),
      })),
    };
  }

  // Step 1: Compress breathing pauses softly before accelerating narration speed
  const targetCeiling = Math.max(leadSilenceSec + 1.0, maxDurationSec - 0.12);
  const totalMinPause = segments.reduce((sum, s) => sum + Math.min(s.pauseAfterSec, s.minPauseAfterSec), 0);
  const availableAfterSpeech = Math.max(totalMinPause, targetCeiling - leadSilenceSec - totalSpeech);
  const reduciblePause = Math.max(0.0001, totalPause - totalMinPause);
  const neededPause = Math.max(totalMinPause, Math.min(totalPause, availableAfterSpeech));
  const pauseKeepRatio = Math.max(0, Math.min(1, (neededPause - totalMinPause) / reduciblePause));

  const compressedPauses = segments.map((s) => {
    const floorP = Math.min(s.pauseAfterSec, s.minPauseAfterSec);
    return Math.floor((floorP + (s.pauseAfterSec - floorP) * pauseKeepRatio) * 1000) / 1000;
  });
  const compressedPauseSum = compressedPauses.reduce((a, b) => a + b, 0);

  // Step 2: Only if speech + minimum pauses still exceeds ceiling, apply bounded atempo
  const speechBudget = Math.max(1.0, targetCeiling - leadSilenceSec - compressedPauseSum);
  let speechTempo = 1.0;
  if (totalSpeech > speechBudget) {
    speechTempo = Math.min(1.28, Number((totalSpeech / speechBudget).toFixed(4)));
  }

  const fittedTotalSec = Number((leadSilenceSec + totalSpeech / speechTempo + compressedPauseSum).toFixed(3));
  return {
    naturalTotalSec,
    fittedTotalSec,
    speechTempo,
    segments: segments.map((s, idx) => ({
      targetSpeechDurSec: Number((s.speechDurSec / speechTempo).toFixed(3)),
      fittedPauseAfterSec: compressedPauses[idx],
    })),
  };
}

function probeDurationSec(ffprobe: string, filePath: string): number {
  const out = execSync(
    `${ffprobe} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  )
    .toString()
    .trim();
  const v = parseFloat(out);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`Invalid duration probed from ${filePath}: "${out}"`);
  }
  return v;
}

async function ensureSilenceMp3(ffmpeg: string, outDir: string, durSec: number): Promise<string> {
  const ms = Math.max(40, Math.round(durSec * 1000));
  const p = path.join(outDir, `silence_${ms}ms.mp3`);
  if (!existsSync(p)) {
    execSync(
      `${ffmpeg} -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${(ms / 1000).toFixed(3)} -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${p}"`,
      { stdio: "pipe" }
    );
  }
  return p;
}

function resolveSfxPath(storyDir: string, sfxName?: string): string | null {
  if (!sfxName) return null;
  const candidates = [
    path.join(storyDir, sfxName),
    path.join(storyDir, "assets/sfx", sfxName),
    path.resolve("templates/sfx", sfxName),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function mixVoiceAmbientAndSfx(options: {
  ffmpeg: string;
  storyDir: string;
  voiceOnlyPath: string;
  voCombinedPath: string;
  totalDuration: number;
  specChapters: StoryChapterSpec[];
  compiledChapters: CompiledChapter[];
}): void {
  const { ffmpeg, storyDir, voiceOnlyPath, voCombinedPath, totalDuration, specChapters, compiledChapters } = options;
  const dur = totalDuration.toFixed(2);

  const extraInputs: string[] = [];
  const filterChains: string[] = [
    `[0:a]volume=1.0[v]`,
    `sine=f=130.81:sample_rate=24000:duration=${dur},volume=0.024[p1]`,
    `sine=f=196.00:sample_rate=24000:duration=${dur},volume=0.016[p2]`,
  ];
  const mixLabels: string[] = ["[v]", "[p1]", "[p2]"];

  // Layer either authentic chapter SFX (.m4a) OR subtle sine transition chime
  compiledChapters.forEach((ch, idx) => {
    const specCh = specChapters[idx];
    const sfxFile = resolveSfxPath(storyDir, specCh?.sfx);
    const delayMs = Math.max(0, Math.round(ch.start * 1000));

    if (sfxFile) {
      const inputIdx = 1 + extraInputs.length;
      extraInputs.push(`-i "${sfxFile}"`);
      const vol = specCh.sfxVolume ?? 0.42;
      const lbl = `[sfx${idx}]`;
      filterChains.push(`[${inputIdx}:a]volume=${vol},adelay=${delayMs}|${delayMs}${lbl}`);
      mixLabels.push(lbl);
    } else if (idx > 0) {
      const freq = idx % 2 === 0 ? 587.33 : 659.25;
      const lbl = `[c${idx}]`;
      filterChains.push(`sine=f=${freq}:sample_rate=24000:duration=0.20,volume=0.04,adelay=${delayMs}|${delayMs}${lbl}`);
      mixLabels.push(lbl);
    }
  });

  filterChains.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[out]`
  );

  const inputsArg = [`-i "${voiceOnlyPath}"`, ...extraInputs].join(" ");
  execSync(
    `${ffmpeg} -y ${inputsArg} -filter_complex "${filterChains.join(";")}" -map "[out]" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${voCombinedPath}"`,
    { stdio: "pipe" }
  );
}

/** Downloads official front cover art (`coverUrl`) once into `stories/<slug>/assets/` for Intro display. */
async function ensureOfficialCoverAsset(storyDir: string, coverUrl?: string): Promise<string | undefined> {
  const assetsDir = path.join(storyDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  for (const existing of ["cover.png", "cover.jpg", "cover.webp"]) {
    const candidate = path.join(assetsDir, existing);
    if (existsSync(candidate)) return existing;
  }

  if (!coverUrl) return undefined;
  const extMatch = coverUrl.match(/\.(png|jpg|jpeg|webp)(?:\?|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
  const targetName = `cover.${ext}`;
  const targetPath = path.join(assetsDir, targetName);

  console.log(`   🖼️ Downloading official BUDI front cover: ${coverUrl}`);
  const resp = await fetch(coverUrl);
  if (!resp.ok) {
    throw new Error(`Failed downloading official coverUrl (${resp.status}): ${coverUrl}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(targetPath, buf);
  return targetName;
}

async function synthesizeUniversalChapters(
  spec: StoryMotionSpec,
  storyDir: string,
  lang: "id" | "en",
  outDir: string
): Promise<CompiledTimelineData> {
  await fs.mkdir(outDir, { recursive: true });
  const { ffmpeg, ffprobe } = resolveFfmpegBinaries();
  const pacing = resolvePacingConfig(spec.pacing);

  const timelinePath = path.join(outDir, "timeline.json");
  const voCombinedPath = path.join(outDir, "vo_combined.mp3");
  const scriptHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        lang,
        pacing,
        speakerRole: spec.narrator.speakerRole || "narrator",
        chapters: spec.chapters.map((c) => ({
          id: c.id,
          section: c.section,
          text: c.text[lang],
          sfx: c.sfx || "",
          sfxVolume: c.sfxVolume ?? null,
        })),
      })
    )
    .digest("hex")
    .slice(0, 14);

  if (existsSync(timelinePath) && existsSync(voCombinedPath)) {
    const existing: CompiledTimelineData = JSON.parse(await fs.readFile(timelinePath, "utf-8"));
    if (existing.scriptHash === scriptHash && existing.chapters.length === spec.chapters.length) {
      existing.characterId = spec.narrator.characterId;
      existing.chapters = existing.chapters.map((ec, idx) => ({
        ...ec,
        section: spec.chapters[idx].section,
        pose: spec.chapters[idx].pose,
        poseSwitchTo: spec.chapters[idx].poseSwitchTo,
        poseSwitchDelay: spec.chapters[idx].poseSwitchDelay,
        callout: spec.chapters[idx].callout?.[lang],
      }));
      await fs.writeFile(timelinePath, JSON.stringify(existing, null, 2), "utf-8");
      console.log(`   ✔ Reusing synthesized VO & syncing visual metadata [${lang.toUpperCase()}] (${scriptHash})`);
      return existing;
    }
  }

  interface RawSentenceSeg {
    chapterIdx: number;
    sentenceIdx: number;
    isLastInChapter: boolean;
    rawMp3Path: string;
    finalMp3Path: string;
    rawDurSec: number;
    finalDurSec: number;
    words: ShiftedWord[];
    pauseAfterSec: number;
    minPauseAfterSec: number;
  }

  const rawSegments: RawSentenceSeg[] = [];
  const speakerRole = spec.narrator.speakerRole || "narrator";

  for (let cIdx = 0; cIdx < spec.chapters.length; cIdx++) {
    const ch = spec.chapters[cIdx];
    const sentences = splitIntoSentences(ch.text[lang]);
    console.log(
      `   🎙️ Synthesizing [${lang.toUpperCase()}] ${ch.id} (${ch.section}, ${sentences.length} sentence${sentences.length > 1 ? "s" : ""})...`
    );

    for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
      const sentenceText = sentences[sIdx];
      const isLast = sIdx === sentences.length - 1;
      const baseId = `${ch.id}_s${sIdx + 1}`;
      const rawMp3Path = path.join(outDir, `${baseId}.mp3`);
      const wordsPath = path.join(outDir, `${baseId}_words.json`);
      const lines: DialogueLine[] = [{ speakerRole, text: sentenceText }];

      await synthesizeSceneVoice({
        sceneId: baseId,
        lang,
        lines,
        outputMp3Path: rawMp3Path,
        outputWordsPath: wordsPath,
        rateOverride: pacing.rateOverride,
      });

      const rawDurSec = probeDurationSec(ffprobe, rawMp3Path);
      const parsedWords = JSON.parse(await fs.readFile(wordsPath, "utf-8"));
      const wordArr = Array.isArray(parsedWords) ? parsedWords : parsedWords.words || [];
      const words: ShiftedWord[] = wordArr.map((w: any) => ({
        word: String(w.word),
        start: Number(w.start),
        end: Number(w.end),
      }));

      let pauseAfterSec = pacing.sentencePauseSec;
      let minPauseAfterSec = Math.min(pacing.sentencePauseSec, 0.34);
      if (isLast) {
        if (ch.section === "cover") {
          pauseAfterSec = pacing.introPauseSec;
          minPauseAfterSec = Math.min(pacing.introPauseSec, 0.45);
        } else if (ch.section === "outro") {
          pauseAfterSec = pacing.outroPauseSec;
          minPauseAfterSec = Math.min(pacing.outroPauseSec, 0.35);
        } else {
          pauseAfterSec = pacing.chapterPauseSec;
          minPauseAfterSec = Math.min(pacing.chapterPauseSec, 0.42);
        }
      }

      rawSegments.push({
        chapterIdx: cIdx,
        sentenceIdx: sIdx,
        isLastInChapter: isLast,
        rawMp3Path,
        finalMp3Path: rawMp3Path,
        rawDurSec,
        finalDurSec: rawDurSec,
        words,
        pauseAfterSec,
        minPauseAfterSec,
      });
    }
  }

  // Run deterministic platform duration guardrail
  const budgetPlan = solveDurationBudget(
    pacing.leadSilenceSec,
    rawSegments.map((s) => ({
      speechDurSec: s.rawDurSec,
      pauseAfterSec: s.pauseAfterSec,
      minPauseAfterSec: s.minPauseAfterSec,
    })),
    pacing.maxVerticalDurationSec
  );

  console.log(
    `   ⏱️ Pacing Guardrail [${lang.toUpperCase()}]: natural=${budgetPlan.naturalTotalSec.toFixed(2)}s, fitted=${budgetPlan.fittedTotalSec.toFixed(2)}s, cap=${pacing.maxVerticalDurationSec}s, tempo=${budgetPlan.speechTempo.toFixed(3)}x`
  );

  // Apply gentle atempo per sentence only when needed, preserving crisp pauses and word sync
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (budgetPlan.speechTempo > 1.005) {
      const adjPath = seg.rawMp3Path.replace(/\.mp3$/, "_adj.mp3");
      execSync(
        `${ffmpeg} -y -i "${seg.rawMp3Path}" -af "atempo=${budgetPlan.speechTempo.toFixed(4)}" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${adjPath}"`,
        { stdio: "pipe" }
      );
      const adjDur = probeDurationSec(ffprobe, adjPath);
      const actualScale = seg.rawDurSec / adjDur;
      seg.finalMp3Path = adjPath;
      seg.finalDurSec = adjDur;
      seg.words = seg.words.map((w) => ({
        word: w.word,
        start: Number((w.start / actualScale).toFixed(3)),
        end: Number((w.end / actualScale).toFixed(3)),
      }));
    }
  }

  // Assemble lead + sentence + exact fitted pause concatenation list
  const leadFile = await ensureSilenceMp3(ffmpeg, outDir, pacing.leadSilenceSec);
  const concatEntries: string[] = [`file '${leadFile}'`];
  let cursorSec = probeDurationSec(ffprobe, leadFile);

  const chapterWords: Map<number, ShiftedWord[]> = new Map();
  const chapterStarts: Map<number, number> = new Map();
  const chapterEnds: Map<number, number> = new Map();
  const chapterAudioDurs: Map<number, number> = new Map();

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    const fittedPause = budgetPlan.segments[i].fittedPauseAfterSec;
    const pauseFile = await ensureSilenceMp3(ffmpeg, outDir, fittedPause);
    const pauseDur = probeDurationSec(ffprobe, pauseFile);

    if (!chapterStarts.has(seg.chapterIdx)) {
      chapterStarts.set(seg.chapterIdx, Number(cursorSec.toFixed(3)));
    }
    const existingWords = chapterWords.get(seg.chapterIdx) || [];
    for (const w of seg.words) {
      existingWords.push({
        word: w.word,
        start: Number((cursorSec + w.start).toFixed(3)),
        end: Number((cursorSec + w.end).toFixed(3)),
      });
    }
    chapterWords.set(seg.chapterIdx, existingWords);
    chapterAudioDurs.set(
      seg.chapterIdx,
      Number(((chapterAudioDurs.get(seg.chapterIdx) || 0) + seg.finalDurSec).toFixed(3))
    );

    concatEntries.push(`file '${seg.finalMp3Path}'`);
    concatEntries.push(`file '${pauseFile}'`);
    cursorSec += seg.finalDurSec + pauseDur;
    chapterEnds.set(seg.chapterIdx, Number(cursorSec.toFixed(3)));
  }

  const concatTxt = path.join(outDir, "concat.txt");
  const voiceOnlyPath = path.join(outDir, "vo_voice_only.mp3");
  await fs.writeFile(concatTxt, concatEntries.join("\n"), "utf-8");
  execSync(`${ffmpeg} -y -f concat -safe 0 -i "${concatTxt}" -ar 24000 -ac 1 -c:a libmp3lame -b:a 96k "${voiceOnlyPath}"`, {
    stdio: "pipe",
  });

  const exactVoiceDur = probeDurationSec(ffprobe, voiceOnlyPath);
  const compiledChapters: CompiledChapter[] = spec.chapters.map((ch, idx) => ({
    id: ch.id,
    section: ch.section,
    pose: ch.pose,
    poseSwitchTo: ch.poseSwitchTo,
    poseSwitchDelay: ch.poseSwitchDelay,
    callout: ch.callout?.[lang],
    text: ch.text[lang],
    start: chapterStarts.get(idx) ?? 0,
    end: chapterEnds.get(idx) ?? exactVoiceDur,
    audioDur: chapterAudioDurs.get(idx) ?? 0,
    words: chapterWords.get(idx) || [],
  }));

  mixVoiceAmbientAndSfx({
    ffmpeg,
    storyDir,
    voiceOnlyPath,
    voCombinedPath,
    totalDuration: exactVoiceDur,
    specChapters: spec.chapters,
    compiledChapters,
  });

  const finalDur = probeDurationSec(ffprobe, voCombinedPath);
  const timelineData: CompiledTimelineData = {
    archetype: "alt1-universal-edu-motion",
    characterId: spec.narrator.characterId,
    lang,
    scriptHash,
    totalDuration: Number(finalDur.toFixed(3)),
    pacing,
    tempoScale: budgetPlan.speechTempo,
    chapters: compiledChapters,
  };

  await fs.writeFile(timelinePath, JSON.stringify(timelineData, null, 2), "utf-8");
  return timelineData;
}

function buildOnDemandCalloutSvg(): string {
  return `<g id="ondemand-callout" opacity="0">
    <circle id="callout-pin-ring" cx="355" cy="565" r="17" fill="none" stroke="#00F5D4" stroke-width="2.8" opacity="0.68"/>
    <circle id="callout-pin-dot" cx="355" cy="565" r="8" fill="#00F5D4" stroke="#021024" stroke-width="3"/>
    <polyline id="callout-line" points="355,565 355,340 385,340" fill="none" stroke="#00F5D4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <g id="callout-card" transform="translate(295, 260)">
      <rect id="callout-box" x="0" y="0" width="416" height="106" rx="22" fill="rgba(10, 22, 48, 0.94)" stroke="#00F5D4" stroke-width="3.5"/>
      <circle cx="52" cy="53" r="28" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="8"/>
      <circle id="callout-ring-arc" cx="52" cy="53" r="28" fill="none" stroke="#FFE600" stroke-width="8" stroke-dasharray="142 180" stroke-linecap="round" transform="rotate(-90 52 53)"/>
      <text id="callout-ring-num" x="52" y="60" text-anchor="middle" fill="#FFE600" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="800">45</text>
      <text id="callout-kicker" x="96" y="40" fill="#7DD3FC" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="800" letter-spacing="1.2">INFO</text>
      <text id="callout-title" x="96" y="74" fill="#FFFFFF" font-family="'Fredoka', sans-serif" font-size="24.5" font-weight="700">FACT</text>
    </g>
  </g>`;
}

function buildAlt1StageCss(options: {
  portraitBg: string;
  landscapeBg: string;
  bubbleBorderColor?: string;
}): string {
  const border = options.bubbleBorderColor || "#00F5D4";
  return `
  :root {
    --cyan: ${border};
    --yellow: #FFE600;
    --bubble-bg: rgba(10, 22, 48, 0.95);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100vw; height: 100vh;
    overflow: hidden;
    background: #020817;
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  }
  #stage {
    position: absolute; left: 50%; top: 50%;
    width: 1080px; height: 1920px;
    background: ${options.portraitBg};
    overflow: hidden;
    transform-origin: 50% 50%;
  }
  body.landscape #stage {
    width: 1920px; height: 1080px;
    background: ${options.landscapeBg};
  }
  #zone-stage {
    position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10;
  }
  #stage-svg { width: 100%; height: 100%; display: block; }

  #narrator-dock {
    position: absolute;
    left: 36px; right: 148px; bottom: 420px;
    display: flex; align-items: center; gap: 20px;
    z-index: 40; pointer-events: none;
  }
  body.landscape #narrator-dock {
    left: 50%; right: auto; bottom: 28px;
    transform: translateX(-50%);
    width: 1360px; gap: 28px;
  }
  #host-badge {
    width: 222px; height: 222px; flex-shrink: 0;
  }
  body.landscape #host-badge {
    width: 232px; height: 232px;
  }
  #speech-bubble {
    position: relative; flex: 1;
    background: var(--bubble-bg);
    border: 3.5px solid var(--cyan);
    border-radius: 28px;
    padding: 20px 26px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.62);
    min-height: 112px;
    display: flex; flex-direction: column; justify-content: center;
  }
  body.landscape #speech-bubble { padding: 22px 34px; min-height: 120px; }
  #bubble-tail {
    position: absolute; left: -34px; top: 38px; width: 38px; height: 34px;
  }
  .sub-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 3px; }
  .sub-word {
    display: inline-block; padding: 2px 6px; border-radius: 9px;
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    font-size: 34px; font-weight: 800; line-height: 1.24; color: #F8FAFC;
  }
  body.landscape .sub-word { font-size: 38px; padding: 2px 8px; }
  .sub-word.active {
    background: var(--yellow); color: #03045E; transform: scale(1.05);
  }
  ${buildOverlayScenesCss()}`;
}

function compileDeclarativeMotionJs(spec: StoryMotionSpec, timelineData: CompiledTimelineData): string {
  const chapterIndexById = new Map<string, number>();
  timelineData.chapters.forEach((c, idx) => chapterIndexById.set(c.id, idx));

  const lines: string[] = [];
  lines.push(`const tl = gsap.timeline({ paused: true });`);

  // Overlay section transitions (Intro / Moral / Outro)
  const coverChap = timelineData.chapters.find((c) => c.section === "cover");
  const moralChap = timelineData.chapters.find((c) => c.section === "moral");
  const outroChap = timelineData.chapters.find((c) => c.section === "outro");

  if (coverChap) {
    lines.push(`tl.fromTo("#overlay-intro", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.4)" }, 0);`);
    lines.push(`tl.to("#overlay-intro", { opacity: 0, scale: 0.96, duration: 0.45, ease: "power2.in" }, ${Math.max(0.5, coverChap.end - 0.35).toFixed(3)});`);
  }

  if (moralChap) {
    lines.push(`tl.fromTo("#overlay-moral", { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.5)" }, ${Math.max(0, moralChap.start + 0.08).toFixed(3)});`);
    lines.push(`tl.to("#overlay-moral", { opacity: 0, y: -16, duration: 0.4, ease: "power2.in" }, ${Math.max(0.5, moralChap.end - 0.28).toFixed(3)});`);
  }

  if (outroChap) {
    lines.push(`tl.fromTo("#overlay-outro", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${Math.max(0, outroChap.start + 0.05).toFixed(3)});`);
    lines.push(`tl.to("#outro-sub-btn", { scale: 1.07, duration: 0.45, yoyo: true, repeat: 5, ease: "sine.inOut" }, ${Math.max(0, outroChap.start + 0.55).toFixed(3)});`);
  }

  // On-demand callouts ONLY for chapters carrying a callout (zero text clutter during Intro/Moral/Outro!)
  spec.chapters.forEach((specCh, idx) => {
    const c = timelineData.chapters[idx];
    if (c.callout) {
      const enterAt = (c.start + 0.65).toFixed(3);
      const exitAt = Math.max(c.start + 1.8, c.end - 0.32).toFixed(3);
      lines.push(`tl.fromTo("#ondemand-callout", { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.42, ease: "back.out(1.6)" }, ${enterAt});`);
      lines.push(`tl.to("#ondemand-callout", { opacity: 0, y: 8, duration: 0.28 }, ${exitAt});`);
    }

    if (specCh.camera) {
      const camTarget: Record<string, any> = {};
      if (specCh.camera.dx !== undefined) camTarget.dx = specCh.camera.dx;
      if (specCh.camera.dy !== undefined) camTarget.dy = specCh.camera.dy;
      if (specCh.camera.ds !== undefined) camTarget.ds = specCh.camera.ds;
      camTarget.duration = specCh.camera.durationSec ?? 0.9;
      camTarget.ease = specCh.camera.ease ?? "power2.inOut";
      lines.push(`tl.to(cam, { ...${JSON.stringify(camTarget)}, onUpdate: applyCam }, ${c.start.toFixed(3)});`);
    }

    if (specCh.actions) {
      for (const act of specCh.actions) {
        const at =
          act.atEndOffsetSec !== undefined
            ? Math.max(c.start + 0.1, c.end + act.atEndOffsetSec)
            : Math.max(0, c.start + (act.offsetSec ?? 0));
        const targetArg = JSON.stringify(act.target);
        if (act.type === "set") {
          lines.push(`tl.set(${targetArg}, ${JSON.stringify(act.vars)}, ${at.toFixed(3)});`);
        } else if (act.type === "fromTo") {
          lines.push(
            `tl.fromTo(${targetArg}, ${JSON.stringify(act.fromVars || {})}, ${JSON.stringify(act.vars)}, ${at.toFixed(3)});`
          );
        } else {
          lines.push(`tl.to(${targetArg}, ${JSON.stringify(act.vars)}, ${at.toFixed(3)});`);
        }
      }
    }
  });

  lines.push(`tl.to({}, { duration: 0.01 }, DUR);`);
  return lines.join("\n");
}

function compileProceduralLoopsJs(loops: ProceduralLoopSpec[] | undefined, timelineData: CompiledTimelineData): string {
  if (!loops || loops.length === 0) {
    return `function updateProceduralMotion(_t) {}`;
  }
  const chapterStartById: Record<string, number> = {};
  for (const c of timelineData.chapters) {
    chapterStartById[c.id] = c.start;
  }

  const bodyLines: string[] = [];
  loops.forEach((loop, idx) => {
    const varName = `plEl_${idx}`;
    bodyLines.push(`const ${varName} = document.querySelector(${JSON.stringify(loop.target)});`);
    if (loop.kind === "bob") {
      const fx = loop.freqX ?? 0;
      const fy = loop.freqY ?? 2.2;
      const ax = loop.ampX ?? 0;
      const ay = loop.ampY ?? 8;
      const ph = loop.phase ?? 0;
      const shiftStart = loop.shiftAfterChapterId ? chapterStartById[loop.shiftAfterChapterId] : undefined;
      if (shiftStart !== undefined && (loop.shiftAmpX !== undefined || loop.shiftAmpY !== undefined)) {
        const sAx = loop.shiftAmpX ?? 0;
        const sAy = loop.shiftAmpY ?? 0;
        bodyLines.push(
          `if (${varName}) { const active = t >= ${shiftStart.toFixed(3)}; const ox = ${loop.baseX} + (active ? ${sAx} : ${ax}) + Math.sin(t * ${fx} + ${ph}) * 8; const oy = ${loop.baseY} + (active ? ${sAy} : 0) + Math.cos(t * ${fy} + ${ph}) * ${ay}; ${varName}.setAttribute("transform", "translate(" + ox.toFixed(1) + "," + oy.toFixed(1) + ")"); }`
        );
      } else {
        bodyLines.push(
          `if (${varName}) { const ox = ${loop.baseX} + Math.sin(t * ${fx} + ${ph}) * ${ax}; const oy = ${loop.baseY} + Math.cos(t * ${fy} + ${ph}) * ${ay}; ${varName}.setAttribute("transform", "translate(" + ox.toFixed(1) + "," + oy.toFixed(1) + ")"); }`
        );
      }
    } else if (loop.kind === "rise-loop") {
      const baseX = loop.baseX ?? 0;
      const ampX = loop.ampX ?? 6;
      const freqX = loop.freqX ?? 1.4;
      bodyLines.push(
        `if (${varName}) { const ox = ${baseX} + Math.sin(t * ${freqX}) * ${ampX}; const oy = -((t * ${loop.speedY}) % ${loop.wrapY}); ${varName}.setAttribute("transform", "translate(" + ox.toFixed(1) + "," + oy.toFixed(1) + ")"); }`
      );
    } else if (loop.kind === "sway") {
      const ph = loop.phase ?? 0;
      bodyLines.push(
        `if (${varName}) { const deg = (Math.sin(t * ${loop.freq} + ${ph}) * ${loop.ampDeg}).toFixed(2); ${varName}.setAttribute("transform", "rotate(" + deg + " ${loop.anchorX} ${loop.anchorY})"); }`
      );
    }
  });

  return `function updateProceduralMotion(t) {\n  ${bodyLines.join("\n  ")}\n}`;
}

function buildUniversalClientRuntimeJs(spec: StoryMotionSpec, timelineData: CompiledTimelineData): string {
  const safeJson = JSON.stringify(timelineData).replace(/</g, "\\u003c");
  return `
const TIMELINE_DATA = ${safeJson};
const q = new URLSearchParams(location.search);
const fmt = q.get("format");
const IS_LANDSCAPE = fmt === "landscape" || (!fmt && window.innerWidth > window.innerHeight);
if (IS_LANDSCAPE) document.body.classList.add("landscape");

const W = IS_LANDSCAPE ? 1920 : 1080;
const H = IS_LANDSCAPE ? 1080 : 1920;

const stageSvg = document.getElementById("stage-svg");
stageSvg.setAttribute("viewBox", "0 0 " + W + " " + H);

const portraitScene = document.getElementById("backdrop-portrait");
const landscapeScene = document.getElementById("backdrop-landscape");
if (portraitScene) portraitScene.setAttribute("display", IS_LANDSCAPE ? "none" : "inline");
if (landscapeScene) landscapeScene.setAttribute("display", IS_LANDSCAPE ? "inline" : "none");

function fitViewport() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  document.getElementById("stage").style.transform = "translate(-50%, -50%) scale(" + s + ")";
}
window.addEventListener("resize", fitViewport);
fitViewport();

const CHAPTERS = TIMELINE_DATA.chapters;
const DUR = TIMELINE_DATA.totalDuration;
const ALL_WORDS = [];
const CHUNKS = [];
for (const c of CHAPTERS) {
  const ws = c.words || [];
  ALL_WORDS.push(...ws);
  const maxPerChunk = IS_LANDSCAPE ? 8 : 6;
  const numChunks = Math.max(1, Math.ceil(ws.length / maxPerChunk));
  const chunkSize = Math.ceil(ws.length / numChunks);
  for (let i = 0; i < ws.length; i += chunkSize) {
    const slice = ws.slice(i, i + chunkSize);
    const start = Math.max(0, slice[0].start - 0.05);
    const end = i + chunkSize < ws.length ? ws[i + chunkSize].start : c.end;
    CHUNKS.push({ start, end, rows: [slice] });
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Tripod-grounded Camera Solver
const camRig = document.getElementById("cam-rig");
const cam = { dx: 0, dy: 0, ds: 1.0 };
const BASE_SCALE = IS_LANDSCAPE ? 1.34 : 1.36;
const FOCUS_WORLD_X = 495;
const FOCUS_WORLD_Y = 632;
const FOCUS_SCREEN_X = IS_LANDSCAPE ? 960 : 465;
const FOCUS_SCREEN_Y = IS_LANDSCAPE ? 735 : 975;

function applyCam() {
  const s = BASE_SCALE * cam.ds;
  const tx = FOCUS_SCREEN_X - FOCUS_WORLD_X * s + cam.dx;
  const ty = FOCUS_SCREEN_Y - FOCUS_WORLD_Y * s + cam.dy;
  camRig.setAttribute("transform", "translate(" + tx.toFixed(2) + "," + ty.toFixed(2) + ") scale(" + s.toFixed(4) + ")");
}
applyCam();

// On-Demand Contextual Callout Pin Updater
const cPinRing = document.getElementById("callout-pin-ring");
const cPinDot = document.getElementById("callout-pin-dot");
const cLine = document.getElementById("callout-line");
const cBox = document.getElementById("callout-box");
const cArc = document.getElementById("callout-ring-arc");
const cNum = document.getElementById("callout-ring-num");
const cKicker = document.getElementById("callout-kicker");
const cTitle = document.getElementById("callout-title");

let lastCalloutIdx = -1;
function syncCallout(activeIdx) {
  if (activeIdx === lastCalloutIdx) return;
  lastCalloutIdx = activeIdx;
  const co = CHAPTERS[activeIdx].callout;
  if (!co) return;
  const accent = co.accent || "#00F5D4";
  cPinRing.setAttribute("cx", co.pinX);
  cPinRing.setAttribute("cy", co.pinY);
  cPinRing.setAttribute("stroke", accent);
  cPinDot.setAttribute("cx", co.pinX);
  cPinDot.setAttribute("cy", co.pinY);
  cPinDot.setAttribute("fill", accent);
  cLine.setAttribute("stroke", accent);
  cBox.setAttribute("stroke", accent);
  cArc.setAttribute("stroke", accent);
  const dash = Math.round((Math.min(100, Math.max(5, co.ringPct)) / 100) * 176);
  cArc.setAttribute("stroke-dasharray", dash + " 180");
  cNum.textContent = co.ringText;
  cKicker.textContent = co.kicker;
  cTitle.textContent = co.title;

  if (co.pinX < 288) {
    cLine.setAttribute("points", co.pinX + "," + co.pinY + " " + co.pinX + ",313 295,313");
  } else if (co.pinX > 718) {
    cLine.setAttribute("points", co.pinX + "," + co.pinY + " " + co.pinX + ",313 711,313");
  } else {
    const anchorX = Math.max(345, Math.min(665, co.pinX));
    cLine.setAttribute("points", co.pinX + "," + co.pinY + " " + co.pinX + ",390 " + anchorX + ",390 " + anchorX + ",366");
  }
}

// Standardized Swappable Host Controller
const hostPoses = {
  wave: document.getElementById("host-pose-wave"),
  point: document.getElementById("host-pose-point"),
  shock: document.getElementById("host-pose-shock"),
  eureka: document.getElementById("host-pose-eureka"),
};
const hostHead = document.getElementById("host-head-rig");
const hostEyesOpen = document.getElementById("host-eyes-open");
const hostEyesBlink = document.getElementById("host-eyes-blink");
const hostMouthIdle = document.getElementById("host-mouth-idle");
const hostMouthTalk = document.getElementById("host-mouth-talk");
const hostMouthShock = document.getElementById("host-mouth-shock");
const elBubbleText = document.getElementById("bubble-text");

function updateHostAndBubble(t) {
  let activeIdx = 0;
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (t >= CHAPTERS[i].start - 0.05) { activeIdx = i; break; }
  }
  const ch = CHAPTERS[activeIdx];
  syncCallout(activeIdx);

  let targetPose = ch.pose || "point";
  if (ch.poseSwitchTo && ch.poseSwitchDelay != null && t >= ch.start + ch.poseSwitchDelay) {
    targetPose = ch.poseSwitchTo;
  }
  for (const key of Object.keys(hostPoses)) {
    if (hostPoses[key]) hostPoses[key].setAttribute("opacity", key === targetPose ? "1" : "0");
  }

  const nodY = (Math.sin(t * 2.8) * 2.5).toFixed(2);
  const nodR = (Math.sin(t * 1.9) * 2.2).toFixed(2);
  hostHead.setAttribute("transform", "translate(0," + nodY + ") rotate(" + nodR + ")");
  const blink = (t % 3.2) > 3.04;
  hostEyesOpen.setAttribute("opacity", blink ? "0" : "1");
  hostEyesBlink.setAttribute("opacity", blink ? "1" : "0");

  const speaking = ALL_WORDS.some((w) => t >= w.start - 0.03 && t <= w.end + 0.04);
  if (targetPose === "shock") {
    hostMouthIdle.setAttribute("opacity", "0");
    hostMouthTalk.setAttribute("opacity", "0");
    hostMouthShock.setAttribute("opacity", "1");
  } else if (speaking) {
    hostMouthIdle.setAttribute("opacity", "0");
    hostMouthShock.setAttribute("opacity", "0");
    hostMouthTalk.setAttribute("opacity", "1");
    const openScale = (0.48 + Math.abs(Math.sin(t * 21)) * 0.56).toFixed(2);
    hostMouthTalk.setAttribute("transform", "translate(0,-37) scale(1," + openScale + ")");
  } else {
    hostMouthIdle.setAttribute("opacity", "1");
    hostMouthTalk.setAttribute("opacity", "0");
    hostMouthShock.setAttribute("opacity", "0");
  }

  const chunk = CHUNKS.find((k) => t >= k.start && t < k.end);
  if (!chunk) { elBubbleText.innerHTML = ""; return; }
  let html = "";
  for (const row of chunk.rows) {
    html += '<div class="sub-row">';
    for (const w of row) {
      const isAct = t >= w.start - 0.04 && t <= w.end + 0.1;
      html += '<span class="sub-word' + (isAct ? ' active' : '') + '">' + esc(w.word) + '</span>';
    }
    html += '</div>';
  }
  elBubbleText.innerHTML = html;
}

${compileProceduralLoopsJs(spec.proceduralLoops, timelineData)}
${compileDeclarativeMotionJs(spec, timelineData)}

window.OPENER = {
  W, H, DURATION: DUR, tl, ready: true,
  seek(t) {
    tl.pause(t, false);
    applyCam();
    updateHostAndBubble(t);
    updateProceduralMotion(t);
  }
};

if (!q.has("clean")) {
  gsap.ticker.add(() => {
    const t = tl.time();
    applyCam();
    updateHostAndBubble(t);
    updateProceduralMotion(t);
  });
  tl.play(0);
} else {
  window.OPENER.seek(0);
}`;
}

function buildUniversalStageHtml(options: {
  spec: StoryMotionSpec;
  lang: "id" | "en";
  timelineData: CompiledTimelineData;
  coverDataUri?: string;
}): string {
  const { spec, lang, timelineData, coverDataUri } = options;
  const uid = `${spec.book.slug}-${lang}`;
  const title = lang === "en" ? spec.book.originalTitle : spec.book.title;
  const ringAccent = spec.narrator.theme?.ringAccentColor;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title} — Zayn Edu-Motion (${lang.toUpperCase()})</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Plus+Jakarta+Sans:wght@700;800;900&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
<style>
${buildAlt1StageCss({
  portraitBg: spec.backdrop.portraitBg,
  landscapeBg: spec.backdrop.landscapeBg,
  bubbleBorderColor: ringAccent,
})}
</style>
</head>
<body>
<div id="stage">
  <main id="zone-stage">
    ${buildStageWorldSvg({
      backdrop: spec.backdrop,
      actors: spec.actors,
      calloutSvg: buildOnDemandCalloutSvg(),
    })}
  </main>

  ${buildOverlayScenesHtml({
    lang,
    book: spec.book,
    moral: spec.moral,
    outro: spec.outro,
    coverDataUri,
  })}

  <section id="narrator-dock">
    <div id="host-badge">
      ${buildHostCircularBadgeSvg({
        uid,
        characterId: spec.narrator.characterId,
        theme: spec.narrator.theme,
      })}
    </div>
    <div id="speech-bubble">
      <svg id="bubble-tail" viewBox="0 0 38 34">
        <path d="M38,4 L2,16 L38,30 Z" fill="rgba(10,22,48,0.98)"/>
        <polyline points="38,4 2,16 38,30" fill="none" stroke="${ringAccent || "#00F5D4"}" stroke-width="4" stroke-linejoin="round"/>
      </svg>
      <div id="bubble-text"></div>
    </div>
  </section>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script>
${buildUniversalClientRuntimeJs(spec, timelineData)}
</script>
</body>
</html>`;
}

async function captureUniversalThumbnails(storyDir: string, seekSec: number): Promise<void> {
  const thumbDir = path.join(storyDir, "assets/thumbnails");
  await fs.mkdir(thumbDir, { recursive: true });

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    for (const lang of ["id", "en"] as const) {
      const htmlPath = path.join(storyDir, "motion", lang, "index.html");

      const pPage = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await pPage.goto(`file://${htmlPath}?clean=1&format=vertical`, { waitUntil: "networkidle" });
      await pPage.evaluate(() => document.fonts.ready);
      await pPage.evaluate((t) => (window as any).OPENER.seek(t), seekSec);
      await pPage.waitForTimeout(50);
      await pPage.screenshot({ path: path.join(thumbDir, `${lang}-9x16.png`), type: "png" });
      await pPage.screenshot({
        path: path.join(thumbDir, `${lang}-4x5.png`),
        type: "png",
        clip: { x: 0, y: 120, width: 1080, height: 1350 },
      });
      await pPage.close();

      const lPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await lPage.goto(`file://${htmlPath}?clean=1&format=landscape`, { waitUntil: "networkidle" });
      await lPage.evaluate(() => document.fonts.ready);
      await lPage.evaluate((t) => (window as any).OPENER.seek(t), seekSec);
      await lPage.waitForTimeout(50);
      await lPage.screenshot({ path: path.join(thumbDir, `${lang}-16x9.png`), type: "png" });
      await lPage.close();

      const exportLangDir = path.join(storyDir, "exports", lang);
      await fs.mkdir(exportLangDir, { recursive: true });
      await fs.copyFile(path.join(thumbDir, `${lang}-16x9.png`), path.join(exportLangDir, "thumbnail-popular.png"));
      await fs.copyFile(path.join(thumbDir, `${lang}-16x9.png`), path.join(exportLangDir, "thumbnail-bedtime.png"));
      await fs.copyFile(path.join(thumbDir, `${lang}-16x9.png`), path.join(exportLangDir, "thumbnail.png"));
      await fs.copyFile(path.join(thumbDir, `${lang}-9x16.png`), path.join(exportLangDir, "thumbnail-vertical.png"));
      await fs.copyFile(path.join(thumbDir, `${lang}-4x5.png`), path.join(exportLangDir, "thumbnail-portrait.png"));
    }
  } finally {
    await browser.close();
  }
}

/**
 * Compiles any validated `StoryMotionSpec` directory (`stories/<slug>/motion-spec.json`)
 * deterministically into bilingual audio, HTML/GSAP stage, thumbnails, and `story.json`.
 */
export async function compileEduMotionStory(storyDir: string): Promise<{
  slug: string;
  idDurationSec: number;
  enDurationSec: number;
}> {
  const specPath = path.join(storyDir, "motion-spec.json");
  const raw = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const spec = validateStoryMotionSpec(raw);

  console.log(`\n==================================================================`);
  console.log(`🎬 UNIVERSAL EDU-MOTION COMPILER: [${spec.book.slug}]`);
  console.log(`   Host      : ${spec.narrator.characterId} (${spec.narrator.displayName?.id || spec.narrator.characterId})`);
  console.log(`   Chapters  : ${spec.chapters.length} (${spec.chapters.map((c) => c.section).join(" → ")})`);
  console.log(`==================================================================\n`);

  const coverFile = await ensureOfficialCoverAsset(storyDir, spec.book.coverUrl);
  const coverRelUrl = coverFile ? `../../assets/${coverFile}` : undefined;

  const idTimeline = await synthesizeUniversalChapters(spec, storyDir, "id", path.join(storyDir, "motion/id"));
  const enTimeline = await synthesizeUniversalChapters(spec, storyDir, "en", path.join(storyDir, "motion/en"));

  await fs.writeFile(
    path.join(storyDir, "motion/id/index.html"),
    buildUniversalStageHtml({ spec, lang: "id", timelineData: idTimeline, coverDataUri: coverRelUrl }),
    "utf-8"
  );
  await fs.writeFile(
    path.join(storyDir, "motion/en/index.html"),
    buildUniversalStageHtml({ spec, lang: "en", timelineData: enTimeline, coverDataUri: coverRelUrl }),
    "utf-8"
  );

  // Pick a vivid focal story beat (midway through educational beats) for thumbnails
  const firstHeroBeat =
    enTimeline.chapters.find((c) => c.section === "story" && c.callout) ||
    enTimeline.chapters.find((c) => c.section === "story") ||
    enTimeline.chapters[0];
  const seekThumbSec = Math.max(1.5, firstHeroBeat.start + 1.8);
  await captureUniversalThumbnails(storyDir, seekThumbSec);

  const manifest = {
    slug: spec.book.slug,
    budiBookId: spec.book.budiBookId,
    budiSlug: spec.book.budiSlug,
    pipelineTrack: "edu-motion",
    motionArchetype: "universal-alt1",
    narratorCharacter: spec.narrator.characterId,
    title: spec.book.title,
    originalTitle: spec.book.originalTitle,
    author: spec.book.author,
    illustrator: spec.book.illustrator || "Zayn Edu-Motion Studio (Cover-Only BUDI Adaptation)",
    publisher: spec.book.publisher || "Badan Pengembangan dan Pembinaan Bahasa, Kemendikdasmen RI",
    license: spec.book.license || "Lisensi Terbuka Kemendikdasmen RI",
    readingLevel: spec.book.readingLevel ?? 2,
    theme: spec.book.theme || "Edukasi Anak",
    sourceUrl: spec.book.sourceUrl,
    coverAsset: coverFile ? `assets/${coverFile}` : undefined,
    language: "id-ID",
    moral: spec.moral,
    thumbnails: {
      id: {
        landscape: "assets/thumbnails/id-16x9.png",
        vertical: "assets/thumbnails/id-9x16.png",
        portrait: "assets/thumbnails/id-4x5.png",
      },
      en: {
        landscape: "assets/thumbnails/en-16x9.png",
        vertical: "assets/thumbnails/en-9x16.png",
        portrait: "assets/thumbnails/en-4x5.png",
      },
    },
    scenes: idTimeline.chapters.map((c, idx) => ({
      sceneId: c.id,
      index: idx + 1,
      type: c.section,
      durationSeconds: Number((c.end - c.start).toFixed(3)),
      audio: {
        text: c.text,
        durationSeconds: Number((c.end - c.start).toFixed(3)),
        en: enTimeline.chapters[idx]
          ? {
              text: enTimeline.chapters[idx].text,
              durationSeconds: Number((enTimeline.chapters[idx].end - enTimeline.chapters[idx].start).toFixed(3)),
            }
          : undefined,
      },
    })),
    exports: {},
  };

  await fs.writeFile(path.join(storyDir, "story.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\n✅ Compiled Edu-Motion [${spec.book.slug}] (ID=${idTimeline.totalDuration}s, EN=${enTimeline.totalDuration}s)`);

  return {
    slug: spec.book.slug,
    idDurationSec: idTimeline.totalDuration,
    enDurationSec: enTimeline.totalDuration,
  };
}
