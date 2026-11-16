import { chromium } from "playwright";
import path from "path";
import os from "os";
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
  concurrency?: number;
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

  // Check for format-specific HTML & audio (index-16x9.html / vo_combined-16x9.mp3 vs index-9x16.html / vo_combined-9x16.mp3)
  const formatHtml = path.join(motionDir, format === "vertical" ? "index-9x16.html" : "index-16x9.html");
  const defaultHtml = path.join(motionDir, "index.html");
  const htmlPath = existsSync(formatHtml) ? formatHtml : defaultHtml;
  const formatVo = path.join(motionDir, format === "vertical" ? "vo_combined-9x16.mp3" : "vo_combined-16x9.mp3");
  const defaultVo = path.join(motionDir, "vo_combined.mp3");
  const voMp3Path = existsSync(formatVo) ? formatVo : defaultVo;

  if (!existsSync(htmlPath)) {
    throw new Error(`Edu-Motion stage HTML not found at: ${htmlPath}`);
  }
  if (!existsSync(voMp3Path)) {
    throw new Error(`Edu-Motion combined voiceover MP3 not found at: ${voMp3Path}`);
  }

  const width = format === "vertical" ? 1080 : 1920;
  const height = format === "vertical" ? 1920 : 1080;
  const workerCount =
    options.concurrency ?? Math.max(2, Math.min(8, Math.floor((os.cpus()?.length || 4) * 0.75)));

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu-vsync"],
  });

  const tempFramesDir = path.join(storyDir, "cache", `frames_${lang}_${format}`);
  await fs.rm(tempFramesDir, { recursive: true, force: true });
  await fs.mkdir(tempFramesDir, { recursive: true });

  try {
    const fileUrl = `file://${htmlPath}?clean=1&format=${format}`;
    const pages = await Promise.all(
      Array.from({ length: workerCount }, async () => {
        const page = await browser.newPage({
          viewport: { width, height },
          deviceScaleFactor: 1,
        });
        await page.goto(fileUrl, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        return page;
      })
    );

    const durationSeconds: number = await pages[0].evaluate(() => (window as any).OPENER?.DURATION || 45);
    const totalFrames = Math.ceil(durationSeconds * fps);

    console.log(
      `🎬 [Edu-Motion Renderer] Rendering ${lang.toUpperCase()} ${format.toUpperCase()} (${width}x${height}, ${totalFrames} frames @ ${fps}fps, ${durationSeconds}s, ${workerCount} workers)...`
    );

    const startTime = Date.now();
    let completedFrames = 0;

    await Promise.all(
      pages.map(async (page, workerIndex) => {
        for (let f = workerIndex; f < totalFrames; f += workerCount) {
          const t = f / fps;
          await page.evaluate((time) => {
            (window as any).OPENER.seek(time);
          }, t);

          const framePath = path.join(tempFramesDir, `f${String(f).padStart(5, "0")}.jpg`);
          await page.screenshot({
            path: framePath,
            type: "jpeg",
            quality: 95,
          });

          completedFrames += 1;
          if (completedFrames % 150 === 0 || completedFrames === totalFrames) {
            const pct = Math.round((completedFrames / totalFrames) * 100);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(
              `   ⏳ [${lang.toUpperCase()}-${format}] ${pct}% (${completedFrames}/${totalFrames} frames, ${elapsed}s)`
            );
          }
        }
      })
    );

    await Promise.all(pages.map((p) => p.close().catch(() => {})));
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
