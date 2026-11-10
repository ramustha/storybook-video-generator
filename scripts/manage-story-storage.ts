import fs from "fs/promises";
import { existsSync, createReadStream, createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  _Object,
} from "@aws-sdk/client-s3";

interface R2Config {
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

interface FileToSync {
  localPath: string;
  r2Key: string;
  sizeBytes: number;
}

/**
 * Loads R2 configuration from config/r2-config.json or environment variables.
 */
export async function loadR2Config(): Promise<R2Config> {
  const configPath = path.resolve("./config/r2-config.json");
  let fileConfig: Partial<R2Config> = {};

  if (existsSync(configPath)) {
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore file parse error and fall back to env
    }
  }

  const accountId =
    process.env.PERSONAL_R2_ACCOUNT_ID ||
    process.env.R2_ACCOUNT_ID ||
    fileConfig.accountId ||
    "";

  const accessKeyId =
    process.env.PERSONAL_R2_ACCESS_KEY_ID ||
    process.env.R2_ACCESS_KEY_ID ||
    fileConfig.accessKeyId ||
    "";

  const secretAccessKey =
    process.env.PERSONAL_R2_SECRET_ACCESS_KEY ||
    process.env.R2_SECRET_KEY ||
    fileConfig.secretAccessKey ||
    "";

  const bucketName =
    process.env.PERSONAL_R2_BUCKET_NAME ||
    process.env.R2_BUCKET_NAME ||
    fileConfig.bucketName ||
    "zayn-storybook";

  const endpoint =
    process.env.PERSONAL_R2_ENDPOINT ||
    process.env.R2_ENDPOINT ||
    fileConfig.endpoint ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  const publicDomain =
    process.env.PERSONAL_R2_PUBLIC_DOMAIN ||
    process.env.R2_PUBLIC_DOMAIN ||
    fileConfig.publicDomain ||
    "https://pub-f2786231e5e34f19a6860d7fe9ddd569.r2.dev";

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "Missing Cloudflare R2 credentials. Please ensure config/r2-config.json exists or R2_* environment variables are set."
    );
  }

  return {
    accountId,
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicDomain,
  };
}

function getS3Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".html":
      return "text/html; charset=utf-8";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/**
 * Concurrently processes an array of items with a worker limit.
 */
async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<any>[] = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e: Promise<any> = p.then(() =>
        executing.splice(executing.indexOf(e), 1)
      );
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

/**
 * Scans a story directory locally and collects all files eligible for R2 upload.
 * Option 1 rules: Excludes any *.mp4 and raw/ pages.
 */
async function collectLocalStoryFiles(
  bookSlug: string,
  manifestOnly: boolean = false
): Promise<FileToSync[]> {
  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const results: FileToSync[] = [];

  if (!existsSync(storyDir)) {
    throw new Error(`Story directory not found: ${storyDir}`);
  }

  const manifestPath = path.join(storyDir, "story.json");
  if (existsSync(manifestPath)) {
    const stat = await fs.stat(manifestPath);
    results.push({
      localPath: manifestPath,
      r2Key: `stories/${bookSlug}/story.json`,
      sizeBytes: stat.size,
    });
  } else if (manifestOnly) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  if (manifestOnly) {
    return results;
  }

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(storyDir, fullPath);

      // Skip rules
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "raw" && entry.isDirectory()) continue;
      if (entry.name === "cache" && entry.isDirectory()) continue;
      if (entry.name.endsWith(".mp4")) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        // We already added story.json
        if (relPath === "story.json") continue;

        const stat = await fs.stat(fullPath);
        results.push({
          localPath: fullPath,
          r2Key: `stories/${bookSlug}/${relPath.replace(/\\/g, "/")}`,
          sizeBytes: stat.size,
        });
      }
    }
  }

  await walk(storyDir);
  return results;
}

/**
 * Pushes a book to R2.
 */
