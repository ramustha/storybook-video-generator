import fs from "fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

interface SyncOptions {
  bookSlug?: string;
  lang: "id" | "en" | "all";
  dryRun: boolean;
  cooldownSec: number;
  cleanup: boolean;
}

interface SyncTask {
  bookSlug: string;
  bookTitle: string;
  lang: "id" | "en";
  format: "vertical" | "landscape";
  platform: "both" | "facebook" | "instagram";
  reason: string;
  videoPath: string;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    lang: "all",
    dryRun: false,
    cooldownSec: 15,
    cleanup: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book" && args[i + 1]) {
      options.bookSlug = args[++i].replace(/^stories\//, "").replace(/\/$/, "");
    } else if (arg === "--lang" && args[i + 1]) {
      options.lang = args[++i] as "id" | "en" | "all";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--cooldown" && args[i + 1]) {
      options.cooldownSec = parseInt(args[++i], 10) || 15;
    } else if (arg === "--no-cleanup") {
      options.cleanup = false;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    }
  }

  return options;
}

async function purgeR2Staging(): Promise<number> {
  const r2ConfigPath = path.resolve("./config/r2-config.json");
  if (!existsSync(r2ConfigPath)) return 0;

  try {
    const r2 = JSON.parse(readFileSync(r2ConfigPath, "utf-8"));
    const endpoint =
      r2.endpoint ||
      (r2.accountId
        ? `https://${r2.accountId}.r2.cloudflarestorage.com`
        : `https://${r2.publicDomain}`);

    const s3 = new S3Client({
      region: "auto",
      endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });

    let deletedCount = 0;
    const prefixes = ["reels/", "meta-temp-uploads/", "tiktok-temp-uploads/"];

    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: r2.bucketName,
      })
    );

    if (listRes.Contents && listRes.Contents.length > 0) {
      for (const obj of listRes.Contents) {
        if (
          obj.Key &&
          (obj.Key.endsWith(".mp4") ||
            prefixes.some((p) => obj.Key!.startsWith(p)))
        ) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: r2.bucketName,
              Key: obj.Key,
            })
          );
          deletedCount++;
        }
      }
    }

    return deletedCount;
  } catch (err: any) {
    console.warn("⚠️ Warning checking R2 staging bucket:", err.message);
    return 0;
  }
}

async function runChildCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

function findVideoFile(storyDir: string, bookSlug: string, lang: "id" | "en", format: "vertical" | "landscape", story: any): string | null {
  const targetExtension = format === "landscape" ? "16x9.mp4" : "9x16.mp4";
  const formatKey = format === "landscape" ? "landscape" : "vertical";

  // 1. Check exports map in story.json
  const manifestPathRel = story.exports?.[lang]?.[formatKey]?.path || story.exports?.[formatKey]?.path;
  if (manifestPathRel) {
    const full = path.join(storyDir, manifestPathRel);
    if (existsSync(full)) return full;
  }

  // 2. Check exports/lang/slug-format.mp4
  const standardLang = path.join(storyDir, "exports", lang, `${bookSlug}-${targetExtension}`);
  if (existsSync(standardLang)) return standardLang;

  // 3. Check exports/slug-format.mp4 (only for default Indonesian language)
  if (lang === "id") {
    const rootExports = path.join(storyDir, "exports", `${bookSlug}-${targetExtension}`);
    if (existsSync(rootExports)) return rootExports;
  }

  // 4. Scan exports/lang directory for any matching extension
  const langExportDir = path.join(storyDir, "exports", lang);
  if (existsSync(langExportDir)) {
    const files = readdirSync(langExportDir);
    const matched = files.find((f) => f.endsWith(targetExtension));
    if (matched) return path.join(langExportDir, matched);
  }

  return null;
}

