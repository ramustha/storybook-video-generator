import fs from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";

interface CleanupOptions {
  bookSlug?: string;
  allBooks: boolean;
  execute: boolean;
  cleanVideos: boolean;
  cleanIntermediate: boolean;
}

interface CleanupItem {
  type: "published_video" | "intermediate_page" | "temp_file";
  bookSlug: string;
  lang?: string;
  format?: string;
  filePath: string;
  sizeBytes: number;
  publishedUrl?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch {
    // Ignore errors
  }
  return total;
}

async function scanBook(bookSlug: string, options: CleanupOptions): Promise<{ items: CleanupItem[]; totalBytes: number }> {
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  const items: CleanupItem[] = [];
  let totalBytes = 0;

  if (!existsSync(manifestPath)) {
    return { items, totalBytes };
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const publications = manifest.publications?.youtube || {};

  // 1. Scan for published video files
  if (options.cleanVideos) {
    const langs: Array<"id" | "en"> = ["id", "en"];
    for (const lang of langs) {
      const exportDir = path.join(storyDir, "exports", lang);
      if (!existsSync(exportDir)) continue;

      // Check landscape
      const landscapePub = publications[lang]?.landscape;
      const isLandscapePublished = landscapePub?.status === "published" && !!landscapePub?.id;
      const landscapeVideoPath = manifest.exports?.[lang]?.landscape?.path
        ? path.join(storyDir, manifest.exports[lang].landscape.path)
        : (lang === "en"
            ? path.join(exportDir, `${manifest.originalTitle ? manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : `${bookSlug}-en`}-16x9.mp4`)
            : path.join(exportDir, `${bookSlug}-16x9.mp4`));

      if (isLandscapePublished && existsSync(landscapeVideoPath)) {
        const stat = statSync(landscapeVideoPath);
        items.push({
          type: "published_video",
          bookSlug,
          lang,
          format: "landscape (16:9)",
          filePath: landscapeVideoPath,
          sizeBytes: stat.size,
          publishedUrl: landscapePub?.url || `https://youtu.be/${landscapePub.id}`,
        });
        totalBytes += stat.size;
      }

      // Check vertical / shorts
      const verticalPub = publications[lang]?.vertical;
      const isVerticalPublished = verticalPub?.status === "published" && !!verticalPub?.id;
      const verticalVideoPath = manifest.exports?.[lang]?.vertical?.path
        ? path.join(storyDir, manifest.exports[lang].vertical.path)
        : (lang === "en"
            ? path.join(exportDir, `${manifest.originalTitle ? manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : `${bookSlug}-en`}-9x16.mp4`)
            : path.join(exportDir, `${bookSlug}-9x16.mp4`));

      if (isVerticalPublished && existsSync(verticalVideoPath)) {
        const stat = statSync(verticalVideoPath);
        items.push({
          type: "published_video",
          bookSlug,
          lang,
          format: "vertical (9:16 Shorts)",
          filePath: verticalVideoPath,
          sizeBytes: stat.size,
          publishedUrl: verticalPub?.url || `https://youtube.com/shorts/${verticalPub.id}`,
        });
        totalBytes += stat.size;
      }
    }
  }

  // 2. Scan for intermediate raw page extractions (raw/pages/)
  if (options.cleanIntermediate) {
    const rawPagesDir = path.join(storyDir, "raw/pages");
    if (existsSync(rawPagesDir)) {
      // Ensure that final artwork in assets/ already exists before proposing deletion
      const assetsDir = path.join(storyDir, "assets");
      const hasAssets = existsSync(assetsDir);
      if (hasAssets) {
        const dirSize = await getDirectorySize(rawPagesDir);
        if (dirSize > 0) {
          items.push({
            type: "intermediate_page",
            bookSlug,
            filePath: rawPagesDir,
            sizeBytes: dirSize,
          });
          totalBytes += dirSize;
        }
      }
    }
  }

  return { items, totalBytes };
}

async function executeCleanup(items: CleanupItem[]) {
  console.log(`\n🧹 Executing Safe Storage Cleanup...`);
  const touchedManifests = new Set<string>();

  for (const item of items) {
    try {
      if (item.type === "published_video") {
        await fs.unlink(item.filePath);
        console.log(`   ✔ Deleted published video: ${path.basename(item.filePath)} (${formatBytes(item.sizeBytes)})`);

        // Update story.json manifest to document clean-up while preserving YouTube links
        const manifestPath = path.resolve(`./stories/${item.bookSlug}/story.json`);
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
          if (manifest.exports && item.lang && manifest.exports[item.lang]) {
            const fmtKey = item.format?.includes("16:9") ? "landscape" : "vertical";
            if (manifest.exports[item.lang][fmtKey]) {
              manifest.exports[item.lang][fmtKey].localStatus = "cleaned_up_after_publish";
              manifest.exports[item.lang][fmtKey].cleanedUpAt = new Date().toISOString();
              manifest.exports[item.lang][fmtKey].reproducibleVia = `npm run render -- --book ${item.bookSlug} --lang ${item.lang} --format ${fmtKey}`;
            }
          }
          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
          touchedManifests.add(manifestPath);
        }
      } else if (item.type === "intermediate_page") {
        await fs.rm(item.filePath, { recursive: true, force: true });
        console.log(`   ✔ Removed intermediate extraction folder: ${path.basename(item.filePath)} (${formatBytes(item.sizeBytes)})`);
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Could not delete ${item.filePath}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Storage cleanup completed! ${touchedManifests.size} story manifests updated.`);
  console.log(`💡 Note: Cleaned-up videos remain 100% live on YouTube and can be re-rendered on demand via Remotion anytime.`);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book");
  const allBooks = args.includes("--all") || !bookSlug;
  const execute = args.includes("--execute") || args.includes("--force") || args.includes("--yes");
  const cleanVideos = !args.includes("--intermediate-only");
  const cleanIntermediate = !args.includes("--videos-only");

  console.log(`\n======================================================`);
  console.log(`💾 Storybook Storage Optimizer & Post-Publish Cleanup`);
  console.log(`   Mode: ${execute ? "\x1b[32mEXECUTE (DELETING UNUSED ARTIFACTS)\x1b[0m" : "\x1b[33mDRY RUN (PREVIEW ONLY)\x1b[0m"}`);
  console.log(`======================================================`);

  const storiesDir = path.resolve("./stories");
  let targetSlugs: string[] = [];

  if (bookSlug) {
    targetSlugs = [bookSlug];
  } else {
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    targetSlugs = entries
      .filter((e) => e.isDirectory() && e.name !== "branding")
      .map((e) => e.name);
  }

  let allItems: CleanupItem[] = [];
  let grandTotalBytes = 0;

  for (const slug of targetSlugs) {
    const { items, totalBytes } = await scanBook(slug, {
      bookSlug: slug,
      allBooks,
      execute,
      cleanVideos,
      cleanIntermediate,
    });
    allItems.push(...items);
    grandTotalBytes += totalBytes;
  }

  if (allItems.length === 0) {
    console.log(`\n✨ Everything is clean! No published videos or temporary extraction scrap found.`);
    return;
  }

  console.log(`\n📦 Cleanup Candidates Found:`);
  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`Project / Category         | Type                  | Size       | Target File & Published Status`);
  console.log(`---------------------------------------------------------------------------------------------------------`);

  for (const item of allItems) {
    const typeLabel =
      item.type === "published_video"
        ? `Published MP4 [${item.lang?.toUpperCase()}]`
        : "Raw Intermediate Pages";
    const statusNote = item.publishedUrl ? `Live on YouTube (${item.publishedUrl})` : "Final assets preserved";
    console.log(
      `${item.bookSlug.padEnd(26)} | ${typeLabel.padEnd(21)} | ${formatBytes(item.sizeBytes).padStart(10)} | ${path.basename(item.filePath)} (${statusNote})`
    );
  }

  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`\n📊 Total Reclaimable Disk Space: \x1b[32m${formatBytes(grandTotalBytes)}\x1b[0m`);

  if (!execute) {
    console.log(`\n💡 To execute cleanup and reclaim ${formatBytes(grandTotalBytes)} of disk space:`);
    console.log(`   npm run cleanup -- --execute`);
    if (bookSlug) {
      console.log(`   npm run cleanup -- --book ${bookSlug} --execute`);
    }
  } else {
    await executeCleanup(allItems);
  }
}

main().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
