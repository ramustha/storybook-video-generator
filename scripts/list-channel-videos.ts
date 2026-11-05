import fs from "fs/promises";
import { existsSync } from "fs";
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

async function main() {
  const oauth2Client = await getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  console.log("\n📡 Fetching all videos from authenticated channel...");
  const channelRes = await youtube.channels.list({
    part: ["contentDetails", "snippet"],
    mine: true,
  });

  const channel = channelRes.data.items?.[0];
  if (!channel) {
    throw new Error("No channel found");
  }

  console.log(`👤 Channel: ${channel.snippet?.title} (${channel.id})`);
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("No uploads playlist found");
  }

  let allItems: any[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const playlistRes = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });

    const items = playlistRes.data.items || [];
    allItems = allItems.concat(items);
    nextPageToken = playlistRes.data.nextPageToken || undefined;
  } while (nextPageToken);

  console.log(`\n📹 Total videos in uploads playlist: ${allItems.length}\n`);

  // Fetch full video details (duration, status, thumbnails) in batches of 50
  const videoIds = allItems.map((it) => it.contentDetails?.videoId).filter(Boolean);
  let videoDetails: any[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const vRes = await youtube.videos.list({
      part: ["snippet", "contentDetails", "status"],
      id: chunk,
    });
    videoDetails = videoDetails.concat(vRes.data.items || []);
  }

  const duplicatesByTitle: Record<string, any[]> = {};

  videoDetails.forEach((v) => {
    const title = v.snippet?.title?.trim() || "Untitled";
    if (!duplicatesByTitle[title]) {
      duplicatesByTitle[title] = [];
    }
    duplicatesByTitle[title].push(v);
  });

  console.log("==================================================================");
  console.log("📋 ALL CHANNEL VIDEOS:");
  console.log("==================================================================");

  videoDetails.forEach((v, idx) => {
    const duration = v.contentDetails?.duration;
    const title = v.snippet?.title;
    const privacy = v.status?.privacyStatus;
    const publishedAt = v.snippet?.publishedAt;
    const thumbs = v.snippet?.thumbnails;
    const hasMaxres = !!thumbs?.maxres;
    const hasStandard = !!thumbs?.standard;
    const hasHigh = !!thumbs?.high;
    const thumbType = hasMaxres ? "MAXRES" : hasStandard ? "STANDARD" : hasHigh ? "HIGH" : "DEFAULT";

    console.log(`${idx + 1}. [${v.id}] (${privacy}) [${duration}] Thumb:${thumbType}`);
    console.log(`   Title : "${title}"`);
    console.log(`   Date  : ${publishedAt}`);
    console.log(`   URL   : https://youtu.be/${v.id}`);
    console.log("------------------------------------------------------------------");
  });

  console.log("\n==================================================================");
  console.log("⚠️ DUPLICATE ANALYSIS (Same exact title):");
  console.log("==================================================================");

  let duplicateCount = 0;
  for (const [title, list] of Object.entries(duplicatesByTitle)) {
    if (list.length > 1) {
      duplicateCount++;
      console.log(`\n🔴 Duplicate Found (${list.length} copies): "${title}"`);
      list.forEach((v, i) => {
        console.log(`   Copy ${i + 1}: ID: ${v.id} | Date: ${v.snippet?.publishedAt} | Status: ${v.status?.privacyStatus} | https://youtu.be/${v.id}`);
      });
    }
  }

  if (duplicateCount === 0) {
    console.log("✔ No duplicate titles found.");
  }
}

main().catch(console.error);
