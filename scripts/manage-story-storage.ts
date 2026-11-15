import fs from "fs/promises";
import { existsSync, createReadStream, createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { validateStoryMotionSpec } from "../src/motion/edu-motion-spec";
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
    case ".mp4":
      return "video/mp4";
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
  manifestOnly: boolean = false,
  includeVideos: boolean = false
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
      if (entry.name === "_preview_frames" && entry.isDirectory()) continue;
      if (entry.name.endsWith(".mp4") && !includeVideos) continue;

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
  options: { force?: boolean; manifestOnly?: boolean; includeVideos?: boolean; dryRun?: boolean } = {}
) {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);

  console.log(`\n======================================================`);
  console.log(`☁️ Cloudflare R2 Push: [stories/${bookSlug}]`);
  console.log(`   Bucket : ${r2.bucketName}`);
  console.log(`   Target : stories/${bookSlug}/`);
  console.log(
    `   Mode   : ${
      options.manifestOnly
        ? "Manifest Only"
        : options.includeVideos
        ? "Full Story Assets + Rendered MP4 Videos"
        : "Full Story Assets (No MP4)"
    }`
  );
  if (options.dryRun) console.log(`   \x1b[33m[DRY RUN - No network mutations]\x1b[0m`);
  console.log(`======================================================`);

  const files = await collectLocalStoryFiles(bookSlug, options.manifestOnly, options.includeVideos);
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
  options: { force?: boolean; manifestOnly?: boolean; includeVideos?: boolean; dryRun?: boolean } = {}
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
        if (!options.includeVideos && item.Key.endsWith(".mp4")) {
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
/**
 * Checks whether story.json exists in Cloudflare R2 for a story slug.
 */
export async function hasStoryManifestInR2(bookSlug: string): Promise<boolean> {
  try {
    const r2 = await loadR2Config();
    const s3 = getS3Client(r2);
    await s3.send(
      new HeadObjectCommand({
        Bucket: r2.bucketName,
        Key: `stories/${bookSlug}/story.json`,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Pushes rendered compilation MP4s & metadata from exports/compilations to R2 under stories/${compSlug}/exports/${lang}/.
 */
export async function pushCompilationBuffer(
  compSlug: string,
  lang: "id" | "en"
): Promise<number> {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);
  const compDir = path.resolve("./exports/compilations");
  if (!existsSync(compDir)) {
    throw new Error(`Compilations directory not found at ${compDir}`);
  }

  const expectedPrefix = `${compSlug}-${lang}`;
  const files = (await fs.readdir(compDir)).filter(
    (name) => name.startsWith(expectedPrefix) && (name.endsWith(".mp4") || name.endsWith("-metadata.txt"))
  );

  if (files.length === 0) {
    throw new Error(`No compilation artifacts found in ${compDir} matching ${expectedPrefix}*`);
  }

  for (const file of files) {
    const localPath = path.join(compDir, file);
    const stat = await fs.stat(localPath);
    const r2Key = `stories/${compSlug}/exports/${lang}/${file}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: r2Key,
        Body: createReadStream(localPath),
        ContentType: getContentType(localPath),
        ContentLength: stat.size,
      })
    );
    console.log(`   ✔ Uploaded compilation buffer: ${r2Key} (${formatBytes(stat.size)})`);
  }

  return files.length;
}

/**
 * Pulls rendered compilation MP4s & metadata from R2 into ./exports/compilations.
 */
export async function pullCompilationBuffer(
  compSlug: string,
  lang: "id" | "en"
): Promise<boolean> {
  try {
    const r2 = await loadR2Config();
    const s3 = getS3Client(r2);
    const prefix = `stories/${compSlug}/exports/${lang}/`;
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: r2.bucketName,
        Prefix: prefix,
      })
    );
    const items = (res.Contents || []).filter((obj) => obj.Key && !obj.Key.endsWith("/"));
    if (items.length === 0) return false;

    const compDir = path.resolve("./exports/compilations");
    await fs.mkdir(compDir, { recursive: true });

    for (const obj of items) {
      const filename = path.basename(obj.Key!);
      const localPath = path.join(compDir, filename);
      if (existsSync(localPath)) {
        const stat = await fs.stat(localPath);
        if (stat.size === obj.Size) continue;
      }
      const getRes = await s3.send(
        new GetObjectCommand({
          Bucket: r2.bucketName,
          Key: obj.Key!,
        })
      );
      if (getRes.Body) {
        const out = createWriteStream(localPath);
        // @ts-ignore - stream.pipeline works cleanly with AWS SDK v3 Body stream
        await pipeline(getRes.Body as any, out);
        console.log(`   ✔ Pulled compilation buffer: ${localPath}`);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether rendered MP4 videos exist in Cloudflare R2 for a given story.
 */
export async function checkStoryBufferedVideos(bookSlug: string): Promise<{
  idLandscape: boolean;
  idVertical: boolean;
  enLandscape: boolean;
  enVertical: boolean;
  allBuffered: boolean;
  anyBuffered: boolean;
}> {
  try {
    const r2 = await loadR2Config();
    const s3 = getS3Client(r2);
    const prefix = `stories/${bookSlug}/exports/`;

    const listCmd = new ListObjectsV2Command({
      Bucket: r2.bucketName,
      Prefix: prefix,
    });
    const res = await s3.send(listCmd);

    const keys = (res.Contents || []).map((c) => c.Key || "");
    const idLandscape = keys.some((k) => k.includes("/id/") && k.endsWith("16x9.mp4"));
    const idVertical = keys.some((k) => k.includes("/id/") && k.endsWith("9x16.mp4"));
    const enLandscape = keys.some((k) => k.includes("/en/") && k.endsWith("16x9.mp4"));
    const enVertical = keys.some((k) => k.includes("/en/") && k.endsWith("9x16.mp4"));

    const allBuffered = idLandscape && idVertical && enLandscape && enVertical;
    const anyBuffered = idLandscape || idVertical || enLandscape || enVertical;

    return {
      idLandscape,
      idVertical,
      enLandscape,
      enVertical,
      allBuffered,
      anyBuffered,
    };
  } catch {
    return {
      idLandscape: false,
      idVertical: false,
      enLandscape: false,
      enVertical: false,
      allBuffered: false,
      anyBuffered: false,
    };
  }
}

export interface StoryR2Readiness {
  hasManifest: boolean;
  hasAssets: boolean;
  hasMotionSpec: boolean;
  hasLandscapeVideo: boolean;
  hasVerticalVideo: boolean;
  missingItems: string[];
  ready: boolean;
}

/**
 * Inspects Cloudflare R2 (plus local fallback for motion-spec.json) to check whether
 * all assets and rendered MP4 videos needed for an upcoming broadcast slot are ready.
 */
export async function inspectStoryReadinessInR2(params: {
  bookSlug: string;
  lang: "id" | "en";
  requireLandscape: boolean;
  requireVertical: boolean;
  isFullMotion?: boolean;
  isCompilation?: boolean;
}): Promise<StoryR2Readiness> {
  const { bookSlug, lang, requireLandscape, requireVertical, isFullMotion, isCompilation } = params;
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: r2.bucketName,
        Prefix: `stories/${bookSlug}/`,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  const localMotionSpec = path.resolve("./stories", bookSlug, "motion-spec.json");
  const hasManifest = isCompilation || keys.some((k) => k === `stories/${bookSlug}/story.json`);
  const hasAssets =
    isCompilation ||
    keys.some(
      (k) =>
        k.startsWith(`stories/${bookSlug}/assets/`) ||
        k.startsWith(`stories/${bookSlug}/motion/`)
    );
  const hasMotionSpec =
    !isFullMotion ||
    keys.some((k) => k === `stories/${bookSlug}/motion-spec.json`) ||
    existsSync(localMotionSpec);

  const exportKeys = keys.filter((k) => k.startsWith(`stories/${bookSlug}/exports/${lang}/`));
  const hasLandscapeVideo = !requireLandscape || exportKeys.some((k) => k.endsWith("16x9.mp4"));
  const hasVerticalVideo = !requireVertical || exportKeys.some((k) => k.endsWith("9x16.mp4"));

  const missingItems: string[] = [];
  if (!hasManifest) missingItems.push("story.json manifest (R2)");
  if (!hasAssets) missingItems.push("assets/illustrations or motion staging (R2)");
  if (!hasMotionSpec) missingItems.push("motion-spec.json (Full-Motion Creative AI)");
  if (!hasLandscapeVideo) missingItems.push(`rendered ${lang.toUpperCase()} 16:9 MP4 (R2)`);
  if (!hasVerticalVideo) missingItems.push(`rendered ${lang.toUpperCase()} 9:16 MP4 (R2)`);

  return {
    hasManifest,
    hasAssets,
    hasMotionSpec,
    hasLandscapeVideo,
    hasVerticalVideo,
    missingItems,
    ready: missingItems.length === 0,
  };
}

/**
 * Lists all stories in R2.
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
 * Validates and uploads ONLY `stories/<slug>/motion-spec.json` to R2 staging prefix
 * (`drafts/edu-motion/<slug>/motion-spec.json`), keeping Git and prod videos untouched.
 */
export async function pushDraftMotionSpec(
  bookSlug: string,
  options: { dryRun?: boolean } = {}
): Promise<string> {
  const localSpecPath = path.resolve("./stories", bookSlug, "motion-spec.json");
  if (!existsSync(localSpecPath)) {
    throw new Error(`Draft motion-spec.json not found at ${localSpecPath}`);
  }
  const rawContent = await fs.readFile(localSpecPath, "utf-8");
  validateStoryMotionSpec(JSON.parse(rawContent));

  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);
  const draftKey = `drafts/edu-motion/${bookSlug}/motion-spec.json`;

  if (options.dryRun) {
    console.log(`[DRY-RUN] Would upload validated draft spec to r2://${r2.bucketName}/${draftKey}`);
    return draftKey;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: draftKey,
      Body: Buffer.from(rawContent, "utf-8"),
      ContentType: "application/json",
    })
  );
  console.log(`✅ Uploaded draft Edu-Motion spec: r2://${r2.bucketName}/${draftKey}`);
  return draftKey;
}

/**
 * Pulls a story's `motion-spec.json` from `drafts/edu-motion/<slug>/motion-spec.json`
 * (or falls back to promoted `stories/<slug>/motion-spec.json`) onto local disk for CI preview.
 */
export async function pullDraftMotionSpec(
  bookSlug: string,
  options: { dryRun?: boolean } = {}
): Promise<string> {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);
  const candidates = [
    `drafts/edu-motion/${bookSlug}/motion-spec.json`,
    `stories/${bookSlug}/motion-spec.json`,
  ];

  let foundKey: string | null = null;
  for (const key of candidates) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: r2.bucketName, Key: key }));
      foundKey = key;
      break;
    } catch {
      // Check next candidate
    }
  }

  if (!foundKey) {
    throw new Error(
      `motion-spec.json not found in R2 for [${bookSlug}]. Checked: ${candidates.join(", ")}. Run "npx tsx scripts/manage-story-storage.ts draft-push ${bookSlug}" first.`
    );
  }

  const localSpecPath = path.resolve("./stories", bookSlug, "motion-spec.json");
  if (options.dryRun) {
    console.log(`[DRY-RUN] Would download r2://${r2.bucketName}/${foundKey} -> ${localSpecPath}`);
    return localSpecPath;
  }

  await fs.mkdir(path.dirname(localSpecPath), { recursive: true });
  const res = await s3.send(new GetObjectCommand({ Bucket: r2.bucketName, Key: foundKey }));
  if (!res.Body) {
    throw new Error(`Empty response downloading r2://${r2.bucketName}/${foundKey}`);
  }
  const fileStream = createWriteStream(localSpecPath);
  await pipeline(res.Body as any, fileStream);

  validateStoryMotionSpec(JSON.parse(await fs.readFile(localSpecPath, "utf-8")));
  console.log(`✅ Downloaded & validated draft spec: ${foundKey} -> ${localSpecPath}`);
  return localSpecPath;
}

