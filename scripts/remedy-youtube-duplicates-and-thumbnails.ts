import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";
import path from "path";
import { google } from "googleapis";

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

async function getOAuth2Client() {
  const credsRaw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const creds = JSON.parse(credsRaw);
  const installed = creds.installed || creds.web;
  const oauth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    (installed.redirect_uris && installed.redirect_uris[0]) || "http://localhost:3000/oauth2callback"
  );
  const tokenRaw = await fs.readFile(TOKEN_PATH, "utf-8");
  oauth2Client.setCredentials(JSON.parse(tokenRaw));
  return oauth2Client;
}

const LANDSCAPE_VIDEOS = [
  // Bulan dan Topi Biru
  { id: "2wIHNkjegd0", title: "Bulan dan Topi Biru (ID)", thumb: "stories/bulan-dan-topi-biru/exports/id/thumbnail-popular.png" },
  { id: "jyQ4sbXJZAs", title: "The Moon and the Cap (EN)", thumb: "stories/bulan-dan-topi-biru/exports/en/thumbnail-popular.png" },
  // Pisang Terlalu Banyak
  { id: "8d1N51G2Py8", title: "Pisang Terlalu Banyak (ID)", thumb: "stories/pisang-terlalu-banyak/exports/id/thumbnail-popular.png" },
  { id: "Kb3pN9MtxVg", title: "Too Many Bananas (EN)", thumb: "stories/pisang-terlalu-banyak/exports/en/thumbnail-popular.png" },
  // Hari Cukur Rambut
  { id: "W_s0hTXPYfw", title: "Hari Cukur Rambut (ID)", thumb: "stories/hari-cukur-rambut/exports/id/thumbnail-popular.png" },
  { id: "U1Bi31IWBzI", title: "Annual Haircut Day (EN)", thumb: "stories/hari-cukur-rambut/exports/en/thumbnail-popular.png" },
  // Raja Gemuk Anjing Kurus
  { id: "qfpALMgjPhU", title: "Raja Gemuk, Anjing Kurus (ID)", thumb: "stories/raja-gemuk-anjing-kurus/exports/id/thumbnail-popular.png" },
  { id: "DJctEROJ7wo", title: "Fat King, Thin Dog (EN)", thumb: "stories/raja-gemuk-anjing-kurus/exports/en/thumbnail-popular.png" },
  // Jas Hujan Merah
  { id: "XJ8QuH2pXSY", title: "Jas Hujan Merah (ID)", thumb: "stories/jas-hujan-merah/exports/id/thumbnail-popular.png" },
  { id: "CkSoydfX-tc", title: "The Red Raincoat (EN)", thumb: "stories/jas-hujan-merah/exports/en/thumbnail-popular.png" },
  // Gara-Gara Kucing
  { id: "Ladb_oJ-1-U", title: "Gara-Gara Kucing (ID)", thumb: "stories/gara-gara-kucing/exports/id/thumbnail-popular.png" },
  { id: "6sLTErwRXsk", title: "It's All the Cat's Fault (EN)", thumb: "stories/gara-gara-kucing/exports/en/thumbnail-popular.png" },
  // Compilations
  { id: "7S2FvRWwgK0", title: "Kompilasi Bedtime (ID)", thumb: "exports/compilations/thumbnail-compilation-bedtime-id.png" },
  { id: "-qGIIuHClE4", title: "Bedtime Compilation (EN)", thumb: "exports/compilations/thumbnail-compilation-bedtime-en.png" },
];

