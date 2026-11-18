export type ImageOrientation = "portrait" | "landscape" | "square";

export interface AspectClassification {
  orientation: ImageOrientation;
  aspectRatio: number;
  isPortrait: boolean;
  isLandscape: boolean;
}

export interface AlignedFrameInput {
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  isVertical: boolean;
  safeMaxWidth: number;
  safeMaxHeight: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
}

export interface AlignedFrameResult {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: ImageOrientation;
  /** True when the image aspect diverges from container bounds or is extreme strip, so contain+backdrop avoids slicing art */
  useContainBackdrop: boolean;
}

export interface ThumbnailHeroFrameInput {
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  layout: "landscape" | "portrait" | "vertical";
}

const DEFAULT_FALLBACK_RATIO = 16 / 9;

export function resolveAspectRatio(
  imageWidth?: number,
  imageHeight?: number,
  imageAspectRatio?: number
): number {
  if (
    typeof imageWidth === "number" &&
    typeof imageHeight === "number" &&
    imageWidth > 0 &&
    imageHeight > 0
  ) {
    return Number((imageWidth / imageHeight).toFixed(3));
  }
  if (typeof imageAspectRatio === "number" && imageAspectRatio > 0) {
    return Number(imageAspectRatio.toFixed(3));
  }
  return Number(DEFAULT_FALLBACK_RATIO.toFixed(3));
}

export function classifyAspectOrientation(
  width: number,
  height: number
): AspectClassification {
  const aspectRatio = resolveAspectRatio(width, height);
  if (aspectRatio < 0.92) {
    return {
      orientation: "portrait",
      aspectRatio,
      isPortrait: true,
      isLandscape: false,
    };
  }
  if (aspectRatio > 1.08) {
    return {
      orientation: "landscape",
      aspectRatio,
      isPortrait: false,
      isLandscape: true,
    };
  }
  return {
    orientation: "square",
    aspectRatio,
    isPortrait: false,
    isLandscape: false,
  };
}

/**
 * Fits an illustration cleanly within safe viewport boundaries without awkwardly cropping characters
 * or crushing portrait artwork into a shallow 16:9 box on 9:16 vertical feeds.
 */
export function computeAlignedVideoFrame(
  input: AlignedFrameInput
): AlignedFrameResult {
  const rawRatio = resolveAspectRatio(
    input.imageWidth,
    input.imageHeight,
    input.imageAspectRatio
  );
  const minR = input.minAspectRatio ?? 0.56;
  const maxR = input.maxAspectRatio ?? 2.05;
  const clampedRatio = Math.min(maxR, Math.max(minR, rawRatio));
  const orientation = classifyAspectOrientation(clampedRatio * 1000, 1000).orientation;

  let width = input.safeMaxWidth;
  let height = Math.round(width / clampedRatio);

  if (height > input.safeMaxHeight) {
    height = input.safeMaxHeight;
    width = Math.round(height * clampedRatio);
  }

  width = Math.min(input.safeMaxWidth, Math.max(240, width));
  height = Math.min(input.safeMaxHeight, Math.max(220, height));

  const extremeRatio = rawRatio > maxR || rawRatio < minR;
  const crossOrientationInLandscape = !input.isVertical && rawRatio < 0.92;

  return {
    width,
    height,
    aspectRatio: rawRatio,
    orientation,
    useContainBackdrop: extremeRatio || crossOrientationInLandscape,
  };
}

/**
 * Computes responsive hero-artwork card bounds inside 16:9, 4:5 (IG Feed), and 9:16 (Reels/Shorts) thumbnails
 * so portrait covers look tall & proud while landscape spreads never show blank whitespace bars.
 */
export function computeThumbnailHeroFrame(
  input: ThumbnailHeroFrameInput
): AlignedFrameResult {
  const rawRatio = resolveAspectRatio(
    input.imageWidth,
    input.imageHeight,
    input.imageAspectRatio
  );

  const boundsByLayout: Record<
    ThumbnailHeroFrameInput["layout"],
    { safeMaxWidth: number; safeMaxHeight: number; minAspectRatio: number; maxAspectRatio: number }
  > = {
    landscape: {
      safeMaxWidth: 880,
      safeMaxHeight: 720,
      minAspectRatio: 0.68,
      maxAspectRatio: 2.35,
    },
    portrait: {
      // Sized so header pill + hero art + title + CTA hook all live safely inside IG's 1:1 grid crop (Y:135..1215)
      safeMaxWidth: 920,
      safeMaxHeight: 500,
      minAspectRatio: 0.72,
      maxAspectRatio: 2.4,
    },
    vertical: {
      // Sized so badge + hero art + title + CTA hook fit inside IG's 3:4 grid crop (Y:240..1680) & Shorts safe zone
      safeMaxWidth: 940,
      safeMaxHeight: 620,
      minAspectRatio: 0.72,
      maxAspectRatio: 2.4,
    },
  };

  const bounds = boundsByLayout[input.layout];
  const frame = computeAlignedVideoFrame({
    imageAspectRatio: rawRatio,
    isVertical: input.layout !== "landscape",
    safeMaxWidth: bounds.safeMaxWidth,
    safeMaxHeight: bounds.safeMaxHeight,
    minAspectRatio: bounds.minAspectRatio,
    maxAspectRatio: bounds.maxAspectRatio,
  });

  // Inside thumbnail hero frames, always allow full-bleed blurred backdrop behind contain when ratio differs >12%
  const frameRatio = frame.width / Math.max(1, frame.height);
  const divergence = Math.abs(frameRatio - rawRatio) / Math.max(0.1, rawRatio);
  return {
    ...frame,
    useContainBackdrop: frame.useContainBackdrop || divergence > 0.12,
  };
}
