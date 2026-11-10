import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";
import { synthesizeSceneVoice, DialogueLine } from "../src/audio/tts-engine";
import { EDU_MOTION_ARCHETYPES } from "../src/motion/types";
import { resolveChromiumExecutable, resolveFfmpegBinaries } from "../src/motion/render-motion-stage";
import { pushStory } from "./manage-story-storage";
import { db } from "./lib/db";

const SLUG = "edu-fabel-kancil-buaya";
const STORY_DIR = path.resolve(`./stories/${SLUG}`);

interface ChapterSpec {
  id: string;
  kicker: { id: string; en: string };
  headlineHtml: { id: string; en: string };
  text: { id: string; en: string };
}

const CHAPTERS: ChapterSpec[] = [
  {
    id: "ch1",
    kicker: {
      id: "FABEL NUSANTARA · BEDAH CERITA",
      en: "INDONESIAN FABLE · STORY BREAKDOWN",
    },
    headlineHtml: {
      id: "Kenapa <span class='hl'>Kancil Kecil</span> Bisa Menyeberang Sungai Buaya?",
      en: "How Did <span class='hl'>Little Mousedeer</span> Cross the Crocodile River?",
    },
    text: {
      id: "Pernah bingung gak, bagaimana Kancil yang mungil bisa menyeberangi sungai penuh buaya lapar tanpa jembatan?",
      en: "Ever wondered how tiny Mousedeer crossed a wide river full of hungry crocodiles without a bridge?",
    },
  },
  {
    id: "ch2",
    kicker: {
      id: "MASALAH UTAMA · SUNGAI DERAS",
      en: "MAIN OBSTACLE · RAGING RIVER",
    },
    headlineHtml: {
      id: "Bukan Berenang, Itu <span class='hl'>Bahaya Besar!</span>",
      en: "Swimming Across Is <span class='hl'>Super Dangerous!</span>",
    },
    text: {
      id: "Di seberang sungai ada pohon apel merah yang manis, tapi airnya deras dan dijaga buaya raksasa!",
      en: "Across the river grows a sweet red apple tree, but the water is fast and guarded by giant crocodiles!",
    },
  },
  {
    id: "ch3",
    kicker: {
      id: "RAHASIA KANCIL · OTAK CERDIK",
      en: "KANCIL'S SECRET · CLEVER BRAIN",
    },
    headlineHtml: {
      id: "Di Balik Tubuh Mungilnya: <span class='hl'>Otak Cerdik</span> Bekerja!",
      en: "Inside His Tiny Body: A <span class='hl'>Clever Brain</span> at Work!",
    },
    text: {
      id: "Saat hewan lain panik ketakutan, otak Kancil justru tenang mencari seratus ide pintar dalam sekejap!",
      en: "While other animals panic in fear, Mousedeer stays calm and sparks a hundred smart ideas in a flash!",
    },
  },
  {
    id: "ch4",
    kicker: {
      id: "STRATEGI JITU · UMPAN RAJA HUTAN",
      en: "SMART STRATEGY · ROYAL INVITATION",
    },
    headlineHtml: {
      id: "Gunakan <span class='hl'>Undangan Pesta</span> Raja Hutan!",
      en: "Using the <span class='hl'>Jungle King's</span> Feast Invite!",
    },
    text: {
      id: "Kancil berseru membawa undangan makan siang dari Raja Hutan, lalu meminta semua buaya berbaris rapi untuk dihitung!",
      en: "Mousedeer announces a royal feast invitation from the Jungle King, asking all crocodiles to line up neatly to be counted!",
    },
  },
  {
    id: "ch5",
    kicker: {
      id: "AKSI LOMPAT · JEMBATAN HIDUP",
      en: "JUMP ACTION · LIVING BRIDGE",
    },
    headlineHtml: {
      id: "Punggung Buaya Jadi <span class='hl'>Jembatan Hidup!</span>",
      en: "Crocodile Backs Become a <span class='hl'>Living Bridge!</span>",
    },
    text: {
      id: "Hap! Satu, dua, tiga! Kancil melompati punggung buaya satu per satu sambil berhitung sampai mendarat selamat di seberang!",
      en: "Hop! One, two, three! Mousedeer leaps across the crocodiles one by one while counting until he lands safely across!",
    },
  },
  {
    id: "ch6",
    kicker: {
      id: "PESAN MORAL · ZAYN STORYBOOK",
      en: "MORAL LESSON · ZAYN STORYBOOK",
    },
    headlineHtml: {
      id: "Akal Cerdik Mengalahkan <span class='hl'>Otot Raksasa!</span>",
      en: "Clever Wit Beats <span class='hl'>Giant Muscle!</span>",
    },
    text: {
      id: "Jadi kuncinya adalah tetap tenang, berpikir cerdik, dan pantang menyerah saat menghadapi masalah besar!",
      en: "So the key is staying calm, thinking smart, and never giving up when facing a giant problem!",
    },
  },
  {
    id: "ch7",
    kicker: {
      id: "KUIS ANAK PINTAR · TULIS DI KOMENTAR",
      en: "SMART KIDS QUIZ · COMMENT BELOW",
    },
    headlineHtml: {
      id: "Fabel Nusantara Mana <span class='hl'>Favorit Kamu?</span>",
      en: "Which Indonesian Fable Is <span class='hl'>Your Favorite?</span>",
    },
    text: {
      id: "Follow Zayn Storybook untuk cerita seru lainnya, dan tulis di kolom komentar fabel mana favorit kamu ya!",
      en: "Follow Zayn Storybook for more fun stories, and write your favorite fable in the comments below!",
    },
  },
];

