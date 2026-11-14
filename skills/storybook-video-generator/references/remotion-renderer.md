# Remotion Video Rendering & Scaffolding Guide

This document specifies the Remotion project structure, composition definitions, dynamic duration calculation, and headless CLI rendering scripts for MP4 export.

---

## 1. Composition Definitions & Scaffolding

### Remotion Root (`src/remotion/Root.tsx`)
Declare two compositions for Landscape (16:9) and Vertical (9:16) with dynamic frame calculation:

```tsx
import React from "react";
import { Composition } from "remotion";
import { StorybookVideoComposition } from "./components/StorybookVideoComposition";
import { BookSceneGraph } from "@/types/sceneGraph";

export const COVER_DURATION_SECONDS = 2.5;

export function calculateTotalFrames(book: BookSceneGraph, fps: number = 30): number {
  const coverFrames = Math.ceil(COVER_DURATION_SECONDS * fps);
  const storyFrames = book.pages.reduce((acc, page) => {
    let pageDurationSeconds = 5.0;
    if (page.narrative.words && page.narrative.words.length > 0) {
      const lastWord = page.narrative.words[page.narrative.words.length - 1];
      pageDurationSeconds = Math.max(3.5, lastWord.end + 1.2);
    }
    return acc + Math.ceil(pageDurationSeconds * fps);
  }, 0);
  return coverFrames + storyFrames;
}

export const RemotionRoot: React.FC = () => {
  const fps = 30;

  return (
    <>
      {/* 16:9 Landscape for Web & YouTube (1920x1080) */}
      <Composition
        id="StorybookVideoComposition-Landscape"
        component={StorybookVideoComposition}
        durationInFrames={300}
        fps={fps}
        width={1920}
        height={1080}
        calculateMetadata={({ props }) => ({
          durationInFrames: calculateTotalFrames(props.book, fps),
        })}
      />

      {/* 9:16 Vertical for Shorts & Reels (1080x1920) */}
      <Composition
        id="StorybookVideoComposition-Vertical"
        component={StorybookVideoComposition}
        durationInFrames={300}
        fps={fps}
        width={1080}
        height={1920}
        calculateMetadata={({ props }) => ({
          durationInFrames: calculateTotalFrames(props.book, fps),
        })}
      />
    </>
  );
};
```

---

## 2. Headless Rendering Script (`scripts/render-book.ts`)

```ts
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || getArg("--book-id");
  if (!bookSlug) {
    console.error("Error: --book <book-slug> is required.");
    process.exit(1);
  }

  const requestedFormat = getArg("--format") || "both"; // "landscape" | "vertical" | "both"
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  const storyData = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: storyDir, // Serves assets relative to story directory
  });

  const formats: Array<"landscape" | "vertical"> =
    requestedFormat === "both" || requestedFormat === "all"
      ? ["landscape", "vertical"]
      : [requestedFormat as "landscape" | "vertical"];

  for (const format of formats) {
    const compositionId =
      format === "vertical"
        ? "StorybookVideoComposition-Vertical"
        : "StorybookVideoComposition-Landscape";

    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: { book: storyData, orientation: format, baseDir: storyDir },
    });

    const exportDir = path.join(storyDir, "exports");
    await fs.mkdir(exportDir, { recursive: true });
    const outputLocation = path.join(exportDir, `${bookSlug}-${format === "vertical" ? "9x16" : "16x9"}.mp4`);

    console.log(`🎬 Rendering ${format} video for "${storyData.title}"...`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: { book: storyData, orientation: format, baseDir: storyDir },
    });

    console.log(`✔ Video exported successfully: ${outputLocation}`);
  }
}

main().catch(console.error);
```

---

## 3. CLI Render Execution

Render directly from terminal into the story's own `exports/` folder:

```bash
# 1. Render both Landscape (16:9) and Vertical (9:16) MP4s (Default 1080p Full HD)
npx tsx scripts/render-book.ts --book <book-slug> --format all

# 2. Render only 16:9 Landscape MP4 (Full HD 1920x1080)
npx tsx scripts/render-book.ts --book <book-slug> --format landscape

# 3. Render only 9:16 Vertical Shorts/Reels MP4 (Full HD 1080x1920)
npx tsx scripts/render-book.ts --book <book-slug> --format vertical

# 4. Optional: 4K UHD Master Render (3840x2160 & 2160x3840)
# Triggers YouTube high-bitrate VP9/AV1 codec allocation for zero compression artifacts
npx tsx scripts/render-book.ts --book <book-slug> --format all --resolution 4k
```

