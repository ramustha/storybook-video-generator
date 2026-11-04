import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const CONFIG_PATH = path.resolve("./config/meta-config.json");

interface MetaConfig {
  appId?: string;
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  pageAccessToken: string;
}

interface MetaPublishedRef {
  bookSlug: string;
  bookTitle: string;
  lang: string;
  platform: "Facebook" | "Instagram";
  format: "16:9 Landscape" | "9:16 Reel";
  id: string;
  url: string;
  title: string;
}

interface VideoStats {
  id: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  saves?: number;
  reach?: number;
  avgWatchTimeSec?: number;
}

async function loadMetaConfig(): Promise<MetaConfig> {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Meta configuration not found at ${CONFIG_PATH}`);
  }
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function collectMetaPublishedVideos(): Promise<MetaPublishedRef[]> {
  const storiesDir = path.resolve("./stories");
  if (!existsSync(storiesDir)) return [];

  const entries = await fs.readdir(storiesDir, { withFileTypes: true });
  const videos: MetaPublishedRef[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "branding") continue;
    const manifestPath = path.join(storiesDir, entry.name, "story.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);

      // 1. Facebook Publications
      const fbPub = manifest.publications?.facebook;
      if (fbPub) {
        for (const lang of ["id", "en"]) {
          const langEntry = fbPub[lang];
          if (!langEntry) continue;

          // Landscape
          if (langEntry.landscape?.id) {
            videos.push({
              bookSlug: entry.name,
              bookTitle: manifest.title || entry.name,
              lang: lang.toUpperCase(),
              platform: "Facebook",
              format: "16:9 Landscape",
              id: langEntry.landscape.id,
              url: langEntry.landscape.url || `https://www.facebook.com/watch/?v=${langEntry.landscape.id}`,
              title: langEntry.landscape.title || manifest.title,
            });
          }

          // Vertical Reel
          const verticalRef = langEntry.vertical || (langEntry.id ? langEntry : null);
          if (verticalRef?.id) {
            videos.push({
              bookSlug: entry.name,
              bookTitle: manifest.title || entry.name,
              lang: lang.toUpperCase(),
              platform: "Facebook",
              format: "9:16 Reel",
              id: verticalRef.id,
              url: verticalRef.url || `https://www.facebook.com/reel/${verticalRef.id}`,
              title: verticalRef.title || manifest.title,
            });
          }
        }
      }

      // 2. Instagram Publications
      const igPub = manifest.publications?.instagram;
      if (igPub) {
        for (const lang of ["id", "en"]) {
          const langEntry = igPub[lang];
          if (!langEntry) continue;

          if (langEntry.id) {
            videos.push({
              bookSlug: entry.name,
              bookTitle: manifest.title || entry.name,
              lang: lang.toUpperCase(),
              platform: "Instagram",
              format: "9:16 Reel",
              id: langEntry.id,
              url: langEntry.url || `https://www.instagram.com/reel/`,
              title: langEntry.title || manifest.title,
            });
          }
        }
      }
    } catch {
      // Ignore invalid JSON manifests
    }
  }

  return videos;
}

async function fetchFacebookVideoStats(videoId: string, token: string): Promise<VideoStats> {
  const stats: VideoStats = {
    id: videoId,
    views: 0,
    likes: 0,
    comments: 0,
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${videoId}?fields=id,views,likes.summary(true),comments.summary(true)&access_token=${token}`
    );
    const data = await res.json();
    if (data.id) {
      stats.views = data.views || 0;
      stats.likes = data.likes?.summary?.total_count || 0;
      stats.comments = data.comments?.summary?.total_count || 0;
    }
  } catch {
    // Continue with basic defaults
  }

  // Attempt video insights edge if read_insights is available
  try {
    const resInsights = await fetch(
      `https://graph.facebook.com/v21.0/${videoId}/video_insights?access_token=${token}`
    );
    const dataInsights = await resInsights.json();
    if (Array.isArray(dataInsights.data)) {
      for (const item of dataInsights.data) {
        const val = item.values?.[0]?.value || 0;
        if (item.name === "total_video_views_unique") stats.reach = val;
        if (item.name === "total_video_avg_time_watched") stats.avgWatchTimeSec = Math.round(val / 1000);
      }
    }
  } catch {
    // Silently ignore if read_insights is missing
  }

  return stats;
}

