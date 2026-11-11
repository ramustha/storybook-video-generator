import fs from "fs/promises";
import { existsSync, statSync, readFileSync } from "fs";
import path from "path";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { loadR2Config } from "./manage-story-storage";

interface CleanupItem {
  target: "local" | "r2";
  type: "published_video" | "compilation_video";
  bookSlug: string;
  lang?: string;
  format?: string;
  filePath: string;
  sizeBytes: number;
  publishedUrl?: string;
  publishedAt?: string;
  ageHours?: number;
}

interface StoryPublicationSummary {
  slug: string;
  isPublished: boolean;
  latestPublishedAt: number;
  latestPublishedAtIso: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Discovers and ranks all published stories in descending order by publication timestamp.
 * Returns the ranked list of slugs and summary metadata.
 */
async function getPublishedStoriesRanked(): Promise<{
  rankedSlugs: string[];
  storySummaries: Map<string, StoryPublicationSummary>;
}> {
  const storiesDir = path.resolve("./stories");
  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const storySlugs = entries
    .filter((e) => e.isDirectory() && e.name !== "branding")
    .map((e) => e.name);

  const summaries: StoryPublicationSummary[] = [];

  for (const slug of storySlugs) {
    const manifestPath = path.join(storiesDir, slug, "story.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      const pubs = manifest.publications?.youtube || {};
      let isPub = false;
      let maxTimestamp = 0;

      for (const lang of ["id", "en"] as const) {
        for (const fmt of ["landscape", "vertical"] as const) {
          const entry = pubs[lang]?.[fmt];
          if (entry?.status === "published" && entry?.id) {
            isPub = true;
            if (entry.publishedAt) {
              const t = new Date(entry.publishedAt).getTime();
              if (t > maxTimestamp) maxTimestamp = t;
            }
          }
        }
      }

      // Check other platforms if YouTube status wasn't set
      if (!isPub && manifest.publications) {
        for (const p of ["facebook", "instagram", "threads"] as const) {
          const platObj = manifest.publications[p];
          if (platObj) {
            for (const lang of ["id", "en"] as const) {
              const entry = platObj[lang];
              if (entry?.status === "published" || entry?.id) {
                isPub = true;
                if (entry.publishedAt) {
                  const t = new Date(entry.publishedAt).getTime();
                  if (t > maxTimestamp) maxTimestamp = t;
                }
              }
            }
          }
        }
      }

      if (isPub) {
        if (maxTimestamp === 0) {
          maxTimestamp = statSync(manifestPath).mtimeMs;
        }
        summaries.push({
          slug,
          isPublished: true,
          latestPublishedAt: maxTimestamp,
          latestPublishedAtIso: new Date(maxTimestamp).toISOString(),
        });
      }
    } catch {
      // Ignore corrupted or unreadable story.json
    }
  }

  // Sort descending: newest published story is index 0
  summaries.sort((a, b) => b.latestPublishedAt - a.latestPublishedAt);

  const rankedSlugs = summaries.map((s) => s.slug);
  const storySummaries = new Map<string, StoryPublicationSummary>();
  summaries.forEach((s) => storySummaries.set(s.slug, s));

  return { rankedSlugs, storySummaries };
}

/**
 * Scans local story directories for published videos eligible for cleanup.
 * Strictly respects protected latest releases, minimum age, and skips unreleased drafts.
 */
async function scanLocalStories(
  targetSlugs: string[],
  protectedSlugs: Set<string>,
  storySummaries: Map<string, StoryPublicationSummary>,
  minAgeHours: number
): Promise<{ items: CleanupItem[]; totalBytes: number }> {
  const items: CleanupItem[] = [];
  let totalBytes = 0;
  const storiesDir = path.resolve("./stories");

  for (const slug of targetSlugs) {
    // 🛡️ Guard 1: Never delete protected latest published releases
    if (protectedSlugs.has(slug)) {
      continue;
    }

    // 🛡️ Guard 2: Never delete unreleased / future stories
    const summary = storySummaries.get(slug);
    if (!summary || !summary.isPublished) {
      continue;
    }

    const storyDir = path.join(storiesDir, slug);
    const manifestPath = path.join(storyDir, "story.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      const publications = manifest.publications?.youtube || {};

      for (const lang of ["id", "en"] as const) {
        const exportDir = path.join(storyDir, "exports", lang);
        if (!existsSync(exportDir)) continue;

        // Check landscape
        const landscapePub = publications[lang]?.landscape;
        const isLandscapePub = landscapePub?.status === "published" && !!landscapePub?.id;
        const landscapePath = manifest.exports?.[lang]?.landscape?.path
          ? path.join(storyDir, manifest.exports[lang].landscape.path)
          : (lang === "en"
              ? path.join(exportDir, `${manifest.originalTitle ? manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : `${slug}-en`}-16x9.mp4`)
              : path.join(exportDir, `${slug}-16x9.mp4`));

        if (isLandscapePub && existsSync(landscapePath)) {
          const pubTime = landscapePub.publishedAt ? new Date(landscapePub.publishedAt).getTime() : summary.latestPublishedAt;
          const ageHours = (Date.now() - pubTime) / (1000 * 3600);

          if (ageHours >= minAgeHours) {
            const stat = statSync(landscapePath);
            items.push({
              target: "local",
              type: "published_video",
              bookSlug: slug,
              lang,
              format: "landscape (16:9)",
              filePath: landscapePath,
              sizeBytes: stat.size,
              publishedUrl: landscapePub?.url || `https://youtu.be/${landscapePub.id}`,
              publishedAt: new Date(pubTime).toISOString(),
              ageHours: Math.round(ageHours),
            });
            totalBytes += stat.size;
          }
        }

        // Check vertical
        const verticalPub = publications[lang]?.vertical;
        const isVerticalPub = verticalPub?.status === "published" && !!verticalPub?.id;
        const verticalPath = manifest.exports?.[lang]?.vertical?.path
          ? path.join(storyDir, manifest.exports[lang].vertical.path)
          : (lang === "en"
              ? path.join(exportDir, `${manifest.originalTitle ? manifest.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : `${slug}-en`}-9x16.mp4`)
              : path.join(exportDir, `${slug}-9x16.mp4`));

        if (isVerticalPub && existsSync(verticalPath)) {
          const pubTime = verticalPub.publishedAt ? new Date(verticalPub.publishedAt).getTime() : summary.latestPublishedAt;
          const ageHours = (Date.now() - pubTime) / (1000 * 3600);

          if (ageHours >= minAgeHours) {
            const stat = statSync(verticalPath);
            items.push({
              target: "local",
              type: "published_video",
              bookSlug: slug,
              lang,
              format: "vertical (9:16)",
              filePath: verticalPath,
              sizeBytes: stat.size,
              publishedUrl: verticalPub?.url || `https://youtube.com/shorts/${verticalPub.id}`,
              publishedAt: new Date(pubTime).toISOString(),
              ageHours: Math.round(ageHours),
            });
            totalBytes += stat.size;
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return { items, totalBytes };
}

/**
 * Scans local compilation exports for published compilation MP4s.
 */
async function scanLocalCompilations(minAgeHours: number): Promise<{ items: CleanupItem[]; totalBytes: number }> {
  const items: CleanupItem[] = [];
  let totalBytes = 0;
  const compDir = path.resolve("./exports/compilations");
  const pubPath = path.join(compDir, "publication-status.json");
  if (!existsSync(pubPath)) return { items, totalBytes };

  try {
    const pubStatus = JSON.parse(await fs.readFile(pubPath, "utf-8"));
    for (const [key, data] of Object.entries(pubStatus) as [string, any][]) {
      const isYt = !!data.youtube?.videoId;
      const isFb = !!data.videoId || !!data.permalink;
      if (isYt || isFb) {
        const mp4Path = path.join(compDir, `kompilasi-${key}-16x9.mp4`);
        if (existsSync(mp4Path)) {
          const stat = statSync(mp4Path);
          const pubTime = data.youtube?.publishedAt ? new Date(data.youtube.publishedAt).getTime() : stat.mtimeMs;
          const ageHours = (Date.now() - pubTime) / (1000 * 3600);

          if (ageHours >= minAgeHours) {
            items.push({
              target: "local",
              type: "compilation_video",
              bookSlug: `compilation-${key}`,
              lang: key.includes("-en") ? "en" : "id",
              format: "landscape (16:9)",
              filePath: mp4Path,
              sizeBytes: stat.size,
              publishedUrl: data.youtube?.url || data.permalink || `https://youtu.be/${data.youtube?.videoId}`,
              publishedAt: new Date(pubTime).toISOString(),
              ageHours: Math.round(ageHours),
            });
            totalBytes += stat.size;
          }
        }
      }
    }
  } catch {
    // Ignore error
  }

  return { items, totalBytes };
}

/**
 * Scans Cloudflare R2 bucket for published MP4 video buffers eligible for deletion.
 * Strictly respects protected latest releases, minimum age, and skips unreleased buffers.
 */
async function scanR2(
  protectedSlugs: Set<string>,
  storySummaries: Map<string, StoryPublicationSummary>,
  minAgeHours: number
): Promise<{ items: CleanupItem[]; totalBytes: number }> {
  const items: CleanupItem[] = [];
  let totalBytes = 0;

  let r2Config;
  try {
    r2Config = await loadR2Config();
  } catch (err: any) {
    console.warn(`⚠️ Cloudflare R2 not configured: ${err.message}. Skipping R2 scan.`);
    return { items, totalBytes };
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Config.endpoint,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });

  const storiesDir = path.resolve("./stories");
  let continuationToken: string | undefined = undefined;

  try {
    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: r2Config.bucketName,
          ContinuationToken: continuationToken,
        })
      );

      const contents = res.Contents || [];
      for (const obj of contents) {
        if (!obj.Key || !obj.Key.endsWith(".mp4")) continue;

        // Key format: stories/<slug>/exports/<lang>/<filename>.mp4
        const parts = obj.Key.split("/");
        if (parts.length < 5 || parts[0] !== "stories" || parts[2] !== "exports") continue;

        const slug = parts[1];
        const lang = parts[3];

        // 🛡️ Guard 1: Never delete protected latest published releases
        if (protectedSlugs.has(slug)) {
          continue;
        }

        // 🛡️ Guard 2: Never delete unreleased / future buffer stories
        const summary = storySummaries.get(slug);
        if (!summary || !summary.isPublished) {
          continue;
        }

        // Check if the specific language is published
        const manifestPath = path.join(storiesDir, slug, "story.json");
        let isLangPublished = false;
        let langPubTimestamp = 0;
        let pubUrl: string | undefined = undefined;

        if (existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
            const pubLandscape = manifest.publications?.youtube?.[lang]?.landscape;
            const pubVertical = manifest.publications?.youtube?.[lang]?.vertical;

            if (pubLandscape?.status === "published" || pubVertical?.status === "published") {
              isLangPublished = true;
              pubUrl = pubLandscape?.url || pubVertical?.url;
              const t = Math.max(
                pubLandscape?.publishedAt ? new Date(pubLandscape.publishedAt).getTime() : 0,
                pubVertical?.publishedAt ? new Date(pubVertical.publishedAt).getTime() : 0
              );
              langPubTimestamp = t || summary.latestPublishedAt;
            }
          } catch {}
        }

        if (!isLangPublished) {
          continue; // Lang not yet published (e.g. upcoming slot)!
        }

        // 🛡️ Guard 3: Minimum age requirement
        const ageHours = (Date.now() - langPubTimestamp) / (1000 * 3600);
        if (ageHours < minAgeHours) {
          continue; // Published too recently (< minAgeHours)!
        }

        const size = obj.Size || 0;
        items.push({
          target: "r2",
          type: "published_video",
          bookSlug: slug,
          lang,
          filePath: obj.Key,
          sizeBytes: size,
          publishedUrl: pubUrl,
          publishedAt: new Date(langPubTimestamp).toISOString(),
          ageHours: Math.round(ageHours),
        });
        totalBytes += size;
      }

      continuationToken = res.NextContinuationToken;
    } while (continuationToken);
  } catch (err: any) {
    console.warn(`⚠️ R2 scan error: ${err.message}`);
  }

