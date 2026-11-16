import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { google } from "googleapis";
import {
  notifyTelegramAnalytics,
  notifyTelegramFailure,
  PlatformStatsSummary,
  TopContentItem,
} from "./notify-telegram";
import { buildMonetizationAudit } from "./lib/monetization-audit";
import { db } from "./lib/db";

// ============================================================================
// CONFIGURATION & TYPE DEFINITIONS
// ============================================================================

const CONFIG_DIR = path.resolve("./config");
const META_CONFIG_PATH = path.join(CONFIG_DIR, "meta-config.json");
const YT_CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const YT_TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

interface VideoItem {
  id: string;
  bookSlug: string;
  bookTitle: string;
  lang: string;
  platform: "YouTube" | "Facebook" | "Instagram" | "Threads";
  format: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
}

// ============================================================================
// META GRAPH API HANDLERS
// ============================================================================

async function fetchFacebookVideoStats(videoId: string, token: string): Promise<{ views: number; likes: number; comments: number }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${videoId}?fields=id,views,likes.summary(true),comments.summary(true)&access_token=${token}`
    );
    const data = await res.json();
    return {
      views: data.views || 0,
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
    };
  } catch {
    return { views: 0, likes: 0, comments: 0 };
  }
}

async function fetchInstagramMediaStats(
  mediaId: string,
  token: string
): Promise<{ views: number; likes: number; comments: number; insightsBlocked?: boolean }> {
  let views = 0;
  let likes = 0;
  let comments = 0;
  let insightsBlocked = false;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=id,like_count,comments_count&access_token=${token}`
    );
    const data = await res.json();
    likes = data.like_count || 0;
    comments = data.comments_count || 0;
  } catch {}

  try {
    const resInsights = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}/insights?metric=views,reach&access_token=${token}`
    );
    const dataInsights = await resInsights.json();
    if (dataInsights?.error?.code === 10 || /permission/i.test(dataInsights?.error?.message || "")) {
      insightsBlocked = true;
    } else if (Array.isArray(dataInsights.data)) {
      for (const item of dataInsights.data) {
        if (item.name === "views") views = item.values?.[0]?.value || 0;
      }
    }
  } catch {}

  return { views, likes, comments, insightsBlocked };
}

async function fetchThreadsPostStats(postId: string, accessToken?: string): Promise<{ views: number; likes: number; comments: number }> {
  if (!accessToken) return { views: 0, likes: 0, comments: 0 };
  try {
    const url = `https://graph.threads.net/v1.0/${postId}/insights?metric=views,likes,replies&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    let views = 0;
    let likes = 0;
    let comments = 0;
    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        const val = item.values?.[0]?.value || 0;
        if (item.name === "views") views = val;
        if (item.name === "likes") likes = val;
        if (item.name === "replies") comments = val;
      }
    }
    return { views, likes, comments };
  } catch {
    return { views: 0, likes: 0, comments: 0 };
  }
}

// ============================================================================
// YOUTUBE DATA API HANDLERS
// ============================================================================

async function getYouTubeClient() {
  if (!existsSync(YT_TOKEN_PATH) || !existsSync(YT_CREDENTIALS_PATH)) {
    return null;
  }

  try {
    const creds = JSON.parse(await fs.readFile(YT_CREDENTIALS_PATH, "utf-8"));
    const installed = creds.installed || creds.web;
    const tokens = JSON.parse(await fs.readFile(YT_TOKEN_PATH, "utf-8"));

    const oauth2Client = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      (installed.redirect_uris && installed.redirect_uris[0]) || "http://localhost:3000/oauth2callback"
    );
    oauth2Client.setCredentials(tokens);

    return google.youtube({ version: "v3", auth: oauth2Client });
  } catch (err: any) {
    console.warn("⚠️ YouTube client init warning:", err.message);
    return null;
  }
}

// ============================================================================
// MAIN PERFORMANCE ANALYTICS ORCHESTRATOR
// ============================================================================

