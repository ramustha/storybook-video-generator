import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { checkPublicationStatus } from "./content-calendar";
import {
  applyTodayStatusToSlots,
  AuditRecordLike,
  buildAuditRecordKey,
  CalendarSlotLike,
  fetchRemoteSlotPublicationMap,
  mergeAuditRecordLists,
  mergeCalendarSlotLists,
  resolveExistingSlotPublications,
  resolveSlotDisplayState,
} from "./lib/portal-sync";

function makeAuditRecord(overrides: Partial<AuditRecordLike> = {}): AuditRecordLike {
  return {
    id: "AUD-001",
    storySlug: "di-bawah-tempat-tidurku",
    storyTitleId: "Ada Harimau di Bawah Tempat Tidurku!",
    storyTitleEn: "There Is a Tiger Under My Bed!",
    category: "Standalone Story",
    platform: "YouTube",
    platformIcon: "youtube",
    language: "en",
    format: "Landscape (16:9)",
    aspectRatio: "16:9",
    videoTitle: "Tiger Under My Bed",
    videoId: "Jc_PPn_TwyE",
    videoUrl: "https://www.youtube.com/watch?v=Jc_PPn_TwyE",
    publishedAt: "2026-11-12T01:31:00.000Z",
    status: "published",
    privacy: "public",
    thumbnailUrl: "https://img.youtube.com/vi/Jc_PPn_TwyE/hqdefault.jpg",
    author: "Pratham Books",
    illustrator: "Illustrator",
    license: "CC BY 4.0",
    sourceUrl: "https://storyweaver.org.in",
    views: 0,
    likes: 0,
    comments: 0,
    ...overrides,
  };
}

function makeCalendarSlot(overrides: Partial<CalendarSlotLike> = {}): CalendarSlotLike {
  return {
    id: "SLOT-011",
    date: "2026-11-12",
    dayName: "Kamis",
    timeSlot: "08:30 WIB",
    slotType: "Morning Educational Slot",
    bookSlug: "di-bawah-tempat-tidurku",
    storyTitleId: "Ada Harimau di Bawah Tempat Tidurku!",
    storyTitleEn: "There Is a Tiger Under My Bed!",
    lang: "en",
    format: "Landscape (16:9) & Shorts (9:16)",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Bravery before bedtime",
    status: "today",
    isCompleted: false,
    hasPublishedAsset: false,
    isBuffered: true,
    hasAssets: true,
    ...overrides,
  };
}

function buildHistoricalAuditFixture(): AuditRecordLike[] {
  return Array.from({ length: 93 }, (_, i) =>
    makeAuditRecord({
      id: `AUD-${String(i + 1).padStart(3, "0")}`,
      storySlug: `story-${Math.floor(i / 5)}`,
      storyTitleId: `Cerita ${Math.floor(i / 5)}`,
      storyTitleEn: `Story ${Math.floor(i / 5)}`,
      platform: i % 3 === 0 ? "YouTube" : i % 3 === 1 ? "Facebook" : "Instagram",
      language: i % 2 === 0 ? "id" : "en",
      aspectRatio: i % 5 < 2 ? "16:9" : "9:16",
      format: i % 5 < 2 ? "Landscape (16:9)" : "Shorts (9:16)",
      videoId: `hist_${i}`,
      publishedAt: "2026-11-10T12:00:00.000Z",
      views: 42,
    })
  );
}

