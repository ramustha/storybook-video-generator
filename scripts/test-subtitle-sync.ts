import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { synthesizeSceneVoice, attachPunctuation } from "../src/audio/tts-engine";
import {
  alignRawWordsToManuscript,
  normalizeKaraokeWords,
  resolveActiveWordState,
  buildSentenceAwareGroups,
} from "../src/subtitles/sync-timings";
import { resolveFfmpegBinaries } from "../src/motion/render-motion-stage";

function computeSpeechBoundsMs(ffmpeg: string, mp3Path: string): { startMs: number; endMs: number; totalMs: number } {
  const pcmBuf = execSync(`${ffmpeg} -v error -i "${mp3Path}" -f s16le -ac 1 -ar 16000 -`, {
    maxBuffer: 64 * 1024 * 1024,
  });
  const samples = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, Math.floor(pcmBuf.byteLength / 2));
  const win = 80;
  const rmsDb: number[] = [];
  let peakDb = -100;
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) {
      const v = samples[i + j] / 32768;
      s += v * v;
    }
    const db = s > 1e-12 ? 20 * Math.log10(Math.sqrt(s / win)) : -100;
    rmsDb.push(db);
    if (db > peakDb) peakDb = db;
  }
  const threshold = Math.max(-42, peakDb - 28);
  const firstIdx = rmsDb.findIndex((d) => d >= threshold);
  let lastIdx = -1;
  for (let i = rmsDb.length - 1; i >= 0; i--) {
    if (rmsDb[i] >= threshold) {
      lastIdx = i;
      break;
    }
  }
  return {
    startMs: firstIdx >= 0 ? firstIdx * 5 : 0,
    endMs: lastIdx >= 0 ? (lastIdx + 1) * 5 : Math.round((samples.length / 16000) * 1000),
    totalMs: Math.round((samples.length / 16000) * 1000),
  };
}

