import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { google } from "googleapis";

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

async function getOAuth2Client() {
  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

  if (!clientId || !clientSecret) {
    if (process.env.YOUTUBE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.YOUTUBE_CREDENTIALS_JSON);
        const installed = creds.installed || creds.web;
        if (installed) {
          clientId = installed.client_id;
          clientSecret = installed.client_secret;
          redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
        }
      } catch (err: any) {
        console.warn(`⚠️ Failed to parse YOUTUBE_CREDENTIALS_JSON: ${err.message}`);
      }
    } else if (existsSync(CREDENTIALS_PATH)) {
      const credsRaw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
      const creds = JSON.parse(credsRaw);
      const installed = creds.installed || creds.web;
      if (installed) {
        clientId = installed.client_id;
        clientSecret = installed.client_secret;
        redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
      }
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error("❌ YouTube OAuth credentials missing. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Authorize credentials
  if (process.env.YOUTUBE_TOKEN_JSON) {
    oauth2Client.setCredentials(JSON.parse(process.env.YOUTUBE_TOKEN_JSON));
  } else if (process.env.YOUTUBE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      access_token: process.env.YOUTUBE_ACCESS_TOKEN || undefined,
    });
  } else if (existsSync(TOKEN_PATH)) {
    const tokenRaw = await fs.readFile(TOKEN_PATH, "utf-8");
    oauth2Client.setCredentials(JSON.parse(tokenRaw));
  } else {
    throw new Error("❌ YouTube OAuth token missing. Set YOUTUBE_REFRESH_TOKEN or place youtube-token.json in config/.");
  }

  return oauth2Client;
}

async function main() {
  const args = process.argv.slice(2);
  const oauth2Client = await getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // List of older duplicate video IDs to clean up
  const oldDuplicateIds = [
    { id: "pbMJ2j7uSZQ", name: "Old ID Landscape" },
    { id: "rXIdUxIZfiA", name: "Old ID Shorts" },
    { id: "NHAB8faMVLM", name: "Old EN Landscape" },
    { id: "SechNkpT4bs", name: "Old EN Shorts" },
  ];

  if (args.includes("--clean-duplicates")) {
    console.log(`\n🧹 Cleaning up older duplicate videos from @ZaynAdyanRamadhan...`);
    for (const item of oldDuplicateIds) {
      try {
        console.log(`Deleting ${item.name} (${item.id})...`);
        await youtube.videos.delete({ id: item.id });
        console.log(`✔ Successfully deleted ${item.id}`);
      } catch (err: any) {
        console.warn(`⚠️ Could not delete ${item.id}: ${err.message}`);
      }
    }
    console.log(`\n✨ Channel cleanup complete! Only the latest 4 videos remain.`);
    return;
  }

  if (args.includes("--delete")) {
    const videoId = args[args.indexOf("--delete") + 1];
    if (!videoId) {
      console.error("Please specify a video ID to delete: --delete <videoId>");
      process.exit(1);
    }
    console.log(`Deleting video ${videoId}...`);
    await youtube.videos.delete({ id: videoId });
    console.log(`✔ Successfully deleted ${videoId}`);
    return;
  }

  console.log("Usage:");
  console.log("  npx tsx scripts/manage-youtube.ts --clean-duplicates");
  console.log("  npx tsx scripts/manage-youtube.ts --delete <videoId>");
}

main().catch(console.error);
