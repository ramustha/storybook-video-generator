import { chromium } from "playwright";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";

/**
 * Resolves a working ffmpeg / ffprobe binary across Ubuntu CI/CD runners and macOS local dev.
 */
export function resolveFfmpegBinaries(): { ffmpeg: string; ffprobe: string } {
  // 1. Check system PATH first (Ubuntu GitHub Actions has /usr/bin/ffmpeg installed via apt)
  try {
    const sysFfmpeg = execSync("command -v ffmpeg", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const sysFfprobe = execSync("command -v ffprobe", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (sysFfmpeg && sysFfprobe) {
      return { ffmpeg: `"${sysFfmpeg}"`, ffprobe: `"${sysFfprobe}"` };
    }
  } catch {
    // Fallback to Remotion bundled compositor binaries
  }

  const darwinArm64 = path.resolve("./node_modules/@remotion/compositor-darwin-arm64");
  if (existsSync(path.join(darwinArm64, "ffmpeg"))) {
    return {
      ffmpeg: `DYLD_LIBRARY_PATH="${darwinArm64}" "${path.join(darwinArm64, "ffmpeg")}"`,
      ffprobe: `DYLD_LIBRARY_PATH="${darwinArm64}" "${path.join(darwinArm64, "ffprobe")}"`,
    };
  }

  const linuxX64 = path.resolve("./node_modules/@remotion/compositor-linux-x64-gnu");
  if (existsSync(path.join(linuxX64, "ffmpeg"))) {
    return {
      ffmpeg: `LD_LIBRARY_PATH="${linuxX64}" "${path.join(linuxX64, "ffmpeg")}"`,
      ffprobe: `LD_LIBRARY_PATH="${linuxX64}" "${path.join(linuxX64, "ffprobe")}"`,
    };
  }

  return { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
}

/**
 * Resolves a Chromium executable across Ubuntu GitHub Actions runners and macOS local dev.
 */
export function resolveChromiumExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Also check Remotion's downloaded headless shell if present
  try {
    const remotionChromeDir = path.resolve("./node_modules/.remotion/chrome-headless-shell");
    if (existsSync(remotionChromeDir)) {
      const found = execSync(`find "${remotionChromeDir}" -name "chrome-headless-shell" -type f 2>/dev/null || true`)
        .toString()
        .trim()
        .split("\n")[0];
      if (found && existsSync(found)) {
        return found;
      }
    }
  } catch {}

  return undefined;
}

export interface RenderMotionVideoOptions {
  storyDir: string;
  bookSlug: string;
  lang: "id" | "en";
  format: "vertical" | "landscape";
  outputLocation: string;
  fps?: number;
}

/**
 * Deterministically renders an Edu-Motion HTML5 + SVG + GSAP stage frame-by-frame
 * into an H.264 + AAC MP4 file with zero AI dependency.
 */
export async function renderEduMotionVideo(options: RenderMotionVideoOptions): Promise<{
  width: number;
  height: number;
  durationSeconds: number;
  totalFrames: number;
}> {
  const { storyDir, lang, format, outputLocation, fps = 30 } = options;
  const motionDir = path.join(storyDir, "motion", lang);

  // Check for format-specific HTML (e.g. index-16x9.html or index-9x16.html) or universal responsive index.html
  const formatHtml = path.join(motionDir, format === "vertical" ? "index-9x16.html" : "index-16x9.html");
  const defaultHtml = path.join(motionDir, "index.html");
  const htmlPath = existsSync(formatHtml) ? formatHtml : defaultHtml;
  const voMp3Path = path.join(motionDir, "vo_combined.mp3");

  if (!existsSync(htmlPath)) {
    throw new Error(`Edu-Motion stage HTML not found at: ${htmlPath}`);
  }
  if (!existsSync(voMp3Path)) {
    throw new Error(`Edu-Motion combined voiceover MP3 not found at: ${voMp3Path}`);
  }

  const width = format === "vertical" ? 1080 : 1920;
  const height = format === "vertical" ? 1920 : 1080;

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const tempFramesDir = path.join(storyDir, "cache", `frames_${lang}_${format}`);
  await fs.rm(tempFramesDir, { recursive: true, force: true });
  await fs.mkdir(tempFramesDir, { recursive: true });

  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    const fileUrl = `file://${htmlPath}?clean=1&format=${format}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const durationSeconds: number = await page.evaluate(() => (window as any).OPENER?.DURATION || 45);
    const totalFrames = Math.ceil(durationSeconds * fps);

    console.log(
      `🎬 [Edu-Motion Renderer] Rendering ${lang.toUpperCase()} ${format.toUpperCase()} (${width}x${height}, ${totalFrames} frames @ ${fps}fps, ${durationSeconds}s)...`
    );

    const startTime = Date.now();
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      await page.evaluate((time) => {
        (window as any).OPENER.seek(time);
      }, t);

      const framePath = path.join(tempFramesDir, `f${String(f).padStart(5, "0")}.jpg`);
      await page.screenshot({
        path: framePath,
        type: "jpeg",
        quality: 92,
      });

      if (f % 150 === 0 || f === totalFrames - 1) {
        const pct = Math.round(((f + 1) / totalFrames) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ⏳ [${lang.toUpperCase()}-${format}] ${pct}% (${f + 1}/${totalFrames} frames, ${elapsed}s)`);
      }
    }

    await browser.close();

    await fs.mkdir(path.dirname(outputLocation), { recursive: true });
    const { ffmpeg } = resolveFfmpegBinaries();

    console.log(`🎞️ [Edu-Motion Renderer] Encoding H.264 MP4 + AAC Audio -> ${outputLocation}`);
    execSync(
      `${ffmpeg} -y -framerate ${fps} -i "${tempFramesDir}/f%05d.jpg" -i "${voMp3Path}" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast -c:a aac -b:a 192k -movflags +faststart -shortest "${outputLocation}"`,
      { stdio: "inherit" }
    );

    return { width, height, durationSeconds, totalFrames };
  } finally {
    try {
      await browser.close();
    } catch {}
    await fs.rm(tempFramesDir, { recursive: true, force: true }).catch(() => {});
  }
}