const VERTICAL_DUPLICATES_TO_REMOVE = [
  { id: "rcVd_13TeKQ", name: "Pisang Terlalu Banyak (ID Vertical - 3m 16s > 3m limit)", slug: "pisang-terlalu-banyak", lang: "id" },
  { id: "_EzyLwNqz90", name: "Too Many Bananas (EN Vertical - 2m 47s)", slug: "pisang-terlalu-banyak", lang: "en" },
  { id: "Mqhho21zGRo", name: "Hari Cukur Rambut (ID Vertical - 3m 7s > 3m limit)", slug: "hari-cukur-rambut", lang: "id" },
  { id: "xm6ZotvEl6A", name: "Annual Haircut Day (EN Vertical - 2m 20s)", slug: "hari-cukur-rambut", lang: "en" },
  { id: "kOBICbv0mx0", name: "Bulan dan Topi Biru (ID Vertical - 2m 13s)", slug: "bulan-dan-topi-biru", lang: "id" },
  { id: "OSd7PKZJZW8", name: "The Moon and the Cap (EN Vertical - 1m 55s)", slug: "bulan-dan-topi-biru", lang: "en" },
  { id: "8RY5_4BF52E", name: "Raja Gemuk Anjing Kurus (ID Vertical - 1m 50s)", slug: "raja-gemuk-anjing-kurus", lang: "id" },
  { id: "J_w2XX_yOHY", name: "Fat King Thin Dog (EN Vertical - 1m 43s)", slug: "raja-gemuk-anjing-kurus", lang: "en" },
  { id: "F9oaEO7KTmE", name: "Jas Hujan Merah (ID Vertical - 1m 55s)", slug: "jas-hujan-merah", lang: "id" },
  { id: "j0S4YN46j9g", name: "The Red Raincoat (EN Vertical - 1m 37s)", slug: "jas-hujan-merah", lang: "en" },
  { id: "37P1i6JEiwE", name: "Gara-Gara Kucing (ID Vertical - 1m 18s)", slug: "gara-gara-kucing", lang: "id" },
  { id: "TRDw6JX8m5M", name: "It's All the Cat's Fault (EN Vertical - 1m 9s)", slug: "gara-gara-kucing", lang: "en" },
];

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const skipDelete = process.argv.includes("--skip-delete");
  const skipThumbs = process.argv.includes("--skip-thumbs");

  console.log("\n==================================================================");
  console.log("🛠️ YOUTUBE DUPLICATE REMOVAL & THUMBNAIL ENHANCEMENT ENGINE");
  console.log("==================================================================");
  console.log(`🧪 Execution Mode: ${isDryRun ? "DRY RUN (Preview Only)" : "LIVE EXECUTION"}`);
  console.log("==================================================================\n");

  const oauth2 = await getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: oauth2 });

  // 1. UPDATE THUMBNAILS ON ALL 14 16:9 LANDSCAPE VIDEOS & COMPILATIONS
  if (!skipThumbs) {
    console.log("------------------------------------------------------------------");
    console.log("🖼️ STEP 1: UPDATING HIGH-CTR THUMBNAILS ON 16:9 LANDSCAPE VIDEOS");
    console.log("------------------------------------------------------------------");

    for (const v of LANDSCAPE_VIDEOS) {
      const fullPath = path.resolve(v.thumb);
      if (!existsSync(fullPath)) {
        console.warn(`⚠️ Thumbnail not found: ${v.thumb} for ${v.title}`);
        continue;
      }

      console.log(`\n📌 Video: "${v.title}" [${v.id}]`);
      console.log(`   Thumb: ${path.basename(v.thumb)} (${(await fs.stat(fullPath)).size} bytes)`);

      if (!isDryRun) {
        try {
          await youtube.thumbnails.set({
            videoId: v.id,
            media: {
              body: createReadStream(fullPath),
            },
          });
          console.log(`   ✔ Successfully uploaded high-CTR thumbnail for ${v.id}!`);
        } catch (err: any) {
          console.error(`   ❌ Failed to upload thumbnail: ${err.message}`);
        }
      } else {
        console.log(`   [DRY RUN] Would upload thumbnail ${v.thumb} to video ${v.id}`);
      }
    }
  }

  // 2. DELETE VERTICAL DUPLICATES FROM YOUTUBE (CLEANING UP LONG VIDEO SECTION)
  if (!skipDelete) {
    console.log("\n------------------------------------------------------------------");
    console.log("🧹 STEP 2: REMOVING VERTICAL DUPLICATE VIDEOS FROM YOUTUBE");
    console.log("------------------------------------------------------------------");

    for (const item of VERTICAL_DUPLICATES_TO_REMOVE) {
      console.log(`\n🗑️ Removing: "${item.name}" [${item.id}]`);

      if (!isDryRun) {
        try {
          await youtube.videos.delete({ id: item.id });
          console.log(`   ✔ Successfully deleted duplicate video ${item.id} from YouTube!`);

          // Update story.json to remove YouTube vertical publication while preserving Meta/IG
          const storyJsonPath = path.resolve(`./stories/${item.slug}/story.json`);
          if (existsSync(storyJsonPath)) {
            const rawStory = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
            if (rawStory.publications?.youtube?.[item.lang]?.vertical) {
              delete rawStory.publications.youtube[item.lang].vertical;
              await fs.writeFile(storyJsonPath, JSON.stringify(rawStory, null, 2), "utf-8");
              console.log(`   ✔ Updated stories/${item.slug}/story.json (cleared YouTube vertical record)`);
            }
          }
        } catch (err: any) {
          console.error(`   ❌ Failed to delete video ${item.id}: ${err.message}`);
        }
      } else {
        console.log(`   [DRY RUN] Would delete video ${item.id} and update story.json`);
      }
    }
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL OPERATIONS COMPLETED SUCCESSFULLY!");
  console.log("==================================================================\n");
}

main().catch(console.error);
