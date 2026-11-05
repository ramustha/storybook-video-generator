import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const theme = getArg("--theme") || "bedtime";
  const rawLang = (getArg("--lang") || "id").toLowerCase();

  const targetLangs: Array<"id" | "en"> =
    rawLang === "all" || rawLang === "both" || rawLang === "id,en"
      ? ["id", "en"]
      : [rawLang as "id" | "en"];

  const outDir = path.resolve("./exports/compilations");
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\n🎨 Rendering Distinct Compilation Marathon Thumbnail...`);
  console.log(`🏷️ Theme   : ${theme}`);
  console.log(`🌐 Language: ${targetLangs.map((l) => l.toUpperCase()).join(" & ")}`);

  const serveUrl = await bundle({
    entryPoint: path.resolve("./src/remotion/index.ts"),
    publicDir: path.resolve("./stories/branding"),
  });

  const loadBase64 = async (relPath: string) => {
    const full = path.resolve(relPath);
    if (!existsSync(full)) return "";
    const buf = await fs.readFile(full);
    return `data:image/png;base64,${buf.toString("base64")}`;
  };

  const cover0 = await loadBase64("stories/pisang-terlalu-banyak/assets/cover.png");
  const cover1 = await loadBase64("stories/hari-cukur-rambut/assets/cover.png");
  const cover2 = await loadBase64("stories/jas-hujan-merah/assets/cover.png");
  const cover3 = await loadBase64("stories/gara-gara-kucing/assets/cover.png");

  for (const lang of targetLangs) {
    const isEn = lang === "en";
    const inputProps = {
      badge: isEn ? "🌙 BEDTIME STORIES MARATHON" : "🌙 DONGENG PENGANTAR TIDUR",
      headlineTop: isEn ? "5 MAGICAL BEDTIME TALES" : "KUMPULAN 5 CERITA",
      headlineMain: isEn ? "BEDTIME MARATHON" : "DONG-EN-G ANAK",
      marathonPill: isEn ? "⏱️ 12 MINS NON-STOP MARATHON" : "⏱️ 12 MENIT NON-STOP MARATHON",
      subHook: isEn
        ? "Calming, Delightful Bedtime Stories for Sweet Dreams & Warm Smiles 💤✨"
        : "Bikin Si Kecil Tertidur Nyenyak, Tenang & Penuh Pesan Moral 💤✨",
      storyCovers: [cover0, cover1, cover2, cover3],
      lang,
      theme,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "StorybookCompilationThumbnail",
      inputProps,
    });

    const outputLocation = path.join(outDir, `thumbnail-compilation-${theme}-${lang}.png`);

    await renderStill({
      composition,
      serveUrl,
      output: outputLocation,
      inputProps,
    });

    console.log(`✔ Distinct compilation thumbnail [${lang.toUpperCase()}] exported successfully!`);
    console.log(`📁 File : ${outputLocation}\n`);
  }
}

main().catch((err) => {
  console.error("Compilation thumbnail render failed:", err);
  process.exit(1);
});
