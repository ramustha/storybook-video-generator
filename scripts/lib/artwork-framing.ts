import sharp from "sharp";
import {
  classifyAspectOrientation,
  computeAlignedVideoFrame,
  computeThumbnailHeroFrame,
  type AspectClassification,
  type ImageOrientation,
} from "../../src/remotion/components/artworkLayout";

export {
  classifyAspectOrientation,
  computeAlignedVideoFrame,
  computeThumbnailHeroFrame,
  type AspectClassification,
  type ImageOrientation,
};

export interface TightArtworkBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
  isFullBleed: boolean;
  wasCropped: boolean;
  strippedHairlines: number;
  strippedTextBands: number;
}

export type ArtworkWarningCode =
  | "LOW_CROPPED_RESOLUTION"
  | "LOW_PAGE_COVERAGE"
  | "HIGH_UPSCALE_FACTOR"
  | "EXTREME_BANNER_STRIP";

export interface ArtworkQualityReport {
  isTooSmall: boolean;
  severity: "ok" | "warn" | "critical";
  croppedWidth: number;
  croppedHeight: number;
  rawWidth: number;
  rawHeight: number;
  coverageRatio: number;
  upscaleFactor: number;
  aspectRatio: number;
  orientation: ImageOrientation;
  isPortrait: boolean;
  isLandscape: boolean;
  warnings: ArtworkWarningCode[];
  summary: string;
}

export interface DetectBoundsOptions {
  /** Optional Gemini [ymin, xmin, ymax, xmax] normalized 0..1000 hint */
  geminiBox?: number[];
  /** Exclude isolated monochrome text lines (like printed page titles/captions) separated by whitespace from color art */
  excludeIsolatedText?: boolean;
  /** Minimum border padding ratio to preserve outlines (default 0.006) */
  paddingRatio?: number;
}

interface BandSegment {
  start: number;
  end: number;
  size: number;
  meanInk: number;
  meanChroma: number;
  score: number;
}

const ANALYSIS_MAX_DIM = 640;

function medianRgb(samples: Array<[number, number, number]>): [number, number, number] {
  const pick = (idx: 0 | 1 | 2) => {
    const vals = samples.map((s) => s[idx]).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)] ?? 255;
  };
  return [pick(0), pick(1), pick(2)];
}

function colorDist(
  r: number,
  g: number,
  b: number,
  bg: [number, number, number]
): number {
  return Math.max(
    Math.abs(r - bg[0]),
    Math.abs(g - bg[1]),
    Math.abs(b - bg[2])
  );
}

function segmentActiveSpans(
  active: boolean[],
  ink: number[],
  chroma: number[],
  maxInternalGap: number
): BandSegment[] {
  const n = active.length;
  const closed = [...active];

  // Bridge tiny internal blank gaps (e.g. light clouds inside an illustration) without bridging real page whitespace
  let gapStart = -1;
  for (let i = 0; i < n; i++) {
    if (!closed[i]) {
      if (gapStart === -1) gapStart = i;
    } else {
      if (gapStart !== -1 && i - gapStart <= maxInternalGap && gapStart > 0) {
        for (let k = gapStart; k < i; k++) closed[k] = true;
      }
      gapStart = -1;
    }
  }

  const segments: BandSegment[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && closed[i];
    if (on && start === -1) {
      start = i;
    } else if (!on && start !== -1) {
      const end = i - 1;
      const size = end - start + 1;
      let inkSum = 0;
      let chromaSum = 0;
      for (let k = start; k <= end; k++) {
        inkSum += ink[k];
        chromaSum += chroma[k];
      }
      const meanInk = inkSum / size;
      const meanChroma = chromaSum / size;
      const score = size * meanInk * (0.25 + meanChroma * 6.0);
      segments.push({ start, end, size, meanInk, meanChroma, score });
      start = -1;
    }
  }
  return segments;
}

/**
 * Detects if a 16:9 image has symmetric blank vertical gutters separating baked blurry sidebars
 * from a centered vertical PDF page (common in pre-baked video plates like raw_backup_scene_01).
 */