function buildCalendarFixture(): CalendarSlotLike[] {
  return [
    makeCalendarSlot({
      id: "SLOT-009",
      date: "2026-11-11",
      dayName: "Rabu",
      timeSlot: "08:30 WIB",
      bookSlug: "story-0",
      storyTitleId: "Cerita 0",
      storyTitleEn: "Story 0",
      lang: "en",
      status: "completed",
      isCompleted: true,
      hasPublishedAsset: true,
    }),
    makeCalendarSlot({
      id: "SLOT-010",
      date: "2026-11-11",
      dayName: "Rabu",
      timeSlot: "19:00 WIB",
      bookSlug: "story-0",
      storyTitleId: "Cerita 0",
      storyTitleEn: "Story 0",
      lang: "id",
      status: "today",
      isCompleted: false,
      hasPublishedAsset: true,
    }),
    makeCalendarSlot({
      id: "SLOT-011",
      date: "2026-11-12",
      dayName: "Kamis",
      timeSlot: "08:30 WIB",
      bookSlug: "di-bawah-tempat-tidurku",
      lang: "en",
      status: "upcoming",
      isCompleted: false,
      hasPublishedAsset: false,
      isBuffered: true,
      hasAssets: true,
    }),
    makeCalendarSlot({
      id: "SLOT-012",
      date: "2026-11-12",
      dayName: "Kamis",
      timeSlot: "19:00 WIB",
      slotType: "Prime Bedtime Story",
      bookSlug: "di-bawah-tempat-tidurku",
      lang: "id",
      status: "upcoming",
      isCompleted: false,
      hasPublishedAsset: false,
      isBuffered: true,
      hasAssets: true,
    }),
    makeCalendarSlot({
      id: "SLOT-013",
      date: "2026-11-13",
      dayName: "Jumat",
      timeSlot: "08:30 WIB",
      bookSlug: "empat-sahabat-cerdik",
      storyTitleId: "Empat Sahabat Cerdik",
      storyTitleEn: "Four Clever Friends",
      lang: "en",
      status: "upcoming",
      isCompleted: false,
      hasPublishedAsset: false,
      isBuffered: false,
      hasAssets: true,
    }),
    makeCalendarSlot({
      id: "SLOT-014",
      date: "2026-11-13",
      dayName: "Jumat",
      timeSlot: "19:00 WIB",
      slotType: "Prime Bedtime Story",
      bookSlug: "empat-sahabat-cerdik",
      storyTitleId: "Empat Sahabat Cerdik",
      storyTitleEn: "Four Clever Friends",
      lang: "id",
      status: "upcoming",
      isCompleted: false,
      hasPublishedAsset: false,
      isBuffered: false,
      hasAssets: false,
    }),
  ];
}

