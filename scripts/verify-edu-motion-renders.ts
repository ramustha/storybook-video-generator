import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { resolveFfmpegBinaries } from "../src/motion/render-motion-stage";

interface RenderProbeRow {
  file: string;
  lang: string;
  dimensions: string;
  codecs: string;
  durationSec: number;
  sizeMb: string;
  withinCap: boolean;
}

async function listMp4Files(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...(await listMp4Files(p)));
    } else if (e.isFile() && e.name.endsWith(".mp4")) {
      results.push(p);
    }
  }
  return results.sort();
}

function fmtTimestamp(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = (s % 60).toFixed(2).padStart(5, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${rem}`;
}

async function main() {
  const args = process.argv.slice(2);
  const bookIdx = args.indexOf("--book");
  const bookSlug = bookIdx >= 0 ? args[bookIdx + 1] : undefined;
  if (!bookSlug) {
    console.error("Usage: npx tsx scripts/verify-edu-motion-renders.ts --book <slug>");
    process.exit(1);
  }

  const storyDir = path.resolve("stories", bookSlug);
  const exportsDir = path.join(storyDir, "exports");
  const previewDir = path.join(exportsDir, "_preview_frames");
  await fs.mkdir(previewDir, { recursive: true });

  let maxDurationSec = 88.0;
  const specPath = path.join(storyDir, "motion-spec.json");
  if (existsSync(specPath)) {
    const spec = JSON.parse(await fs.readFile(specPath, "utf-8"));
    if (typeof spec?.pacing?.maxVerticalDurationSec === "number") {
      maxDurationSec = spec.pacing.maxVerticalDurationSec;
    }
  }

  const mp4Files = await listMp4Files(exportsDir);
  if (mp4Files.length === 0) {
    throw new Error(`No rendered .mp4 files found under ${exportsDir}`);
  }

  const { ffmpeg, ffprobe } = resolveFfmpegBinaries();
  const rows: RenderProbeRow[] = [];
  let hasViolation = false;

  for (const mp4 of mp4Files) {
    const st = await fs.stat(mp4);
    const probeJson = execSync(
      `${ffprobe} -v error -show_entries stream=codec_name,width,height -show_entries format=duration -of json "${mp4}"`
    ).toString();
    const parsed = JSON.parse(probeJson);
    const vStream = parsed.streams?.find((s: any) => s.width && s.height);
    const aStream = parsed.streams?.find((s: any) => !s.width);
    const dur = parseFloat(parsed.format?.duration || "0");

    if (!vStream || !aStream || !Number.isFinite(dur) || dur <= 0) {
      throw new Error(`Invalid video/audio stream in rendered MP4: ${mp4}`);
    }

    const isExpectedDim =
      (vStream.width === 1080 && vStream.height === 1920) ||
      (vStream.width === 1920 && vStream.height === 1080);
    const isH264Aac = vStream.codec_name === "h264" && aStream.codec_name === "aac";
    const withinCap = dur <= maxDurationSec;
    if (!isExpectedDim || !isH264Aac || !withinCap) {
      hasViolation = true;
    }

    const relFromExports = path.relative(exportsDir, mp4);
    const lang = relFromExports.split(path.sep)[0] || "id";

    rows.push({
      file: path.basename(mp4),
      lang: lang.toUpperCase(),
      dimensions: `${vStream.width}x${vStream.height}`,
      codecs: `${vStream.codec_name}/${aStream.codec_name}`,
      durationSec: Number(dur.toFixed(2)),
      sizeMb: `${(st.size / 1024 / 1024).toFixed(2)} MB`,
      withinCap: withinCap && isExpectedDim && isH264Aac,
    });

    // Extract Intro, Focal Story Beat, Moral, and Outro review frames from timeline cues
    const tlPath = path.join(storyDir, "motion", lang.toLowerCase(), "timeline.json");
    if (existsSync(tlPath)) {
      const tl = JSON.parse(await fs.readFile(tlPath, "utf-8"));
      const chapters = tl.chapters || [];
      const cover = chapters.find((c: any) => c.section === "cover");
      const stories = chapters.filter((c: any) => c.section === "story");
      const midStory = stories[Math.floor(stories.length / 2)] || stories[0];
      const moral = chapters.find((c: any) => c.section === "moral");
      const outro = chapters.find((c: any) => c.section === "outro");

      const cues = [
        cover ? { label: "intro", sec: cover.start + 1.5 } : null,
        midStory ? { label: "beat", sec: midStory.start + 1.8 } : null,
        moral ? { label: "moral", sec: moral.start + 1.4 } : null,
        outro ? { label: "outro", sec: outro.start + 1.4 } : null,
      ].filter(Boolean) as Array<{ label: string; sec: number }>;

      const orientTag = vStream.width > vStream.height ? "16x9" : "9x16";
      for (const cue of cues) {
        const outPng = path.join(previewDir, `${lang.toLowerCase()}-${orientTag}-${cue.label}.png`);
        execSync(`${ffmpeg} -y -ss ${fmtTimestamp(cue.sec)} -i "${mp4}" -frames:v 1 "${outPng}"`, {
          stdio: "pipe",
        });
      }
    }
  }

  console.log(`\n==================================================================`);
  console.log(`🔍 EDU-MOTION RENDER VERIFICATION: [${bookSlug}] (cap <= ${maxDurationSec}s)`);
  for (const r of rows) {
    console.log(
      `   ${r.withinCap ? "✅" : "❌"} [${r.lang}] ${r.file.padEnd(50)} ${r.dimensions} ${r.codecs} ${r.durationSec.toFixed(2)}s (${r.sizeMb})`
    );
  }
  console.log(`==================================================================\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const md = [
      `### 🎬 Edu-Motion Preview Verification — \`${bookSlug}\``,
      ``,
      `| Lang | File | Resolution | Codecs | Duration (cap ≤ ${maxDurationSec}s) | Size | Gate |`,
      `|---|---|---|---|---:|---:|---|`,
      ...rows.map(
        (r) =>
          `| ${r.lang} | \`${r.file}\` | ${r.dimensions} | ${r.codecs} | ${r.durationSec.toFixed(2)}s | ${r.sizeMb} | ${r.withinCap ? "✅ PASS" : "❌ FAIL"} |`
      ),
      ``,
      `> Preview keyframes extracted to \`exports/_preview_frames/\` and attached alongside MP4 artifacts.`,
      ``,
    ].join("\n");
    await fs.appendFile(summaryPath, md, "utf-8");
  }

  if (hasViolation) {
    throw new Error(`One or more rendered MP4s failed stream, resolution, or duration <= ${maxDurationSec}s checks.`);
  }
}

main().catch((err) => {
  console.error("❌ Render verification failed:", err);
  process.exit(1);
});
