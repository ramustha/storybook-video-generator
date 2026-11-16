import assert from "node:assert/strict";
import { buildMonetizationAudit } from "./lib/monetization-audit";
import { generateSeoMetadata } from "./lib/seo-formatter";

function runTests(): void {
  // 1. Monetization gap & Shorts-heavy traffic audit
  const summary = buildMonetizationAudit({
    items: [
      { platform: "YouTube", format: "9:16 Shorts", lang: "id", views: 2948, likes: 21, comments: 0 },
      { platform: "YouTube", format: "9:16 Shorts", lang: "en", views: 914, likes: 14, comments: 0 },
      { platform: "YouTube", format: "16:9 Full HD", lang: "id", views: 326, likes: 1, comments: 0 },
      { platform: "YouTube", format: "16:9 Full HD", lang: "en", views: 64, likes: 0, comments: 0 },
      { platform: "Facebook", format: "16:9 Watch", lang: "id", views: 666, likes: 2, comments: 0 },
      { platform: "Facebook", format: "9:16 Reel", lang: "en", views: 423, likes: 3, comments: 0 },
      { platform: "Instagram", format: "9:16 Reel", lang: "id", views: 0, likes: 2, comments: 0 },
      { platform: "Threads", format: "Post", lang: "id", views: 92, likes: 0, comments: 0 },
    ],
    youtubeSubscribers: 4,
    facebookFollowers: 0,
    instagramFollowers: 0,
    instagramInsightsBlocked: true,
  });

  assert.equal(summary.youtube.totalViews, 4252);
  assert.equal(summary.youtube.shortsViews, 3862);
  assert.equal(summary.youtube.longViews, 390);
  assert.equal(summary.youtube.subsRemaining, 996);
  assert.ok(summary.youtube.longViewSharePct < 10);
  assert.equal(summary.facebook.followersRemaining, 5000);
  assert.ok(summary.facebook.watch16x9SharePct > 50);
  assert.equal(summary.instagram.insightsPermissionMissing, true);
  assert.ok(summary.recommendations.some((r) => r.includes("funnel Shorts viewers")));
  assert.ok(summary.recommendations.some((r) => r.includes("instagram_manage_insights")));

  // 2. YouTube Shorts SEO funnel opens with Full Story 16:9 + Subscribe links above the fold
  const idShortSeo = generateSeoMetadata({
    bookSlug: "dengarkan-tubuhku",
    title: "Mendengarkan Tubuhku",
    originalTitle: "Listen to My Body",
    lang: "id",
    format: "vertical",
    fullEpisodeUrl: "https://youtu.be/FULL12345",
    playlistUrl: "https://www.youtube.com/playlist?list=PL12345",
  });
  const topLinesId = idShortSeo.description.split("\n").slice(0, 5).join("\n");
  assert.ok(topLinesId.includes("https://youtu.be/FULL12345"), "Shorts ID top description must link to 16:9 episode");
  assert.ok(topLinesId.includes("sub_confirmation=1"), "Shorts ID top description must include subscribe link");
  assert.ok(topLinesId.includes("playlist?list=PL12345"), "Shorts ID top description must link binge playlist");

  const enShortSeo = generateSeoMetadata({
    bookSlug: "dengarkan-tubuhku",
    title: "Mendengarkan Tubuhku",
    originalTitle: "Listen to My Body",
    lang: "en",
    format: "vertical",
    fullEpisodeUrl: "https://youtu.be/FULL_EN99",
  });
  assert.ok(
    enShortSeo.description.split("\n").slice(0, 4).join("\n").includes("https://youtu.be/FULL_EN99"),
    "Shorts EN top description must link to 16:9 episode"
  );

  console.log("✅ All monetization audit & Shorts-to-Long funnel unit checks passed!");
}

runTests();
