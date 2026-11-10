import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { google } from "googleapis";
import {
  generateSeoMetadata,
  generateStoryChapters,
  extractStoryMoral,
  extractStoryMoralDescription,
} from "./lib/seo-formatter";
import { db } from "./lib/db";

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");
const AUDIT_PATH = path.resolve("./docs/audit-data.json");

interface VideoRecord {
  videoId: string;
  storySlug: string;
  lang: "id" | "en";
  format: "landscape" | "vertical";
  currentTitle: string;
}

async function getYouTubeClient() {
  if (!existsSync(TOKEN_PATH) || !existsSync(CREDENTIALS_PATH)) {
    throw new Error("Missing YouTube credentials or token in ./config directory.");
  }
  const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf-8"));
  const installed = creds.installed || creds.web;
  const tokens = JSON.parse(await fs.readFile(TOKEN_PATH, "utf-8"));

  const oauth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    (installed.redirect_uris && installed.redirect_uris[0]) || "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials(tokens);

  return google.youtube({ version: "v3", auth: oauth2Client });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const targetSlug = args.find((a) => a.startsWith("--book="))?.split("=")[1];

  console.log("\n=======================================================");
  console.log("🚀 YOUTUBE SEO METADATA BATCH REFRESH ENGINE");
  console.log("=======================================================");
  console.log(`🧪 Execution Mode: ${isDryRun ? "DRY RUN (Preview Only)" : "LIVE EXECUTION (Updating YouTube)"}`);
  if (targetSlug) console.log(`📖 Filter Book   : ${targetSlug}`);
  console.log("=======================================================\n");

  const youtube = await getYouTubeClient();

  // 1. Gather all YouTube publications
  if (!existsSync(AUDIT_PATH)) {
    throw new Error(`Audit data not found at ${AUDIT_PATH}`);
  }

  const auditData: any[] = JSON.parse(readFileSync(AUDIT_PATH, "utf-8"));
  const ytPubs = auditData.filter(
    (item) => item.platform?.toLowerCase() === "youtube" && item.videoId
  );

  // If targetSlug specified and not in auditData, extract from story.json publications
  if (targetSlug && !ytPubs.some((p) => p.storySlug === targetSlug)) {
    const targetStoryPath = path.resolve(`./stories/${targetSlug}/story.json`);
    if (existsSync(targetStoryPath)) {
      try {
        const s = JSON.parse(readFileSync(targetStoryPath, "utf-8"));
        const pubs = s.publications?.youtube || {};
        for (const l of ["en", "id"] as const) {
          if (pubs[l]?.landscape?.id) {
            ytPubs.push({
              platform: "youtube",
              videoId: pubs[l].landscape.id,
              storySlug: targetSlug,
              language: l,
              format: "landscape",
              aspectRatio: "16:9",
              videoTitle: pubs[l].landscape.title,
            });
          }
          if (pubs[l]?.vertical?.id) {
            ytPubs.push({
              platform: "youtube",
              videoId: pubs[l].vertical.id,
              storySlug: targetSlug,
              language: l,
              format: "vertical",
              aspectRatio: "9:16",
              videoTitle: pubs[l].vertical.title,
            });
          }
        }
      } catch {}
    }
  }

  console.log(`✔ Found ${ytPubs.length} published YouTube videos in catalog.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < ytPubs.length; i++) {
    const pub = ytPubs[i];
    const slug = pub.storySlug;
    if (targetSlug && slug !== targetSlug) continue;

    const videoId = pub.videoId;
    const lang: "id" | "en" = pub.language === "en" ? "en" : "id";
    const isVertical =
      pub.format?.toLowerCase().includes("short") ||
      pub.format?.toLowerCase().includes("9:16") ||
      pub.aspectRatio === "9:16";
    const format = isVertical ? "vertical" : "landscape";

    console.log(`\n-------------------------------------------------------`);
    console.log(`[${i + 1}/${ytPubs.length}] Checking Video: ${videoId} (${slug} [${lang.toUpperCase()}] ${format})`);
    console.log(`   🔗 URL: https://youtu.be/${videoId}`);
    console.log(`   Current Title: "${pub.videoTitle}"`);

    // Load story manifest if available
    let storyJson: any = null;
    const storyJsonPath = path.resolve(`./stories/${slug}/story.json`);
    if (existsSync(storyJsonPath)) {
      try {
        storyJson = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
      } catch {}
    }

    const title = storyJson ? (lang === "en" ? (storyJson.originalTitle || storyJson.title) : storyJson.title) : pub.storyTitleId || slug;
    const author = storyJson?.source?.originalAuthor || pub.author;
    const illustrator = storyJson?.source?.originalIllustrator || pub.illustrator;
    const license = storyJson?.source?.license || pub.license;
    const publisher = storyJson?.source?.repository || "StoryWeaver / Pratham Books";
    const moralHeadline = extractStoryMoral(storyJson, lang);
    const moralDesc = extractStoryMoralDescription(storyJson, lang);

    // Generate Chapters adhering to target language and timing
    const chapters = generateStoryChapters(storyJson?.scenes || [], lang);

    // Special handling for marathon compilations to keep high-retention title
    const isCompilation = slug.startsWith("bedtime-") || pub.category?.toLowerCase().includes("compilation") || pub.category?.toLowerCase().includes("marathon");
    let seo = generateSeoMetadata({
      bookSlug: slug,
      title,
      originalTitle: storyJson?.originalTitle,
      lang,
      format,
      author,
      illustrator,
      moralHeadline,
      moralDescription: moralDesc,
      chapters,
      license,
      publisher,
    });

    if (isCompilation) {
      if (lang === "en") {
        seo.title = "Bedtime Stories Marathon for Kids (14 Mins Non-Stop) | Calming Animated Picture Books 🌙✨";
      } else {
        seo.title = "Kumpulan Dongeng Anak Sebelum Tidur (14 Menit Non-Stop) | Cerita Bergambar Penuh Pesan Moral 🌙✨";
      }
    }

    console.log(`   ✨ Optimized Title: "${seo.title}"`);
    console.log(`   🏷️  Tags Count     : ${seo.tags.length} tags`);
    console.log(`   📝 Description    : ${seo.description.split("\n")[0]}`);

    if (isDryRun) {
      console.log(`   ℹ️ [DRY RUN] Would update snippet on YouTube via API.`);
      updatedCount++;
      continue;
    }

    // Call YouTube API update
    try {
      console.log(`   📡 Calling YouTube API videos.update for ${videoId}...`);
      await youtube.videos.update({
        part: ["snippet"],
        requestBody: {
          id: videoId,
          snippet: {
            title: seo.title,
            description: seo.description,
            tags: seo.tags,
            categoryId: "27", // Education
            defaultLanguage: lang,
          },
        },
      });

      // Update local record
      pub.videoTitle = seo.title;
      updatedCount++;
      console.log(`   ✔ Video ${videoId} successfully updated with new SEO metadata!`);

      // Gentle pause to respect YouTube API rate limits
      await delay(1200);
    } catch (apiErr: any) {
      console.error(`   ❌ Failed to update ${videoId}:`, apiErr.message);
      skippedCount++;
    }
  }

  // Persist updated titles in docs/audit-data.json
  if (!isDryRun && updatedCount > 0) {
    await fs.writeFile(AUDIT_PATH, JSON.stringify(auditData, null, 2), "utf-8");
    console.log(`\n✔ docs/audit-data.json successfully updated with refreshed SEO titles.`);
  }

  console.log("\n=======================================================");
  console.log("🏁 SEO REFRESH BATCH COMPLETED");
  console.log("=======================================================");
  console.log(`Total Videos Processed : ${ytPubs.length}`);
  console.log(`Updated Videos         : ${updatedCount}`);
  console.log(`Errors / Skipped       : ${skippedCount}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Fatal error in YouTube SEO Refresh:", err);
  process.exit(1);
});