async function runUnitTests(): Promise<void> {
  console.log("Running unit tests for scripts/lib/portal-sync.ts & content-calendar.ts...");

  const historical = buildHistoricalAuditFixture();
  const partialIncoming = [
    makeAuditRecord({ id: "AUD-001", views: 5 }),
    makeAuditRecord({
      id: "AUD-002",
      platform: "Facebook",
      format: "Watch Video (16:9)",
      videoId: "fb1",
    }),
  ];
  const mergedPartial = mergeAuditRecordLists(partialIncoming, historical);
  assert.equal(mergedPartial.length, 95, "Expected 93 existing + 2 new records");
  assert.equal(mergedPartial[0].storySlug, "story-0");
  assert.equal(mergedPartial[0].id, "AUD-001");
  assert.equal(mergedPartial[93].storySlug, "di-bawah-tempat-tidurku");
  assert.equal(mergedPartial[93].id, "AUD-094");
  assert.equal(mergedPartial[94].id, "AUD-095");

  const dupExisting = [
    makeAuditRecord({ id: "AUD-010", views: 10, publishedAt: "N/A" }),
    makeAuditRecord({ id: "AUD-099", views: 55, publishedAt: "2026-11-12T02:00:00.000Z" }),
  ];
  const mergedDup = mergeAuditRecordLists([], dupExisting, false);
  assert.equal(mergedDup.length, 1);
  assert.equal(mergedDup[0].id, "AUD-099");
  assert.equal(mergedDup[0].views, 55);

  const newerStatic = [
    makeAuditRecord({
      publishedAt: "2026-11-12T01:31:00.000Z",
      videoId: "NEW_ID",
      views: 10,
      thumbnailUrl: "https://img.youtube.com/vi/NEW_ID/hqdefault.jpg",
    }),
  ];
  const olderD1 = [
    makeAuditRecord({
      publishedAt: "2026-11-09T01:00:00.000Z",
      videoId: "OLD_ID",
      views: 99,
      likes: 12,
      thumbnailUrl: "branding/cover-facebook-1640x924.png",
    }),
  ];
  const mergedMonotonic = mergeAuditRecordLists(olderD1, newerStatic);
  assert.equal(mergedMonotonic.length, 1);
  assert.equal(mergedMonotonic[0].videoId, "NEW_ID");
  assert.equal(mergedMonotonic[0].views, 99);
  assert.equal(mergedMonotonic[0].likes, 12);
  assert.equal(mergedMonotonic[0].thumbnailUrl, "https://img.youtube.com/vi/NEW_ID/hqdefault.jpg");
  assert.equal(buildAuditRecordKey(newerStatic[0]), "di-bawah-tempat-tidurku::youtube::en::16:9");

  const month1Base = [
    makeCalendarSlot({
      id: "SLOT-011",
      storyTitleId: "Di Bawah Tempat Tidurku",
      storyTitleEn: "Di Bawah Tempat Tidurku",
      isBuffered: false,
    }),
  ];
  const existingFull = [
    makeCalendarSlot({
      id: "SLOT-061",
      date: "2026-12-07",
      bookSlug: "budi-story-01",
      storyTitleId: "Kisah BUDI #1",
      storyTitleEn: "BUDI Story #1",
    }),
    makeCalendarSlot({
      id: "SLOT-011",
      storyTitleId: "Ada Harimau di Bawah Tempat Tidurku!",
      storyTitleEn: "There Is a Tiger Under My Bed!",
      isBuffered: true,
    }),
  ];
  const mergedCal = mergeCalendarSlotLists(month1Base, existingFull);
  assert.equal(mergedCal.length, 2);
  assert.equal(mergedCal[0].date, "2026-11-12");
  assert.equal(mergedCal[0].isBuffered, true);
  assert.equal(mergedCal[0].storyTitleId, "Ada Harimau di Bawah Tempat Tidurku!");
  assert.equal(mergedCal[1].bookSlug, "budi-story-01");

  const slotsAcrossTime = [
    makeCalendarSlot({ id: "S1", date: "2026-11-11", lang: "id", isCompleted: false, status: "today" }),
    makeCalendarSlot({ id: "S2", date: "2026-11-12", lang: "en", isCompleted: false }),
    makeCalendarSlot({ id: "S3", date: "2026-11-12", lang: "id", timeSlot: "19:00 WIB", isCompleted: false }),
    makeCalendarSlot({ id: "S4", date: "2026-11-20", lang: "en", isCompleted: true }),
  ];
  const nonVideoOrFailedRecords = [
    makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", language: "en", platform: "YouTube", status: "published" }),
    makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", language: "id", platform: "Telegram", status: "published" }),
    makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", language: "id", platform: "Threads", status: "published" }),
    makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", language: "id", platform: "YouTube", status: "failed" }),
  ];
  const todayApplied = applyTodayStatusToSlots(slotsAcrossTime, nonVideoOrFailedRecords, "2026-11-12");
  assert.equal(todayApplied[0].status, "completed");
  assert.equal(todayApplied[0].isCompleted, true);
  assert.equal(todayApplied[1].status, "completed");
  assert.equal(todayApplied[1].isCompleted, true);
  assert.equal(todayApplied[2].status, "today");
  assert.equal(todayApplied[2].isCompleted, false);
  assert.equal(todayApplied[2].hasPublishedAsset, true);
  assert.equal(todayApplied[2].hasAssets, true);
  assert.equal(todayApplied[3].status, "upcoming");
  assert.equal(todayApplied[3].isCompleted, false);

  const todayBufferedState = resolveSlotDisplayState(todayApplied[2], "2026-11-12");
  assert.equal(todayBufferedState.statusClass, "today");
  assert.equal(todayBufferedState.statusText, "🔥 Today");
  assert.equal(todayBufferedState.footerKind, "today");
  assert.equal(todayBufferedState.isTodayRow, true);
  assert.equal(todayBufferedState.isTodayPending, true);

  const staleDateTodayStatus = resolveSlotDisplayState(
    makeCalendarSlot({ date: "2026-11-11", status: "today", isCompleted: false, isBuffered: false, hasAssets: false }),
    "2026-11-12"
  );
  assert.equal(staleDateTodayStatus.isTodayRow, false);
  assert.equal(staleDateTodayStatus.statusClass, "upcoming");

  const assetsState = resolveSlotDisplayState(
    makeCalendarSlot({ date: "2026-11-14", status: "upcoming", isCompleted: false, isBuffered: false, hasAssets: true }),
    "2026-11-12"
  );
  assert.equal(assetsState.statusClass, "assets-ready");
  assert.equal(assetsState.statusText, "🟡 Assets");

  const queuedState = resolveSlotDisplayState(
    makeCalendarSlot({ date: "2026-11-14", status: "upcoming", isCompleted: false, isBuffered: false, hasAssets: false }),
    "2026-11-12"
  );
  assert.equal(queuedState.statusClass, "upcoming");
  assert.equal(queuedState.statusText, "⏳ Queued");

  const requestedUrls: string[] = [];
  const remoteMap = await fetchRemoteSlotPublicationMap({
    localAuditRecords: [],
    localCalendarSlots: [makeCalendarSlot({ bookSlug: "night-book", lang: "id", storyTitleId: "Buku Malam" })],
    catalogApiUrl: "https://mock.invalid/api/catalog",
    snapshotAuditUrl: "https://mock.invalid/audit-data.json",
    fetcher: async (url: string) => {
      requestedUrls.push(url);
      if (url.includes("/api/catalog")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            auditRecords: [
              makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", platform: "Telegram", language: "id", status: "published" }),
              makeAuditRecord({ storySlug: "di-bawah-tempat-tidurku", platform: "YouTube", language: "id", status: "failed" }),
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => [
          makeAuditRecord({ platform: "YouTube", language: "en" }),
          makeAuditRecord({ platform: "Facebook", language: "en", format: "Watch Video (16:9)" }),
          makeAuditRecord({ platform: "Instagram", language: "en", format: "Instagram Reel (9:16)", aspectRatio: "9:16" }),
        ],
      };
    },
  });
  assert.ok(requestedUrls.every((u) => u.includes("?_t=")), "Expected cache-buster query param");
  const enInfo = remoteMap.get("di-bawah-tempat-tidurku::en");
  assert.ok(enInfo);
  assert.equal(enInfo.yt, true);
  assert.equal(enInfo.fb, true);
  assert.equal(enInfo.ig, true);
  assert.deepEqual(enInfo.sources, ["pages.dev/audit-data.json"]);
  const idInfo = remoteMap.get("di-bawah-tempat-tidurku::id");
  assert.equal(idInfo?.yt || false, false);
  assert.deepEqual(idInfo?.sources || [], []);
  assert.equal(remoteMap.get("night-book::id")?.title, "Buku Malam");

  let abortFired = false;
  const fallbackMap = await fetchRemoteSlotPublicationMap({
    localAuditRecords: [makeAuditRecord({ storySlug: "offline-book", platform: "YouTube", language: "en" })],
    catalogApiUrl: "https://mock.invalid/api/catalog",
    snapshotAuditUrl: "https://mock.invalid/audit-data.json",
    timeoutMs: 25,
    fetcher: async (url: string, init?: RequestInit) => {
      if (url.includes("/api/catalog")) {
        return await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            abortFired = true;
            reject(new Error("aborted"));
          });
        });
      }
      return {
        ok: false,
        json: async () => {
          throw new Error("bad json");
        },
      };
    },
  });
  assert.equal(abortFired, true, "Expected AbortController to abort hung request");
  assert.equal(fallbackMap.get("offline-book::en")?.yt, true);

  const tmpStoriesDir = fs.mkdtempSync(path.join(os.tmpdir(), "cal-story-test-"));
  try {
    const slugDir = path.join(tmpStoriesDir, "slug-only-story");
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, "story.json"),
      JSON.stringify({
        title: { id: "slug-only-story", en: "" },
        publications: { youtube: { en: { landscape: { url: "https://youtu.be/abc" } } } },
      })
    );
    const slugStatus = checkPublicationStatus("slug-only-story", "en", tmpStoriesDir);
    assert.equal(slugStatus.yt, true);
    assert.equal(slugStatus.title, undefined);
  } finally {
    fs.rmSync(tmpStoriesDir, { recursive: true, force: true });
  }

  // Duplicate-publish prevention: stale local story.json must still see live D1 + snapshot publications
  const resolvedDup = await resolveExistingSlotPublications({
    bookSlug: "di-bawah-tempat-tidurku",
    lang: "en",
    localFlags: { yt: false, fb: false, ig: false },
    localAuditRecords: [
      makeAuditRecord({ platform: "YouTube", language: "en", format: "Landscape (16:9)", aspectRatio: "16:9" }),
    ],
    catalogApiUrl: "https://mock.invalid/api/catalog",
    snapshotAuditUrl: "https://mock.invalid/audit-data.json",
    fetcher: async (url: string) => {
      if (url.includes("/api/catalog")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            auditRecords: [
              makeAuditRecord({ platform: "Instagram", language: "en", format: "Instagram Reel (9:16)", aspectRatio: "9:16" }),
            ],
          }),
        };
      }
      return { ok: true, json: async () => [] };
    },
    queryD1Publications: async () => [
      { platform: "facebook", format: "vertical", status: "published", external_id: "fbv1" },
      { platform: "facebook", format: "landscape", status: "failed", external_id: "" },
    ],
  });
  assert.equal(resolvedDup.yt, true);
  assert.equal(resolvedDup.ytLand, true);
  assert.equal(resolvedDup.ytVert, false);
  assert.equal(resolvedDup.ig, true);
  assert.equal(resolvedDup.fb, true);
  assert.equal(resolvedDup.fbVert, true);
  assert.equal(resolvedDup.fbLand, false);
  assert.equal(resolvedDup.allPrimaryLive, true);
  assert.deepEqual(
    resolvedDup.sources.sort(),
    ["d1:publications", "docs/audit-data.json", "pages.dev/api/catalog"].sort()
  );

  // Telegram/failed rows must not block publish
  const resolvedUnpublished = await resolveExistingSlotPublications({
    bookSlug: "di-bawah-tempat-tidurku",
    lang: "id",
    localFlags: { yt: false, fb: false, ig: false },
    catalogApiUrl: "",
    snapshotAuditUrl: "",
    queryD1Publications: async () => [
      { platform: "telegram", format: "notification", status: "published", external_id: "tg1" },
      { platform: "youtube", format: "landscape", status: "failed", external_id: "y1" },
    ],
  });
  assert.equal(resolvedUnpublished.yt, false);
  assert.equal(resolvedUnpublished.fb, false);
  assert.equal(resolvedUnpublished.ig, false);
  assert.equal(resolvedUnpublished.allPrimaryLive, false);

  console.log("✅ All unit tests passed.");
}