async function run() {
  const { ffmpeg } = resolveFfmpegBinaries();

  // ── 1. Indonesian & English Manuscript Span Alignment (Kata Ulang, Em-Dash, Quotes, Contractions) ──
  console.log("1️⃣ Testing ID & EN manuscript token span alignment...");

  const idRedup = alignRawWordsToManuscript(
    [
      { word: "Tiba", start: 0.2, end: 0.42 },
      { word: "tiba", start: 0.42, end: 0.68 },
      { word: "katak", start: 0.72, end: 1.05 },
      { word: "melompat", start: 1.08, end: 1.45 },
      { word: "lompat", start: 1.45, end: 1.82 },
      { word: "bersama", start: 1.85, end: 2.25 },
      { word: "kupu", start: 2.28, end: 2.52 },
      { word: "kupu", start: 2.52, end: 2.82 },
    ],
    '"Tiba-tiba, katak melompat-lompat bersama kupu-kupu!"'
  );
  assert.deepEqual(
    idRedup.map((w) => w.word),
    ['"Tiba-tiba,', "katak", "melompat-lompat", "bersama", 'kupu-kupu!"'],
    "Indonesian reduplicated hyphenated words must merge without duplicate tail tokens"
  );
  assert.equal(idRedup[0].start, 0.2);
  assert.equal(idRedup[0].end, 0.68);
  assert.equal(idRedup[2].start, 1.08);
  assert.equal(idRedup[2].end, 1.82);

  // Backward-compatible string helper check
  const legacyPunct = attachPunctuation(
    ["Pelan", "pelan", "ia", "berjalan", "bersama", "teman", "teman", "setibanya", "di", "sana"],
    "Pelan-pelan, ia berjalan bersama teman-teman setibanya di sana."
  );
  assert.equal(
    legacyPunct.join(" "),
    "Pelan-pelan, ia berjalan bersama teman-teman setibanya di sana."
  );

  // English em-dash & contractions (repro from bulan-dan-topi-biru scene_03 + step-by-step)
  const enDash = alignRawWordsToManuscript(
    [
      { word: "a", start: 0.2, end: 0.28 },
      { word: "strong", start: 0.3, end: 0.65 },
      { word: "wind", start: 0.66, end: 0.95 },
      { word: "came", start: 0.96, end: 1.22 },
      { word: "by", start: 1.24, end: 1.42 },
      { word: "whoooosh", start: 1.44, end: 1.98 },
      { word: "I", start: 2.4, end: 2.52 },
      { word: "can", start: 2.53, end: 2.72 },
      { word: "t", start: 2.72, end: 2.84 },
      { word: "fly", start: 2.86, end: 3.18 },
      { word: "yet", start: 3.2, end: 3.52 },
      { word: "step", start: 3.6, end: 3.82 },
      { word: "by", start: 3.82, end: 3.96 },
      { word: "step", start: 3.96, end: 4.28 },
    ],
    'a strong wind came by—whoooosh! "I can\'t fly yet," step-by-step.'
  );
  assert.deepEqual(
    enDash.map((w) => w.word),
    ["a", "strong", "wind", "came", "by—whoooosh!", '"I', "can't", "fly", 'yet,"', "step-by-step."],
    "English em-dash compounds and split contractions must align 1-to-1 without skipping words"
  );
  assert.equal(enDash[4].start, 1.24);
  assert.equal(enDash[4].end, 1.98);
  assert.equal(enDash[6].word, "can't");
  assert.equal(enDash[7].word, "fly");

  // ── 2. Gapless Karaoke Normalization & Short Function Word Floor (30fps Frame Audit) ──
  console.log("2️⃣ Testing gapless intra-clause highlight bridging & 30fps short-word floor...");
  const rawPhrase = [
    { word: "Tinggal", start: 0.25, end: 0.68, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" },
    { word: "di", start: 0.71, end: 0.76, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" }, // only 50ms!
    { word: "atas", start: 0.88, end: 1.16, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" }, // 120ms gap before
    { word: "pohon,", start: 1.22, end: 1.65, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" },
    { word: "membuat", start: 2.02, end: 2.46, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" }, // 370ms comma pause
    { word: "aman.", start: 2.50, end: 3.05, speaker: "child_protagonist", speakerName: "Aku", speakerColor: "#FACC15" },
    { word: "Benar!", start: 3.85, end: 4.35, speaker: "mother", speakerName: "Ibu", speakerColor: "#38BDF8" }, // 800ms sentence pause + speaker change
  ];

  const normPhrase = normalizeKaraokeWords(rawPhrase);
  // Short word "di" must get >= 90ms highlight window (>= ~3 frames @ 30fps)
  const diWord = normPhrase[1];
  assert.ok(
    diWord.activeEnd - diWord.start >= 0.089,
    `Expected short word "di" active span >= 90ms, got ${((diWord.activeEnd - diWord.start) * 1000).toFixed(0)}ms`
  );
  // Zero dead frames across continuous intra-clause span [0.25s .. 1.65s] at 30fps!
  for (let t = 0.26; t <= 1.64; t += 1 / 30) {
    const st = resolveActiveWordState(normPhrase, t);
    assert.ok(st.activeIndex !== -1, `Expected continuous active highlight at t=${t.toFixed(3)}s, got -1`);
  }
  // During the 800ms pause at t=3.55s (after "aman." and before Mother's "Benar!"), speaker must NOT snap to Mother prematurely or reset if mid-scene
  const pauseState = resolveActiveWordState(normPhrase, 3.55);
  assert.equal(pauseState.lastSpokenIndex, 5, "During inter-sentence pause, lastSpokenIndex must stay on preceding word");

  // Sentence-aware grouping splits cleanly on terminal punctuation even for short questions ("Mandai? Pakasam? Dadih?")
  const shortQWords = [
    { word: "Mandai?", start: 0.2, end: 0.7 },
    { word: "Pakasam?", start: 1.1, end: 1.6 },
    { word: "Dadih?", start: 2.0, end: 2.5 },
    { word: "Itu", start: 2.9, end: 3.1 },
    { word: "makanan", start: 3.1, end: 3.5 },
    { word: "khas", start: 3.5, end: 3.8 },
    { word: "Indonesia!", start: 3.8, end: 4.4 },
  ];
  const groups = buildSentenceAwareGroups(shortQWords, { isVertical: true });
  assert.ok(groups.length >= 2, "Short punctuated questions with pauses should split cleanly from the long answer sentence");

  // ── 3. Live End-to-End TTS + Acoustic Calibration + Multi-Speaker Drift + TrimSilence (ID & EN) ──
  console.log("3️⃣ Testing live Edge TTS synthesis + acoustic calibration (ID & EN)...");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-sub-e2e-"));
  try {
    // 3a. Indonesian single-line with formantScale + kata ulang
    const idMp3 = path.join(tmpDir, "id_scene.mp3");
    const idWordsPath = path.join(tmpDir, "id_scene_words.json");
    const idText = "Tiba-tiba, Katak kecil melompat-lompat menatap bintang-bintang yang berkilau!";
    await synthesizeSceneVoice({
      sceneId: "id_scene",
      lang: "id",
      lines: [{ speakerRole: "narrator", text: idText }],
      outputMp3Path: idMp3,
      outputWordsPath: idWordsPath,
    });
    const idWords = JSON.parse(fs.readFileSync(idWordsPath, "utf-8")).words;
    assert.equal(
      idWords.map((w: any) => w.word).join(" "),
      idText,
      "Live ID synthesized words must match manuscript 1-to-1 including kata ulang & punctuation"
    );
    const idSpeech = computeSpeechBoundsMs(ffmpeg, idMp3);
    const idStartDiffMs = Math.abs(idWords[0].start * 1000 - idSpeech.startMs);
    const idEndDiffMs = Math.abs(idWords[idWords.length - 1].end * 1000 - idSpeech.endMs);
    console.log(
      `   [ID Acoustic Check] speech=[${idSpeech.startMs}..${idSpeech.endMs}ms], words=[${Math.round(idWords[0].start * 1000)}..${Math.round(idWords[idWords.length - 1].end * 1000)}ms] (onsetDiff=${idStartDiffMs.toFixed(0)}ms, endDiff=${idEndDiffMs.toFixed(0)}ms)`
    );
    assert.ok(idStartDiffMs <= 65, `ID first word start should align within 65ms of speech onset (got ${idStartDiffMs}ms)`);

    // 3b. English single-line with em-dash & contraction
    const enMp3 = path.join(tmpDir, "en_scene.mp3");
    const enWordsPath = path.join(tmpDir, "en_scene_words.json");
    const enText = "Suddenly, a strong wind rushed by—whoooosh! Don't give up, little frog!";
    await synthesizeSceneVoice({
      sceneId: "en_scene",
      lang: "en",
      lines: [{ speakerRole: "narrator", text: enText }],
      outputMp3Path: enMp3,
      outputWordsPath: enWordsPath,
    });
    const enWords = JSON.parse(fs.readFileSync(enWordsPath, "utf-8")).words;
    assert.equal(
      enWords.map((w: any) => w.word).join(" "),
      enText,
      "Live EN synthesized words must match manuscript 1-to-1 without duplicating em-dash words"
    );
    const enSpeech = computeSpeechBoundsMs(ffmpeg, enMp3);
    const enStartDiffMs = Math.abs(enWords[0].start * 1000 - enSpeech.startMs);
    console.log(
      `   [EN Acoustic Check] speech=[${enSpeech.startMs}..${enSpeech.endMs}ms], words=[${Math.round(enWords[0].start * 1000)}..${Math.round(enWords[enWords.length - 1].end * 1000)}ms] (onsetDiff=${enStartDiffMs.toFixed(0)}ms)`
    );
    assert.ok(enStartDiffMs <= 65, `EN first word start should align within 65ms of speech onset (got ${enStartDiffMs}ms)`);

    // 3c. Multi-speaker 2-line dialogue scene: verify ZERO +0.80s phantom drift on line 2!
    const dlgMp3 = path.join(tmpDir, "dlg_id.mp3");
    const dlgWordsPath = path.join(tmpDir, "dlg_id_words.json");
    await synthesizeSceneVoice({
      sceneId: "dlg_id",
      lang: "id",
      lines: [
        { speakerRole: "mother", text: "Selamat malam, Nak." },
        { speakerRole: "child_protagonist", text: "Aku siap tidur sekarang!" },
      ],
      outputMp3Path: dlgMp3,
      outputWordsPath: dlgWordsPath,
    });
    const dlgWords = JSON.parse(fs.readFileSync(dlgWordsPath, "utf-8")).words;
    const dlgSpeech = computeSpeechBoundsMs(ffmpeg, dlgMp3);
    const dlgLastEndMs = dlgWords[dlgWords.length - 1].end * 1000;
    const dlgTailDriftMs = Math.abs(dlgLastEndMs - dlgSpeech.endMs);
    console.log(
      `   [ID Multi-Speaker Check] speechEnd=${dlgSpeech.endMs}ms, lastWordEnd=${dlgLastEndMs.toFixed(0)}ms (drift=${dlgTailDriftMs.toFixed(0)}ms)`
    );
    assert.ok(
      dlgTailDriftMs <= 160,
      `Multi-speaker last word end must match actual audio speech end within 160ms (got ${dlgTailDriftMs.toFixed(0)}ms — previously drifted by +800ms!)`
    );

    // 3d. TrimSilence mode for Edu-Motion sentences (removes ~800ms trailing Edge TTS silence)
    const trimMp3 = path.join(tmpDir, "trim_id.mp3");
    const trimWordsPath = path.join(tmpDir, "trim_id_words.json");
    await synthesizeSceneVoice({
      sceneId: "trim_id",
      lang: "id",
      lines: [{ speakerRole: "narrator", text: "Mandai?" }],
      outputMp3Path: trimMp3,
      outputWordsPath: trimWordsPath,
      trimSilence: true,
    });
    const trimWords = JSON.parse(fs.readFileSync(trimWordsPath, "utf-8")).words;
    const trimBounds = computeSpeechBoundsMs(ffmpeg, trimMp3);
    console.log(
      `   [TrimSilence Check] "Mandai?" totalMp3=${trimBounds.totalMs}ms, word=[${Math.round(trimWords[0].start * 1000)}..${Math.round(trimWords[0].end * 1000)}ms]`
    );
    assert.ok(
      trimBounds.totalMs < 1100 && trimBounds.totalMs - trimWords[0].end * 1000 < 200,
      `Trimmed single-word sentence MP3 should not carry 800ms dead trailing silence (got total=${trimBounds.totalMs}ms, wordEnd=${trimWords[0].end * 1000}ms)`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("\n✅ All ID & EN subtitle/voiceover sync E2E & unit tests passed!");
}

run().catch((err) => {
  console.error("❌ test-subtitle-sync failed:", err);
  process.exit(1);
});
