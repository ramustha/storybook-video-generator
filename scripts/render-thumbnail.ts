import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const requestedLang = (getArg("--lang") || "all") as "id" | "en" | "all";
  const requestedVariant = (getArg("--variant") || "all") as "popular" | "bedtime" | "all";
  const heroImageArg = getArg("--hero");
  const backdropImageArg = getArg("--backdrop");
  const customHookArg = getArg("--hook");

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  console.log(`\n🎨 Initializing High-CTR Thumbnail Engine for "${rawManifest.title}"...`);

  // Ensure export directories
  await fs.mkdir(path.join(storyDir, "exports/id"), { recursive: true });
  await fs.mkdir(path.join(storyDir, "exports/en"), { recursive: true });

  console.log(`📦 Bundling Remotion Thumbnail composition...`);
  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: storyDir,
  });

  const languages: Array<"id" | "en"> =
    requestedLang === "all" ? ["id", "en"] : [requestedLang];
  const variants: Array<"popular" | "bedtime"> =
    requestedVariant === "all" ? ["popular", "bedtime"] : [requestedVariant];

  const generatedThumbnails: Record<string, any> = {};

  for (const lang of languages) {
    const isEn = lang === "en";
    const exportLangDir = path.join(storyDir, `exports/${lang}`);

    for (const variant of variants) {
      const inputProps = {
        book: rawManifest,
        lang,
        variant,
        heroImagePath: heroImageArg || (variant === "popular" ? "assets/cover.png" : "assets/scene_02.png"),
        backdropImagePath: backdropImageArg || (variant === "popular" ? "assets/scene_02.png" : "assets/cover.png"),
        customHook: customHookArg,
      };

      console.log(`\n🖼️  Rendering [${lang.toUpperCase()}] [${variant.toUpperCase()}] Thumbnail (1920x1080)...`);

      const composition = await selectComposition({
        serveUrl,
        id: "StorybookThumbnail",
        inputProps,
      });

      const fileName = `thumbnail-${variant}.png`;
      const outputPath = path.join(exportLangDir, fileName);

      const startTime = Date.now();
      await renderStill({
        composition,
        serveUrl,
        output: outputPath,
        inputProps,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const stat = await fs.stat(outputPath);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
      console.log(`   ✔ Rendered in ${elapsed}s -> ${fileName} (${sizeMb} MB)`);

      if (!generatedThumbnails[lang]) generatedThumbnails[lang] = {};
      generatedThumbnails[lang][variant] = `exports/${lang}/${fileName}`;

      // If popular, also save as default primary thumbnail.png for this language
      if (variant === "popular") {
        const defaultPath = path.join(exportLangDir, "thumbnail.png");
        await fs.copyFile(outputPath, defaultPath);
        generatedThumbnails[lang].primary = `exports/${lang}/thumbnail.png`;

        if (lang === "id") {
          // Also copy to root exports/thumbnail.png for backwards compatibility
          await fs.copyFile(outputPath, path.join(storyDir, "exports/thumbnail.png"));
        }
      }
    }

    // Render 9:16 Vertical Thumbnail for Shorts & Reels (1080x1920)
    console.log(`\n📱 Rendering [${lang.toUpperCase()}] Shorts/Reels Vertical Thumbnail (1080x1920)...`);
    const verticalProps = {
      book: rawManifest,
      lang,
      variant: "popular" as const,
      orientation: "vertical" as const,
      heroImagePath: heroImageArg || "assets/cover.png",
      backdropImagePath: backdropImageArg || "assets/scene_02.png",
      customHook: customHookArg,
    };

    const verticalComposition = await selectComposition({
      serveUrl,
      id: "StorybookThumbnail-Vertical",
      inputProps: verticalProps,
    });

    const verticalFileName = "thumbnail-vertical.png";
    const verticalOutputPath = path.join(exportLangDir, verticalFileName);
    const startVert = Date.now();
    await renderStill({
      composition: verticalComposition,
      serveUrl,
      output: verticalOutputPath,
      inputProps: verticalProps,
    });

    const vertElapsed = ((Date.now() - startVert) / 1000).toFixed(1);
    const vertStat = await fs.stat(verticalOutputPath);
    const vertSizeMb = (vertStat.size / (1024 * 1024)).toFixed(2);
    console.log(`   ✔ Rendered in ${vertElapsed}s -> ${verticalFileName} (${vertSizeMb} MB)`);

    generatedThumbnails[lang].vertical = `exports/${lang}/${verticalFileName}`;
  }

  // Update story.json with thumbnail references
  if (!rawManifest.thumbnails) rawManifest.thumbnails = {};
  rawManifest.thumbnails = {
    ...rawManifest.thumbnails,
    ...generatedThumbnails,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath, JSON.stringify(rawManifest, null, 2), "utf-8");
  console.log(`\n✔ story.json updated with high-CTR thumbnail paths!`);
  console.log(`✨ All requested thumbnails rendered successfully.`);
}

main().catch((err) => {
  console.error("❌ Thumbnail render failed:", err);
  process.exit(1);
});
