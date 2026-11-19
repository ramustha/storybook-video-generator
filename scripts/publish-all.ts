import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { verifyStoryThumbnails, renderStoryThumbnails } from "./render-thumbnail";
import { notifyTelegramPublish, notifyTelegramFailure } from "./notify-telegram";
import { db } from "./lib/db";
import { pullStory } from "./manage-story-storage";
import {
  AuditRecordLike,
  CalendarSlotLike,
  loadJsonArraySafe,
  resolveExistingSlotPublications,
} from "./lib/portal-sync";

interface PublishAllOptions {
  bookSlug: string;
  lang: "id" | "en" | "all";
  dryRun: boolean;
  skipYoutube: boolean;
  skipMeta: boolean;
  skipTiktok: boolean;
  skipPromo: boolean;
  force: boolean;
  privacy: "public" | "unlisted" | "private";
}

export interface PublishFailureRecord {
  platform: string;
  lang: string;
  error: string;
}

/**
 * Identifies failures on primary automated CI broadcast platforms (YouTube, Instagram, Facebook).
 */
export function hasPrimaryPublishFailures(failures: readonly PublishFailureRecord[]): boolean {
  return failures.some((f) => /^(youtube|meta|facebook|instagram)/i.test(f.platform));
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
    force: false,
    privacy: "public",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book" && args[i + 1]) {
      options.bookSlug = args[++i].replace(/^stories\//, "").replace(/\/$/, "");
    } else if (arg === "--lang" && args[i + 1]) {
      options.lang = args[++i] as "id" | "en" | "all";
    } else if (arg === "--privacy" && args[i + 1]) {
      options.privacy = args[++i] as "public" | "unlisted" | "private";
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
    } else if (arg === "--force") {
      options.force = true;
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

  if (!options.force) {
    try {
      await pullStory(options.bookSlug, { manifestOnly: true, force: true });
    } catch {
      // Offline or manifest not in R2 yet; fall back to local story.json and D1/portal checks
    }
  }

  if (!existsSync(storyJsonPath)) {
    throw new Error(`Story manifest not found at ${storyJsonPath}`);
  }

  const rawStory = await fs.readFile(storyJsonPath, "utf-8");
  const story = JSON.parse(rawStory);
  console.log(`📚 Story Title: "${typeof story.title === "object" ? story.title.id || story.title.en : story.title}"\n`);

  const langsToProcess: Array<"id" | "en"> =
    options.lang === "all" ? ["id", "en"] : [options.lang];

  let anyUploadOccurred = false;
  const allFailures: Array<{ platform: string; lang: string; error: string }> = [];
  const localAuditRecords = loadJsonArraySafe<Partial<AuditRecordLike>>(path.resolve("./docs/audit-data.json"));
  const localCalendarSlots = loadJsonArraySafe<Partial<CalendarSlotLike>>(path.resolve("./docs/calendar-data.json"));

  for (const currentLang of langsToProcess) {
    console.log(`\n======================================================`);
    console.log(`📍 PROCESSING LANGUAGE: [${currentLang.toUpperCase()}]`);
    console.log(`======================================================`);

    // ── Pre-publish deduplication & audit gate ────────────────────────────
    const pub = story.publications || {};
    const getId = (v: any) => (typeof v === "string" ? v : v?.id || v?.videoId);

    const ytLandscapeId = getId(pub.youtube?.[currentLang]?.landscape) || story.exports?.[currentLang]?.landscape?.youtubeId;
    const ytVerticalId = getId(pub.youtube?.[currentLang]?.vertical);
    const localYtId = ytLandscapeId || ytVerticalId;

    const localIgId = getId(pub.instagram?.[currentLang]) || (currentLang === "id" ? getId(pub.instagram?.id) : undefined);
    const localFbLandId = getId(pub.facebook?.[currentLang]?.landscape) || (currentLang === "id" ? getId(pub.facebook?.landscape) : undefined);
    const localFbVertId = getId(pub.facebook?.[currentLang]?.vertical) || (currentLang === "id" ? getId(pub.facebook?.vertical) : undefined);

    const remoteResolved = options.force
      ? null
      : await resolveExistingSlotPublications({
          bookSlug: options.bookSlug,
          lang: currentLang,
          localFlags: {
            yt: Boolean(localYtId),
            ig: Boolean(localIgId),
            fb: Boolean(localFbLandId || localFbVertId),
            ytLand: Boolean(ytLandscapeId),
            ytVert: Boolean(ytVerticalId),
            fbLand: Boolean(localFbLandId),
            fbVert: Boolean(localFbVertId),
          },
          localAuditRecords,
          localCalendarSlots,
          queryD1Publications: (slug, lang) => db.getPublishedPublicationsForSlot(slug, lang),
        });

    const ytId = localYtId || (remoteResolved?.yt ? "remote-published" : undefined);
    const igId = localIgId || (remoteResolved?.ig ? "remote-published" : undefined);
    const fbLandId = localFbLandId || (remoteResolved?.fbLand ? "remote-published" : undefined);
    const fbVertId = localFbVertId || (remoteResolved?.fbVert ? "remote-published" : undefined);

    console.log(`\n🔍 PRE-PUBLISH DEDUPLICATION AUDIT:`);
    if (remoteResolved && remoteResolved.sources.length > 0) {
      console.log(`   - Sources Tracked : ${remoteResolved.sources.join(", ")}`);
    }
    console.log(`   - YouTube Video : ${ytId ? `✔ LIVE (${ytId})` : "⏳ PENDING"}`);
    console.log(`   - Instagram Reel: ${igId ? `✔ LIVE (${igId})` : "⏳ PENDING"}`);
    console.log(`   - Facebook 16:9 : ${fbLandId ? `✔ LIVE (${fbLandId})` : "⏳ PENDING"}`);
    console.log(`   - Facebook 9:16 : ${fbVertId ? `✔ LIVE (${fbVertId})` : "⏳ PENDING"}`);

    const isAllLive = ytId && igId && (fbLandId || fbVertId || remoteResolved?.fb);
    if (isAllLive && !options.force) {
      console.log(`\n🛡️ [ZERO DUPLICATE GATE] Story "${options.bookSlug}" [${currentLang.toUpperCase()}] is ALREADY LIVE across all platforms!`);
      console.log(`   ⏩ SKIPPING publish to ensure ZERO DUPLICATE content.`);
      console.log(`   💡 Tip: Pass --force to replace or re-publish anyway.`);
      continue;
    }

    // ── Pre-publish thumbnail verification gate (only when language will upload) ─
    console.log(`\n🔍 Verifying multi-platform thumbnails for [${currentLang.toUpperCase()}]...`);
    const thumbVerifs = await verifyStoryThumbnails(options.bookSlug, currentLang);
    for (const v of thumbVerifs) {
      if (!v.isValid) {
        const missing = v.items
          .filter((t) => !t.isValid)
          .map((t) => `${t.type} (${t.error || "missing"})`)
          .join(", ");
        console.log(`⚠️  Missing/invalid thumbnails for [${v.lang.toUpperCase()}]: ${missing}`);
        if (!options.dryRun) {
          console.log(`🔧 Auto-rendering missing thumbnails for [${v.lang.toUpperCase()}]...`);
          await renderStoryThumbnails({ bookSlug: options.bookSlug, lang: v.lang, silent: false });
        } else {
          console.log(`ℹ️  (DRY RUN) Would auto-render missing thumbnails for [${v.lang.toUpperCase()}].`);
        }
      } else {
        console.log(`✔  All thumbnails valid for [${v.lang.toUpperCase()}]`);
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    // Ensure MP4 video files are rendered on disk before attempting to upload
    const storyDir = path.resolve("./stories", options.bookSlug);
    const enOriginalSlug =
      currentLang === "en" && story.originalTitle
        ? story.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : null;
    const candidateLand = [
      story.exports?.[currentLang]?.landscape?.path ? path.join(storyDir, story.exports[currentLang].landscape.path) : null,
      enOriginalSlug ? path.join(storyDir, `exports/${currentLang}/${enOriginalSlug}-16x9.mp4`) : null,
      path.join(storyDir, `exports/${currentLang}/${options.bookSlug}-16x9.mp4`),
      path.join(storyDir, `exports/${currentLang}/topsy-turvy-16x9.mp4`),
    ].find((p) => p && existsSync(p));

    const candidateVert = [
      story.exports?.[currentLang]?.vertical?.path ? path.join(storyDir, story.exports[currentLang].vertical.path) : null,
      enOriginalSlug ? path.join(storyDir, `exports/${currentLang}/${enOriginalSlug}-9x16.mp4`) : null,
      path.join(storyDir, `exports/${currentLang}/${options.bookSlug}-9x16.mp4`),
      path.join(storyDir, `exports/${currentLang}/topsy-turvy-9x16.mp4`),
    ].find((p) => p && existsSync(p));

    if ((!candidateLand || !candidateVert) && !options.dryRun) {
      console.log(`\n⚙️ [AUTO-RENDER] MP4 video files not found on disk for [${currentLang.toUpperCase()}]. Rendering Remotion videos now...`);
      await runCommand("npx", ["tsx", "scripts/render-book.ts", "--book", options.bookSlug, "--lang", currentLang, "--format", "both"]);
    }

    // 1. YouTube Distribution (Dual-Format: 16:9 Landscape Video & 9:16 Shorts if <= 180s per policy)
    if (!options.skipYoutube) {
      if (ytId && !options.force) {
        console.log(`\n⏩ Skipping YouTube: Video is already live (ID: ${ytId}) to prevent duplicate upload.`);
      } else {
        console.log(`\n--- [1/2] PUBLISHING TO YOUTUBE (DUAL-FORMAT: 16:9 VIDEO & SHORTS IF <=180s) ---`);
        const ytArgs = [
          "scripts/upload-youtube.ts",
          "--book",
          options.bookSlug,
          "--lang",
          currentLang,
          "--format",
          "all",
          "--privacy",
          options.privacy || "public",
        ];
        if (options.dryRun) ytArgs.push("--dry-run");
        if (options.force) ytArgs.push("--force");

        try {
          await runCommand("npx", ["tsx", ...ytArgs]);
          anyUploadOccurred = true;
        } catch (err: any) {
          console.error("⚠️ YouTube upload warning:", err.message);
          allFailures.push({ platform: "YouTube", lang: currentLang, error: err.message });
        }
      }
    } else {
      console.log(`⏩ Skipping YouTube per --skip-youtube`);
    }

    // 2. Meta Distribution (Instagram Reels & Facebook Page Video/Reels via R2 Fan-Out)
    if (!options.skipMeta) {
      const needIg = !igId || options.force;
      const needFbVert = !fbVertId || options.force;
      const needFbLand = !fbLandId || options.force;

      if (!needIg && !needFbVert && !needFbLand) {
        console.log(`\n⏩ Skipping Meta: Video is already live on Instagram (${igId}) and Facebook (Vert: ${fbVertId}, Land: ${fbLandId}) to prevent duplicates.`);
      } else {
        console.log(`\n--- [2/2] PUBLISHING TO META (INSTAGRAM REELS & FACEBOOK) ---`);

        // 2A. Vertical (9:16) Fan-out to Instagram Reels & Facebook Reels
        if (needIg || needFbVert) {
          const targetPlatform = needIg && needFbVert ? "both" : (needIg ? "instagram" : "facebook");
          const metaVerticalArgs = [
            "scripts/upload-meta.ts",
            "--book",
            options.bookSlug,
            "--lang",
            currentLang,
            "--platform",
            targetPlatform,
            "--format",
            "vertical",
          ];
          if (options.dryRun) metaVerticalArgs.push("--dry-run");
          if (options.force) metaVerticalArgs.push("--force");

          try {
            console.log(`\n📲 Publishing 9:16 Vertical Reel (${targetPlatform.toUpperCase()})...`);
            await runCommand("npx", ["tsx", ...metaVerticalArgs]);
            anyUploadOccurred = true;
          } catch (err: any) {
            console.error("⚠️ Meta vertical reel upload warning:", err.message);
            allFailures.push({ platform: `Meta Reels (${targetPlatform})`, lang: currentLang, error: err.message });
          }
        } else {
          console.log(`\n⏩ Skipping Vertical Reel: Already live on Instagram (${igId}) and Facebook Reels (${fbVertId}).`);
        }

        // 2B. Landscape (16:9) to Facebook Page Video / Watch
        if (needFbLand) {
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
          if (options.force) metaLandscapeArgs.push("--force");

          try {
            console.log(`\n📺 Publishing 16:9 Landscape Video to Facebook Page Watch...`);
            await runCommand("npx", ["tsx", ...metaLandscapeArgs]);
            anyUploadOccurred = true;
          } catch (err: any) {
            console.error("⚠️ Facebook landscape upload warning:", err.message);
            allFailures.push({ platform: "Facebook Watch (16:9)", lang: currentLang, error: err.message });
          }
        } else {
          console.log(`\n⏩ Skipping Facebook Landscape: Already live on Facebook Watch (${fbLandId}).`);
        }
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
          anyUploadOccurred = true;
        } catch (err: any) {
          console.error("⚠️ TikTok API upload warning:", err.message);
          allFailures.push({ platform: "TikTok (API)", lang: currentLang, error: err.message });
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
          anyUploadOccurred = true;
        } catch (err: any) {
          console.error("⚠️ TikTok Puppeteer browser upload warning:", err.message);
          allFailures.push({ platform: "TikTok (Browser)", lang: currentLang, error: err.message });
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

  // Generate Bilingual Social Promotion Kit only when uploads actually ran or forced
  if (anyUploadOccurred || options.force) {
    try {
      console.log(`\n📢 Generating Multi-Platform Bilingual Social Promotion Kit...`);
      await runCommand("npx", ["tsx", "scripts/generate-social-promo.ts", options.bookSlug]);
      console.log(`✔ Social promotion kit saved to stories/${options.bookSlug}/exports/social-promotion-posts.md`);
    } catch (promoErr: any) {
      console.warn("⚠️ Warning: could not generate social promotion kit:", promoErr.message);
    }
  }

  // 4. Automated Multi-Platform Social Promotion (Facebook Page & Instagram Feed/Carousel)
  const isSocialPromoLive = !!story.publications?.socialPromotion?.[options.lang === "all" ? "id" : options.lang];
  if (isSocialPromoLive && !options.force) {
    console.log(`\n⏩ Skipping Social Promotion: Feed announcement posts are already published for this book. (Pass --force to re-post).`);
  } else if (!anyUploadOccurred && !options.force && !options.dryRun) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] No new video uploads were performed because target editions are already live.`);
    console.log(`   ⏩ SKIPPING social promotion posts to avoid duplicate feed announcements.`);
    console.log(`   💡 Tip: Pass --force to broadcast social promotion posts anyway.`);
  } else if (!options.skipPromo) {
    console.log(`\n==================================================================`);
    console.log(`📢 AUTOMATED SOCIAL PROMOTION DISTRIBUTION`);
    console.log(`==================================================================`);

    // 4A. Facebook Page Promotional Post
    try {
      console.log(`\n📘 Publishing Promotional Post to Facebook Page...`);
      const fbArgs = ["scripts/publish-launch-posts.ts", "--book", options.bookSlug, "--lang", options.lang === "all" ? "id" : options.lang];
      if (options.dryRun) fbArgs.push("--dry-run");
      await runCommand("npx", ["tsx", ...fbArgs]);
    } catch (fbErr: any) {
      console.warn("⚠️ Facebook promotion post warning:", fbErr.message);
    }

    // 4B. Instagram Feed / Carousel Post (throttled off by default — native IG Reel already posts to feed & grid)
    if (process.argv.includes("--include-ig-promo")) {
      try {
        console.log(`\n📸 Publishing Promotional Post to Instagram Feed...`);
        const igArgs = ["scripts/publish-instagram-post.ts", "--book", options.bookSlug, "--lang", options.lang === "all" ? "id" : options.lang, "--carousel"];
        if (options.dryRun) igArgs.push("--dry-run");
        await runCommand("npx", ["tsx", ...igArgs]);
      } catch (igErr: any) {
        console.warn("⚠️ Instagram promotion post warning:", igErr.message);
      }
    } else {
      console.log(`\n🛡️ [IG THROTTLE] Skipping redundant Instagram Feed promo post (Reel already covers IG feed/grid; pass --include-ig-promo to override).`);
    }

    // 4C. Meta Threads Promotional Post (Image Preview Only)
    try {
      console.log(`\n🧵 Publishing Promotional Post to Meta Threads (Image Preview)...`);
      const threadsArgs = [
        "scripts/publish-threads.ts",
        "--book",
        options.bookSlug,
        "--lang",
        options.lang === "all" ? "id" : options.lang,
        "--mode",
        "image",
      ];
      if (options.dryRun) threadsArgs.push("--dry-run");
      await runCommand("npx", ["tsx", ...threadsArgs]);
    } catch (threadsErr: any) {
      console.warn("⚠️ Threads promotion post warning:", threadsErr.message);
    }

    // Record social promotion state in story.json (re-read to avoid clobbering child process updates)
    if (!options.dryRun) {
      try {
        const freshRaw = await fs.readFile(storyJsonPath, "utf-8");
        const freshStory = JSON.parse(freshRaw);
        if (!freshStory.publications) freshStory.publications = {};
        if (!freshStory.publications.socialPromotion) freshStory.publications.socialPromotion = {};
        freshStory.publications.socialPromotion[options.lang === "all" ? "id" : options.lang] = {
          published: true,
          publishedAt: new Date().toISOString(),
        };
        await fs.writeFile(storyJsonPath, JSON.stringify(freshStory, null, 2), "utf-8");

        // Sync publications and state to Cloudflare D1
        try {
          await db.saveStory(freshStory);
          console.log(`\n☁️ Synchronized publications to Cloudflare D1 serverless database.`);
        } catch (d1Err: any) {
          console.warn("⚠️ Cloudflare D1 synchronization warning:", d1Err.message);
        }
      } catch (saveErr: any) {
        console.warn("⚠️ Failed updating socialPromotion in story.json:", saveErr.message);
      }
    }

    // 4D. YouTube Community Tab (Explicit Skip Policy)
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
    if (updatedStory.publications?.threads) {
      console.log("\n🧵 Threads:");
      console.log(JSON.stringify(updatedStory.publications.threads, null, 2));
    }

    // 5. Telegram Notifications (Failure Alert or Success Broadcast)
    if (allFailures.length > 0) {
      console.warn(`\n⚠️ ${allFailures.length} platform(s) encountered failure during publish.`);
      try {
        console.log(`✈️ Dispatching Telegram Failure Alert...`);
        await notifyTelegramFailure({
          bookSlug: options.bookSlug,
          lang: options.lang === "all" ? "id" : options.lang,
          platform: Array.from(new Set(allFailures.map((f) => f.platform))).join(", "),
          error: allFailures.map((f) => `• [${f.platform} ${f.lang.toUpperCase()}]: ${f.error}`).join("\n"),
          dryRun: options.dryRun,
        });
      } catch (tgFailErr: any) {
        console.warn("⚠️ Telegram failure alert dispatch warning:", tgFailErr.message);
      }
    }

    if (anyUploadOccurred || options.force) {
      try {
        console.log(`\n✈️ Dispatching Telegram Broadcast Notification...`);
        await notifyTelegramPublish({
          bookSlug: options.bookSlug,
          lang: options.lang === "all" ? "id" : options.lang,
          dryRun: options.dryRun,
        });
      } catch (tgErr: any) {
        console.warn("⚠️ Telegram notification dispatch warning:", tgErr.message);
      }
    } else {
      console.log(`\n🛡️ [ZERO DUPLICATE GATE] Skipping Telegram broadcast notification (no new uploads occurred).`);
    }
  }

  console.log("\n✨ Done! You can monitor live performance anytime with: npm run stats:meta & npm run stats\n");

  if (hasPrimaryPublishFailures(allFailures)) {
    const failedPlatforms = Array.from(new Set(allFailures.map((f) => `${f.platform} [${f.lang.toUpperCase()}]`))).join(", ");
    console.error(`❌ Exiting non-zero due to primary broadcast failure(s): ${failedPlatforms}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch(async (err) => {
    console.error("❌ Fatal error in Multi-Platform Publisher:", err);
    try {
      const bookIdx = process.argv.indexOf("--book");
      const bookSlug = bookIdx !== -1 ? process.argv[bookIdx + 1] : undefined;
      const langIdx = process.argv.indexOf("--lang");
      const lang =
        langIdx !== -1 && (process.argv[langIdx + 1] === "en" || process.argv[langIdx + 1] === "id")
          ? (process.argv[langIdx + 1] as "id" | "en")
          : "id";
      const dryRun = process.argv.includes("--dry-run");
      await notifyTelegramFailure({
        bookSlug,
        lang,
        platform: "Multi-Platform Publisher (Fatal)",
        error: err,
        dryRun,
      });
    } catch {}
    process.exit(1);
  });
}
