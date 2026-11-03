import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { google } from "googleapis";

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

interface PublishedVideoRef {
  bookSlug: string;
  bookTitle: string;
  lang: string;
  format: string;
  videoId: string;
  url: string;
  localTitle: string;
}

async function getYouTubeClient() {
  if (!existsSync(TOKEN_PATH) || !existsSync(CREDENTIALS_PATH)) {
    throw new Error("YouTube credentials or token not found. Run upload with --auth-only first.");
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

  oauth2Client.on("tokens", async (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    await fs.writeFile(TOKEN_PATH, JSON.stringify(updated, null, 2));
  });

  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function collectPublishedVideos(): Promise<PublishedVideoRef[]> {
  const storiesDir = path.resolve("./stories");
  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const videos: PublishedVideoRef[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "branding") continue;
    const manifestPath = path.join(storiesDir, entry.name, "story.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      const pubYoutube = manifest.publications?.youtube;
      if (!pubYoutube) continue;

      for (const lang of ["id", "en"]) {
        const langPub = pubYoutube[lang];
        if (!langPub) continue;

        if (langPub.landscape?.id) {
          videos.push({
            bookSlug: entry.name,
            bookTitle: manifest.title,
            lang: lang.toUpperCase(),
            format: "16:9 Landscape",
            videoId: langPub.landscape.id,
            url: langPub.landscape.url || `https://youtu.be/${langPub.landscape.id}`,
            localTitle: langPub.landscape.title || manifest.title,
          });
        }

        if (langPub.vertical?.id) {
          videos.push({
            bookSlug: entry.name,
            bookTitle: manifest.title,
            lang: lang.toUpperCase(),
            format: "9:16 Shorts",
            videoId: langPub.vertical.id,
            url: langPub.vertical.url || `https://youtube.com/shorts/${langPub.vertical.id}`,
            localTitle: langPub.vertical.title || manifest.title,
          });
        }
      }
    } catch {
      // Ignore malformed manifests
    }
  }

  return videos;
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`📊 YouTube Analytics & Performance Monitor`);
  console.log(`======================================================`);

  const youtube = await getYouTubeClient();

  // 1. Channel Overview
  const channelRes = await youtube.channels.list({
    part: ["snippet", "statistics"],
    mine: true,
  });

  if (channelRes.data.items && channelRes.data.items.length > 0) {
    const ch = channelRes.data.items[0];
    console.log(`📺 Channel: \x1b[36m${ch.snippet?.title}\x1b[0m (${ch.snippet?.customUrl || `@${ch.id}`})`);
    console.log(
      `   • Subscribers: \x1b[33m${ch.statistics?.subscriberCount || 0}\x1b[0m | Total Channel Views: \x1b[32m${ch.statistics?.viewCount || 0}\x1b[0m | Videos: ${ch.statistics?.videoCount || 0}`
    );
  }

  // 2. Published Storybook Videos
  const publishedVideos = await collectPublishedVideos();
  if (publishedVideos.length === 0) {
    console.log(`\n⚠️ No published storybook videos found in story manifests.`);
    return;
  }

  const videoIds = publishedVideos.map((v) => v.videoId);
  const videoStatsRes = await youtube.videos.list({
    part: ["snippet", "statistics", "status"],
    id: videoIds,
  });

  const statsMap = new Map<string, any>();
  for (const item of videoStatsRes.data.items || []) {
    if (item.id) statsMap.set(item.id, item);
  }

  console.log(`\n🎬 Published Storybook Catalogue Performance:`);
  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`Project / Edition        | Format         | Status   | Views  | Likes | Comments | YouTube Link`);
  console.log(`---------------------------------------------------------------------------------------------------------`);

  let totalStoryViews = 0;
  let totalStoryLikes = 0;
  let totalStoryComments = 0;

  for (const v of publishedVideos) {
    const data = statsMap.get(v.videoId);
    const views = parseInt(data?.statistics?.viewCount || "0", 10);
    const likes = parseInt(data?.statistics?.likeCount || "0", 10);
    const comments = parseInt(data?.statistics?.commentCount || "0", 10);
    const privacy = (data?.status?.privacyStatus || "unknown").toUpperCase();

    totalStoryViews += views;
    totalStoryLikes += likes;
    totalStoryComments += comments;

    const projectTag = `${v.bookSlug} [${v.lang}]`.padEnd(24);
    const formatTag = v.format.padEnd(14);
    const privacyTag = privacy.padEnd(8);
    const viewsTag = views.toString().padStart(6);
    const likesTag = likes.toString().padStart(5);
    const commentsTag = comments.toString().padStart(8);

    console.log(
      `${projectTag} | ${formatTag} | ${privacyTag} | ${viewsTag} | ${likesTag} | ${commentsTag} | ${v.url}`
    );
  }

  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`📈 Catalogue Totals: \x1b[32m${totalStoryViews} Views\x1b[0m | \x1b[33m${totalStoryLikes} Likes\x1b[0m | ${totalStoryComments} Comments`);
  console.log(`💡 Run 'npm run stats' anytime to refresh live metrics.`);
}

main().catch((err) => {
  console.error("Stats Error:", err.message);
  process.exit(1);
});