function detectBakedSidebarCenterWindow(
  data: Uint8Array,
  w: number,
  h: number,
  channels: number,
  bg: [number, number, number]
): { xStart: number; xEnd: number } | null {
  if (w / Math.max(1, h) < 1.55) return null;

  const colBlankFrac = new Array<number>(w).fill(0);
  for (let x = 0; x < w; x++) {
    let blank = 0;
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * channels;
      const dist = colorDist(data[idx], data[idx + 1], data[idx + 2], bg);
      if (dist <= 16) blank++;
    }
    colBlankFrac[x] = blank / h;
  }

  // Look for wide nearly-pure-bg vertical gutters in x in [0.18..0.38] and [0.62..0.82]
  const findGutterEdge = (from: number, to: number, fromLeft: boolean): number | null => {
    let run = 0;
    let bestEnd = -1;
    const minGutterWidth = Math.max(4, Math.round(w * 0.015));
    for (let x = from; x <= to; x++) {
      if (colBlankFrac[x] >= 0.96) {
        run++;
        if (run >= minGutterWidth) {
          bestEnd = fromLeft ? x : x - run + 1;
        }
      } else {
        if (bestEnd !== -1 && fromLeft) break;
        run = 0;
      }
    }
    return bestEnd;
  };

  const leftEdge = findGutterEdge(Math.round(w * 0.16), Math.round(w * 0.4), true);
  const rightEdge = findGutterEdge(Math.round(w * 0.6), Math.round(w * 0.84), false);

  if (leftEdge !== null && rightEdge !== null && rightEdge - leftEdge > w * 0.25) {
    return { xStart: leftEdge, xEnd: rightEdge };
  }
  return null;
}

/**
 * Tightly crops authentic illustration artwork out of PDF pages or pre-padded frames:
 * - Strips horizontal/vertical hairline page separator rules
 * - Strips corner pagination numbers (e.g. "1 / 12")
 * - Preserves full-bleed colored illustrations without slicing edges
 */
