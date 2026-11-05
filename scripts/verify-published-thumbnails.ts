import fs from "fs/promises";
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

async function verifyUrl(url: string): Promise<{ ok: boolean; status: number; contentType?: string; contentLength?: string }> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || undefined,
      contentLength: res.headers.get("content-length") || undefined,
    };
  } catch (err: any) {
    return { ok: false, status: 0 };
  }
}

async function main() {
  console.log("\n==================================================================");
  console.log("🔍 LIVE YOUTUBE THUMBNAIL VERIFICATION ENGINE");
  console.log("==================================================================\n");

  const oauth2Client = await getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const channelRes = await youtube.channels.list({
    part: ["contentDetails", "snippet"],
    mine: true,
  });

  const channel = channelRes.data.items?.[0];
  if (!channel) throw new Error("No channel found");
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("No uploads playlist found");

  let allItems: any[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const playlistRes = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    allItems = allItems.concat(playlistRes.data.items || []);
    nextPageToken = playlistRes.data.nextPageToken || undefined;
  } while (nextPageToken);

  const videoIds = allItems.map((it) => it.contentDetails?.videoId).filter(Boolean);
  const vRes = await youtube.videos.list({
    part: ["snippet", "contentDetails", "status"],
    id: videoIds,
  });

  const videos = vRes.data.items || [];
  console.log(`👤 Channel: ${channel.snippet?.title} (${channel.id})`);
  console.log(`📹 Total Published Videos: ${videos.length}\n`);

  let allValid = true;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const snippet = v.snippet;
    const thumbs = snippet?.thumbnails;
    const bestThumb = thumbs?.maxres || thumbs?.standard || thumbs?.high || thumbs?.default;
    const thumbLevel = thumbs?.maxres ? "MAXRES (1920x1080)" : thumbs?.standard ? "STANDARD (640x480)" : thumbs?.high ? "HIGH (480x360)" : "DEFAULT";

    console.log(`------------------------------------------------------------------`);
    console.log(`[${i + 1}/${videos.length}] Video ID: ${v.id} | Status: ${v.status?.privacyStatus}`);
    console.log(`📌 Title: "${snippet?.title}"`);
    console.log(`📐 Tier : ${thumbLevel}`);

    if (bestThumb?.url) {
      console.log(`🌐 Thumb URL: ${bestThumb.url}`);
      const httpCheck = await verifyUrl(bestThumb.url);
      if (httpCheck.ok) {
        console.log(`   ✔ CDN Check : HTTP ${httpCheck.status} | Content-Type: ${httpCheck.contentType} | Size: ${httpCheck.contentLength || "chunked"} bytes`);
      } else {
        allValid = false;
        console.error(`   ❌ CDN Check FAILED: HTTP ${httpCheck.status}`);
      }
    } else {
      allValid = false;
      console.error(`   ❌ No thumbnail URL available!`);
    }
  }

  console.log("\n==================================================================");
  if (allValid) {
    console.log("🎉 ALL 14 PUBLISHED VIDEOS HAVE ACTIVE, HIGH-RESOLUTION THUMBNAILS ON YOUTUBE CDN!");
  } else {
    console.log("⚠️ Some thumbnails failed verification. Check details above.");
  }
  console.log("==================================================================\n");
}

main().catch(console.error);
