import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  extractMoral,
  extractStorySummary,
  generateDailyLineupCopy,
  generateFullMotionCopy,
  generatePostPublishWaveCopy,
  generateTeaserCopy,
  SocialPlatformClients,
  syncAnnouncementPlatforms,
} from "./publish-announcement";

function assertNoStaticPortalUrl(label: string, texts: Array<string | undefined>): void {
  const combined = texts.filter(Boolean).join("\n");
  assert.ok(!/storybook-catalog/i.test(combined), `${label}: unexpectedly contains storybook-catalog`);
  assert.ok(!/pages\.dev/i.test(combined), `${label}: unexpectedly contains pages.dev`);
  assert.ok(!/\bportal\b/i.test(combined), `${label}: unexpectedly references Portal`);
}

async function runTests(): Promise<void> {
  // 1. Story summary & moral extraction on both edu-motion and standard illustrated manifests
  const papang = JSON.parse(
    fs.readFileSync(path.resolve("./stories/edu-budi-papang-teripang/story.json"), "utf-8")
  );
  const momo = JSON.parse(
    fs.readFileSync(path.resolve("./stories/ayo-berayun-momo/story.json"), "utf-8")
  );

  const papangSummaryId = extractStorySummary(papang, "id");
  const papangSummaryEn = extractStorySummary(papang, "en");
  const papangMoralId = extractMoral(papang, "id");
  assert.ok(
    papangSummaryId.includes("Jakang") && papangSummaryId.includes("Papang") && !papangSummaryId.includes("Jangan sedih!"),
    "Papang ID summary should span setup and resolution without stopping at hook"
  );
  assert.ok(
    papangSummaryEn.includes("Jakang") && papangSummaryEn.includes("Papang") && !papangSummaryEn.includes("Don't worry!"),
    "Papang EN summary should span setup and resolution without stopping at hook"
  );
  assert.ok(
    papangMoralId.includes("Kecil Tapi Penjaga Samudera") && papangMoralId.includes("terumbu karang"),
    "Papang moral should combine headline and spoken lesson"
  );

  const momoSummaryEn = extractStorySummary(momo, "en");
  const momoSummaryId = extractStorySummary(momo, "id");
  const momoMoralEn = extractMoral(momo, "en");
  const momoMoralId = extractMoral(momo, "id");
  assert.ok(
    momoSummaryEn.includes("Momo") &&
      momoSummaryEn.includes("courage to swing") &&
      !/chirp,\s*chirp/i.test(momoSummaryEn),
    "Momo EN summary should include resolution without sound-effect chatter"
  );
  assert.ok(
    momoSummaryId.includes("Momo") &&
      momoSummaryId.includes("berani berayun") &&
      !/cuit,\s*cuit/i.test(momoSummaryId),
    "Momo ID summary should include resolution without sound-effect chatter"
  );
  assert.ok(!/[!?]\./.test(momoMoralEn) && !/[!?]\./.test(momoMoralId), "Moral must not contain double punctuation (!.)");
  assert.ok(momoMoralEn.length > 20, "Momo EN moral should be non-trivial");

  // 2. Teaser copy checks
  for (const lang of ["id", "en"] as const) {
    const teaser = generateTeaserCopy(momo, lang, lang === "en" ? "08:30 WIB" : "19:00 WIB");
    assertNoStaticPortalUrl(`teaser:${lang}`, [
      teaser.captionInstagram,
      teaser.captionFacebook,
      teaser.captionThreads,
      teaser.captionYoutubeCommunity,
    ]);
    assert.ok(teaser.captionThreads.length <= 480, `teaser:${lang} Threads caption exceeds 480 chars`);
    assert.ok(/youtube/i.test(teaser.captionInstagram), `teaser:${lang} IG should mention YouTube`);
    assert.ok(teaser.captionFacebook.includes(extractMoral(momo, lang, true)), `teaser:${lang} FB should include moral`);
  }

  // 3. Daily lineup copy checks
  const daily = generateDailyLineupCopy(
    momo,
    { lang: "en", timeSlot: "08:30 WIB" },
    papang,
    { lang: "id", timeSlot: "19:00 WIB" },
    "2026-11-16"
  );
  assertNoStaticPortalUrl("dailyLineup", [
    daily.captionInstagram,
    daily.captionFacebook,
    daily.captionThreads,
  ]);
  assert.ok(daily.captionThreads.length <= 480, "dailyLineup Threads caption exceeds 480 chars");
  assert.ok(
    daily.captionFacebook.includes("Momo") && daily.captionFacebook.includes("Jakang"),
    "dailyLineup should summarize both morning and evening stories"
  );

  // 4. Wave 2 & Wave 3 checks (with and without youtubeUrl)
  for (const wave of [2, 3] as const) {
    for (const youtubeUrl of ["https://youtu.be/JkSk558PFTI", undefined]) {
      const waveCopy = generatePostPublishWaveCopy({
        wave,
        bookSlug: "edu-budi-papang-teripang",
        cleanTitle: "Papang Teripang dan Terumbu Karang",
        lang: wave === 2 ? "en" : "id",
        summary: papangSummaryId,
        moral: papangMoralId,
        youtubeUrl,
        related: [{ title: "Bulan dan Topi Biru", url: "https://youtu.be/2wIHNkjegd0" }],
      });
      assertNoStaticPortalUrl(`wave${wave}:${youtubeUrl ? "yt" : "no-yt"}`, [
        waveCopy.facebookCaption,
        waveCopy.facebookFallbackCaption,
        waveCopy.facebookFirstComment,
        waveCopy.instagramCaption,
        waveCopy.threadsText,
        waveCopy.threadsLinkUrl,
      ]);
      assert.ok(waveCopy.threadsText.length <= 480, `wave${wave} Threads text exceeds 480 chars`);
      assert.ok(
        waveCopy.facebookCaption.includes(papangSummaryId) && waveCopy.facebookCaption.includes(papangMoralId),
        `wave${wave} should highlight summary & moral`
      );
      if (wave === 2) {
        assert.ok(
          waveCopy.facebookFirstComment.includes("Previous Story on YouTube") &&
            !waveCopy.facebookFirstComment.includes("Cerita Sebelumnya"),
          "Wave 2 EN should localize related video labels in English"
        );
      }
    }
  }

  // 5. Full-Motion before & after copy checks (ID & EN)
  for (const phase of ["before", "after"] as const) {
    for (const slotLang of ["en", "id"] as const) {
      const fm = generateFullMotionCopy({
        story: papang,
        targetBook: "edu-budi-papang-teripang",
        phase,
        slotTime: "15:00 WIB",
        slotLang,
        dayHeadingEn: slotLang === "en" ? "SUNDAY" : "WEDNESDAY",
        dayLabelId: slotLang === "en" ? "Minggu" : "Rabu",
        ytEnUrl: phase === "after" ? "https://youtu.be/JkSk558PFTI" : undefined,
        ytIdUrl: phase === "after" && slotLang === "id" ? "https://youtu.be/ID12345" : undefined,
      });
      assertNoStaticPortalUrl(`fullMotion:${phase}:${slotLang}`, [
        fm.captionIg,
        fm.captionFb,
        fm.captionTh,
        fm.facebookFirstComment,
      ]);
      assert.ok(fm.captionTh.length <= 480, `fullMotion:${phase}:${slotLang} Threads text exceeds 480 chars`);
      assert.ok(
        /instagram/i.test(fm.captionIg) && /facebook/i.test(fm.captionIg) && /youtube/i.test(fm.captionIg),
        `fullMotion:${phase}:${slotLang} IG should mention social platforms`
      );
      if (phase === "after" && slotLang === "en") {
        assert.ok(
          fm.captionFb.includes("NOW STREAMING") &&
            fm.captionFb.includes("Story Summary") &&
            fm.captionFb.includes("Moral of the Story") &&
            !fm.captionFb.includes("Ringkasan Cerita") &&
            !fm.captionFb.includes("SUDAH TAYANG"),
          "Full-Motion EN after Facebook caption should stay consistently in English"
        );
      }
    }
  }

  // 6. Edit-if-supported instead of republish behavior
  const calls = {
    fbCreate: 0,
    fbEdit: 0,
    editedPostId: "",
    editedMessage: "",
    igCreate: 0,
    thCreate: 0,
  };
  const mockClients: SocialPlatformClients = {
    publishFacebookPhotoPost: async () => {
      calls.fbCreate++;
      return { success: true, postId: "new_fb", photoId: "new_photo", permalink: "https://fb.test/new" };
    },
    publishFacebookMultiPhotoPost: async () => {
      calls.fbCreate++;
      return { success: true, postId: "new_fb_multi", permalink: "https://fb.test/multi" };
    },
    updateFacebookPostMessage: async (postId: string, message: string) => {
      calls.fbEdit++;
      calls.editedPostId = postId;
      calls.editedMessage = message;
      return true;
    },
    publishInstagramFeedPhoto: async () => {
      calls.igCreate++;
      return { success: true, mediaId: "new_ig", permalink: "https://ig.test/new" };
    },
    publishInstagramCarousel: async () => {
      calls.igCreate++;
      return { success: true, mediaId: "new_ig_carousel", permalink: "https://ig.test/carousel" };
    },
    publishThreadsPhotoPost: async () => {
      calls.thCreate++;
      return { success: true, postId: "new_th", permalink: "https://threads.test/new" };
    },
    publishThreadsCarousel: async () => {
      calls.thCreate++;
      return { success: true, postId: "new_th_carousel", permalink: "https://threads.test/carousel" };
    },
    publishThreadsLinkPost: async () => {
      calls.thCreate++;
      return { success: true, postId: "new_th_link", permalink: "https://threads.test/link" };
    },
  };

  const editRes = await syncAnnouncementPlatforms({
    label: "EditTest",
    imagePaths: ["/tmp/dummy.png"],
    facebookCaption: "Updated summary & moral FB caption",
    instagramCaption: "Updated IG caption",
    threadsText: "Updated Threads text",
    existing: {
      facebook: { postId: "1473240609201601_122101314135548910", url: "https://fb.test/orig", status: "published" },
      instagram: { id: "17998049877051764", url: "https://ig.test/orig", status: "published" },
      threads: { id: "18039168671892907", postId: "18039168671892907", url: "https://th.test/orig", status: "published" },
    },
    allowEdit: true,
    dryRun: false,
    clients: mockClients,
  });

  assert.equal(editRes.errors.length, 0);
  assert.equal(calls.fbEdit, 1, "Facebook should edit in-place");
  assert.equal(calls.editedPostId, "1473240609201601_122101314135548910");
  assert.equal(calls.editedMessage, "Updated summary & moral FB caption");
  assert.equal(calls.fbCreate, 0, "Facebook must not republish duplicate post");
  assert.equal(calls.igCreate, 0, "Instagram must skip republish when API edit unsupported");
  assert.equal(calls.thCreate, 0, "Threads must skip republish when API edit unsupported");
  assert.equal(editRes.facebook?.status, "updated");
  assert.equal(editRes.instagram?.id, "17998049877051764");

  console.log("✅ All announcement summary/moral/social-only/edit-in-place unit checks passed!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
