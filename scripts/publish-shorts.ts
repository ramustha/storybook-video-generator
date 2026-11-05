import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const ALL_STORIES = [
  "gara-gara-kucing",
  "hari-cukur-rambut",
  "jas-hujan-merah",
  "pisang-terlalu-banyak",
  "raja-gemuk-anjing-kurus",
  "bulan-dan-topi-biru",
];

interface ShortCandidate {
  slug: string;
  lang: "id" | "en";
  title: string;
  durationSeconds: number;
  isEligibleShorts: boolean; // durationSeconds <= 180
  reason?: string;
  existingShortId?: string;
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

function resolveVerticalVideoPath(storyDir: string, slug: string, lang: string, manifest: any): string | null {
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
  console.log("📱 YOUTUBE SHORTS AUTOMATED PIPELINE (<180s COMPLIANT)");
  console.log("==================================================================");
  console.log(`🧪 Execution Mode: ${isDryRun ? "DRY RUN (Preview Only)" : "LIVE EXECUTION"}`);
  if (targetBook) console.log(`📖 Target Book   : ${targetBook}`);
  if (targetLang) console.log(`🌐 Target Lang   : ${targetLang.toUpperCase()}`);
  console.log("==================================================================\n");

  const storiesToInspect = targetBook ? [targetBook] : ALL_STORIES;
  const candidates: ShortCandidate[] = [];

  for (const slug of storiesToInspect) {
    const storyJsonPath = path.resolve(`./stories/${slug}/story.json`);
    if (!existsSync(storyJsonPath)) continue;

    const manifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
    const langs: Array<"id" | "en"> = targetLang ? [targetLang] : ["id", "en"];

    for (const lang of langs) {
      const dur = manifest.scenes.reduce((acc: number, sc: any) => {
        if (lang === "en" && sc.audio?.en?.durationSeconds) {
          return acc + sc.audio.en.durationSeconds;
        }
        return acc + (sc.durationSeconds || 0);
      }, 0);

      const isEligible = dur <= 180;
      const title = lang === "en" ? (manifest.originalTitle || manifest.title) : manifest.title;
      const existingShortId = manifest.publications?.youtube?.[lang]?.vertical?.id;

      candidates.push({
        slug,
        lang,
        title,
        durationSeconds: dur,
        isEligibleShorts: isEligible,
        reason: isEligible
          ? "Compliant with YouTube Shorts limit (<= 180s)"
          : `Duration is ${dur.toFixed(1)}s (> 180s). Exceeds YouTube Shorts ceiling; suppressed to prevent falling into the Videos tab.`,
        existingShortId,
      });
    }
  }

  console.log("📋 SHORTS ELIGIBILITY AUDIT:");
  console.log("-----------------------------------------------------------------------------------------");
  console.log("Story / Edition            | Duration | Status       | YouTube Short ID / Link");
  console.log("-----------------------------------------------------------------------------------------");
  for (const c of candidates) {
    const label = `${c.slug} [${c.lang.toUpperCase()}]`.padEnd(26, " ");
    const durStr = `${c.durationSeconds.toFixed(1)}s`.padEnd(8, " ");
    const status = (c.isEligibleShorts ? (c.existingShortId ? "LIVE" : "ELIGIBLE") : "EXCEEDS LIMIT").padEnd(12, " ");
    const link = c.existingShortId ? `https://youtube.com/shorts/${c.existingShortId}` : (c.isEligibleShorts ? "Pending Upload" : "Skipped (>180s)");
    console.log(`${label} | ${durStr} | ${status} | ${link}`);
  }
  console.log("-----------------------------------------------------------------------------------------\n");

  const pendingEligible = candidates.filter((c) => c.isEligibleShorts && !c.existingShortId);
  console.log(`🎯 Total Eligible Pending Shorts to Upload: ${pendingEligible.length}`);

  if (pendingEligible.length === 0) {
    console.log("✔ All eligible YouTube Shorts (<180s) are already uploaded and live!\n");
    return;
  }

  for (let i = 0; i < pendingEligible.length; i++) {
    const item = pendingEligible[i];
    console.log(`\n======================================================`);
    console.log(`🎬 [${i + 1}/${pendingEligible.length}] PROCESSING SHORT: "${item.title}" [${item.lang.toUpperCase()}]`);
    console.log(`⏱️ Duration: ${item.durationSeconds.toFixed(1)}s`);
    console.log(`======================================================`);

    const storyDir = path.resolve(`./stories/${item.slug}`);
    const storyJsonPath = path.join(storyDir, "story.json");
    const manifest = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));

    // 1. Verify or Render 9:16 Vertical Video
    let videoFile = resolveVerticalVideoPath(storyDir, item.slug, item.lang, manifest);
    if (!videoFile) {
      console.log(`\n⚙️ Video file missing for ${item.slug} [${item.lang}]! Rendering vertical video via Remotion...`);
      if (!isDryRun) {
        await runCommand("npx", [
          "tsx",
          "scripts/render-book.ts",
          "--book",
          item.slug,
          "--lang",
          item.lang,
          "--format",
          "vertical",
        ]);
        // re-read manifest after render
        const refreshed = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
        videoFile = resolveVerticalVideoPath(storyDir, item.slug, item.lang, refreshed);
      } else {
        console.log(`[DRY RUN] Would render vertical video for ${item.slug} [${item.lang}]`);
      }
    } else {
      console.log(`✔ Found existing 9:16 vertical video: ${videoFile}`);
    }

    // 2. Upload to YouTube as Public Short
    console.log(`\n🚀 Uploading Short to YouTube (@zayn.storybook)...`);
    const uploadArgs = [
      "scripts/upload-youtube.ts",
      "--book",
      item.slug,
      "--lang",
      item.lang,
      "--format",
      "vertical",
      "--privacy",
      "public",
    ];
    if (isDryRun) {
      uploadArgs.push("--dry-run");
    }

    try {
      await runCommand("npx", ["tsx", ...uploadArgs]);
    } catch (err: any) {
      console.error(`❌ Failed to upload Short for ${item.slug} [${item.lang}]:`, err.message);
    }
  }

  // Regenerate Documentation Portal
  if (!isDryRun) {
    try {
      console.log(`\n📊 Updating Docs Portal with new Shorts links...`);
      await runCommand("npm", ["run", "docs:portal"]);
    } catch (docsErr: any) {
      console.warn("⚠️ Docs portal update warning:", docsErr.message);
    }
  }

  console.log("\n==================================================================");
  console.log("🎉 YOUTUBE SHORTS AUTOMATION COMPLETED!");
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("❌ Fatal error in YouTube Shorts Automation:", err);
  process.exit(1);
});