async function synthesizeEditionVoice(lang: "id" | "en", outDir: string) {
  await fs.mkdir(outDir, { recursive: true });
  const { ffmpeg, ffprobe } = resolveFfmpegBinaries();

  const timelinePath = path.join(outDir, "timeline.json");
  const voCombinedPath = path.join(outDir, "vo_combined.mp3");

  // Reuse cached synthesis if already present
  if (existsSync(timelinePath) && existsSync(voCombinedPath)) {
    console.log(`   ✔ Using existing synthesized VO & timeline for [${lang.toUpperCase()}]`);
    return JSON.parse(await fs.readFile(timelinePath, "utf-8"));
  }

  const leadSilence = path.join(outDir, "lead_silence.mp3");
  const gapSilence = path.join(outDir, "gap_silence.mp3");
  execSync(`${ffmpeg} -y -f lavfi -i anullsrc=r=24000:cl=mono -t 0.25 -q:a 9 -acodec libmp3lame "${leadSilence}"`);
  execSync(`${ffmpeg} -y -f lavfi -i anullsrc=r=24000:cl=mono -t 0.35 -q:a 9 -acodec libmp3lame "${gapSilence}"`);

  let cursorSec = 0.25;
  const concatList: string[] = [`file '${leadSilence}'`];
  const chaptersOut: any[] = [];

  for (const ch of CHAPTERS) {
    const mp3Path = path.join(outDir, `${ch.id}.mp3`);
    const wordsPath = path.join(outDir, `${ch.id}_words.json`);
    const lines: DialogueLine[] = [{ speakerRole: "narrator", text: ch.text[lang] }];

    console.log(`   🎙️ Synthesizing [${lang.toUpperCase()}] ${ch.id}...`);
    await synthesizeSceneVoice({
      sceneId: ch.id,
      lang,
      lines,
      outputMp3Path: mp3Path,
      outputWordsPath: wordsPath,
    });

    const durStr = execSync(
      `${ffprobe} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`
    )
      .toString()
      .trim();
    const audioDur = parseFloat(durStr);

    const parsedWords = JSON.parse(await fs.readFile(wordsPath, "utf-8"));
    const rawWords = Array.isArray(parsedWords) ? parsedWords : parsedWords.words || [];
    const shiftedWords = rawWords.map((w: any) => ({
      word: w.word,
      start: Number((cursorSec + w.start).toFixed(3)),
      end: Number((cursorSec + w.end).toFixed(3)),
    }));

    const chStart = Number(cursorSec.toFixed(3));
    const chEnd = Number((cursorSec + audioDur + 0.35).toFixed(3));

    chaptersOut.push({
      id: ch.id,
      kicker: ch.kicker[lang],
      headlineHtml: ch.headlineHtml[lang],
      text: ch.text[lang],
      start: chStart,
      end: chEnd,
      audioDur: Number(audioDur.toFixed(3)),
      words: shiftedWords,
    });

    concatList.push(`file '${mp3Path}'`);
    concatList.push(`file '${gapSilence}'`);
    cursorSec = chEnd;
  }

  const concatTxt = path.join(outDir, "concat.txt");
  await fs.writeFile(concatTxt, concatList.join("\n"), "utf-8");
  execSync(`${ffmpeg} -y -f concat -safe 0 -i "${concatTxt}" -c copy "${voCombinedPath}"`);

  // Clean up intermediate chapter mp3s so only vo_combined.mp3 + timeline.json + index.html are uploaded to R2
  for (const ch of CHAPTERS) {
    await fs.rm(path.join(outDir, `${ch.id}.mp3`), { force: true });
    await fs.rm(path.join(outDir, `${ch.id}_words.json`), { force: true });
  }
  await fs.rm(leadSilence, { force: true });
  await fs.rm(gapSilence, { force: true });
  await fs.rm(concatTxt, { force: true });

  const timelineData = {
    archetype: "diorama-cross-section",
    lang,
    totalDuration: Number(cursorSec.toFixed(2)),
    chapters: chaptersOut,
  };

  await fs.writeFile(timelinePath, JSON.stringify(timelineData, null, 2), "utf-8");
  return timelineData;
}

