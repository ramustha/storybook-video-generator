export interface MonetizationStatsItem {
  platform: string;
  format: string;
  lang: string;
  views: number;
  likes: number;
  comments: number;
}

export interface MonetizationAuditSummary {
  youtube: {
    subscribers: number;
    subsTarget: number;
    subsRemaining: number;
    totalViews: number;
    shortsViews: number;
    longViews: number;
    longViewSharePct: number;
    subConversionPct: number;
    idViews: number;
    enViews: number;
  };
  facebook: {
    followers: number;
    followersTarget: number;
    followersRemaining: number;
    totalViews: number;
    watch16x9Views: number;
    reel9x16Views: number;
    watch16x9SharePct: number;
    likes: number;
    comments: number;
    engagementRatePct: number;
  };
  instagram: {
    followers: number;
    totalPlays: number;
    likes: number;
    comments: number;
    reelsCount: number;
    insightsPermissionMissing: boolean;
  };
  threads: {
    postsCount: number;
    totalViews: number;
    avgViewsPerPost: number;
  };
  recommendations: string[];
}

export function buildMonetizationAudit(params: {
  items: MonetizationStatsItem[];
  youtubeSubscribers?: number;
  facebookFollowers?: number;
  instagramFollowers?: number;
  instagramInsightsBlocked?: boolean;
}): MonetizationAuditSummary {
  const {
    items,
    youtubeSubscribers = 0,
    facebookFollowers = 0,
    instagramFollowers = 0,
    instagramInsightsBlocked = false,
  } = params;

  const ytItems = items.filter((i) => i.platform === "YouTube");
  const fbItems = items.filter((i) => i.platform === "Facebook");
  const igItems = items.filter((i) => i.platform === "Instagram");
  const thItems = items.filter((i) => i.platform === "Threads");

  const ytTotalViews = ytItems.reduce((s, i) => s + (i.views || 0), 0);
  const ytShortsViews = ytItems
    .filter((i) => i.format.toLowerCase().includes("short"))
    .reduce((s, i) => s + (i.views || 0), 0);
  const ytLongViews = Math.max(0, ytTotalViews - ytShortsViews);
  const ytIdViews = ytItems.filter((i) => i.lang === "id").reduce((s, i) => s + (i.views || 0), 0);
  const ytEnViews = ytItems.filter((i) => i.lang === "en").reduce((s, i) => s + (i.views || 0), 0);

  const fbTotalViews = fbItems.reduce((s, i) => s + (i.views || 0), 0);
  const fbWatchViews = fbItems
    .filter((i) => i.format.includes("16:9") || i.format.toLowerCase().includes("watch"))
    .reduce((s, i) => s + (i.views || 0), 0);
  const fbReelViews = Math.max(0, fbTotalViews - fbWatchViews);
  const fbLikes = fbItems.reduce((s, i) => s + (i.likes || 0), 0);
  const fbComments = fbItems.reduce((s, i) => s + (i.comments || 0), 0);

  const igTotalPlays = igItems.reduce((s, i) => s + (i.views || 0), 0);
  const igLikes = igItems.reduce((s, i) => s + (i.likes || 0), 0);
  const igComments = igItems.reduce((s, i) => s + (i.comments || 0), 0);

  const thTotalViews = thItems.reduce((s, i) => s + (i.views || 0), 0);

  const longViewSharePct = ytTotalViews > 0 ? Number(((ytLongViews / ytTotalViews) * 100).toFixed(1)) : 0;
  const subConversionPct =
    ytTotalViews > 0 ? Number(((youtubeSubscribers / ytTotalViews) * 100).toFixed(2)) : 0;
  const fbWatchSharePct = fbTotalViews > 0 ? Number(((fbWatchViews / fbTotalViews) * 100).toFixed(1)) : 0;
  const fbEngRatePct =
    fbTotalViews > 0 ? Number((((fbLikes + fbComments) / fbTotalViews) * 100).toFixed(2)) : 0;

  const recs: string[] = [];
  if (longViewSharePct < 25 && ytShortsViews > 0) {
    recs.push(
      `YT Shorts (${ytShortsViews} views) = ${(100 - longViewSharePct).toFixed(1)}% of YT traffic — funnel Shorts viewers to 16:9 Full Stories & Playlists to build 4,000 watch hours.`
    );
  }
  if (subConversionPct < 0.5) {
    recs.push(
      `YT Sub conversion is ${subConversionPct}% (${youtubeSubscribers}/1,000) — keep Subscribe CTA + Full Episode link above the fold on every upload.`
    );
  }
  if (facebookFollowers < 5000) {
    recs.push(
      `FB Watch (${fbWatchSharePct}% of FB views) performs best on long stories/marathons — pin Follow Page CTA & Watch-Next comments to close ${5000 - facebookFollowers} follower gap.`
    );
  }
  if (instagramInsightsBlocked) {
    recs.push("Instagram /insights missing instagram_manage_insights token scope (Reel plays currently unmeasured).");
  }

  return {
    youtube: {
      subscribers: youtubeSubscribers,
      subsTarget: 1000,
      subsRemaining: Math.max(0, 1000 - youtubeSubscribers),
      totalViews: ytTotalViews,
      shortsViews: ytShortsViews,
      longViews: ytLongViews,
      longViewSharePct,
      subConversionPct,
      idViews: ytIdViews,
      enViews: ytEnViews,
    },
    facebook: {
      followers: facebookFollowers,
      followersTarget: 5000,
      followersRemaining: Math.max(0, 5000 - facebookFollowers),
      totalViews: fbTotalViews,
      watch16x9Views: fbWatchViews,
      reel9x16Views: fbReelViews,
      watch16x9SharePct: fbWatchSharePct,
      likes: fbLikes,
      comments: fbComments,
      engagementRatePct: fbEngRatePct,
    },
    instagram: {
      followers: instagramFollowers,
      totalPlays: igTotalPlays,
      likes: igLikes,
      comments: igComments,
      reelsCount: igItems.length,
      insightsPermissionMissing: instagramInsightsBlocked,
    },
    threads: {
      postsCount: thItems.length,
      totalViews: thTotalViews,
      avgViewsPerPost: thItems.length > 0 ? Number((thTotalViews / thItems.length).toFixed(1)) : 0,
    },
    recommendations: recs,
  };
}