function freezeClockScript(initialIso: string): string {
  return `
    (() => {
      const RealDate = window.Date;
      const baseFake = new RealDate(${JSON.stringify(initialIso)}).getTime();
      const baseReal = RealDate.now();
      window.__setFakeWibTime = function(nextIso) {
        window.__fakeOffsetMs = new RealDate(nextIso).getTime() - RealDate.now();
      };
      window.__fakeOffsetMs = baseFake - baseReal;

      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(RealDate.now() + window.__fakeOffsetMs);
          } else {
            super(...args);
          }
        }
        static now() {
          return RealDate.now() + window.__fakeOffsetMs;
        }
      }
      window.Date = MockDate;
    })();
  `;
}

function buildIsolatedFixtureDocs(): {
  tmpDir: string;
  fixtureHtmlPath: string;
  fixtureAudit: AuditRecordLike[];
  fixtureCalendar: CalendarSlotLike[];
} {
  const realHtmlPath = path.resolve(__dirname, "..", "docs", "index.html");
  let html = fs.readFileSync(realHtmlPath, "utf-8");

  const fixtureAudit = buildHistoricalAuditFixture();
  const fixtureCalendar = buildCalendarFixture();

  html = html.replace(
    /const BUILD_AUDIT_SNAPSHOT = \[[\s\S]*?\];/,
    `const BUILD_AUDIT_SNAPSHOT = ${JSON.stringify(fixtureAudit)};`
  );
  html = html.replace(
    /const KNOWN_STORY_ASSETS = \[[\s\S]*?\];/,
    `const KNOWN_STORY_ASSETS = ${JSON.stringify(["story-0", "di-bawah-tempat-tidurku", "empat-sahabat-cerdik"])};`
  );
  html = html.replace(
    /const KNOWN_BUFFERED_STORIES = \[[\s\S]*?\];/,
    `const KNOWN_BUFFERED_STORIES = ${JSON.stringify(["di-bawah-tempat-tidurku"])};`
  );
  html = html.replace(
    /const BUILD_CALENDAR_SNAPSHOT = \[[\s\S]*?\]\.map\(normalizeCalendarSlot\);/,
    `const BUILD_CALENDAR_SNAPSHOT = ${JSON.stringify(fixtureCalendar)}.map(normalizeCalendarSlot);`
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-sync-fixture-"));
  const fixtureHtmlPath = path.join(tmpDir, "index.html");
  fs.writeFileSync(fixtureHtmlPath, html);
  fs.writeFileSync(path.join(tmpDir, "audit-data.json"), JSON.stringify(fixtureAudit));
  fs.writeFileSync(path.join(tmpDir, "calendar-data.json"), JSON.stringify(fixtureCalendar));

  return { tmpDir, fixtureHtmlPath, fixtureAudit, fixtureCalendar };
}

function startStaticDocsServer(rootDir: string): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || "/").split("?")[0];
      if (urlPath === "/api/catalog") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false }));
        return;
      }
      const cleanRel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
      const filePath = path.join(rootDir, cleanRel);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".json"
          ? "application/json; charset=utf-8"
          : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      fs.createReadStream(filePath).pipe(res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind static docs server"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

declare const RAW_AUDIT_DATA: AuditRecordLike[];

async function runPlaywrightTests(): Promise<void> {
  const realHtmlPath = path.resolve(__dirname, "..", "docs", "index.html");
  assert.ok(fs.existsSync(realHtmlPath), "docs/index.html must exist before browser tests");

  const { tmpDir, fixtureHtmlPath, fixtureAudit, fixtureCalendar } = buildIsolatedFixtureDocs();
  const { server, baseUrl } = await startStaticDocsServer(tmpDir);
  const chromeAppPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromeAppPath) ? { channel: "chrome" } : {}),
  });

  try {
    console.log("Running headless Playwright integration scenarios...");

    // Scenario 1: Stale D1 + colliding keys + failed/Telegram ID rows + transient offline poll
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(freezeClockScript("2026-11-12T08:37:00+07:00"));

      const todayEnRecords = [
        makeAuditRecord({ platform: "YouTube", language: "en", format: "Landscape (16:9)", aspectRatio: "16:9", views: 5 }),
        makeAuditRecord({ platform: "YouTube", language: "en", format: "Shorts (9:16)", aspectRatio: "9:16", videoId: "wQStyUFIrKA" }),
        makeAuditRecord({ platform: "Facebook", language: "en", format: "Watch Video (16:9)", aspectRatio: "16:9", videoId: "1861732521509554" }),
        makeAuditRecord({ platform: "Facebook", language: "en", format: "Facebook Reel (9:16)", aspectRatio: "9:16", videoId: "1861732521509555" }),
        makeAuditRecord({ platform: "Instagram", language: "en", format: "Instagram Reel (9:16)", aspectRatio: "9:16", videoId: "ig123" }),
      ];

      let failAllFetches = false;

      await page.route("**/api/catalog*", async (route) => {
        if (failAllFetches) return route.abort();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            auditRecords: [
              ...fixtureAudit,
              makeAuditRecord({
                platform: "YouTube",
                language: "en",
                format: "Landscape (16:9)",
                aspectRatio: "16:9",
                publishedAt: "2026-11-09T01:00:00.000Z",
                videoId: "OLD_STALE_ID",
                views: 150,
                thumbnailUrl: "branding/cover-facebook-1640x924.png",
              }),
              makeAuditRecord({
                platform: "Telegram",
                language: "id",
                format: "Telegram Notification",
                aspectRatio: "16:9",
                videoId: "tg1",
                status: "published",
              }),
              makeAuditRecord({
                platform: "YouTube",
                language: "id",
                format: "Landscape (16:9)",
                aspectRatio: "16:9",
                videoId: "fail1",
                status: "failed",
              }),
            ],
            calendarSlots: [
              ...fixtureCalendar.map((s) =>
                s.date === "2026-11-12" ? { ...s, isCompleted: false, status: "today", isBuffered: true } : s
              ),
              makeCalendarSlot({
                id: "SLOT-061",
                date: "2026-12-07",
                bookSlug: "budi-001",
                storyTitleId: "BUDI 1",
                storyTitleEn: "BUDI 1",
              }),
            ],
          }),
        });
      });

      await page.route("**/audit-data.json*", async (route) => {
        if (failAllFetches) return route.abort();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mergeAuditRecordLists(todayEnRecords, fixtureAudit)),
        });
      });

      await page.route("**/calendar-data.json*", async (route) => {
        if (failAllFetches) return route.abort();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixtureCalendar),
        });
      });

      await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
      await page.waitForSelector("#d1StatusText");

      const d1Badge = await page.locator("#d1StatusText").innerText();
      assert.equal(d1Badge, `⚡ D1 + Snapshot (${fixtureAudit.length + 7})`);

      // Verify colliding key kept newer videoId/thumb and higher views, plus preserved AUD-001 order
      const browserCollisionState = await page.evaluate(() => {
        const rec = RAW_AUDIT_DATA.find(
          (r: AuditRecordLike) =>
            r.storySlug === "di-bawah-tempat-tidurku" &&
            r.platform === "YouTube" &&
            r.language === "en" &&
            r.aspectRatio === "16:9"
        );
        return {
          firstId: RAW_AUDIT_DATA[0]?.storySlug,
          recId: rec?.id,
          videoId: rec?.videoId,
          views: rec?.views,
          thumb: rec?.thumbnailUrl,
        };
      });
      assert.equal(browserCollisionState.firstId, "story-0");
      assert.equal(browserCollisionState.recId, "AUD-094");
      assert.equal(browserCollisionState.videoId, "Jc_PPn_TwyE");
      assert.equal(browserCollisionState.views, 150);
      assert.equal(browserCollisionState.thumb, "https://img.youtube.com/vi/Jc_PPn_TwyE/hqdefault.jpg");

      await page.click("#tabTimelineBtn");
      await page.waitForSelector(".timeline-day-group");

      assert.equal(await page.locator("#kpiCalToday").innerText(), "2");
      assert.equal(await page.locator("#kpiCalTodayDesc").innerText(), "1 Done · 1 Remaining Today");

      const todayGroup = page.locator(".timeline-day-group", {
        has: page.locator(".timeline-day-header.today"),
      });
      assert.equal(await todayGroup.count(), 1);
      const todayHeaderText = await todayGroup.locator(".timeline-day-header").innerText();
      assert.ok(todayHeaderText.includes("12 Nov 2026"));
      assert.ok(todayHeaderText.toUpperCase().includes("HARI INI / TODAY"));

      // Morning EN is ✅ Done; Night ID stays 🔥 Today despite Telegram & failed YT records
      const todayCards = todayGroup.locator(".slot-card");
      assert.equal(await todayCards.count(), 2);
      assert.equal(await todayCards.nth(0).locator(".slot-status-pill").innerText(), "✅ DONE");
      assert.ok(await todayCards.nth(1).evaluate((el) => el.classList.contains("today-card")));
      assert.equal(await todayCards.nth(1).locator(".slot-status-pill").innerText(), "🔥 TODAY");
      const idFooterText = await todayCards.nth(1).locator(".slot-footer-actions").innerText();
      assert.ok(idFooterText.includes("Airing Today (19:00)") && idFooterText.includes("R2 Ready"));

      await page.click("#viewCalTableBtn");
      const todayRows = page.locator("#timelineTableBody tr.today-row");
      assert.equal(await todayRows.count(), 2);
      assert.equal(await todayRows.nth(0).locator("td").nth(3).innerText(), "✅ DONE");
      assert.equal(await todayRows.nth(1).locator("td").nth(3).innerText(), "🔥 TODAY");
      assert.ok((await todayRows.nth(1).locator("td").nth(0).innerText()).toUpperCase().includes("TODAY"));

      // Simulate transient offline poll: hydrated records and BUDI scope must NOT revert
      failAllFetches = true;
      await page.evaluate(async () => {
        await (window as any).hydrateLiveCatalog(false);
      });
      assert.equal(await page.locator("#d1StatusText").innerText(), `⚡ D1 Cached (${fixtureAudit.length + 7})`);
      assert.ok((await page.locator('[data-cal-filter="scope"][data-value="budi"]').innerText()).includes("(1)"));
      assert.equal(errors.length, 0, `Unexpected page errors: ${errors.join("; ")}`);
      await context.close();
    }

    // Scenario 2: Morning past 08:30 WIB WITHOUT EN publication (all 3 routes explicitly isolated)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(freezeClockScript("2026-11-12T08:40:00+07:00"));
      await page.route("**/api/catalog*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, auditRecords: fixtureAudit, calendarSlots: fixtureCalendar }),
        });
      });
      await page.route("**/audit-data.json*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureAudit) });
      });
      await page.route("**/calendar-data.json*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureCalendar) });
      });

      await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
      await page.click("#tabTimelineBtn");
      await page.waitForSelector("#stageMorningStatus");
      assert.equal(await page.locator("#stageMorningStatus").innerText(), "⏳ PENDING / SYNCING");
      assert.equal(await page.locator(".slot-card.today-card").count(), 2);
      await context.close();
    }

    // Scenario 3: Both Today completed (19:05 WIB) + Midnight rollover (00:00:05 WIB, hourCycle h23)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(freezeClockScript("2026-11-12T19:05:00+07:00"));
      const bothDoneAudit = mergeAuditRecordLists(
        [
          makeAuditRecord({ platform: "YouTube", language: "en" }),
          makeAuditRecord({ platform: "YouTube", language: "id", videoId: "idVid1" }),
        ],
        fixtureAudit
      );
      await page.route("**/api/catalog*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, auditRecords: bothDoneAudit, calendarSlots: fixtureCalendar }),
        });
      });
      await page.route("**/audit-data.json*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bothDoneAudit) });
      });
      await page.route("**/calendar-data.json*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureCalendar) });
      });

      await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
      await page.click("#tabTimelineBtn");
      await page.waitForSelector("#kpiCalToday");

      assert.equal(await page.locator("#kpiCalToday").innerText(), "2");
      assert.equal(await page.locator("#kpiCalTodayDesc").innerText(), "All 2 Broadcasted Today");
      assert.equal(await page.locator(".timeline-day-header.today").count(), 1);
      await page.click("#viewCalTableBtn");
      assert.equal(await page.locator("#timelineTableBody tr.today-row").count(), 2);

      await page.evaluate(() => {
        (window as any).__setFakeWibTime("2026-11-13T00:00:05+07:00");
        (window as any).updatePipelineMonitor();
      });

      const clockText = await page.locator("#pipelineClockWib").innerText();
      assert.equal(clockText, "⏰ 00:00:05 WIB");
      const newTodayHeader = await page.locator(".timeline-day-header.today").innerText();
      assert.ok(newTodayHeader.includes("13 Nov 2026"), `Expected midnight rollover header, got "${newTodayHeader}"`);
      assert.equal(await page.locator("#timelineTableBody tr.today-row").count(), 2);
      await context.close();
    }

    // Scenario 4: file:// offline mode on isolated fixture HTML + smoke test on real docs/index.html
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(freezeClockScript("2026-11-12T10:00:00+07:00"));
      await page.route("https://storybook-catalog.pages.dev/**", async (route) => {
        await route.abort();
      });

      await page.goto(`file://${fixtureHtmlPath}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const el = document.getElementById("d1StatusText");
        return el && el.textContent && el.textContent.includes("Embedded");
      });

      await page.click("#tabTimelineBtn");
      await page.waitForSelector(".timeline-day-header.today");
      assert.ok((await page.locator(".timeline-day-header.today").innerText()).includes("12 Nov 2026"));
      await page.click("#viewCalTableBtn");
      assert.equal(await page.locator("#timelineTableBody tr.today-row").count(), 2);
      assert.equal(errors.length, 0);

      // Smoke check actual workspace docs/index.html renders cleanly with zero runtime errors
      await page.goto(`file://${realHtmlPath}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#d1StatusText");
      await page.click("#tabTimelineBtn");
      await page.waitForSelector("#timelineFlowContainer");
      assert.equal(errors.length, 0, `Real docs/index.html page errors: ${errors.join("; ")}`);
      await context.close();
    }

    console.log("✅ All Playwright integration scenarios passed.");
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  await runUnitTests();
  await runPlaywrightTests();
  console.log("🎉 ALL PORTAL SYNC TESTS PASSED");
}

main().catch((err) => {
  console.error("❌ Portal sync test failed:", err);
  process.exit(1);
});
