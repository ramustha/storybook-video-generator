import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface PublishAllOptions {
  bookSlug: string;
  lang: "id" | "en" | "all";
  dryRun: boolean;
  skipYoutube: boolean;
  skipMeta: boolean;
  skipTiktok: boolean;
  skipPromo: boolean;
}

function parseArgs(): PublishAllOptions {
  const args = process.argv.slice(2);
  const options: PublishAllOptions = {
    bookSlug: "gara-gara-kucing",
    lang: "id",
    dryRun: false,
    skipYoutube: false,
    skipMeta: false,
    skipTiktok: false,
    skipPromo: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book" && args[i + 1]) {
      options.bookSlug = args[++i].replace(/^stories\//, "").replace(/\/$/, "");
    } else if (arg === "--lang" && args[i + 1]) {
      options.lang = args[++i] as "id" | "en" | "all";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-youtube") {
      options.skipYoutube = true;
    } else if (arg === "--skip-meta") {
      options.skipMeta = true;
    } else if (arg === "--skip-tiktok") {
      options.skipTiktok = true;
    } else if (arg === "--skip-promo") {
      options.skipPromo = true;
    }
  }

  return options;
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

async function main() {
  const options = parseArgs();

  console.log("\n==================================================================");
  console.log("🚀 MULTI-PLATFORM PUBLISHER (YOUTUBE, INSTAGRAM & FACEBOOK)");
  console.log("==================================================================");
  console.log(`📖 Book Slug     : ${options.bookSlug}`);
  console.log(`🌐 Target Lang   : ${options.lang.toUpperCase()}`);
  console.log(`🧪 Execution Mode: ${options.dryRun ? "DRY RUN (Preview Only)" : "LIVE PUBLISH"}`);
  console.log("==================================================================\n");

  const storyDir = path.resolve("./stories", options.bookSlug);
  const storyJsonPath = path.join(storyDir, "story.json");

  if (!existsSync(storyJsonPath)) {
    throw new Error(`Story manifest not found at ${storyJsonPath}`);
  }

  const rawStory = await fs.readFile(storyJsonPath, "utf-8");
  const story = JSON.parse(rawStory);
  console.log(`📚 Story Title: "${story.title}"\n`);

  const langsToProcess = options.lang === "all" ? ["id", "en"] : [options.lang];

  for (const currentLang of langsToProcess) {
    console.log(`\n======================================================`);
    console.log(`📍 PROCESSING LANGUAGE: [${currentLang.toUpperCase()}]`);
    console.log(`======================================================`);

    // 1. YouTube Distribution (Dual-Format: 16:9 Landscape Video & 9:16 Shorts if <= 180s per policy)
    if (!options.skipYoutube) {
      console.log(`\n--- [1/2] PUBLISHING TO YOUTUBE (DUAL-FORMAT: 16:9 VIDEO & SHORTS IF <=180s) ---`);
      const ytArgs = [
        "scripts/upload-youtube.ts",
        "--book",
        options.bookSlug,
        "--lang",
        currentLang,
        "--format",
        "all",
      ];
      if (options.dryRun) ytArgs.push("--dry-run");

      try {
        await runCommand("npx", ["tsx", ...ytArgs]);
      } catch (err: any) {
        console.error("⚠️ YouTube upload warning:", err.message);
      }
    } else {
      console.log(`⏩ Skipping YouTube per --skip-youtube`);
    }

    // 2. Meta Distribution (Instagram Reels & Facebook Page Video/Reels via R2 Fan-Out)
    if (!options.skipMeta) {
      console.log(`\n--- [2/2] PUBLISHING TO META (INSTAGRAM REELS & FACEBOOK) ---`);

      // 2A. Vertical (9:16) Fan-out to Instagram Reels & Facebook Reels
      const metaVerticalArgs = [
        "scripts/upload-meta.ts",
        "--book",
        options.bookSlug,
        "--lang",
        currentLang,
        "--platform",
        "both",
        "--format",
        "vertical",
      ];
      if (options.dryRun) metaVerticalArgs.push("--dry-run");

      try {
        console.log(`\n📲 Publishing 9:16 Vertical Reel (Instagram & Facebook)...`);
        await runCommand("npx", ["tsx", ...metaVerticalArgs]);
      } catch (err: any) {
        console.error("⚠️ Meta vertical reel upload warning:", err.message);
      }

      // 2B. Landscape (16:9) to Facebook Page Video / Watch
      const metaLandscapeArgs = [
        "scripts/upload-meta.ts",
        "--book",
        options.bookSlug,
        "--lang",
        currentLang,
        "--platform",
        "facebook",
        "--format",
        "landscape",
      ];
      if (options.dryRun) metaLandscapeArgs.push("--dry-run");

      try {
        console.log(`\n📺 Publishing 16:9 Landscape Video to Facebook Page Watch...`);
        await runCommand("npx", ["tsx", ...metaLandscapeArgs]);
      } catch (err: any) {
        console.error("⚠️ Facebook landscape upload warning:", err.message);
      }
    } else {
      console.log(`⏩ Skipping Meta per --skip-meta`);
    }

    // 3. TikTok Distribution (API v2 or Puppeteer Headless Browser Fallback)
    if (!options.skipTiktok) {
      const hasApiToken = existsSync(path.resolve("./config/tiktok-token.json"));
      const hasBrowserSession = existsSync(path.resolve("./config/tiktok-browser-session"));

      if (hasApiToken) {
        console.log(`\n--- [3/3] PUBLISHING TO TIKTOK (OFFICIAL CONTENT POSTING API) ---`);
        const tiktokArgs = ["scripts/upload-tiktok.ts", "--book", options.bookSlug, "--lang", currentLang];
        if (options.dryRun) tiktokArgs.push("--dry-run");

        try {
          await runCommand("npx", ["tsx", ...tiktokArgs]);
        } catch (err: any) {
          console.error("⚠️ TikTok API upload warning:", err.message);
        }
      } else if (hasBrowserSession) {
        console.log(`\n--- [3/3] PUBLISHING TO TIKTOK (PUPPETEER HEADLESS BROWSER) ---`);
        const tiktokBrowserArgs = [
          "scripts/upload-tiktok-browser.ts",
          "--book",
          options.bookSlug,
          "--lang",
          currentLang,
          "--headless",
        ];
        if (options.dryRun) tiktokBrowserArgs.push("--dry-run");

        try {
          await runCommand("npx", ["tsx", ...tiktokBrowserArgs]);
        } catch (err: any) {
          console.error("⚠️ TikTok Puppeteer browser upload warning:", err.message);
        }
      } else {
        console.log(`\n--- [3/3] TIKTOK STATUS ---`);
        console.log(`ℹ️ TikTok publishing paused: neither API token nor browser session connected.`);
        console.log(`👉 To activate Puppeteer: npm run upload:tiktok:browser -- --login`);
        console.log(`👉 To activate Official API: npm run upload:tiktok -- --login`);
      }
    }
  }

  // 3. Final Summary Report & Social Promotion Kit Generation
  console.log(`\n==================================================================`);
  console.log(`🎉 MULTI-PLATFORM PUBLISHING RUN COMPLETE!`);
  console.log(`==================================================================`);

  // Generate Bilingual Social Promotion Kit for all platforms (Instagram, Facebook, YouTube Community, TikTok)
  try {
    console.log(`\n📢 Generating Multi-Platform Bilingual Social Promotion Kit...`);
    await runCommand("npx", ["tsx", "scripts/generate-social-promo.ts", options.bookSlug]);
    console.log(`✔ Social promotion kit saved to stories/${options.bookSlug}/exports/social-promotion-posts.md`);
  } catch (promoErr: any) {
    console.warn("⚠️ Warning: could not generate social promotion kit:", promoErr.message);
  }

  // 4. Automated Multi-Platform Social Promotion (Facebook Page & Instagram Feed/Carousel)
  if (!options.skipPromo) {
    console.log(`\n==================================================================`);
    console.log(`📢 AUTOMATED SOCIAL PROMOTION DISTRIBUTION`);
    console.log(`==================================================================`);

    // 4A. Facebook Page Promotional Post
    try {
      console.log(`\n📘 Publishing Promotional Post to Facebook Page...`);
      const fbArgs = ["scripts/publish-launch-posts.ts", "--book", options.bookSlug];
      if (options.dryRun) fbArgs.push("--dry-run");
      await runCommand("npx", ["tsx", ...fbArgs]);
    } catch (fbErr: any) {
      console.warn("⚠️ Facebook promotion post warning:", fbErr.message);
    }

    // 4B. Instagram Feed / Carousel Post
    try {
      console.log(`\n📸 Publishing Promotional Carousel to Instagram Feed...`);
      const igArgs = ["scripts/publish-instagram-post.ts", "--book", options.bookSlug, "--carousel"];
      if (options.dryRun) igArgs.push("--dry-run");
      await runCommand("npx", ["tsx", ...igArgs]);
    } catch (igErr: any) {
      console.warn("⚠️ Instagram promotion post warning:", igErr.message);
    }

    // 4C. YouTube Community Tab (Explicit Skip Policy)
    console.log(`\n▶️ YouTube Community Tab:`);
    console.log(`ℹ️ SKIPPED from automated API distribution (Google YouTube Data API v3 does not provide an official Community Tab endpoint).`);
    console.log(`👉 Copy-paste text is preserved in stories/${options.bookSlug}/exports/social-promotion-posts.md for optional manual use.`);
  } else {
    console.log(`\n⏩ Skipping Automated Social Promotion per --skip-promo`);
  }

  if (!options.dryRun) {
    // Re-read updated story.json to display consolidated links
    const updatedRaw = await fs.readFile(storyJsonPath, "utf-8");
    const updatedStory = JSON.parse(updatedRaw);

    console.log("\n📋 LIVE PUBLICATION REPORT:");
    if (updatedStory.publications?.youtube) {
      console.log("\n▶️ YouTube:");
      console.log(JSON.stringify(updatedStory.publications.youtube, null, 2));
    }
    if (updatedStory.publications?.facebook) {
      console.log("\n📘 Facebook:");
      console.log(JSON.stringify(updatedStory.publications.facebook, null, 2));
    }
    if (updatedStory.publications?.instagram) {
      console.log("\n📸 Instagram:");
      console.log(JSON.stringify(updatedStory.publications.instagram, null, 2));
    }
  }

  console.log("\n✨ Done! You can monitor live performance anytime with: npm run stats:meta & npm run stats\n");
}

main().catch((err) => {
  console.error("❌ Fatal error in Multi-Platform Publisher:", err);
  process.exit(1);
});