/**
 * Lists all staged draft Edu-Motion specs currently sitting in R2 (`drafts/edu-motion/`).
 */
export async function listDraftMotionSpecs(): Promise<string[]> {
  const r2 = await loadR2Config();
  const s3 = getS3Client(r2);
  const drafts: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: r2.bucketName,
        Prefix: "drafts/edu-motion/",
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of res.Contents || []) {
      if (obj.Key?.endsWith("/motion-spec.json")) {
        const parts = obj.Key.split("/");
        if (parts[2]) drafts.push(parts[2]);
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  if (drafts.length === 0) {
    console.log("⚠️ No draft Edu-Motion specs in R2 under drafts/edu-motion/.");
  } else {
    console.log(`📋 Found ${drafts.length} R2 draft Edu-Motion specs:`);
    drafts.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  }
  return drafts;
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
  const includeVideos = args.includes("--include-videos") || args.includes("--with-videos");
  const dryRun = args.includes("--dry-run");

  switch (command) {
    case "push": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npm run story:push <book-slug> [--manifest-only] [--include-videos] [--force] [--dry-run]");
        process.exit(1);
      }
      await pushStory(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), {
        force,
        manifestOnly,
        includeVideos,
        dryRun,
      });
      break;
    }
    case "pull": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npm run story:pull <book-slug> [--manifest-only] [--include-videos] [--force] [--dry-run]");
        process.exit(1);
      }
      await pullStory(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), {
        force,
        manifestOnly,
        includeVideos,
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
    case "draft-push": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npx tsx scripts/manage-story-storage.ts draft-push <book-slug> [--dry-run]");
        process.exit(1);
      }
      await pushDraftMotionSpec(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), { dryRun });
      break;
    }
    case "draft-pull": {
      const bookSlug = args[1]?.startsWith("--") ? undefined : args[1] || getArg("--book");
      if (!bookSlug) {
        console.error("Usage: npx tsx scripts/manage-story-storage.ts draft-pull <book-slug> [--dry-run]");
        process.exit(1);
      }
      await pullDraftMotionSpec(bookSlug.replace(/^stories\//, "").replace(/\/$/, ""), { dryRun });
      break;
    }
    case "draft-list": {
      await listDraftMotionSpecs();
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
