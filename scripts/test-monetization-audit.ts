import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMonetizationAudit } from "./lib/monetization-audit";
import { buildSocialEngagementCta, generateSeoMetadata } from "./lib/seo-formatter";
import {
  auditMetaScopes,
  buildMetaReauthInstructions,
  isMetaInsightsPermissionError,
  REQUIRED_META_SCOPES,
} from "./lib/meta-token-health";
import { buildCaption, buildCompilationCaption } from "./upload-meta";
import { DEFAULT_LAUNCH_CAPTION } from "./publish-instagram-post";
import { hasPrimaryPublishFailures } from "./publish-all";
import { isRetryableR2UploadError, uploadFileToR2WithRetry } from "./manage-story-storage";

function assertHasSaveAndFollow(text: string, label: string): void {
  assert.ok(/save|simpan/i.test(text), `${label} must include Save/Simpan CTA`);
  assert.ok(/follow/i.test(text), `${label} must include Follow CTA`);
  assert.ok(/comment|komentar|share below|tulis di/i.test(text), `${label} must include Comment CTA`);
}

async function runTests(): Promise<void> {
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

  // 3. Meta/Instagram captions across Reels, Watch, Compilations & Feed posts carry Save/Follow/Comment CTAs
  const sampleStory = {
    title: "Mendengarkan Tubuhku",
    originalTitle: "Listen to My Body",
    moral: {
      headlineId: "Tubuh memberi tanda saat lelah atau lapar.",
      headlineEn: "Listening to body signals helps us stay healthy.",
    },
  };
  for (const lang of ["id", "en"] as const) {
    for (const format of ["vertical", "landscape"] as const) {
      assertHasSaveAndFollow(buildCaption(sampleStory, lang, format), `buildCaption(${lang}, ${format})`);
    }
    assertHasSaveAndFollow(
      buildCompilationCaption("Compilation", "Bedtime stories", "00:00 Story 1", lang),
      `buildCompilationCaption(${lang})`
    );
    for (const surface of ["reel", "watch", "feed", "compilation"] as const) {
      assertHasSaveAndFollow(buildSocialEngagementCta(lang, surface), `buildSocialEngagementCta(${lang}, ${surface})`);
    }
  }
  assertHasSaveAndFollow(DEFAULT_LAUNCH_CAPTION, "DEFAULT_LAUNCH_CAPTION");

  // 4. Meta token permission audit detects missing instagram_manage_insights / read_insights
  const currentTokenAudit = auditMetaScopes([
    "pages_show_list",
    "business_management",
    "instagram_basic",
    "instagram_content_publish",
    "pages_read_engagement",
    "pages_manage_posts",
    "public_profile",
  ]);
  assert.equal(currentTokenAudit.ok, false);
  assert.equal(currentTokenAudit.insightsReady, false);
  assert.deepEqual(currentTokenAudit.missingInsightsScopes, ["instagram_manage_insights", "read_insights"]);
  const guide = buildMetaReauthInstructions("1099494459651856", currentTokenAudit.missingScopes).join("\n");
  assert.ok(guide.includes("instagram_manage_insights"));
  assert.ok(guide.includes("refresh-meta-token.ts --user-token"));

  const healthyAudit = auditMetaScopes([...REQUIRED_META_SCOPES]);
  assert.equal(healthyAudit.ok, true);
  assert.equal(healthyAudit.insightsReady, true);
  assert.deepEqual(healthyAudit.missingScopes, []);

  assert.equal(
    isMetaInsightsPermissionError({ code: 10, message: "(#10) Application does not have permission" }),
    true
  );
  assert.equal(
    isMetaInsightsPermissionError({
      code: 100,
      error_subcode: 33,
      message: "Object with ID '123' does not exist, cannot be loaded due to missing permissions",
    }),
    false
  );

  // 5. Partial publish failure gate fails CI on primary platforms (YouTube/Meta/FB/IG), ignores optional TikTok
  assert.equal(hasPrimaryPublishFailures([]), false);
  assert.equal(hasPrimaryPublishFailures([{ platform: "TikTok (API)", lang: "en", error: "sandbox" }]), false);
  assert.equal(hasPrimaryPublishFailures([{ platform: "YouTube", lang: "en", error: "invalid_grant" }]), true);
  assert.equal(hasPrimaryPublishFailures([{ platform: "Meta Reels (instagram)", lang: "en", error: "token" }]), true);

  // 6. R2 upload retry recovers from transient InternalError and non-retryable streaming failures
  assert.equal(isRetryableR2UploadError(new Error("We encountered an internal error. Please try again.")), true);
  assert.equal(isRetryableR2UploadError({ $metadata: { httpStatusCode: 403 }, message: "AccessDenied" }), false);

  const tmpFile = path.join(os.tmpdir(), `r2-retry-test-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, "hello r2 retry", "utf-8");
  try {
    let attempts = 0;
    await uploadFileToR2WithRetry({
      s3: {
        send: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("We encountered an internal error. Please try again.");
          }
          return {};
        },
      },
      bucketName: "test-bucket",
      key: "stories/test/file.txt",
      localPath: tmpFile,
      contentType: "text/plain",
      sizeBytes: 14,
      maxAttempts: 4,
      baseDelayMs: 0,
    });
    assert.equal(attempts, 3, "Expected uploadFileToR2WithRetry to succeed on attempt 3");
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  console.log("✅ All monetization audit, Save/Follow caption & Meta scope audit checks passed!");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