---

## 4. High-Throughput Render Speedup Engine

Remotion rendering speed is dominated by two bottlenecks: Chromium software rasterization / CSS filter repaints and single-frame PNG encoding across too few worker tabs. Use these four optimizations together (implemented centrally in `scripts/lib/render-options.ts` via `getOptimalRenderOptions`):

1. **Dynamic Multi-Core Concurrency**:
   * **1080p Full HD**: `clamp(Math.floor(cpus * 0.75), 2, 8)` on macOS/Linux (and `Math.floor(cpus * 0.5)` on Windows).
   * **4K UHD**: Cap concurrency at `4` to prevent Chromium tab OOM spikes on high-resolution canvases.
   * Override anytime via `REMOTION_CONCURRENCY=<n>` or `--concurrency <n>`.
2. **ANGLE / SwANGLE GPU Rasterization + VSync Unlock**:
   * Pass `gl: process.platform === "linux" ? "swangle" : "angle"` so Apple Metal / Windows D3D11 / Linux SwiftShader-ANGLE handles bitmap compositing.
   * Pass `chromiumOptions: { args: ["--disable-gpu-vsync"] }` so offscreen headless tabs never block on 60Hz display vertical sync.
3. **JPEG Intermediate Frames (`jpegQuality: 95`)**:
   * Set `imageFormat: "jpeg"` and `jpegQuality: 95` instead of `png`. Lossless PNG deflate serialization dominates Remotion's frame extraction time; `jpegQuality: 95` eliminates deflate overhead before `libx264` CRF encoding with visually indistinguishable final MP4 quality.
4. **Eliminate Per-Frame CSS Blur Repaints**:
   * **Static Blur Backdrop Scale**: Never run large `filter: blur(40-48px)` over moving `Img` backgrounds at full canvas resolution; scale down static blurred background layers or pre-filter once so Chromium does not recompute full-screen Gaussian convolution on every animated Ken Burns frame.
   * **No `backdropFilter` on Opaque Boxes**: Never use `backdropFilter: "blur(...)"` on cards/HUDs/subtitles whose background opacity is `>= 0.90` — the solid background already hides underlying artwork while `backdropFilter` forces an extra full-layer readback per frame.
5. **Single-Bundle Multi-Target Batching**:
   * Render all formats/languages of a story in one `--lang all --format all` run (or group sibling EN+ID stories via `scripts/buffer-prerender.ts`) so `bundle()` executes Webpack once and reuses the compiled bundle across compositions.

### Verified Benchmark (Apple M4 10-Core, `bima-tukang-tidur` EN 9:16 — 4,732 frames @ `1080×1920`)
| Configuration | Render Duration | Throughput | End-to-End Wall Time |
| :--- | :--- | :--- | :--- |
| Baseline (`concurrency: 2`, PNG, per-frame blur) | `302.1s` | `15.66 fps` | `340.85s` |
| Optimized (`concurrency: 8`, `gl: "angle"`, `jpegQuality: 95`, blur opt) | `81.6s` | `58.0 fps` | `87.84s` (**3.88× faster**) |

* Full 4-video Day+4 pre-render batch (`16,412` total frames + R2 pull + single bundle + `78.91 MB` R2 upload + D1 sync): `291.97s` (`4m 52s` total).

---

## 5. Troubleshooting & Best Practices

1. **Localhost WebSocket Permission (`EPERM`)**:
   Remotion's `renderMedia` launches a headless Chrome instance and communicates via Chrome DevTools Protocol over WebSocket (`ws://127.0.0.1:<port>`). In restricted sandboxes, ensure network loopback permissions are granted (`BypassSandbox: true`).
2. **Audio Volume Normalization**:
   Keep background music (`BGM`) volume at `0.12` to `0.15` and voiceover volume at `1.0` so dialogue remains crystal-clear for children.
