import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";

async function main() {
  console.log("\n📦 Bundling Remotion composition for TikTok Developer Demo Video...");
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
  });

  console.log("🔍 Selecting composition: TikTokPublisherDemo...");
  const composition = await selectComposition({
    serveUrl,
    id: "TikTokPublisherDemo",
  });

  const outputDir = path.resolve("./stories/branding");
  await fs.mkdir(outputDir, { recursive: true });
  const outputLocation = path.join(outputDir, "tiktok-demo-end-to-end.mp4");

  console.log(
    `🚀 Rendering TikTok Developer Demo Video (${composition.width}x${composition.height}, ${composition.durationInFrames} frames @ ${composition.fps}fps)...`
  );
  const startTime = Date.now();

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    concurrency: 2,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const stats = await fs.stat(outputLocation);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n✔ Video exported in ${elapsed}s!`);
  console.log(`📁 File: ${outputLocation} (${sizeMb} MB)`);

  // Copy to user's Downloads folder for immediate 1-click upload
  const downloadsPath = "/Users/ramadhani.musthofa/Downloads/tiktok-demo-end-to-end.mp4";
  try {
    await fs.copyFile(outputLocation, downloadsPath);
    console.log(`📋 Copied to Downloads for easy upload: ${downloadsPath}`);
  } catch (err) {
    console.warn("Could not copy to Downloads:", err);
  }

  console.log("\n🎉 Ready for TikTok Developer Submission!");
}

main().catch((err) => {
  console.error("Rendering failed:", err);
  process.exit(1);
});