async function main() {
  console.log("\n=======================================================");
  console.log("📊 ZAYN STORYBOOK: PERFORMANCE ANALYTICS HARVESTER");
  console.log("=======================================================\n");

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sendTelegram =
    (args.includes("--telegram") || (Boolean(process.env.CI) && !args.includes("--no-telegram"))) &&
    (!dryRun || args.includes("--telegram"));
  const metaOnly = args.includes("--meta-only");
  const youtubeOnly = args.includes("--youtube-only");

  const allItems: VideoItem[] = [];

  // 1. Fetch Publications Catalog (from D1 or local disk fallback)
  let publications: any[] = [];
  try {
    publications = await db.getPublications();
    console.log(`✔ Loaded ${publications.length} publication records from Cloudflare D1.`);
  } catch {
    // Fallback: read directly from docs/audit-data.json
    const auditPath = path.resolve("./docs/audit-data.json");
    if (existsSync(auditPath)) {
      const recs = JSON.parse(readFileSync(auditPath, "utf-8"));
      publications = recs.map((r: any) => ({
        book_slug: r.storySlug,
        platform: r.platform?.toLowerCase(),
        lang: r.language,
        format: r.format?.toLowerCase().includes("short") || r.format?.toLowerCase().includes("reel") ? "vertical" : "landscape",
        external_id: r.videoId || r.id,
        video_url: r.videoUrl,
        external_title: r.videoTitle,
      }));
      console.log(`✔ Fallback: Loaded ${publications.length} records from audit-data.json.`);
    }
  }

  // 2. Process Meta Platforms (Facebook, Instagram, Threads)
  let fbStats: PlatformStatsSummary | undefined;
  let igStats: PlatformStatsSummary | undefined;
  let thStats: PlatformStatsSummary | undefined;
  let fbFollowers = 0;
  let igFollowers = 0;
  let instagramInsightsBlocked = false;

  if (!youtubeOnly && existsSync(META_CONFIG_PATH)) {
    try {
      const metaConfig = JSON.parse(await fs.readFile(META_CONFIG_PATH, "utf-8"));
      try {
        if (metaConfig.facebookPageId && metaConfig.pageAccessToken) {
          const fbPage = await (
            await fetch(
              `https://graph.facebook.com/v21.0/${metaConfig.facebookPageId}?fields=followers_count,fan_count&access_token=${metaConfig.pageAccessToken}`
            )
          ).json();
          fbFollowers = fbPage.followers_count || fbPage.fan_count || 0;
        }
        if (metaConfig.instagramUserId && metaConfig.pageAccessToken) {
          const igAcct = await (
            await fetch(
              `https://graph.facebook.com/v21.0/${metaConfig.instagramUserId}?fields=followers_count&access_token=${metaConfig.pageAccessToken}`
            )
          ).json();
          igFollowers = igAcct.followers_count || 0;
        }
      } catch {}
      const metaPubs = publications.filter((p) =>
        ["facebook", "instagram", "threads"].includes(p.platform)
      );

      console.log(`\n📡 Fetching live metrics for ${metaPubs.length} Meta published assets...`);

      let fbViews = 0, fbLikes = 0, fbComments = 0, fbCount = 0;
      let igViews = 0, igLikes = 0, igComments = 0, igCount = 0;
      let thViews = 0, thLikes = 0, thComments = 0, thCount = 0;

      // Process concurrently in chunks of 6
      const chunkSize = 6;
      for (let i = 0; i < metaPubs.length; i += chunkSize) {
        const chunk = metaPubs.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (p) => {
            const extId = p.external_id;
            if (!extId) return;

            if (p.platform === "facebook") {
              const res = await fetchFacebookVideoStats(extId, metaConfig.pageAccessToken);
              fbViews += res.views;
              fbLikes += res.likes;
              fbComments += res.comments;
              fbCount++;
              allItems.push({
                id: extId,
                bookSlug: p.book_slug,
                bookTitle: p.external_title || p.book_slug,
                lang: p.lang || "id",
                platform: "Facebook",
                format: p.format === "vertical" ? "9:16 Reel" : "16:9 Watch",
                url: p.video_url || `https://www.facebook.com/watch/?v=${extId}`,
                views: res.views,
                likes: res.likes,
                comments: res.comments,
              });
            } else if (p.platform === "instagram") {
              const res = await fetchInstagramMediaStats(extId, metaConfig.pageAccessToken);
              if (res.insightsBlocked) instagramInsightsBlocked = true;
              igViews += res.views;
              igLikes += res.likes;
              igComments += res.comments;
              igCount++;
              allItems.push({
                id: extId,
                bookSlug: p.book_slug,
                bookTitle: p.external_title || p.book_slug,
                lang: p.lang || "id",
                platform: "Instagram",
                format: "9:16 Reel",
                url: p.video_url || `https://www.instagram.com/reel/`,
                views: res.views,
                likes: res.likes,
                comments: res.comments,
              });
            } else if (p.platform === "threads") {
              const res = await fetchThreadsPostStats(extId, metaConfig.threadsAccessToken);
              thViews += res.views;
              thLikes += res.likes;
              thComments += res.comments;
              thCount++;
              allItems.push({
                id: extId,
                bookSlug: p.book_slug,
                bookTitle: p.external_title || p.book_slug,
                lang: p.lang || "id",
                platform: "Threads",
                format: p.format === "vertical" ? "9:16 Video" : "Post",
                url: p.video_url || `https://www.threads.net/post/${extId}`,
                views: res.views,
                likes: res.likes,
                comments: res.comments,
              });
            }
          })
        );
      }

      fbStats = { views: fbViews, likes: fbLikes, comments: fbComments, videoCount: fbCount };
      igStats = { views: igViews, likes: igLikes, comments: igComments, videoCount: igCount };
      thStats = { views: thViews, likes: thLikes, comments: thComments, videoCount: thCount };

      console.log(`  ✔ Facebook  : ${fbViews.toLocaleString()} views | ${fbLikes} likes | ${fbCount} assets (Followers: ${fbFollowers})`);
      console.log(
        `  ✔ Instagram : ${igViews.toLocaleString()} plays | ${igLikes} likes | ${igCount} reels (Followers: ${igFollowers})${instagramInsightsBlocked ? " [⚠️ insights scope missing]" : ""}`
      );
      console.log(`  ✔ Threads   : ${thViews.toLocaleString()} views | ${thLikes} likes | ${thCount} posts`);
    } catch (err: any) {
      console.warn("⚠️ Meta stats warning:", err.message);
    }
  }

  // 3. Process YouTube Platform
  let ytStats: (PlatformStatsSummary & { subscribers?: number; totalChannelViews?: number }) | undefined;

  if (!metaOnly) {
    try {
      const youtube = await getYouTubeClient();
      if (youtube) {
        console.log(`\n▶️ Fetching live metrics for YouTube Channel & Videos...`);

        // Channel Overview
        let subs = 0;
        let totalChViews = 0;
        try {
          const chRes = await youtube.channels.list({ part: ["snippet", "statistics"], mine: true });
          if (chRes.data.items && chRes.data.items[0]) {
            subs = parseInt(chRes.data.items[0].statistics?.subscriberCount || "0", 10);
            totalChViews = parseInt(chRes.data.items[0].statistics?.viewCount || "0", 10);
          }
        } catch {}

        // Published Videos Batch
        const ytPubs = publications.filter((p) => p.platform === "youtube" && p.external_id);
        const videoIds = ytPubs.map((p) => p.external_id);

        let ytViews = 0, ytLikes = 0, ytComments = 0;

        if (videoIds.length > 0) {
          // Batch fetch up to 50 IDs at a time
          for (let i = 0; i < videoIds.length; i += 50) {
            const batchIds = videoIds.slice(i, i + 50);
            const vRes = await youtube.videos.list({
              part: ["snippet", "statistics"],
              id: batchIds,
            });

            const statMap = new Map<string, any>();
            for (const item of vRes.data.items || []) {
              if (item.id) statMap.set(item.id, item);
            }

            for (const p of ytPubs.filter((pub) => batchIds.includes(pub.external_id))) {
              const item = statMap.get(p.external_id);
              const views = parseInt(item?.statistics?.viewCount || "0", 10);
              const likes = parseInt(item?.statistics?.likeCount || "0", 10);
              const comments = parseInt(item?.statistics?.commentCount || "0", 10);
              const title = item?.snippet?.title || p.external_title || p.book_slug;

              ytViews += views;
              ytLikes += likes;
              ytComments += comments;

              allItems.push({
                id: p.external_id,
                bookSlug: p.book_slug,
                bookTitle: title,
                lang: p.lang || "id",
                platform: "YouTube",
                format: p.format === "vertical" ? "9:16 Shorts" : "16:9 Full HD",
                url: p.video_url || `https://youtu.be/${p.external_id}`,
                views,
                likes,
                comments,
              });
            }
          }
        }

        ytStats = {
          views: ytViews,
          likes: ytLikes,
          comments: ytComments,
          videoCount: ytPubs.length,
          subscribers: subs,
          totalChannelViews: totalChViews,
        };

        console.log(`  ✔ YouTube   : ${ytViews.toLocaleString()} views | ${ytLikes} likes | ${ytPubs.length} videos (Subscribers: ${subs})`);
      }
    } catch (err: any) {
      console.warn("⚠️ YouTube stats warning:", err.message);
    }
  }

  // 4. Determine Top Performing Content
  allItems.sort((a, b) => b.views - a.views);
  const topContent: TopContentItem[] = allItems.slice(0, 5).map((item) => ({
    title: item.bookTitle,
    platform: item.platform,
    format: item.format,
    views: item.views,
    likes: item.likes,
    url: item.url,
  }));

  // 5. Monetization Gap Audit & Console Report
  const monetizationAudit = buildMonetizationAudit({
    items: allItems,
    youtubeSubscribers: ytStats?.subscribers || 0,
    facebookFollowers: fbFollowers,
    instagramFollowers: igFollowers,
    instagramInsightsBlocked,
  });

  const totalAggViews = (ytStats?.views || 0) + (fbStats?.views || 0) + (igStats?.views || 0) + (thStats?.views || 0);
  const totalAggLikes = (ytStats?.likes || 0) + (fbStats?.likes || 0) + (igStats?.likes || 0) + (thStats?.likes || 0);
  const totalAggComments = (ytStats?.comments || 0) + (fbStats?.comments || 0) + (igStats?.comments || 0) + (thStats?.comments || 0);

  console.log("\n=======================================================");
  console.log("📈 AGGREGATE PERFORMANCE SUMMARY");
  console.log("=======================================================");
  console.log(`Total Published Assets : ${allItems.length}`);
  console.log(`Total Live Views/Plays : ${totalAggViews.toLocaleString()}`);
  console.log(`Total Likes            : ${totalAggLikes.toLocaleString()}`);
  console.log(`Total Comments         : ${totalAggComments.toLocaleString()}`);
  console.log(`YT Monetization Gap    : ${monetizationAudit.youtube.subscribers}/1,000 subs (${monetizationAudit.youtube.longViewSharePct}% 16:9 long views vs Shorts)`);
  console.log(`FB Monetization Gap    : ${monetizationAudit.facebook.followers}/5,000 followers (${monetizationAudit.facebook.watch16x9SharePct}% 16:9 Watch views)`);
  if (monetizationAudit.recommendations.length > 0) {
    console.log("-------------------------------------------------------");
    console.log("🎯 MONETIZATION BOOST ACTIONS:");
    monetizationAudit.recommendations.forEach((rec) => console.log(`  • ${rec}`));
  }
  console.log("-------------------------------------------------------");
  if (topContent.length > 0) {
    console.log("🏆 TOP 3 PERFORMING CONTENT:");
    topContent.slice(0, 3).forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.platform} ${t.format}] ${t.title}`);
      console.log(`     👀 ${t.views.toLocaleString()} views | ❤️ ${t.likes} likes | ${t.url}`);
    });
  }
  console.log("=======================================================\n");

  // 6. Persist Weekly Metrics to Cloudflare D1 & Static docs/stats-data.json
  const statsJsonPath = path.resolve("./docs/stats-data.json");
  const statsArtifact = {
    recordedAt: new Date().toISOString(),
    summary: {
      totalAssets: allItems.length,
      totalViews: totalAggViews,
      totalLikes: totalAggLikes,
      totalComments: totalAggComments,
      youtube: ytStats,
      facebook: fbStats,
      instagram: igStats,
      threads: thStats,
      topContent,
      monetizationAudit,
    },
    items: allItems.map((item) => ({
      id: item.id,
      bookSlug: item.bookSlug,
      platform: item.platform,
      format: item.format,
      lang: item.lang,
      views: item.views,
      likes: item.likes,
      comments: item.comments,
      url: item.url,
    })),
  };

  try {
    await fs.writeFile(statsJsonPath, JSON.stringify(statsArtifact, null, 2));
    console.log(`✔ Saved static analytics snapshot to ${statsJsonPath}`);
  } catch (err: any) {
    console.warn("⚠️ Failed to write docs/stats-data.json:", err.message);
  }

  if (!dryRun && allItems.length > 0) {
    console.log("💾 Persisting metrics to Cloudflare D1 `publication_stats` table...");
    const d1Records = allItems.map((i) => ({
      external_id: i.id,
      platform: i.platform.toLowerCase(),
      views: i.views || 0,
      likes: i.likes || 0,
      comments: i.comments || 0,
      shares: 0,
      watch_time_minutes: 0,
    }));
    try {
      await db.savePublicationStats(d1Records);
      console.log(`✔ Successfully persisted ${d1Records.length} metrics to Cloudflare D1.`);
    } catch (err: any) {
      console.warn("⚠️ Failed to persist metrics to Cloudflare D1:", err.message);
    }
  }

  // 7. Send Telegram Notification
  if (sendTelegram) {
    console.log("✈️ Sending Weekly Performance Analytics Report to Telegram...");
    const ok = await notifyTelegramAnalytics({
      periodLabel: "Laporan Kinerja Mingguan (Weekly Performance)",
      youtube: ytStats,
      facebook: fbStats,
      instagram: igStats,
      threads: thStats,
      topContent,
      monetizationAudit,
      dryRun,
    });

    if (ok) {
      console.log("🎉 Weekly analytics report successfully delivered to Telegram!");
    } else {
      console.warn("⚠️ Telegram dispatch was skipped or encountered an issue.");
    }
  }
}

main().catch(async (err) => {
  console.error("❌ Fatal error in performance analytics:", err);
  try {
    await notifyTelegramFailure({
      platform: "Weekly Performance Analytics Pipeline",
      error: err,
    });
  } catch {}
  process.exit(1);
});