  return { items, totalBytes };
}

/**
 * Executes local deletion and marks manifest localStatus.
 */
async function executeLocalCleanup(items: CleanupItem[]) {
  console.log(`\n🧹 Executing Local Storage Cleanup...`);
  const touchedManifests = new Set<string>();

  for (const item of items) {
    try {
      if (existsSync(item.filePath)) {
        await fs.unlink(item.filePath);
        console.log(`   ✔ [LOCAL] Deleted published video: ${path.basename(item.filePath)} (${formatBytes(item.sizeBytes)})`);

        // If story manifest exists, document localStatus
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
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Could not delete ${item.filePath}: ${err.message}`);
    }
  }

  if (touchedManifests.size > 0) {
    console.log(`   ✔ Updated ${touchedManifests.size} story manifests with reproducible localStatus.`);
  }
}

/**
 * Executes Cloudflare R2 remote deletion.
 */
async function executeR2Cleanup(items: CleanupItem[]) {
  console.log(`\n☁️ Executing Cloudflare R2 Remote Storage Cleanup...`);
  const r2Config = await loadR2Config();
  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Config.endpoint,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });

  for (const item of items) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2Config.bucketName,
          Key: item.filePath,
        })
      );
      console.log(`   ✔ [R2] Deleted remote published buffer: ${item.filePath} (${formatBytes(item.sizeBytes)})`);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not delete R2 object ${item.filePath}: ${err.message}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isLocal = args.includes("--local") || (!args.includes("--r2") && !args.includes("--all-targets"));
  const isR2 = args.includes("--r2") || args.includes("--all-targets");
  const isExecute = args.includes("--execute") || args.includes("--force") || args.includes("--yes");
  const keepLatest = parseInt(getArg("--keep-latest") || "1", 10);
  const minAgeHours = getArg("--min-age-hours") !== undefined
    ? parseInt(getArg("--min-age-hours")!, 10)
    : (isR2 && !isLocal ? 48 : 0);
  const bookSlug = getArg("--book");

  console.log(`\n==================================================================`);
  console.log(`💾 ZAYN STORYBOOK: HYBRID STORAGE OPTIMIZER & CLEANUP`);
  console.log(`   Targets Active       : ${[isLocal ? "LOCAL DISK" : null, isR2 ? "CLOUDFLARE R2" : null].filter(Boolean).join(" & ")}`);
  console.log(`   Execution Mode       : ${isExecute ? "\x1b[32mEXECUTE (DELETING UNUSED ARTIFACTS)\x1b[0m" : "\x1b[33mDRY RUN (PREVIEW ONLY)\x1b[0m"}`);
  console.log(`   Keep Latest Releases : Top ${keepLatest} published story`);
  console.log(`   Minimum Age Gate     : ${minAgeHours} hours after publication`);
  if (bookSlug) console.log(`   Single Book Filter   : ${bookSlug}`);
  console.log(`==================================================================`);

  // 1. Analyze published stories and rank them
  const { rankedSlugs, storySummaries } = await getPublishedStoriesRanked();
  const protectedSlugs = new Set<string>(rankedSlugs.slice(0, keepLatest));

  if (protectedSlugs.size > 0) {
    console.log(`\n🛡️  Protected Latest Releases (${protectedSlugs.size} story):`);
    for (const slug of protectedSlugs) {
      const summary = storySummaries.get(slug);
      console.log(`   • ${slug} (Published: ${summary?.latestPublishedAtIso}) -> 🔒 LOCKED`);
    }
  }

  let localItems: CleanupItem[] = [];
  let localBytes = 0;
  let r2Items: CleanupItem[] = [];
  let r2Bytes = 0;

  // 2. Scan Local Storage if requested
  if (isLocal) {
    console.log(`\n🔍 Scanning Local Storage for historic published videos...`);
    const targetSlugs = bookSlug
      ? [bookSlug]
      : (await fs.readdir(path.resolve("./stories"), { withFileTypes: true }))
          .filter((e) => e.isDirectory() && e.name !== "branding")
          .map((e) => e.name);

    const localStories = await scanLocalStories(targetSlugs, protectedSlugs, storySummaries, minAgeHours);
    localItems.push(...localStories.items);
    localBytes += localStories.totalBytes;

    if (!bookSlug) {
      const localComp = await scanLocalCompilations(minAgeHours);
      localItems.push(...localComp.items);
      localBytes += localComp.totalBytes;
    }
  }

  // 3. Scan Cloudflare R2 if requested
  if (isR2) {
    console.log(`\n🔍 Scanning Cloudflare R2 Remote Storage for published video buffers...`);
    const r2Scan = await scanR2(protectedSlugs, storySummaries, minAgeHours);
    r2Items.push(...r2Scan.items);
    r2Bytes += r2Scan.totalBytes;
  }

  const allItems = [...localItems, ...r2Items];
  const grandTotalBytes = localBytes + r2Bytes;

  if (allItems.length === 0) {
    console.log(`\n✨ Everything is clean!`);
    console.log(`   • No historic published videos found exceeding retention rules.`);
    console.log(`   • All upcoming buffers and latest release assets are safely intact.`);
    return;
  }

  console.log(`\n📦 Cleanup Candidates Found (${allItems.length} items):`);
  console.log(`-----------------------------------------------------------------------------------------------------------------`);
  console.log(`Target  | Project / Category        | Type                    | Size       | Age   | Published Status`);
  console.log(`-----------------------------------------------------------------------------------------------------------------`);

  for (const item of allItems) {
    const targetBadge = item.target === "local" ? "LOCAL" : "R2   ";
    const typeLabel =
      item.type === "compilation_video"
        ? "Compilation MP4"
        : `Published MP4 [${item.lang?.toUpperCase()}]`;
    const ageLabel = item.ageHours !== undefined ? `${item.ageHours}h ago` : "N/A";
    const statusNote = item.publishedUrl ? `Live on YouTube (${item.publishedUrl})` : "Verified Live";

    console.log(
      `${targetBadge}   | ${item.bookSlug.padEnd(25)} | ${typeLabel.padEnd(23)} | ${formatBytes(item.sizeBytes).padStart(10)} | ${ageLabel.padEnd(5)} | ${path.basename(item.filePath)}`
    );
  }

  console.log(`-----------------------------------------------------------------------------------------------------------------`);
  if (isLocal) console.log(`📊 Local Reclaimable Disk Space : \x1b[32m${formatBytes(localBytes)}\x1b[0m`);
  if (isR2) console.log(`☁️ Cloudflare R2 Reclaimable Space: \x1b[32m${formatBytes(r2Bytes)}\x1b[0m`);
  console.log(`📊 Total Reclaimable Space      : \x1b[32m${formatBytes(grandTotalBytes)}\x1b[0m\n`);

  if (!isExecute) {
    console.log(`💡 DRY RUN COMPLETE. To execute cleanup:`);
    if (isLocal && !isR2) {
      console.log(`   npm run cleanup:local -- --execute`);
    } else if (isR2 && !isLocal) {
      console.log(`   npm run cleanup:r2 -- --execute`);
    } else {
      console.log(`   npx tsx scripts/cleanup-storage.ts --all-targets --execute`);
    }
  } else {
    if (localItems.length > 0) {
      await executeLocalCleanup(localItems);
    }
    if (r2Items.length > 0) {
      await executeR2Cleanup(r2Items);
    }
    console.log(`\n🎉 Storage cleanup completed successfully!`);
    console.log(`💡 Note: Source illustrations (assets/*.png) and voiceovers (assets/*.mp3) remain 100% intact.`);
    console.log(`   Any video can be re-rendered via Remotion anytime on demand.`);
  }
}

main().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