async function main() {
  const options = parseArgs();

  console.log("\n==================================================================");
  console.log("🔄 MULTI-PLATFORM SYNCHRONIZER (YOUTUBE ↔ META PARITY)");
  console.log("==================================================================");
  console.log(`📖 Target Book   : ${options.bookSlug || "ALL BOOKS"}`);
  console.log(`🌐 Target Lang   : ${options.lang.toUpperCase()}`);
  console.log(`🧪 Execution Mode: ${options.dryRun ? "DRY RUN (Preview Only)" : "LIVE SYNCHRONIZATION"}`);
  console.log(`⏳ Cooldown Delay: ${options.cooldownSec}s between uploads`);
  console.log("==================================================================\n");

  const storiesDir = path.resolve("./stories");
  const allDirs = readdirSync(storiesDir).filter((d) => {
    const full = path.join(storiesDir, d);
    return (
      existsSync(path.join(full, "story.json")) &&
      d !== "branding" &&
      d !== "test-no-image" &&
      d !== "raja-gemuk-remotion"
    );
  });

  const targetSlugs = options.bookSlug ? [options.bookSlug] : allDirs;
  const syncTasks: SyncTask[] = [];
  const missingAssetNotes: string[] = [];

  for (const slug of targetSlugs) {
    const storyDir = path.join(storiesDir, slug);
    const storyJsonPath = path.join(storyDir, "story.json");
    if (!existsSync(storyJsonPath)) continue;

    const rawStory = readFileSync(storyJsonPath, "utf-8");
    const story = JSON.parse(rawStory);
    const title = story.title || slug;

    const langsToAudit: Array<"id" | "en"> =
      options.lang === "all" ? ["id", "en"] : [options.lang];

    for (const l of langsToAudit) {
      // Check YouTube publication state
      const ytLandscape = story.publications?.youtube?.[l]?.landscape || story.exports?.[l]?.landscape?.youtubeId;
      const ytVertical = story.publications?.youtube?.[l]?.vertical || story.exports?.[l]?.vertical?.youtubeId;

      // Meta publication states
      const fbLandscape = story.publications?.facebook?.[l]?.landscape || (l === "id" && story.publications?.facebook?.landscape);
      const fbVertical = story.publications?.facebook?.[l]?.vertical || (l === "id" && story.publications?.facebook?.id?.id && !story.publications?.facebook?.landscape);
      const igVertical = story.publications?.instagram?.[l] || (l === "id" && story.publications?.instagram?.id);

      // 1. Audit Vertical Reel (Facebook Reels + Instagram Reels)
      const isFbVerticalMissing = !fbVertical;
      const isIgVerticalMissing = !igVertical;

      if (isFbVerticalMissing || isIgVerticalMissing) {
        const vertFile = findVideoFile(storyDir, slug, l, "vertical", story);
        if (vertFile) {
          let targetPlatform: "both" | "facebook" | "instagram" = "both";
          if (!isFbVerticalMissing && isIgVerticalMissing) targetPlatform = "instagram";
          if (isFbVerticalMissing && !isIgVerticalMissing) targetPlatform = "facebook";

          syncTasks.push({
            bookSlug: slug,
            bookTitle: title,
            lang: l,
            format: "vertical",
            platform: targetPlatform,
            reason: `Vertical Reel missing on ${targetPlatform.toUpperCase()}`,
            videoPath: vertFile,
          });
        } else {
          missingAssetNotes.push(`[${slug}] ${l.toUpperCase()} 9:16 Vertical MP4 not found on disk. Needs render.`);
        }
      }

      // 2. Audit Landscape Video (Facebook Page Watch)
      const isFbLandscapeMissing = !fbLandscape;
      if (isFbLandscapeMissing) {
        const landFile = findVideoFile(storyDir, slug, l, "landscape", story);
        if (landFile) {
          syncTasks.push({
            bookSlug: slug,
            bookTitle: title,
            lang: l,
            format: "landscape",
            platform: "facebook",
            reason: "16:9 Landscape Video missing on Facebook Page Watch",
            videoPath: landFile,
          });
        } else {
          missingAssetNotes.push(`[${slug}] ${l.toUpperCase()} 16:9 Landscape MP4 not found on disk. Needs render.`);
        }
      }
    }
  }

  // Display Pre-Sync Audit Table
  console.log("📋 PRE-SYNC AUDIT REPORT:");
  console.log(`Found ${syncTasks.length} pending synchronization tasks ready to execute.`);

  if (syncTasks.length > 0) {
    console.log("\nPending Tasks:");
    syncTasks.forEach((t, i) => {
      console.log(
        `  ${i + 1}. [${t.bookSlug}] [${t.lang.toUpperCase()}] ${t.format.toUpperCase()} -> ${t.platform.toUpperCase()} (${path.basename(
          t.videoPath
        )})`
      );
    });
  }

  if (missingAssetNotes.length > 0) {
    console.log("\n⚠️ Items requiring rendering before they can be synced:");
    missingAssetNotes.forEach((n) => console.log(`  - ${n}`));
  }

  if (syncTasks.length === 0) {
    console.log("\n🎉 All available video assets are already 100% in sync with Meta platforms!");
    return;
  }

  console.log("\n------------------------------------------------------------------");
  if (options.dryRun) {
    console.log("🧪 DRY RUN MODE ACTIVATED: Testing execution payloads without publishing...");
  } else {
    console.log("🚀 STARTING LIVE SYNCHRONIZATION EXECUTION...");
  }
  console.log("------------------------------------------------------------------");

  let successCount = 0;
  let failCount = 0;
  let totalBytesFreed = 0;

  for (let idx = 0; idx < syncTasks.length; idx++) {
    const task = syncTasks[idx];
    console.log(`\n==================================================================`);
    console.log(`[Task ${idx + 1}/${syncTasks.length}] SYNCING: ${task.bookSlug} [${task.lang.toUpperCase()} ${task.format.toUpperCase()}]`);
    console.log(`Target: ${task.platform.toUpperCase()}`);
    console.log(`File  : ${task.videoPath}`);
    console.log(`==================================================================`);

    const metaArgs = [
      "scripts/upload-meta.ts",
      "--book",
      task.bookSlug,
      "--lang",
      task.lang,
      "--platform",
      task.platform,
      "--format",
      task.format,
    ];
    if (options.dryRun) metaArgs.push("--dry-run");

    try {
      await runChildCommand("npx", ["tsx", ...metaArgs]);
      successCount++;
      console.log(`✔ Task ${idx + 1} completed successfully!`);

      // Local video cleanup if requested
      if (!options.dryRun && options.cleanup) {
        if (existsSync(task.videoPath)) {
          const fileSize = statSync(task.videoPath).size;
          await fs.unlink(task.videoPath);
          totalBytesFreed += fileSize;
          console.log(`🗑️ [CLEANUP] Deleted local video: ${task.videoPath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB freed)`);
        }
      } else if (options.dryRun && options.cleanup) {
        if (existsSync(task.videoPath)) {
          const fileSize = statSync(task.videoPath).size;
          console.log(`🧪 [CLEANUP DRY RUN] Would delete local video: ${task.videoPath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB freed)`);
        }
      }

      // Cooldown delay between live uploads (skip on last task or in dry run)
      if (!options.dryRun && idx < syncTasks.length - 1 && options.cooldownSec > 0) {
        console.log(`⏳ Cooldown pause (${options.cooldownSec}s) to prevent Meta API rate limits...`);
        await new Promise((r) => setTimeout(r, options.cooldownSec * 1000));
      }
    } catch (err: any) {
      failCount++;
      console.error(`❌ Task ${idx + 1} failed:`, err.message);
    }
  }

  // Cloudflare R2 Remote Storage Purge
  let r2PurgedCount = 0;
  if (!options.dryRun && options.cleanup) {
    console.log(`\n🧹 Checking and purging Cloudflare R2 staging bucket...`);
    r2PurgedCount = await purgeR2Staging();
    console.log(`✔ Cloudflare R2 staging cleanup complete: ${r2PurgedCount} remote object(s) purged.`);
  }

  console.log("\n==================================================================");
  console.log(`🎉 SYNCHRONIZATION SUMMARY`);
  console.log(`==================================================================`);
  console.log(`Total Tasks Processed : ${syncTasks.length}`);
  console.log(`Successful            : ${successCount}`);
  console.log(`Failed                : ${failCount}`);
  if (options.cleanup) {
    console.log(`Local Disk Freed      : ${(totalBytesFreed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Remote R2 Purged      : ${r2PurgedCount} object(s)`);
  }
  console.log("==================================================================\n");

  if (!options.dryRun && successCount > 0) {
    console.log("📊 You can verify live metrics across all synced videos with:");
    console.log("   npm run stats:meta\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