export async function detectTightArtworkBounds(
  imageBuffer: Buffer,
  options: DetectBoundsOptions = {}
): Promise<TightArtworkBounds> {
  const meta = await sharp(imageBuffer).metadata();
  const rawWidth = meta.width || 1920;
  const rawHeight = meta.height || 1080;

  const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(rawWidth, rawHeight));
  const w = Math.max(32, Math.round(rawWidth * scale));
  const h = Math.max(32, Math.round(rawHeight * scale));

  const { data, info } = await sharp(imageBuffer)
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;

  // Sample 4 corner inset strips + mid-margin samples to estimate page background reliably
  const bgSamples: Array<[number, number, number]> = [];
  const sampleCoords = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [Math.round(w * 0.5), 2],
    [Math.round(w * 0.5), h - 3],
    [2, Math.round(h * 0.5)],
    [w - 3, Math.round(h * 0.5)],
    [2, Math.round(h * 0.75)],
    [w - 3, Math.round(h * 0.75)],
  ];
  for (const [sx, sy] of sampleCoords) {
    const idx = (sy * w + sx) * channels;
    bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
  }
  const bg = medianRgb(bgSamples);
  const bgMin = Math.min(bg[0], bg[1], bg[2]);
  const bgMax = Math.max(bg[0], bg[1], bg[2]);
  const isPaperLikeBg = bgMin >= 205 && bgMax - bgMin <= 36;

  // Full-bleed guard: saturated/colored backgrounds OR >45% non-paper perimeter edges mean full-bleed art
  let borderNonBg = 0;
  let borderTotal = 0;
  if (isPaperLikeBg) {
    for (let x = 0; x < w; x++) {
      for (const y of [1, h - 2]) {
        const idx = (y * w + x) * channels;
        borderTotal++;
        if (colorDist(data[idx], data[idx + 1], data[idx + 2], bg) > 24) borderNonBg++;
      }
    }
    for (let y = 0; y < h; y++) {
      for (const x of [1, w - 2]) {
        const idx = (y * w + x) * channels;
        borderTotal++;
        if (colorDist(data[idx], data[idx + 1], data[idx + 2], bg) > 24) borderNonBg++;
      }
    }
  }
  const isFullBleed = !isPaperLikeBg || borderNonBg / Math.max(1, borderTotal) > 0.45;
  if (isFullBleed) {
    return {
      left: 0,
      top: 0,
      width: rawWidth,
      height: rawHeight,
      rawWidth,
      rawHeight,
      isFullBleed: true,
      wasCropped: false,
      strippedHairlines: 0,
      strippedTextBands: 0,
    };
  }

  // Optional Gemini region clamp inside page
  let scanXStart = 0;
  let scanXEnd = w - 1;
  let scanYStart = 0;
  let scanYEnd = h - 1;

  const bakedCenter = detectBakedSidebarCenterWindow(data, w, h, channels, bg);
  if (bakedCenter) {
    scanXStart = bakedCenter.xStart;
    scanXEnd = bakedCenter.xEnd;
  }

  if (options.geminiBox && options.geminiBox.length === 4) {
    const [ymin, xmin, ymax, xmax] = options.geminiBox;
    const gx0 = Math.max(0, Math.floor((xmin / 1000) * w));
    const gy0 = Math.max(0, Math.floor((ymin / 1000) * h));
    const gx1 = Math.min(w - 1, Math.ceil((xmax / 1000) * w));
    const gy1 = Math.min(h - 1, Math.ceil((ymax / 1000) * h));
    if (gx1 - gx0 > w * 0.15 && gy1 - gy0 > h * 0.12) {
      scanXStart = Math.max(scanXStart, gx0);
      scanXEnd = Math.min(scanXEnd, gx1);
      scanYStart = gy0;
      scanYEnd = gy1;
    }
  }

  const scanW = Math.max(1, scanXEnd - scanXStart + 1);
  const rowInk = new Array<number>(h).fill(0);
  const rowChroma = new Array<number>(h).fill(0);
  const rowActive = new Array<boolean>(h).fill(false);

  for (let y = scanYStart; y <= scanYEnd; y++) {
    let nonBg = 0;
    let chroma = 0;
    for (let x = scanXStart; x <= scanXEnd; x++) {
      const idx = (y * w + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (colorDist(r, g, b, bg) > 18) {
        nonBg++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) {
          chroma++;
        }
      }
    }
    rowInk[y] = nonBg / scanW;
    rowChroma[y] = chroma / scanW;
    // Active if >=0.5% of scan width (or >=2 pixels) shows content
    rowActive[y] = nonBg >= Math.max(2, Math.round(scanW * 0.005));
  }

  const maxVerticalGap = Math.max(1, Math.round(h * 0.005));
  const vBands = segmentActiveSpans(rowActive, rowInk, rowChroma, maxVerticalGap);

  let strippedHairlines = 0;
  let strippedTextBands = 0;
  const excludeText = options.excludeIsolatedText !== false;
  const maxBandChroma = vBands.reduce((acc, b) => Math.max(acc, b.meanChroma), 0);

  const hairlineMaxH = Math.max(5, Math.round(h * 0.018));
  const keptVBands = vBands.filter((band) => {
    const touchesTopEdge = band.start <= Math.round(h * 0.13);
    const touchesBottomEdge = band.end >= Math.round(h * 0.87);

    // Strip isolated thin horizontal divider rules (like StoryWeaver top/bottom header rules)
    if (band.size <= hairlineMaxH && band.meanChroma < 0.06) {
      strippedHairlines++;
      return false;
    }

    // Strip isolated pagination footers / running headers ("1 / 12")
    if (
      (touchesTopEdge || touchesBottomEdge) &&
      band.size <= Math.round(h * 0.065) &&
      band.meanInk < 0.15 &&
      band.meanChroma < 0.05
    ) {
      strippedTextBands++;
      return false;
    }

    // In color-illustrated books, strip isolated monochrome title/paragraph typography separated from colorful art
    if (
      excludeText &&
      maxBandChroma >= 0.05 &&
      band.size <= Math.round(h * 0.38) &&
      band.meanChroma < 0.025 &&
      band.meanInk < 0.38
    ) {
      strippedTextBands++;
      return false;
    }

    return true;
  });

  const bestScore = keptVBands.reduce((acc, b) => Math.max(acc, b.score), 0);
  const selectedVBands =
    keptVBands.length > 0
      ? keptVBands.filter((b) => b.score >= bestScore * 0.18)
      : vBands;

  const chosenYStart =
    selectedVBands.length > 0 ? Math.min(...selectedVBands.map((b) => b.start)) : 0;
  const chosenYEnd =
    selectedVBands.length > 0 ? Math.max(...selectedVBands.map((b) => b.end)) : h - 1;
  const chosenH = Math.max(1, chosenYEnd - chosenYStart + 1);

  // Horizontal column segmentation inside chosen Y range to strip side hairlines / stray margin specks
  const colInk = new Array<number>(w).fill(0);
  const colChroma = new Array<number>(w).fill(0);
  const colActive = new Array<boolean>(w).fill(false);

  for (let x = scanXStart; x <= scanXEnd; x++) {
    let nonBg = 0;
    let chroma = 0;
    for (let y = chosenYStart; y <= chosenYEnd; y++) {
      const idx = (y * w + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (colorDist(r, g, b, bg) > 18) {
        nonBg++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) chroma++;
      }
    }
    colInk[x] = nonBg / chosenH;
    colChroma[x] = chroma / chosenH;
    colActive[x] = nonBg >= Math.max(2, Math.round(chosenH * 0.008));
  }

  const maxHorizontalGap = Math.max(1, Math.round(w * 0.006));
  const hBands = segmentActiveSpans(colActive, colInk, colChroma, maxHorizontalGap);
  const hairlineMaxW = Math.max(4, Math.round(w * 0.015));

  const keptHBands = hBands.filter((band) => {
    if (band.size <= hairlineMaxW && band.meanChroma < 0.05) {
      strippedHairlines++;
      return false;
    }
    return true;
  });

  const bestHScore = keptHBands.reduce((acc, b) => Math.max(acc, b.score), 0);
  const selectedHBands =
    keptHBands.length > 0
      ? keptHBands.filter((b) => b.score >= bestHScore * 0.08)
      : hBands;

  const chosenXStart =
    selectedHBands.length > 0 ? Math.min(...selectedHBands.map((b) => b.start)) : scanXStart;
  const chosenXEnd =
    selectedHBands.length > 0 ? Math.max(...selectedHBands.map((b) => b.end)) : scanXEnd;

  // Convert scaled bounds back to full original image pixels with slight edge safety margin
  const padRatio = options.paddingRatio ?? 0.006;
  const padX = Math.max(2, Math.round(rawWidth * padRatio));
  const padY = Math.max(2, Math.round(rawHeight * padRatio));

  const left = Math.max(0, Math.floor(chosenXStart / scale) - padX);
  const top = Math.max(0, Math.floor(chosenYStart / scale) - padY);
  const right = Math.min(rawWidth, Math.ceil((chosenXEnd + 1) / scale) + padX);
  const bottom = Math.min(rawHeight, Math.ceil((chosenYEnd + 1) / scale) + padY);

  const cropW = Math.max(1, right - left);
  const cropH = Math.max(1, bottom - top);

  return {
    left,
    top,
    width: cropW,
    height: cropH,
    rawWidth,
    rawHeight,
    isFullBleed: false,
    wasCropped: cropW < rawWidth * 0.98 || cropH < rawHeight * 0.98,
    strippedHairlines,
    strippedTextBands,
  };
}