export async function pushStory(
  bookSlug: string,
  options: { force?: boolean; manifestOnly?: boolean; dryRun?: boolean } = {}
) {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);

  console.log(`\n======================================================`);
  console.log(`☁️ Cloudflare R2 Push: [stories/${bookSlug}]`);
  console.log(`   Bucket : ${r2.bucketName}`);
  console.log(`   Target : stories/${bookSlug}/`);
  console.log(`   Mode   : ${options.manifestOnly ? "Manifest Only" : "Full Story Assets (No MP4)"}`);
  if (options.dryRun) console.log(`   \x1b[33m[DRY RUN - No network mutations]\x1b[0m`);
  console.log(`======================================================`);

  const files = await collectLocalStoryFiles(bookSlug, options.manifestOnly);
  if (files.length === 0) {
    console.log(`⚠️ No files found to upload for [${bookSlug}].`);
    return;
  }

  const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  console.log(`📋 Found ${files.length} candidate files (${formatBytes(totalBytes)}).`);

  // Fetch existing objects in R2 under stories/${bookSlug}/ to avoid re-uploading identical files
  const existingMap = new Map<string, number>();
  if (!options.force) {
    try {
      let continuationToken: string | undefined = undefined;
      do {
        const listCmd = new ListObjectsV2Command({
          Bucket: r2.bucketName,
          Prefix: `stories/${bookSlug}/`,
          ContinuationToken: continuationToken,
        });
        const res = await s3.send(listCmd);
        for (const item of res.Contents || []) {
          if (item.Key && item.Size !== undefined) {
            existingMap.set(item.Key, item.Size);
          }
        }
        continuationToken = res.NextContinuationToken;
      } while (continuationToken);
    } catch (err: any) {
      console.warn(`⚠️ Could not list existing objects: ${err.message}. Proceeding with fresh upload.`);
    }
  }

  const toUpload: FileToSync[] = [];
  let skippedBytes = 0;

  for (const file of files) {
    const existingSize = existingMap.get(file.r2Key);
    if (!options.force && existingSize !== undefined && existingSize === file.sizeBytes) {
      skippedBytes += file.sizeBytes;
    } else {
      toUpload.push(file);
    }
  }

  if (toUpload.length === 0) {
    console.log(`✨ All ${files.length} files are already in sync on Cloudflare R2! (${formatBytes(skippedBytes)} identical).`);
    return;
  }

  console.log(`🚀 Uploading ${toUpload.length} files (${formatBytes(toUpload.reduce((a, b) => a + b.sizeBytes, 0))})...`);
  if (skippedBytes > 0) {
    console.log(`   (${files.length - toUpload.length} files already match on R2, skipping)`);
  }

  let uploadedCount = 0;
  let uploadedBytes = 0;

  await asyncPool(5, toUpload, async (item) => {
    if (options.dryRun) {
      console.log(`   [DRY-RUN] Would upload: ${item.r2Key} (${formatBytes(item.sizeBytes)})`);
      return;
    }

    const fileStream = createReadStream(item.localPath);
    const contentType = getContentType(item.localPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: item.r2Key,
        Body: fileStream,
        ContentType: contentType,
        ContentLength: item.sizeBytes,
      })
    );

    uploadedCount++;
    uploadedBytes += item.sizeBytes;
    const pct = Math.round((uploadedCount / toUpload.length) * 100);
    console.log(
      `   ✔ [${uploadedCount}/${toUpload.length}] (${pct}%) ${path.relative(`./stories/${bookSlug}`, item.localPath)} (${formatBytes(item.sizeBytes)})`
    );
  });

  console.log(`\n🎉 Push Complete for [${bookSlug}]!`);
  console.log(`   Uploaded : ${uploadedCount} files (${formatBytes(uploadedBytes)})`);
  console.log(`   Bucket   : ${r2.bucketName} (stories/${bookSlug}/)`);
}

/**
 * Pulls a book from Cloudflare R2 to local disk.
 */