async function fetchInstagramMediaStats(mediaId: string, token: string): Promise<VideoStats> {
  const stats: VideoStats = {
    id: mediaId,
    views: 0,
    likes: 0,
    comments: 0,
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=id,like_count,comments_count&access_token=${token}`
    );
    const data = await res.json();
    if (data.id) {
      stats.likes = data.like_count || 0;
      stats.comments = data.comments_count || 0;
    }
  } catch {
    // Continue with basic defaults
  }

  // Attempt Instagram insights edge if instagram_manage_insights is available
  try {
    const resInsights = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}/insights?metric=views,reach,saved,shares&access_token=${token}`
    );
    const dataInsights = await resInsights.json();
    if (Array.isArray(dataInsights.data)) {
      for (const item of dataInsights.data) {
        const val = item.values?.[0]?.value || 0;
        if (item.name === "views") stats.views = val;
        if (item.name === "reach") stats.reach = val;
        if (item.name === "saved") stats.saves = val;
        if (item.name === "shares") stats.shares = val;
      }
    }
  } catch {
    // Silently ignore if instagram_manage_insights is missing
  }

  return stats;
}

async function main() {
  console.log("\n=======================================================");
  console.log("📊 META VIDEO ANALYTICS & INSIGHTS SUMMARY (FB & IG)");
  console.log("=======================================================\n");

  const config = await loadMetaConfig();
  console.log(`📘 Facebook Page  : ${config.facebookPageName || config.facebookPageId}`);
  console.log(`📸 Instagram User : @${config.instagramUsername || config.instagramUserId}\n`);

  const videos = await collectMetaPublishedVideos();
  if (videos.length === 0) {
    console.log("ℹ️ No published Meta videos found across story.json manifests.");
    return;
  }

  console.log(`Found ${videos.length} published Meta videos. Fetching live performance metrics...\n`);

  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const stats =
      v.platform === "Facebook"
        ? await fetchFacebookVideoStats(v.id, config.pageAccessToken)
        : await fetchInstagramMediaStats(v.id, config.pageAccessToken);

    totalViews += stats.views;
    totalLikes += stats.likes;
    totalComments += stats.comments;

    const platformIcon = v.platform === "Facebook" ? "📘 FB" : "📸 IG";
    console.log(`[${i + 1}/${videos.length}] ${platformIcon} | ${v.bookTitle} (${v.lang}) - ${v.format}`);
    console.log(`     🔗 URL       : ${v.url}`);
    console.log(`     👀 Views     : ${stats.views.toLocaleString()}`);
    console.log(`     ❤️ Likes     : ${stats.likes.toLocaleString()}`);
    console.log(`     💬 Comments  : ${stats.comments.toLocaleString()}`);
    if (stats.reach !== undefined) console.log(`     👥 Reach     : ${stats.reach.toLocaleString()} accounts`);
    if (stats.shares !== undefined) console.log(`     🔄 Shares    : ${stats.shares.toLocaleString()}`);
    if (stats.saves !== undefined) console.log(`     🔖 Saves     : ${stats.saves.toLocaleString()}`);
    if (stats.avgWatchTimeSec !== undefined) console.log(`     ⏱️ Avg Watch : ${stats.avgWatchTimeSec}s`);
    console.log("-------------------------------------------------------");
  }

  console.log("\n📈 AGGREGATE META PERFORMANCE SUMMARY:");
  console.log(`Total Published Videos : ${videos.length}`);
  console.log(`Total Live Views/Plays : ${totalViews.toLocaleString()}`);
  console.log(`Total Likes            : ${totalLikes.toLocaleString()}`);
  console.log(`Total Comments         : ${totalComments.toLocaleString()}`);
  console.log("\n=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Error fetching Meta stats:", err.message);
  process.exit(1);
});