/**
 * Evaluates whether a cropped artwork asset is too small / sparse / extreme-ratio for crisp HD video rendering.
 */
export function assessArtworkQuality(params: {
  croppedWidth: number;
  croppedHeight: number;
  rawWidth: number;
  rawHeight: number;
  targetSafeW?: number;
  targetSafeH?: number;
  isFullBleed?: boolean;
}): ArtworkQualityReport {
  const {
    croppedWidth,
    croppedHeight,
    rawWidth,
    rawHeight,
    targetSafeW = 1600,
    targetSafeH = 820,
    isFullBleed = false,
  } = params;

  const coverageRatio = Number(
    ((croppedWidth * croppedHeight) / Math.max(1, rawWidth * rawHeight)).toFixed(3)
  );
  const upscaleFactor = Number(
    Math.min(
      targetSafeW / Math.max(1, croppedWidth),
      targetSafeH / Math.max(1, croppedHeight)
    ).toFixed(2)
  );
  const { orientation, aspectRatio, isPortrait, isLandscape } =
    classifyAspectOrientation(croppedWidth, croppedHeight);

  const warnings: ArtworkWarningCode[] = [];
  if (croppedWidth < 720 || croppedHeight < 420) {
    warnings.push("LOW_CROPPED_RESOLUTION");
  }
  if (!isFullBleed && coverageRatio < 0.28) {
    warnings.push("LOW_PAGE_COVERAGE");
  }
  if (upscaleFactor > 2.2) {
    warnings.push("HIGH_UPSCALE_FACTOR");
  }
  if (aspectRatio > 2.6 || aspectRatio < 0.38) {
    warnings.push("EXTREME_BANNER_STRIP");
  }

  const isTooSmall =
    warnings.includes("LOW_CROPPED_RESOLUTION") ||
    warnings.includes("LOW_PAGE_COVERAGE") ||
    warnings.includes("HIGH_UPSCALE_FACTOR");

  const severity: "ok" | "warn" | "critical" =
    warnings.includes("LOW_CROPPED_RESOLUTION") &&
    (croppedWidth < 500 || croppedHeight < 340 || upscaleFactor > 2.8)
      ? "critical"
      : warnings.length > 0
      ? "warn"
      : "ok";

  const summary =
    warnings.length === 0
      ? `OK (${croppedWidth}x${croppedHeight}, ${orientation} ratio=${aspectRatio})`
      : `${warnings.join("+")} (${croppedWidth}x${croppedHeight}, cov=${Math.round(
          coverageRatio * 100
        )}%, upscale=${upscaleFactor}x, ratio=${aspectRatio})`;

  return {
    isTooSmall,
    severity,
    croppedWidth,
    croppedHeight,
    rawWidth,
    rawHeight,
    coverageRatio,
    upscaleFactor,
    aspectRatio,
    orientation,
    isPortrait,
    isLandscape,
    warnings,
    summary,
  };
}