function buildResponsiveStageHtml(lang: "id" | "en", timelineData: any): string {
  const preset = EDU_MOTION_ARCHETYPES["diorama-cross-section"];
  const isEn = lang === "en";

  const labels = {
    boardLabel: isEn ? "NUSANTARA RIVER · STRONG CURRENT" : "SUNGAI NUSANTARA · ARUS DERAS",
    dimLabel: preset.defaultDimensionLabel[lang],
    callKancil: isEn ? "TINY MOUSEDEER" : "SI KANCIL MUNGIL",
    callBuaya: isEn ? "HUNGRY CROCODILES" : "BUAYA LAPAR MENGHADANG",
    callApel: isEn ? "TARGET: SWEET APPLES" : "TARGET: APEL MERAH",
    callOtak: isEn ? "CLEVER BRAIN ACTIVE!" : "OTAK CERDIK AKTIF!",
    burstBuaya: isEn ? "3 CROCS!" : "3 BUAYA!",
    burstTing: "TING! 💡",
    burstHap: isEn ? "HOP! 🦌" : "HAP! 🦌",
    iqKicker: isEn ? "⚡ KANCIL BRAIN SPEED" : "⚡ KECEPATAN AKAL KANCIL",
    iqUnit: isEn ? "IDEAS/SEC" : "IDE/DTK",
    iqSub: isEn ? "CALM & ZERO PANIC" : "TENANG & TIDAK PANIK",
    dangerKicker: isEn ? "⚠️ RIVER DANGER LEVEL" : "⚠️ TINGKAT BAHAYA SUNGAI",
    dangerUnit: isEn ? "% DANGER" : "% BAHAYA",
    dangerSub: isEn ? "FAST CURRENT + SHARP TEETH" : "ARUS DERAS + GIGI TAJAM",
    chk1Title: isEn ? "STAY CALM" : "TETAP TENANG",
    chk1Desc: isEn ? "Never panic when facing trouble" : "Jangan panik saat ada masalah",
    chk2Title: isEn ? "USE CLEVER WIT" : "GUNAKAN AKAL CERDIK",
    chk2Desc: isEn ? "Find creative solutions peacefully" : "Cari solusi kreatif tanpa berkelahi",
    chk3Title: isEn ? "NEVER GIVE UP" : "PANTANG MENYERAH",
    chk3Desc: isEn ? "Small size does not mean weak!" : "Kecil bukan berarti lemah!",
    ctaTop: isEn ? "FOLLOW · ZAYN STORYBOOK" : "FOLLOW · ZAYN STORYBOOK INDONESIA",
    ctaQ: isEn
      ? "Write in the Comments:<br>Which Indonesian Fable Is Your Favorite?"
      : "Tulis di Kolom Komentar:<br>Fabel Nusantara Mana Favorit Kamu?",
    opt1: isEn ? "🦌 MOUSEDEER" : "🦌 SI KANCIL",
    opt2: isEn ? "🐵 MONKEY & TURTLE" : "🐵 MONYET & KURA",
    opt3: isEn ? "🐦 PARROT TALE" : "🐦 BURUNG NURI",
  };

  // Proportional timing anchors mapped dynamically to each chapter's actual start/end in timelineData
  const ch = timelineData.chapters;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>Zayn Edu-Motion — ${SLUG} (${lang.toUpperCase()})</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800;900&family=JetBrains+Mono:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: ${preset.palette.bg};
    --ink: ${preset.palette.ink};
    --orange: ${preset.palette.accentPrimary};
    --yellow: ${preset.palette.pillHighlight};
    --green: ${preset.palette.accentSecondary};
    --card: ${preset.palette.cardBg};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%;
    background: #0f1419;
    overflow: hidden;
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    color: var(--ink);
  }
  #stage {
    position: absolute;
    left: 50%; top: 50%;
    width: 1080px; height: 1920px;
    background: var(--bg);
    overflow: hidden;
    transform-origin: 50% 50%;
  }
  body.landscape #stage {
    width: 1920px; height: 1080px;
  }
  .iso-grid {
    position: absolute;
    inset: -200px;
    pointer-events: none;
    opacity: 0.55;
    background-image: url("data:image/svg+xml,${encodeURIComponent(preset.gridPatternSvg)}");
  }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(75% 65% at 50% 50%, transparent 60%, rgba(30,36,43,0.08) 100%);
  }

  /* ==================== ZONE 1: HEADER & CHAPTER KICKER ==================== */
  #zone-header {
    position: absolute;
    left: 72px; right: 72px; top: 150px;
    z-index: 20;
  }
  body.landscape #zone-header {
    left: 84px; right: 1140px; top: 72px;
  }
  .kicker-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  .kicker-bar {
    width: 8px; height: 32px;
    background: var(--orange);
    border-radius: 4px;
  }
  .kicker-text {
    font-family: "JetBrains Mono", monospace;
    font-size: 25px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #5A534A;
    text-transform: uppercase;
  }
  .headline {
    font-size: 62px;
    font-weight: 900;
    line-height: 1.12;
    letter-spacing: -0.025em;
    color: var(--ink);
  }
  body.landscape .headline {
    font-size: 52px;
  }
  .headline .hl { color: var(--orange); }

  /* ==================== ZONE 2: INTERACTIVE VECTOR STAGE ==================== */
  #zone-stage {
    position: absolute;
    left: 0; top: 410px;
    width: 1080px; height: 920px;
    z-index: 10;
  }
  body.landscape #zone-stage {
    left: 810px; top: 65px;
    width: 1080px; height: 920px;
    transform: scale(0.95);
    transform-origin: 50% 50%;
  }
  .dim-label {
    position: absolute;
    left: 90px; right: 90px; bottom: 26px;
    display: flex;
    align-items: center;
    gap: 16px;
    font-family: "JetBrains Mono", monospace;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: #7C7367;
    text-transform: uppercase;
    z-index: 15;
  }
  body.landscape .dim-label {
    bottom: -10px;
  }
  .dim-label::before, .dim-label::after {
    content: "";
    flex: 1;
    border-bottom: 2.5px dashed #BDB3A3;
  }

  /* ==================== ZONE 3: KARAOKE PILL SUBTITLES ==================== */
  #zone-subs {
    position: absolute;
    left: 60px; right: 60px;
    top: 1380px;
    height: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    z-index: 30;
    pointer-events: none;
  }
  body.landscape #zone-subs {
    left: 84px; right: auto;
    width: 700px;
    top: 720px;
    height: 290px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
  }
  .sub-row {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px;
    background: #1E232A;
    padding: 14px 28px;
    border-radius: 18px;
    box-shadow: 0 14px 28px rgba(0,0,0,0.18);
    border: 2px solid rgba(255,255,255,0.08);
  }
  .sub-word {
    font-size: 40px;
    font-weight: 800;
    color: #F8FAFC;
    padding: 4px 12px;
    border-radius: 10px;
    letter-spacing: -0.01em;
  }
  body.landscape .sub-word { font-size: 34px; }
  .sub-word.active {
    background: var(--yellow);
    color: #111827;
    transform: scale(1.06);
    box-shadow: 0 4px 12px rgba(250, 204, 21, 0.45);
  }

  /* ==================== OVERLAY CARDS ==================== */
  .hud-card {
    position: absolute;
    background: var(--card);
    border: 3.5px solid var(--ink);
    border-radius: 22px;
    box-shadow: 0 12px 0 var(--ink);
    padding: 20px 26px;
    z-index: 25;
    opacity: 0;
  }
  .hud-kicker {
    display: inline-block;
    background: #E0F2FE;
    color: #0369A1;
    border: 2px solid #0284C7;
    font-family: "JetBrains Mono", monospace;
    font-size: 18px;
    font-weight: 800;
    padding: 4px 12px;
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .hud-num {
    font-family: "JetBrains Mono", monospace;
    font-size: 54px;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    line-height: 1.05;
  }
  .hud-sub {
    font-family: "JetBrains Mono", monospace;
    font-size: 19px;
    font-weight: 700;
    color: #64748B;
    margin-top: 4px;
  }

  #check-stack {
    position: absolute;
    left: 64px; top: 520px;
    width: 560px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    z-index: 26;
    pointer-events: none;
  }
  body.landscape #check-stack {
    left: 84px; top: 280px;
  }
  .check-card {
    display: flex;
    align-items: center;
    gap: 20px;
    background: var(--card);
    border: 3.5px solid var(--ink);
    border-radius: 20px;
    padding: 20px 24px;
    box-shadow: 0 10px 0 var(--ink);
    opacity: 0;
  }
  .check-badge {
    width: 68px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #DCFCE7;
    border: 2.5px solid #16A34A;
    border-radius: 14px;
    padding: 8px 0;
    font-family: "JetBrains Mono", monospace;
    font-weight: 800;
    font-size: 24px;
    color: #15803D;
  }
  .check-title {
    font-size: 29px;
    font-weight: 900;
    color: var(--ink);
    margin-bottom: 4px;
  }
  .check-desc {
    font-family: "JetBrains Mono", monospace;
    font-size: 20px;
    font-weight: 700;
    color: #57534E;
  }

  #cta-card {
    position: absolute;
    left: 64px; right: 64px;
    top: 960px;
    background: var(--card);
    border: 4px solid var(--ink);
    border-radius: 26px;
    padding: 28px 32px;
    box-shadow: 0 14px 0 var(--ink);
    z-index: 28;
    opacity: 0;
  }
  body.landscape #cta-card {
    left: 84px; right: auto; width: 780px;
    top: 420px;
  }
  .cta-pill-top {
    display: inline-block;
    background: var(--orange);
    color: #fff;
    font-family: "JetBrains Mono", monospace;
    font-size: 21px;
    font-weight: 800;
    padding: 8px 18px;
    border-radius: 10px;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
  }
  .cta-question {
    font-size: 36px;
    font-weight: 900;
    color: var(--ink);
    margin-bottom: 20px;
  }
  .cta-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .cta-opt {
    padding: 14px 12px;
    border-radius: 14px;
    font-family: "JetBrains Mono", monospace;
    font-size: 21px;
    font-weight: 800;
    text-align: center;
    border: 3px solid var(--ink);
  }
  .cta-opt.o1 { background: #E0F2FE; color: #0369A1; border-color: #0284C7; }
  .cta-opt.o2 { background: #FEF9C3; color: #A16207; border-color: #CA8A04; }
  .cta-opt.o3 { background: #FEE2E2; color: #B91C1C; border-color: #DC2626; }
</style>
</head>
<body>
<div id="stage">
  <div class="iso-grid"></div>

  <!-- ZONE 1: HEADER -->
  <div id="zone-header">
    <div class="kicker-row">
      <div class="kicker-bar"></div>
      <div class="kicker-text" id="hdr-kicker">${ch[0].kicker}</div>
    </div>
    <div class="headline" id="hdr-title">${ch[0].headlineHtml}</div>
  </div>

  <!-- ZONE 2: VECTOR RIGGED STAGE -->
  <div id="zone-stage">
    <svg id="svg-stage" width="1080" height="920" viewBox="0 0 1080 920" style="overflow:visible">
      <defs>
        <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0EA5E9"/>
          <stop offset="50%" stop-color="#0284C7"/>
          <stop offset="100%" stop-color="#0369A1"/>
        </linearGradient>
        <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#65A30D"/>
          <stop offset="100%" stop-color="#3F6212"/>
        </linearGradient>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="6" flood-color="#1E242B" flood-opacity="0.22"/>
        </filter>
      </defs>

      <g id="cam-rig" transform="translate(540,460) scale(1) translate(-540,-460)">
        <g id="diorama-board" filter="url(#dropShadow)">
          <path d="M 55 340 L 1025 300 L 1025 710 L 55 750 Z" fill="#1E293B" stroke="#1E242B" stroke-width="5"/>
          <path id="water-body" d="M 225 335 L 860 310 L 860 665 L 225 690 Z" fill="url(#riverGrad)" stroke="#1E242B" stroke-width="4"/>

          <g id="water-currents" opacity="0.65">
            <path class="wave-line" d="M 290 400 Q 340 385 390 400 T 490 400" fill="none" stroke="#BAE6FD" stroke-width="5" stroke-linecap="round" stroke-dasharray="28 18"/>
            <path class="wave-line" d="M 540 460 Q 590 445 640 460 T 740 460" fill="none" stroke="#BAE6FD" stroke-width="5" stroke-linecap="round" stroke-dasharray="28 18"/>
            <path class="wave-line" d="M 320 550 Q 370 535 420 550 T 520 550" fill="none" stroke="#BAE6FD" stroke-width="5" stroke-linecap="round" stroke-dasharray="28 18"/>
            <path class="wave-line" d="M 600 600 Q 650 585 700 600 T 800 600" fill="none" stroke="#BAE6FD" stroke-width="5" stroke-linecap="round" stroke-dasharray="28 18"/>
          </g>

          <path d="M 55 300 L 245 300 L 245 690 L 55 710 Z" fill="url(#bankGrad)" stroke="#1E242B" stroke-width="5"/>
          <path d="M 55 660 L 245 660 L 245 725 L 55 745 Z" fill="#92400E" stroke="#1E242B" stroke-width="5"/>

          <path d="M 840 275 L 1025 275 L 1025 675 L 840 675 Z" fill="url(#bankGrad)" stroke="#1E242B" stroke-width="5"/>
          <path d="M 840 635 L 1025 635 L 1025 705 L 840 705 Z" fill="#92400E" stroke="#1E242B" stroke-width="5"/>

          <rect x="310" y="685" width="460" height="40" rx="8" fill="#0F172A" stroke="#475569" stroke-width="3"/>
          <text x="540" y="712" fill="#F8FAFC" font-family="JetBrains Mono" font-size="18" font-weight="800" text-anchor="middle" letter-spacing="2">${labels.boardLabel}</text>
        </g>

        <!-- RED APPLE TREE -->
        <g id="apple-tree" transform="translate(935, 275)">
          <path d="M -22 10 L -16 -130 L 16 -130 L 22 10 Z" fill="#78350F" stroke="#1E242B" stroke-width="4.5"/>
          <g id="tree-canopy">
            <circle cx="-48" cy="-145" r="56" fill="#15803D" stroke="#1E242B" stroke-width="4.5"/>
            <circle cx="48" cy="-145" r="56" fill="#15803D" stroke="#1E242B" stroke-width="4.5"/>
            <circle cx="0" cy="-185" r="68" fill="#16A34A" stroke="#1E242B" stroke-width="4.5"/>
            <g class="apple" transform="translate(-38, -155)"><circle cx="0" cy="0" r="16" fill="#EF4444" stroke="#1E242B" stroke-width="3.5"/><circle cx="-5" cy="-5" r="4" fill="#FCA5A5"/></g>
            <g class="apple" transform="translate(36, -140)"><circle cx="0" cy="0" r="16" fill="#EF4444" stroke="#1E242B" stroke-width="3.5"/><circle cx="-5" cy="-5" r="4" fill="#FCA5A5"/></g>
            <g class="apple" transform="translate(2, -198)"><circle cx="0" cy="0" r="17" fill="#EF4444" stroke="#1E242B" stroke-width="3.5"/><circle cx="-5" cy="-5" r="4" fill="#FCA5A5"/></g>
          </g>
        </g>

        <!-- 3 RIGGED CROCODILES -->
        <g id="croc-1" transform="translate(350, 490)">
          <path d="M -75 -12 L -60 -28 L -45 -12 L -30 -28 L -15 -12 L 0 -28 L 15 -12" fill="#15803D" stroke="#1E242B" stroke-width="3.5"/>
          <rect x="-85" y="-14" width="145" height="46" rx="22" fill="#166534" stroke="#1E242B" stroke-width="4.5"/>
          <path d="M -65 20 L 40 20" stroke="#86EFAC" stroke-width="5" stroke-linecap="round" stroke-dasharray="12 10"/>
          <path d="M 35 6 L 98 6 L 92 26 L 35 26 Z" fill="#15803D" stroke="#1E242B" stroke-width="4"/>
          <g id="croc1-jaw" transform="translate(35, 6)">
            <path d="M 0 -22 L 66 -16 L 64 2 L 0 2 Z" fill="#166534" stroke="#1E242B" stroke-width="4"/>
            <path d="M 14 2 L 20 12 L 26 2 M 32 2 L 38 12 L 44 2 M 48 2 L 54 12 L 60 2" fill="#FFFFFF" stroke="#1E242B" stroke-width="2.5"/>
            <circle cx="12" cy="-24" r="13" fill="#FACC15" stroke="#1E242B" stroke-width="3.5"/><circle cx="14" cy="-24" r="5" fill="#1E242B"/>
          </g>
          <g id="croc-num-1" opacity="0" transform="translate(-15, -62)">
            <rect x="-28" y="-26" width="56" height="44" rx="12" fill="#FACC15" stroke="#1E242B" stroke-width="4"/>
            <text x="0" y="5" font-family="JetBrains Mono" font-size="28" font-weight="900" fill="#1E242B" text-anchor="middle">01</text>
          </g>
        </g>

        <g id="croc-2" transform="translate(545, 525)">
          <path d="M -75 -12 L -60 -28 L -45 -12 L -30 -28 L -15 -12 L 0 -28 L 15 -12" fill="#15803D" stroke="#1E242B" stroke-width="3.5"/>
          <rect x="-85" y="-14" width="145" height="46" rx="22" fill="#166534" stroke="#1E242B" stroke-width="4.5"/>
          <path d="M -65 20 L 40 20" stroke="#86EFAC" stroke-width="5" stroke-linecap="round" stroke-dasharray="12 10"/>
          <path d="M 35 6 L 98 6 L 92 26 L 35 26 Z" fill="#15803D" stroke="#1E242B" stroke-width="4"/>
          <g id="croc2-jaw" transform="translate(35, 6)">
            <path d="M 0 -22 L 66 -16 L 64 2 L 0 2 Z" fill="#166534" stroke="#1E242B" stroke-width="4"/>
            <path d="M 14 2 L 20 12 L 26 2 M 32 2 L 38 12 L 44 2 M 48 2 L 54 12 L 60 2" fill="#FFFFFF" stroke="#1E242B" stroke-width="2.5"/>
            <circle cx="12" cy="-24" r="13" fill="#FACC15" stroke="#1E242B" stroke-width="3.5"/><circle cx="14" cy="-24" r="5" fill="#1E242B"/>
          </g>
          <g id="croc-num-2" opacity="0" transform="translate(-15, -62)">
            <rect x="-28" y="-26" width="56" height="44" rx="12" fill="#FACC15" stroke="#1E242B" stroke-width="4"/>
            <text x="0" y="5" font-family="JetBrains Mono" font-size="28" font-weight="900" fill="#1E242B" text-anchor="middle">02</text>
          </g>
        </g>

        <g id="croc-3" transform="translate(730, 475)">
          <path d="M -75 -12 L -60 -28 L -45 -12 L -30 -28 L -15 -12 L 0 -28 L 15 -12" fill="#15803D" stroke="#1E242B" stroke-width="3.5"/>
          <rect x="-85" y="-14" width="145" height="46" rx="22" fill="#166534" stroke="#1E242B" stroke-width="4.5"/>
          <path d="M -65 20 L 40 20" stroke="#86EFAC" stroke-width="5" stroke-linecap="round" stroke-dasharray="12 10"/>
          <path d="M 35 6 L 98 6 L 92 26 L 35 26 Z" fill="#15803D" stroke="#1E242B" stroke-width="4"/>
          <g id="croc3-jaw" transform="translate(35, 6)">
            <path d="M 0 -22 L 66 -16 L 64 2 L 0 2 Z" fill="#166534" stroke="#1E242B" stroke-width="4"/>
            <path d="M 14 2 L 20 12 L 26 2 M 32 2 L 38 12 L 44 2 M 48 2 L 54 12 L 60 2" fill="#FFFFFF" stroke="#1E242B" stroke-width="2.5"/>
            <circle cx="12" cy="-24" r="13" fill="#FACC15" stroke="#1E242B" stroke-width="3.5"/><circle cx="14" cy="-24" r="5" fill="#1E242B"/>
          </g>
          <g id="croc-num-3" opacity="0" transform="translate(-15, -62)">
            <rect x="-28" y="-26" width="56" height="44" rx="12" fill="#FACC15" stroke="#1E242B" stroke-width="4"/>
            <text x="0" y="5" font-family="JetBrains Mono" font-size="28" font-weight="900" fill="#1E242B" text-anchor="middle">03</text>
          </g>
        </g>

        <!-- HERO RIG: SI KANCIL -->
        <g id="kancil-rig" transform="translate(150, 295)">
          <ellipse cx="0" cy="6" rx="46" ry="12" fill="#1E242B" opacity="0.22"/>
          <g id="kancil-legs">
            <rect x="-28" y="-42" width="12" height="46" rx="6" fill="#B45309" stroke="#1E242B" stroke-width="3.5"/>
            <rect x="-8" y="-42" width="12" height="46" rx="6" fill="#D97706" stroke="#1E242B" stroke-width="3.5"/>
            <rect x="14" y="-42" width="12" height="46" rx="6" fill="#B45309" stroke="#1E242B" stroke-width="3.5"/>
            <rect x="30" y="-42" width="12" height="46" rx="6" fill="#D97706" stroke="#1E242B" stroke-width="3.5"/>
          </g>
          <ellipse cx="4" cy="-58" rx="48" ry="30" fill="#D97706" stroke="#1E242B" stroke-width="4.5"/>
          <path d="M -28 -44 Q 4 -32 36 -44" fill="none" stroke="#FEF3C7" stroke-width="8" stroke-linecap="round"/>
          <circle cx="-14" cy="-64" r="5" fill="#FEF3C7"/><circle cx="4" cy="-70" r="6" fill="#FEF3C7"/><circle cx="-4" cy="-52" r="4.5" fill="#FEF3C7"/>
          <path d="M -42 -66 Q -62 -78 -54 -52 Z" fill="#B45309" stroke="#1E242B" stroke-width="3.5"/>
          <path d="M 22 -74 L 36 -118 L 58 -110 L 44 -64 Z" fill="#D97706" stroke="#1E242B" stroke-width="4"/>

          <g id="royal-scroll" opacity="0" transform="translate(76, -82)">
            <rect x="-24" y="-32" width="68" height="48" rx="8" fill="#FEF3C7" stroke="#1E242B" stroke-width="3.5"/>
            <circle cx="10" cy="-8" r="10" fill="#EF4444" stroke="#1E242B" stroke-width="2.5"/>
            <path d="M -12 -20 L 32 -20 M -12 6 L 32 6" stroke="#92400E" stroke-width="3" stroke-linecap="round"/>
          </g>

          <g id="kancil-head" transform="translate(46, -132)">
            <g id="xray-brain" opacity="0" transform="translate(-6, -12)">
              <rect x="-38" y="-36" width="76" height="54" rx="14" fill="#0F172A" stroke="#38BDF8" stroke-width="3.5"/>
              <g id="brain-gear" transform="translate(-12, -9)">
                <circle cx="0" cy="0" r="14" fill="#FACC15" stroke="#1E242B" stroke-width="2.5"/>
                <path d="M 0 -19 L 0 19 M -19 0 L 19 0 M -13 -13 L 13 13 M -13 13 L 13 -13" stroke="#FACC15" stroke-width="5" stroke-linecap="round"/>
                <circle cx="0" cy="0" r="6" fill="#0F172A"/>
              </g>
              <g id="brain-bulb" transform="translate(18, -10)">
                <circle cx="0" cy="-4" r="12" fill="#FDE047" stroke="#CA8A04" stroke-width="2.5"/>
                <rect x="-5" y="6" width="10" height="7" rx="2" fill="#94A3B8"/>
              </g>
            </g>

            <path d="M -34 -14 C -34 -42 32 -42 42 -8 C 52 8 34 24 0 24 C -28 24 -34 8 -34 -14 Z" fill="#D97706" stroke="#1E242B" stroke-width="4.5"/>
            <ellipse cx="42" cy="-2" rx="8" ry="6" fill="#1E242B"/>
            <circle cx="12" cy="-10" r="8" fill="#1E242B"/><circle cx="14" cy="-12" r="3" fill="#FFFFFF"/>
            <path d="M 14 8 Q 26 16 34 6" fill="none" stroke="#1E242B" stroke-width="3.5" stroke-linecap="round"/>

            <g id="kancil-head-cap">
              <ellipse cx="-18" cy="-44" rx="11" ry="26" transform="rotate(-22 -18 -44)" fill="#B45309" stroke="#1E242B" stroke-width="4"/>
              <ellipse cx="-4" cy="-46" rx="12" ry="28" transform="rotate(-8 -4 -46)" fill="#D97706" stroke="#1E242B" stroke-width="4"/>
              <ellipse cx="-4" cy="-46" rx="6" ry="16" transform="rotate(-8 -4 -46)" fill="#FDE68A"/>
              <path d="M -32 -16 C -28 -40 24 -40 32 -16 Z" fill="#B45309" stroke="#1E242B" stroke-width="3.5"/>
            </g>
          </g>
        </g>

        <path id="jump-arc-path" d="M 160 270 Q 250 180 340 375 Q 440 240 535 375 Q 630 240 720 375 Q 820 190 900 265" fill="none" stroke="#FACC15" stroke-width="6" stroke-dasharray="14 12" stroke-linecap="round" opacity="0"/>

        <g id="call-kancil" opacity="0">
          <line x1="175" y1="150" x2="175" y2="75" stroke="#1E242B" stroke-width="3.5"/>
          <circle cx="175" cy="150" r="6" fill="#E05A2B"/>
          <rect x="45" y="25" width="280" height="52" rx="14" fill="#1E242B"/>
          <circle cx="72" cy="51" r="7" fill="#E05A2B"/>
          <text x="196" y="58" font-family="JetBrains Mono" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">${labels.callKancil}</text>
        </g>

        <g id="call-buaya" opacity="0">
          <line x1="545" y1="535" x2="545" y2="755" stroke="#1E242B" stroke-width="3.5"/>
          <circle cx="545" cy="535" r="6" fill="#FACC15"/>
          <rect x="375" y="755" width="340" height="54" rx="14" fill="#FACC15" stroke="#1E242B" stroke-width="3.5"/>
          <text x="545" y="790" font-family="JetBrains Mono" font-size="21" font-weight="900" fill="#1E242B" text-anchor="middle">${labels.callBuaya}</text>
        </g>

        <g id="call-apel" opacity="0">
          <line x1="935" y1="95" x2="885" y2="55" stroke="#1E242B" stroke-width="3.5"/>
          <circle cx="935" cy="95" r="6" fill="#16A34A"/>
          <rect x="705" y="10" width="290" height="52" rx="14" fill="#DCFCE7" stroke="#16A34A" stroke-width="3.5"/>
          <text x="850" y="43" font-family="JetBrains Mono" font-size="21" font-weight="900" fill="#15803D" text-anchor="middle">${labels.callApel}</text>
        </g>

        <g id="call-otak" opacity="0">
          <line x1="192" y1="190" x2="310" y2="250" stroke="#1E242B" stroke-width="3.5"/>
          <circle cx="192" cy="190" r="6" fill="#FACC15"/>
          <rect x="250" y="250" width="290" height="50" rx="12" fill="#FACC15" stroke="#1E242B" stroke-width="3.5"/>
          <text x="395" y="282" font-family="JetBrains Mono" font-size="20" font-weight="900" fill="#1E242B" text-anchor="middle">${labels.callOtak}</text>
        </g>

        <g id="burst-buaya" opacity="0" transform="translate(690, 210) scale(0)">
          <polygon points="0,-65 22,-42 58,-52 44,-20 76,0 44,20 58,52 22,42 0,65 -22,42 -58,52 -44,20 -76,0 -44,-20 -58,-52 -22,-42" fill="#FACC15" stroke="#1E242B" stroke-width="5"/>
          <text x="0" y="10" font-family="Plus Jakarta Sans" font-size="27" font-weight="900" fill="#1E242B" text-anchor="middle">${labels.burstBuaya}</text>
        </g>

        <g id="burst-ting" opacity="0" transform="translate(310, 95) scale(0)">
          <polygon points="0,-55 18,-35 48,-44 36,-16 64,0 36,16 48,44 18,35 0,55 -18,35 -48,44 -36,16 -64,0 -36,-16 -48,-44 -18,-35" fill="#FACC15" stroke="#1E242B" stroke-width="4.5"/>
          <text x="0" y="9" font-family="Plus Jakarta Sans" font-size="26" font-weight="900" fill="#1E242B" text-anchor="middle">${labels.burstTing}</text>
        </g>

        <g id="burst-hap" opacity="0" transform="translate(260, 120) scale(0)">
          <polygon points="0,-62 20,-40 54,-48 40,-18 72,0 40,18 54,48 20,40 0,62 -20,40 -54,48 -40,18 -72,0 -40,-18 -54,-48 -20,-40" fill="#FACC15" stroke="#1E242B" stroke-width="5"/>
          <text x="0" y="10" font-family="Plus Jakarta Sans" font-size="30" font-weight="900" fill="#1E242B" text-anchor="middle">${labels.burstHap}</text>
        </g>
      </g>
    </svg>

    <div class="dim-label">${labels.dimLabel}</div>
  </div>

  <!-- OVERLAY HUD CARDS -->
  <div class="hud-card" id="hud-iq" style="right: 68px; top: 420px; width: 390px;">
    <div class="hud-kicker">${labels.iqKicker}</div>
    <div class="hud-num"><span id="iq-num">10</span> ${labels.iqUnit}</div>
    <div class="hud-sub">${labels.iqSub}</div>
  </div>

  <div class="hud-card" id="hud-danger" style="left: 72px; top: 430px; width: 410px;">
    <div class="hud-kicker" style="background:#FEE2E2;color:#B91C1C;border-color:#EF4444;">${labels.dangerKicker}</div>
    <div class="hud-num" style="color:#DC2626;"><span id="danger-num">99</span>${labels.dangerUnit}</div>
    <div class="hud-sub">${labels.dangerSub}</div>
  </div>

  <div id="check-stack">
    <div class="check-card" id="chk-1">
      <div class="check-badge"><span>01</span><span>✅</span></div>
      <div><div class="check-title">${labels.chk1Title}</div><div class="check-desc">${labels.chk1Desc}</div></div>
    </div>
    <div class="check-card" id="chk-2">
      <div class="check-badge"><span>02</span><span>✅</span></div>
      <div><div class="check-title">${labels.chk2Title}</div><div class="check-desc">${labels.chk2Desc}</div></div>
    </div>
    <div class="check-card" id="chk-3">
      <div class="check-badge"><span>03</span><span>✅</span></div>
      <div><div class="check-title">${labels.chk3Title}</div><div class="check-desc">${labels.chk3Desc}</div></div>
    </div>
  </div>

  <div id="cta-card">
    <div class="cta-pill-top">${labels.ctaTop}</div>
    <div class="cta-question">${labels.ctaQ}</div>
    <div class="cta-options">
      <div class="cta-opt o1">${labels.opt1}</div>
      <div class="cta-opt o2">${labels.opt2}</div>
      <div class="cta-opt o3">${labels.opt3}</div>
    </div>
  </div>

  <div id="zone-subs"></div>
  <div class="vignette"></div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script>
const TIMELINE_DATA = ${JSON.stringify(timelineData)};
const q = new URLSearchParams(location.search);
const isLandscape = q.get('format') === 'landscape';
if (isLandscape) document.body.classList.add('landscape');

const W = isLandscape ? 1920 : 1080;
const H = isLandscape ? 1080 : 1920;
const DUR = TIMELINE_DATA.totalDuration;

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  document.getElementById('stage').style.transform = \`translate(-50%, -50%) scale(\${s})\`;
}
window.addEventListener('resize', fit);
fit();

const CHUNKS = [];
for (const ch of TIMELINE_DATA.chapters) {
  const ws = ch.words;
  const chunkSize = 6;
  for (let i = 0; i < ws.length; i += chunkSize) {
    const slice = ws.slice(i, i + chunkSize);
    const start = slice[0].start;
    const nextStart = (i + chunkSize < ws.length) ? ws[i + chunkSize].start : ch.end;
    const rows = [];
    for (let r = 0; r < slice.length; r += 3) {
      rows.push(slice.slice(r, r + 3));
    }
    CHUNKS.push({ chId: ch.id, start: Math.max(0, start - 0.08), end: nextStart, rows });
  }
}

const hdrKicker = document.getElementById('hdr-kicker');
const hdrTitle = document.getElementById('hdr-title');
const zoneSubs = document.getElementById('zone-subs');

function updateHUDAndSubtitles(t) {
  let activeCh = TIMELINE_DATA.chapters[0];
  for (const ch of TIMELINE_DATA.chapters) {
    if (t >= ch.start - 0.1) activeCh = ch;
  }
  if (hdrKicker.textContent !== activeCh.kicker) {
    hdrKicker.textContent = activeCh.kicker;
    hdrTitle.innerHTML = activeCh.headlineHtml;
  }

  const chunk = CHUNKS.find(c => t >= c.start && t < c.end);
  if (!chunk) {
    zoneSubs.innerHTML = '';
    return;
  }
  let html = '';
  for (const row of chunk.rows) {
    html += '<div class="sub-row">';
    for (const w of row) {
      const isActive = (t >= w.start - 0.04 && t <= w.end + 0.12);
      html += \`<span class="sub-word\${isActive ? ' active' : ''}">\${w.word}</span>\`;
    }
    html += '</div>';
  }
  zoneSubs.innerHTML = html;
}

const tl = gsap.timeline({ paused: true });
const cam = { x: 540, y: 460, s: 1 };
const camEl = document.getElementById('cam-rig');
function applyCam() {
  camEl.setAttribute('transform', \`translate(540, 460) scale(\${cam.s}) translate(\${-cam.x}, \${-cam.y})\`);
}
function moveCam(at, x, y, s, dur = 1.0, ease = 'power2.inOut') {
  tl.to(cam, { x, y, s, duration: dur, ease, onUpdate: applyCam }, at);
}

// Continuous background loops
tl.to('.wave-line', { strokeDashoffset: -180, duration: DUR, ease: 'none' }, 0);
tl.to('#croc1-jaw', { rotation: -12, transformOrigin: '0px 0px', duration: 0.9, yoyo: true, repeat: Math.ceil(DUR / 0.9), ease: 'sine.inOut' }, 0);
tl.to('#croc2-jaw', { rotation: -15, transformOrigin: '0px 0px', duration: 1.1, yoyo: true, repeat: Math.ceil(DUR / 1.1), ease: 'sine.inOut' }, 0.3);
tl.to('#croc3-jaw', { rotation: -10, transformOrigin: '0px 0px', duration: 0.85, yoyo: true, repeat: Math.ceil(DUR / 0.85), ease: 'sine.inOut' }, 0.6);
tl.to('#tree-canopy', { rotation: 2.5, transformOrigin: '0px -140px', duration: 1.8, yoyo: true, repeat: Math.ceil(DUR / 1.8), ease: 'sine.inOut' }, 0);
tl.to('#brain-gear', { rotation: 360 * 25, transformOrigin: '0px 0px', duration: DUR, ease: 'none' }, 0);

const C1 = TIMELINE_DATA.chapters[0].start;
const C2 = TIMELINE_DATA.chapters[1].start;
const C3 = TIMELINE_DATA.chapters[2].start;
const C4 = TIMELINE_DATA.chapters[3].start;
const C5 = TIMELINE_DATA.chapters[4].start;
const C6 = TIMELINE_DATA.chapters[5].start;
const C7 = TIMELINE_DATA.chapters[6].start;

/* CH1 */
tl.fromTo('#diorama-board', { scale: 0.88, opacity: 0, transformOrigin: '540px 520px' }, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.5)' }, 0);
tl.fromTo('#call-kancil', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' }, C1 + 1.2);
tl.fromTo('#call-buaya', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' }, C1 + 3.2);
tl.fromTo('#burst-buaya', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, C1 + 4.0);

/* CH2 */
tl.to(['#call-kancil', '#call-buaya', '#burst-buaya'], { opacity: 0, duration: 0.3 }, C2 - 0.15);
moveCam(C2, 700, 390, 1.2, 1.0);
tl.fromTo('#call-apel', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' }, C2 + 1.0);
tl.fromTo('#hud-danger', { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: 'back.out(1.5)' }, C2 + 2.8);
const dangerObj = { v: 25 };
tl.to(dangerObj, { v: 99, duration: 2.2, ease: 'power2.out', onUpdate() { document.getElementById('danger-num').textContent = String(Math.round(dangerObj.v)); } }, C2 + 3.0);

/* CH3 */
tl.to(['#call-apel', '#hud-danger'], { opacity: 0, duration: 0.3 }, C3 - 0.15);
moveCam(C3, 220, 290, 1.58, 1.0);
tl.fromTo('#burst-ting', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.4)' }, C3 + 1.8);
tl.to('#kancil-head-cap', { y: -42, rotation: -14, duration: 0.65, ease: 'back.out(1.8)' }, C3 + 1.9);
tl.to('#xray-brain', { opacity: 1, duration: 0.35 }, C3 + 2.0);
tl.fromTo('#call-otak', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 }, C3 + 2.4);
tl.fromTo('#hud-iq', { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.5)' }, C3 + 2.7);
const iqObj = { v: 10 };
tl.to(iqObj, { v: 100, duration: 2.5, ease: 'power2.out', onUpdate() { document.getElementById('iq-num').textContent = String(Math.round(iqObj.v)); } }, C3 + 2.9);

/* CH4 */
tl.to(['#burst-ting', '#call-otak', '#hud-iq', '#xray-brain'], { opacity: 0, duration: 0.3 }, C4 - 0.15);
tl.to('#kancil-head-cap', { y: 0, rotation: 0, duration: 0.4 }, C4 - 0.15);
moveCam(C4, 540, 450, 1.04, 1.0);
tl.fromTo('#royal-scroll', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, C4 + 0.8);
tl.to('#croc-1', { x: 355, y: 455, duration: 0.9, ease: 'back.out(1.4)' }, C4 + 3.6);
tl.to('#croc-2', { x: 545, y: 455, duration: 0.9, ease: 'back.out(1.4)' }, C4 + 3.8);
tl.to('#croc-3', { x: 735, y: 455, duration: 0.9, ease: 'back.out(1.4)' }, C4 + 4.0);
tl.to(['#croc-num-1', '#croc-num-2', '#croc-num-3'], { opacity: 1, duration: 0.4, stagger: 0.25 }, C4 + 4.5);

/* CH5 */
tl.to('#royal-scroll', { opacity: 0, duration: 0.25 }, C5 - 0.1);
tl.to('#jump-arc-path', { opacity: 0.85, duration: 0.4 }, C5 + 0.1);
tl.fromTo('#burst-hap', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.2)' }, C5 + 0.1);

tl.to('#kancil-rig', { keyframes: [{ x: 250, y: 230, rotation: 10, duration: 0.45, ease: 'power2.out' }, { x: 350, y: 425, rotation: 0, duration: 0.45, ease: 'bounce.out' }] }, C5 + 0.9);
tl.to('#croc-1', { y: 472, duration: 0.18, yoyo: true, repeat: 1 }, C5 + 1.7);

tl.to('#kancil-rig', { keyframes: [{ x: 450, y: 280, rotation: 10, duration: 0.45, ease: 'power2.out' }, { x: 540, y: 425, rotation: 0, duration: 0.45, ease: 'bounce.out' }] }, C5 + 2.0);
tl.to('#croc-2', { y: 472, duration: 0.18, yoyo: true, repeat: 1 }, C5 + 2.8);

tl.to('#kancil-rig', { keyframes: [{ x: 635, y: 280, rotation: 10, duration: 0.45, ease: 'power2.out' }, { x: 730, y: 425, rotation: 0, duration: 0.45, ease: 'bounce.out' }] }, C5 + 3.0);
tl.to('#croc-3', { y: 472, duration: 0.18, yoyo: true, repeat: 1 }, C5 + 3.8);

tl.to('#kancil-rig', { keyframes: [{ x: 825, y: 150, rotation: -10, duration: 0.55, ease: 'power2.out' }, { x: 895, y: 270, rotation: 0, duration: 0.55, ease: 'bounce.out' }] }, C5 + 4.8);
tl.to('#burst-hap', { opacity: 0, scale: 0.5, duration: 0.3 }, C5 + 6.0);

/* CH6 */
tl.to('#jump-arc-path', { opacity: 0, duration: 0.3 }, C6 - 0.1);
moveCam(C6, 310, 460, 0.92, 0.9);
tl.fromTo('#chk-1', { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'back.out(1.5)' }, C6 + 0.5);
tl.fromTo('#chk-2', { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'back.out(1.5)' }, C6 + 2.0);
tl.fromTo('#chk-3', { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'back.out(1.5)' }, C6 + 3.5);

/* CH7 */
tl.to(['#chk-1', '#chk-2', '#chk-3'], { opacity: 0, x: -40, duration: 0.35 }, C7 - 0.15);
moveCam(C7, 540, 680, 0.85, 0.8);
tl.fromTo('#cta-card', { opacity: 0, y: 50, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.6)' }, C7 + 0.3);

tl.to({}, { duration: 0.01 }, DUR);

window.OPENER = {
  W, H, DURATION: DUR, tl, ready: true,
  seek(t) {
    tl.pause(t, false);
    applyCam();
    updateHUDAndSubtitles(t);
    if (gsap.ticker.tick) gsap.ticker.tick();
  }
};

if (!q.has('clean')) {
  gsap.ticker.add(() => updateHUDAndSubtitles(tl.time()));
  tl.play(0);
} else {
  updateHUDAndSubtitles(0);
}
</script>
</body>
</html>`;
}

async function generateThumbnails() {
  const thumbDir = path.join(STORY_DIR, "assets/thumbnails");
  await fs.mkdir(thumbDir, { recursive: true });

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  for (const lang of ["id", "en"] as const) {
    const htmlPath = path.join(STORY_DIR, "motion", lang, "index.html");

    // 1. Portrait 9:16 Thumbnail (at t=18.2s or 33.2s — vibrant action frame)
    const pPage = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await pPage.goto(`file://${htmlPath}?clean=1&format=vertical`, { waitUntil: "networkidle" });
    await pPage.evaluate(() => document.fonts.ready);
    await pPage.evaluate(() => (window as any).OPENER.seek(4.8));
    await pPage.waitForTimeout(40);
    await pPage.screenshot({ path: path.join(thumbDir, `${lang}-9x16.png`), type: "png" });
    await pPage.close();

    // 2. Landscape 16:9 Thumbnail
    const lPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await lPage.goto(`file://${htmlPath}?clean=1&format=landscape`, { waitUntil: "networkidle" });
    await lPage.evaluate(() => document.fonts.ready);
    await lPage.evaluate(() => (window as any).OPENER.seek(4.8));
    await lPage.waitForTimeout(40);
    await lPage.screenshot({ path: path.join(thumbDir, `${lang}-16x9.png`), type: "png" });
    await lPage.close();
  }

  await browser.close();
  console.log(`   🖼️ Generated 4 thumbnails (id/en × 16:9/9:16) in ${thumbDir}`);
}

async function main() {
  const shouldPushR2 = process.argv.includes("--push");
  console.log(`\n==================================================================`);
  console.log(`🏗️  PACKAGING EDU-MOTION EPISODE: [${SLUG}]`);
  console.log(`   Track     : edu-motion (Separated from Original-Illustration Books)`);
  console.log(`   Archetype : diorama-cross-section`);
  console.log(`==================================================================\n`);

  await fs.mkdir(STORY_DIR, { recursive: true });

  // Copy already synthesized ID voiceover from scratch if available to save time
  const scratchDir =
    "/Users/ramadhani.musthofa/.gemini/antigravity/brain/a4b65591-83d1-4935-8a2a-296ff3ee5e38/scratch/poc_fabel_kancil";
  const idMotionDir = path.join(STORY_DIR, "motion/id");
  const enMotionDir = path.join(STORY_DIR, "motion/en");
  await fs.mkdir(idMotionDir, { recursive: true });
  await fs.mkdir(enMotionDir, { recursive: true });

  if (existsSync(path.join(scratchDir, "vo_combined.mp3")) && existsSync(path.join(scratchDir, "timeline.json"))) {
    await fs.copyFile(path.join(scratchDir, "vo_combined.mp3"), path.join(idMotionDir, "vo_combined.mp3"));
    await fs.copyFile(path.join(scratchDir, "timeline.json"), path.join(idMotionDir, "timeline.json"));
  }

  const idTimeline = await synthesizeEditionVoice("id", idMotionDir);
  const enTimeline = await synthesizeEditionVoice("en", enMotionDir);

  await fs.writeFile(path.join(idMotionDir, "index.html"), buildResponsiveStageHtml("id", idTimeline), "utf-8");
  await fs.writeFile(path.join(enMotionDir, "index.html"), buildResponsiveStageHtml("en", enTimeline), "utf-8");

  await generateThumbnails();

  // Build standard story.json manifest so publish-all.ts, R2, and D1 catalog work seamlessly
  const manifest = {
    slug: SLUG,
    pipelineTrack: "edu-motion",
    motionArchetype: "diorama-cross-section",
    title: "Fabel Nusantara: Si Kancil & Jembatan Buaya",
    originalTitle: "Indonesian Fable: The Clever Mousedeer & The Crocodile Bridge",
    author: "Zayn Edu-Motion Studio (Fabel Rakyat Nusantara)",
    illustrator: "Zayn Vector Rigging Engine",
    publisher: "Zayn Storybook Indonesia",
    license: "CC-BY-NC-SA 4.0 / Folklore Domain Publik",
    readingLevel: 2,
    theme: "Edukasi Anak & Fabel Kecerdikan Nusantara",
    sourceUrl: "https://storybook-catalog.pages.dev/",
    language: "id-ID",
    moral: {
      headlineId: "Akal Cerdik Mengalahkan Otot Raksasa!",
      spokenId: "Tetap tenang, berpikir cerdik, dan pantang menyerah saat menghadapi masalah besar!",
      headlineEn: "Clever Wit Beats Giant Muscle!",
      spokenEn: "Stay calm, think smart, and never give up when facing a giant problem!",
    },
    thumbnails: {
      id: {
        landscape: "assets/thumbnails/id-16x9.png",
        vertical: "assets/thumbnails/id-9x16.png",
      },
      en: {
        landscape: "assets/thumbnails/en-16x9.png",
        vertical: "assets/thumbnails/en-9x16.png",
      },
    },
    scenes: CHAPTERS.map((c, idx) => ({
      sceneId: c.id,
      index: idx + 1,
      type: idx === 0 ? "cover" : idx === CHAPTERS.length - 1 ? "outro" : "story",
      durationSeconds: Number((idTimeline.chapters[idx].end - idTimeline.chapters[idx].start).toFixed(2)),
      audio: {
        text: c.text.id,
        en: {
          text: c.text.en,
          durationSeconds: Number((enTimeline.chapters[idx].end - enTimeline.chapters[idx].start).toFixed(2)),
        },
      },
    })),
    exports: {},
  };

  const manifestPath = path.join(STORY_DIR, "story.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`   📄 Saved manifest: ${manifestPath}`);

  if (shouldPushR2) {
    await pushStory(SLUG);
    try {
      await db.saveStory(manifest);
      console.log(`   ☁️ Saved [${SLUG}] metadata to Cloudflare D1!`);
    } catch (e: any) {
      console.warn(`   ⚠️ D1 save warning: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