export async function pullStory(
  bookSlug: string,
  options: { force?: boolean; manifestOnly?: boolean; dryRun?: boolean } = {}
) {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);

  console.log(`\n======================================================`);
  console.log(`⬇️ Cloudflare R2 Pull: [stories/${bookSlug}]`);
  console.log(`   Bucket : ${r2.bucketName}`);
  console.log(`   Source : stories/${bookSlug}/`);
  console.log(`   Target : ./stories/${bookSlug}/`);
  if (options.dryRun) console.log(`   \x1b[33m[DRY RUN - No disk writes]\x1b[0m`);
  console.log(`======================================================`);

  const prefix = `stories/${bookSlug}/`;
  const remoteObjects: _Object[] = [];

  let continuationToken: string | undefined = undefined;
  do {
    const listCmd = new ListObjectsV2Command({
      Bucket: r2.bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const res = await s3.send(listCmd);
    for (const item of res.Contents || []) {
      if (item.Key && !item.Key.endsWith("/")) {
        if (options.manifestOnly && item.Key !== `${prefix}story.json`) {
          continue;
        }
        remoteObjects.push(item);
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  if (remoteObjects.length === 0) {
    console.log(`⚠️ No objects found in R2 with prefix [${prefix}].`);
    return;
  }

  const totalRemoteBytes = remoteObjects.reduce((acc, o) => acc + (o.Size || 0), 0);
  console.log(`📋 Found ${remoteObjects.length} remote files in R2 (${formatBytes(totalRemoteBytes)}).`);

  const toDownload: { remoteKey: string; localPath: string; size: number }[] = [];
  let skippedBytes = 0;

  for (const obj of remoteObjects) {
    const relKey = obj.Key!.substring(prefix.length);
    const localPath = path.resolve(`./stories/${bookSlug}`, relKey);

    if (!options.force && existsSync(localPath)) {
      const stat = await fs.stat(localPath);
      if (stat.size === obj.Size) {
        skippedBytes += stat.size;
        continue;
      }
    }

    toDownload.push({
      remoteKey: obj.Key!,
      localPath,
      size: obj.Size || 0,
    });
  }

  if (toDownload.length === 0) {
    console.log(`✨ All ${remoteObjects.length} files are already up-to-date locally! (${formatBytes(skippedBytes)} match).`);
    return;
  }

  console.log(`🚀 Downloading ${toDownload.length} files (${formatBytes(toDownload.reduce((a, b) => a + b.size, 0))})...`);
  if (skippedBytes > 0) {
    console.log(`   (${remoteObjects.length - toDownload.length} files already match locally, skipping)`);
  }

  let downloadedCount = 0;
  let downloadedBytes = 0;

  await asyncPool(5, toDownload, async (item) => {
    if (options.dryRun) {
      console.log(`   [DRY-RUN] Would download: ${item.remoteKey} -> ${item.localPath}`);
      return;
    }

    const parentDir = path.dirname(item.localPath);
    await fs.mkdir(parentDir, { recursive: true });

    const getCmd = new GetObjectCommand({
      Bucket: r2.bucketName,
      Key: item.remoteKey,
    });
    const res = await s3.send(getCmd);

    if (res.Body) {
      const fileStream = createWriteStream(item.localPath);
      await pipeline(res.Body as any, fileStream);
    }

    downloadedCount++;
    downloadedBytes += item.size;
    const pct = Math.round((downloadedCount / toDownload.length) * 100);
    console.log(
      `   ✔ [${downloadedCount}/${toDownload.length}] (${pct}%) ${path.relative(`./stories/${bookSlug}`, item.localPath)} (${formatBytes(item.size)})`
    );
  });

  console.log(`\n🎉 Pull Complete for [${bookSlug}]!`);
  console.log(`   Downloaded : ${downloadedCount} files (${formatBytes(downloadedBytes)})`);
  console.log(`   Location   : ./stories/${bookSlug}/`);
}

/**
 * Lists all stories stored in Cloudflare R2 with statistics.
 */
export async function listStories() {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);

  console.log(`\n======================================================`);
  console.log(`📚 Zayn Storybook - Cloudflare R2 Remote Catalog`);
  console.log(`   Bucket: ${r2.bucketName}`);
  console.log(`======================================================\n`);

  const bookStats = new Map<
    string,
    { fileCount: number; totalBytes: number; hasManifest: boolean; lastModified?: Date }
  >();

  let continuationToken: string | undefined = undefined;
  let totalObjects = 0;
  let grandTotalBytes = 0;

  do {
    const listCmd = new ListObjectsV2Command({
      Bucket: r2.bucketName,
      Prefix: "stories/",
      ContinuationToken: continuationToken,
    });
    const res = await s3.send(listCmd);
    for (const item of res.Contents || []) {
      if (!item.Key) continue;
      totalObjects++;
      grandTotalBytes += item.Size || 0;

      const parts = item.Key.split("/");
      if (parts.length >= 2 && parts[0] === "stories") {
        const slug = parts[1];
        if (!bookStats.has(slug)) {
          bookStats.set(slug, {
            fileCount: 0,
            totalBytes: 0,
            hasManifest: false,
          });
        }
        const stat = bookStats.get(slug)!;
        stat.fileCount++;
        stat.totalBytes += item.Size || 0;
        if (parts[2] === "story.json") {
          stat.hasManifest = true;
        }
        if (item.LastModified && (!stat.lastModified || item.LastModified > stat.lastModified)) {
          stat.lastModified = item.LastModified;
        }
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  if (bookStats.size === 0) {
    console.log(`⚠️ No stories currently found in Cloudflare R2 under 'stories/'.`);
    console.log(`💡 Run 'npm run story:push-all' to upload local stories to R2.`);
    return;
  }

  console.log(
    `-----------------------------------------------------------------------------------------`
  );
  console.log(
    `Book Slug                      | Files | Total Size | Manifest | Last Synced`
  );
  console.log(
    `-----------------------------------------------------------------------------------------`
  );

  for (const [slug, stat] of bookStats.entries()) {
    const manifestStatus = stat.hasManifest ? "✔ Yes" : "❌ No";
    const lastDate = stat.lastModified
      ? stat.lastModified.toISOString().split("T")[0]
      : "-";
    console.log(
      `${slug.padEnd(30)} | ${String(stat.fileCount).padStart(5)} | ${formatBytes(stat.totalBytes).padStart(10)} | ${manifestStatus.padEnd(8)} | ${lastDate}`
    );
  }

  console.log(
    `-----------------------------------------------------------------------------------------`
  );
  console.log(
    `📊 Grand Total: ${bookStats.size} Stories | ${totalObjects} Objects | ${formatBytes(grandTotalBytes)} in R2\n`
  );
}

/**
 * Pushes all local stories to R2.
 */
async function pushAll(options: { force?: boolean; dryRun?: boolean }) {
  const storiesDir = path.resolve("./stories");
  const entries = await fs.readdir(storiesDir, { withFileTypes: true });

  const targetSlugs = entries
    .filter(
      (e) =>
        e.isDirectory() &&
        e.name !== "branding" &&
        !e.name.startsWith("test-") &&
        e.name !== "raja-gemuk-remotion"
    )
    .map((e) => e.name);

  console.log(`\n📦 Discovered ${targetSlugs.length} story candidates to sync to R2:`);
  targetSlugs.forEach((s, idx) => console.log(`   ${idx + 1}. ${s}`));

  for (const slug of targetSlugs) {
    await pushStory(slug, options);
  }

  console.log(`\n🎉 ALL STORIES SUCCESSFULLY SYNCED TO CLOUDFLARE R2!`);
}

/**
 * Pulls all stories present in R2 to local disk.
 */
async function pullAll(options: { force?: boolean; dryRun?: boolean }) {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);

  const slugs = new Set<string>();
  let continuationToken: string | undefined = undefined;

  do {
    const listCmd = new ListObjectsV2Command({
      Bucket: r2.bucketName,
      Prefix: "stories/",
      ContinuationToken: continuationToken,
    });
    const res = await s3.send(listCmd);
    for (const item of res.Contents || []) {
      if (item.Key) {
        const parts = item.Key.split("/");
        if (parts.length >= 2 && parts[0] === "stories" && parts[1]) {
          slugs.add(parts[1]);
        }
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  const targetSlugs = Array.from(slugs);
  console.log(`\n📦 Discovered ${targetSlugs.length} remote stories in R2:`);
  targetSlugs.forEach((s, idx) => console.log(`   ${idx + 1}. ${s}`));

  for (const slug of targetSlugs) {
    await pullStory(slug, options);
  }

  console.log(`\n🎉 ALL STORIES SUCCESSFULLY PULLED FROM CLOUDFLARE R2!`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const force = args.includes("--force");
  const manifestOnly = args.includes("--manifest-only");
  const dryRun = args.includes("--dry-run");

  switch (command) {
    case "push": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npm run story:push <book-slug> [--manifest-only] [--force] [--dry-run]");
        process.exit(1);
      }
      await pushStory(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), {
        force,
        manifestOnly,
        dryRun,
      });
      break;
    }
    case "pull": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npm run story:pull <book-slug> [--manifest-only] [--force] [--dry-run]");
        process.exit(1);
      }
      await pullStory(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), {
        force,
        manifestOnly,
        dryRun,
      });
      break;
    }
    case "push-all": {
      await pushAll({ force, dryRun });
      break;
    }
    case "pull-all": {
      await pullAll({ force, dryRun });
      break;
    }
    case "list": {
      await listStories();
      break;
    }
    default: {
      console.log(`
📚 Zayn Storybook Cloud Storage CLI (Cloudflare R2)

Commands:
  npm run story:push <book-slug>       Upload story assets & manifest to R2 (excludes *.mp4 & raw/)
  npm run story:pull <book-slug>       Download story assets & manifest from R2
  npm run story:push-all               Upload all local stories to R2
  npm run story:pull-all               Download all stories from R2 to local disk
  npm run story:list                   View all stories and sizes in Cloudflare R2

Options:
  --manifest-only                      Only transfer story.json manifest
  --force                              Overwrite files even if file sizes match
  --dry-run                            Preview operations without executing network or disk changes
      `);
      break;
    }
  }
}

if (process.argv[1]?.includes("manage-story-storage")) {
  main().catch((err) => {
    console.error("\n❌ Error in storage management:", err);
    process.exit(1);
  });
}
