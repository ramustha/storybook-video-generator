import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const ALL_STORIES = [
  "gara-gara-kucing",
  "jas-hujan-merah",
  "raja-gemuk-anjing-kurus",
  "bulan-dan-topi-biru",
  "hari-cukur-rambut",
  "pisang-terlalu-banyak",
];

interface ReelTask {
  slug: string;
  lang: "id" | "en";
  title: string;
  videoPath: string | null;
  thumbnailPath: string | null;
}

async function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${bin} ${args.join(" ")}`));
      }
    });
  });
}

function resolveVerticalVideo(storyDir: string, slug: string, lang: string, manifest: any): string | null {
  const candidates = [
    (manifest.exports as any)?.[lang]?.vertical?.path
      ? path.join(storyDir, (manifest.exports as any)[lang].vertical.path)
      : null,
    path.join(storyDir, `exports/${lang}/${slug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/${manifest.originalTitle ? manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") : slug}-9x16.mp4`),
    path.join(storyDir, `exports/${slug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/the-moon-and-the-cap-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/its-all-the-cats-fault-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/the-red-raincoat-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/fat-king-thin-dog-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/annual-haircut-day-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/too-many-bananas-9x16.mp4`),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }

  return null;
}

function resolveVerticalThumbnail(storyDir: string, lang: string, manifest: any): string | null {
  const candidates = [
    (manifest as any).thumbnails?.[lang]?.vertical
      ? path.join(storyDir, (manifest as any).thumbnails[lang].vertical)
      : null,
    path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`),
    path.join(storyDir, `exports/thumbnail-vertical.png`),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isDryRun = args.includes("--dry-run");
  const targetBook = getArg("--book");
  const targetLang = getArg("--lang") as "id" | "en" | undefined;

  console.log("\n==================================================================");
  console.log("📸 INSTAGRAM REELS BATCH PUBLISHER (WITH CUSTOM COVER)");
  console.log("==================================================================");
  console.log(`🧪 Execution Mode: ${isDryRun ? "DRY RUN (Preview Only)" : "LIVE EXECUTION"}`);
  if (targetBook) console.log(`📖 Target Book   : ${targetBook}`);
  if (targetLang) console.log(`🌐 Target Lang   : ${targetLang.toUpperCase()}`);
  console.log("==================================================================\n");

  const storiesToInspect = targetBook ? [targetBook] : ALL_STORIES;
  const tasks: ReelTask[] = [];

  for (const slug of storiesToInspect) {
    const storyDir = path.resolve(`./stories/${slug}`);
    const storyJsonPath = path.join(storyDir, "story.json");
    if (!existsSync(storyJsonPath)) continue;

    const manifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
    const langs: Array<"id" | "en"> = targetLang ? [targetLang] : ["id", "en"];

    for (const lang of langs) {
      const title = lang === "en" ? (manifest.originalTitle || manifest.title) : manifest.title;
      const videoPath = resolveVerticalVideo(storyDir, slug, lang, manifest);
      const thumbnailPath = resolveVerticalThumbnail(storyDir, lang, manifest);

      tasks.push({
        slug,
        lang,
        title,
        videoPath,
        thumbnailPath,
      });
    }
  }

  console.log("📋 INSTAGRAM REELS AUDIT:");
  console.log("-----------------------------------------------------------------------------------------");
  console.log("Story / Edition            | Video Status   | Custom Cover Status");
  console.log("-----------------------------------------------------------------------------------------");
  for (const t of tasks) {
    const label = `${t.slug} [${t.lang.toUpperCase()}]`.padEnd(26, " ");
    const vidStatus = (t.videoPath ? "Ready on Disk" : "Needs Rendering").padEnd(16, " ");
    const coverStatus = t.thumbnailPath ? "✔ thumbnail-vertical.png" : "❌ Missing Cover";
    console.log(`${label} | ${vidStatus} | ${coverStatus}`);
  }
  console.log("-----------------------------------------------------------------------------------------\n");
  console.log(`🎯 Total Instagram Reels to Publish: ${tasks.length}`);

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    console.log(`\n======================================================`);
    console.log(`🎬 [${i + 1}/${tasks.length}] PROCESSING REEL: "${t.title}" [${t.lang.toUpperCase()}]`);
    console.log(`======================================================`);

    const storyDir = path.resolve(`./stories/${t.slug}`);

    // 1. Render Video if missing
    if (!t.videoPath || !existsSync(t.videoPath)) {
      console.log(`\n⚙️ Vertical video missing for ${t.slug} [${t.lang}]! Rendering via Remotion...`);
      if (!isDryRun) {
        await runCommand("npx", [
          "tsx",
          "scripts/render-book.ts",
          "--book",
          t.slug,
          "--lang",
          t.lang,
          "--format",
          "vertical",
        ]);
      } else {
        console.log(`[DRY RUN] Would render vertical video for ${t.slug} [${t.lang}]`);
        console.log(`[DRY RUN] Would upload to Instagram with custom cover after render completes.\n`);
        continue;
      }
    }

    // 2. Upload to Instagram with custom cover
    console.log(`\n🚀 Uploading Instagram Reel with Custom Cover attached...`);
    const uploadArgs = [
      "scripts/upload-meta.ts",
      "--book",
      t.slug,
      "--lang",
      t.lang,
      "--platform",
      "instagram",
      "--format",
      "vertical",
    ];
    if (isDryRun) {
      uploadArgs.push("--dry-run");
    }

    await runCommand("npx", ["tsx", ...uploadArgs]);
  }

  // 3. Update Docs Portal
  if (!isDryRun) {
    console.log(`\n📊 Updating Docs Portal with new Instagram Reel records...`);
    try {
      await runCommand("npm", ["run", "docs:portal"]);
    } catch (e: any) {
      console.warn(`⚠️ Docs portal warning: ${e.message}`);
    }
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL INSTAGRAM REELS UPLOADED WITH CUSTOM COVERS SUCCESSFULLY!");
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err);
  process.exit(1);
});
