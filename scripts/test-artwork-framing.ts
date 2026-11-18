import assert from "node:assert/strict";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  assessArtworkQuality,
  classifyAspectOrientation,
  computeAlignedVideoFrame,
  computeThumbnailHeroFrame,
  detectTightArtworkBounds,
} from "./lib/artwork-framing";

async function makeSyntheticPageWithHairlinesAndFooter(opts: {
  pageW: number;
  pageH: number;
  artLeft: number;
  artTop: number;
  artW: number;
  artH: number;
}): Promise<Buffer> {
  const { pageW, pageH, artLeft, artTop, artW, artH } = opts;
  const svg = `<svg width="${pageW}" height="${pageH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${pageW}" height="${pageH}" fill="#FFFFFF"/>
    <!-- Top thin hairline divider at ~4% -->
    <rect x="${Math.round(pageW * 0.08)}" y="${Math.round(pageH * 0.04)}" width="${Math.round(pageW * 0.84)}" height="6" fill="#262626"/>
    <!-- Colorful illustrated scene block -->
    <rect x="${artLeft}" y="${artTop}" width="${artW}" height="${artH}" fill="#FDE047"/>
    <circle cx="${artLeft + Math.round(artW * 0.35)}" cy="${artTop + Math.round(artH * 0.5)}" r="${Math.round(Math.min(artW, artH) * 0.3)}" fill="#9333EA"/>
    <rect x="${artLeft + Math.round(artW * 0.55)}" y="${artTop + Math.round(artH * 0.2)}" width="${Math.round(artW * 0.3)}" height="${Math.round(artH * 0.6)}" fill="#22C55E"/>
    <!-- Bottom hairline + tiny corner footer page number "1 / 12" -->
    <rect x="${Math.round(pageW * 0.08)}" y="${Math.round(pageH * 0.92)}" width="${Math.round(pageW * 0.84)}" height="6" fill="#262626"/>
    <rect x="${Math.round(pageW * 0.86)}" y="${Math.round(pageH * 0.96)}" width="54" height="16" fill="#171717"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function runTests() {
  console.log("🧪 Running Artwork Cropping, Too-Small Detection & Orientation Alignment Tests...\n");

  // 1. Tight cropping on synthetic page with white borders + top/bottom hairlines + footer number
  const smallPageBuf = await makeSyntheticPageWithHairlinesAndFooter({
    pageW: 1200,
    pageH: 900,
    artLeft: 180,
    artTop: 140,
    artW: 840,
    artH: 300,
  });
  const smallBounds = await detectTightArtworkBounds(smallPageBuf, { paddingRatio: 0.002 });
  assert.equal(smallBounds.isFullBleed, false, "White-margin PDF page must not be treated as full-bleed");
  assert.equal(smallBounds.wasCropped, true, "White margins + hairlines must be cropped");
  assert.ok(smallBounds.strippedHairlines >= 1, "Hairline rules should be stripped");
  assert.ok(smallBounds.top >= 120 && smallBounds.top + smallBounds.height <= 465, "Crop must exclude top hairline and bottom footer");
  assert.ok(
    smallBounds.height >= 285 && smallBounds.height <= 335,
    `Expected tight cropped height around 300px without hairline/footer bloat, got ${smallBounds.height}`
  );
  assert.ok(
    smallBounds.width >= 820 && smallBounds.width <= 875,
    `Expected tight cropped width around 840px, got ${smallBounds.width}`
  );
  console.log(`✔ [1] Tight crop stripped hairlines & footer: ${smallBounds.width}x${smallBounds.height} (orig 1200x900)`);

  // 2. Full-bleed colorful illustration must remain uncropped
  const fullBleedSvg = `<svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1600" fill="#1D4ED8"/>
    <circle cx="600" cy="800" r="520" fill="#F97316"/>
  </svg>`;
  const fullBleedBuf = await sharp(Buffer.from(fullBleedSvg)).png().toBuffer();
  const fullBounds = await detectTightArtworkBounds(fullBleedBuf);
  assert.equal(fullBounds.isFullBleed, true, "Full-bleed portrait artwork must be detected as full-bleed");
  assert.equal(fullBounds.wasCropped, false, "Full-bleed artwork must not lose outer borders");
  const fullQuality = assessArtworkQuality({
    croppedWidth: fullBounds.width,
    croppedHeight: fullBounds.height,
    rawWidth: fullBounds.rawWidth,
    rawHeight: fullBounds.rawHeight,
    isFullBleed: fullBounds.isFullBleed,
  });
  assert.equal(fullQuality.isTooSmall, false);
  assert.equal(fullQuality.orientation, "portrait");
  assert.equal(fullQuality.isPortrait, true);
  console.log(`✔ [2] Full-bleed portrait preserved: ${fullQuality.summary}`);

  // 3. Too-small image detection (like Bheema low-res panel on white sheet)
  const bheemaLikeQuality = assessArtworkQuality({
    croppedWidth: 660,
    croppedHeight: 315,
    rawWidth: 1920,
    rawHeight: 1080,
    isFullBleed: false,
  });
  assert.equal(bheemaLikeQuality.isTooSmall, true, "660x315 panel on 1920x1080 must be flagged isTooSmall");
  assert.ok(bheemaLikeQuality.warnings.includes("LOW_CROPPED_RESOLUTION"));
  assert.ok(bheemaLikeQuality.warnings.includes("LOW_PAGE_COVERAGE"));
  assert.ok(bheemaLikeQuality.warnings.includes("HIGH_UPSCALE_FACTOR"));
  assert.equal(bheemaLikeQuality.severity, "critical");
  console.log(`✔ [3] Too-small artwork flagged: ${bheemaLikeQuality.summary}`);

  // 4. Portrait vs Square vs Landscape classification & Remotion frame alignment
  assert.equal(classifyAspectOrientation(900, 1200).orientation, "portrait");
  assert.equal(classifyAspectOrientation(1000, 1000).orientation, "square");
  assert.equal(classifyAspectOrientation(1600, 900).orientation, "landscape");

  const verticalPortraitSceneFrame = computeAlignedVideoFrame({
    imageWidth: 900,
    imageHeight: 1200,
    isVertical: true,
    safeMaxWidth: 984,
    safeMaxHeight: 730,
  });
  assert.equal(verticalPortraitSceneFrame.orientation, "portrait");
  assert.ok(
    verticalPortraitSceneFrame.height > verticalPortraitSceneFrame.width,
    `Portrait art on 9:16 video must have taller box than wide, got ${verticalPortraitSceneFrame.width}x${verticalPortraitSceneFrame.height}`
  );
  assert.equal(verticalPortraitSceneFrame.useContainBackdrop, false);

  const verticalLandscapeSceneFrame = computeAlignedVideoFrame({
    imageWidth: 1920,
    imageHeight: 1080,
    isVertical: true,
    safeMaxWidth: 984,
    safeMaxHeight: 730,
  });
  assert.equal(verticalLandscapeSceneFrame.width, 984);
  assert.ok(
    Math.abs(verticalLandscapeSceneFrame.height - 554) <= 1,
    `Expected ~554px height for 16:9 art, got ${verticalLandscapeSceneFrame.height}`
  );

  // Thumbnail hero alignment: IG 4:5 stays inside 880x500 & extreme banner uses contain+backdrop
  const stripThumbFrame = computeThumbnailHeroFrame({
    imageWidth: 1589,
    imageHeight: 458,
    layout: "portrait",
  });
  assert.equal(
    stripThumbFrame.useContainBackdrop,
    true,
    "3.47:1 extreme wide cover strip must use blurred contain backdrop instead of slicing edges"
  );
  assert.ok(stripThumbFrame.height <= 500 && stripThumbFrame.width <= 920);
  console.log(
    `✔ [4] Orientation & thumbnail alignment verified (9:16 portrait scene=${verticalPortraitSceneFrame.width}x${verticalPortraitSceneFrame.height}, 4:5 strip=${stripThumbFrame.width}x${stripThumbFrame.height})`
  );

  // 5. Optional real-asset regression check if scratch/bima_inspect exists
  const scratchBimaCover = path.resolve(
    "/Users/ramadhani.musthofa/.gemini/antigravity/brain/a4b65591-83d1-4935-8a2a-296ff3ee5e38/scratch/bima_inspect/cover.png"
  );
  if (existsSync(scratchBimaCover)) {
    const buf = await fs.readFile(scratchBimaCover);
    const b = await detectTightArtworkBounds(buf, { paddingRatio: 0.002 });
    const q = assessArtworkQuality({
      croppedWidth: b.width,
      croppedHeight: b.height,
      rawWidth: b.rawWidth,
      rawHeight: b.rawHeight,
      isFullBleed: b.isFullBleed,
    });
    assert.ok(b.wasCropped && b.height < 520, "Real Bheema cover should crop off bottom white page");
    assert.equal(q.isTooSmall, true, "Real Bheema cover strip should trigger isTooSmall");
    console.log(`✔ [5] Real Bheema cover regression passed: ${q.summary}`);
  }

  console.log("\n✅ ALL ARTWORK FRAMING & ORIENTATION TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("❌ Artwork framing tests failed:", err);
  process.exit(1);
});
