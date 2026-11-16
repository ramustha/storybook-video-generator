/**
 * Published asset audit entry tracked across YouTube, Facebook, and Instagram.
 */
export interface AuditRecordLike {
  id: string;
  storySlug: string;
  storyTitleId: string;
  storyTitleEn: string;
  category: string;
  platform: string;
  platformIcon?: string;
  language: string;
  format: string;
  aspectRatio: string;
  videoTitle: string;
  videoId: string;
  videoUrl: string;
  publishedAt: string;
  status: string;
  privacy: string;
  duration?: string;
  thumbnailUrl?: string;
  author: string;
  illustrator: string;
  license: string;
  sourceUrl: string;
  views?: number;
  likes?: number;
  comments?: number;
}

/**
 * Editorial broadcast schedule entry enriched with pipeline and publication state.
 */
export interface CalendarSlotLike {
  id: string;
  date: string;
  dayName: string;
  timeSlot: string;
  slotType: string;
  bookSlug: string;
  storyTitleId: string;
  storyTitleEn: string;
  lang: "id" | "en" | string;
  format: string;
  targetPlatforms: string[];
  theme: string;
  status: "completed" | "today" | "upcoming" | string;
  isCompleted: boolean;
  hasPublishedAsset: boolean;
  isBuffered?: boolean;
  hasAssets?: boolean;
}

/**
 * Normalized visual state consumed identically by Roadmap Day Cards and Schedule Table rows.
 */
export interface SlotDisplayState {
  isCompleted: boolean;
  isTodayRow: boolean;
  isTodayPending: boolean;
  isBuffered: boolean;
  hasAssets: boolean;
  statusClass: "completed" | "today" | "buffered" | "assets-ready" | "upcoming";
  statusText: string;
  footerKind: "completed" | "today" | "buffered" | "assets" | "queued";
}

export const PRIMARY_VIDEO_PLATFORMS = ["youtube", "facebook", "instagram"] as const;

/**
 * Formats a Date into YYYY-MM-DD in Asia/Jakarta (WIB).
 */
export function getWibDateIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Converts a hyphenated slug into Title Case as a display fallback.
 */
export function formatSlugFallbackTitle(slug: string): string {
  if (!slug) return "Story";
  return String(slug)
    .split("-")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

/**
 * Checks whether a display title is empty or merely a slug/title-case fallback.
 */
export function isSlugTitleFallback(title: string | undefined, slug: string): boolean {
  if (!title) return true;
  const trimmed = String(title).trim().toLowerCase();
  return (
    trimmed === "" ||
    trimmed === String(slug || "").trim().toLowerCase() ||
    trimmed === formatSlugFallbackTitle(slug).toLowerCase()
  );
}

/**
 * Returns true only for successfully published video assets on primary video platforms.
 */
export function isPrimaryPublishedRecord(rec: Partial<AuditRecordLike> | null | undefined): boolean {
  if (!rec || !rec.storySlug) return false;
  const status = rec.status ? String(rec.status).trim().toLowerCase() : "published";
  if (status !== "published") return false;
  const platform = rec.platform ? String(rec.platform).trim().toLowerCase() : "";
  return PRIMARY_VIDEO_PLATFORMS.indexOf(platform as "youtube" | "facebook" | "instagram") !== -1;
}

/**
 * Builds a deterministic natural identity key shared across local scans, static snapshots, and D1 rows.
 */
export function buildAuditRecordKey(record: Partial<AuditRecordLike> | null | undefined): string {
  const slug = String((record && record.storySlug) || "").trim().toLowerCase();
  const platform = String((record && record.platform) || "").trim().toLowerCase();
  const language = String((record && record.language) || "id").trim().toLowerCase();
  const fmtLower = String((record && record.format) || "").trim().toLowerCase();
  const variant = fmtLower.includes("notification")
    ? "notification"
    : String((record && record.aspectRatio) || fmtLower || "16:9").trim().toLowerCase();
  return slug + "::" + platform + "::" + language + "::" + variant;
}

function parseTimestampMs(iso: string | undefined): number {
  if (!iso || iso === "N/A" || iso === "undefined") return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function mergeSingleAuditRecord<T extends AuditRecordLike>(existing: T, incoming: T): T {
  const existingMs = parseTimestampMs(existing.publishedAt);
  const incomingMs = parseTimestampMs(incoming.publishedAt);
  const preferred = incomingMs >= existingMs ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;

  const preferredThumb = preferred.thumbnailUrl || "";
  const secondaryThumb = secondary.thumbnailUrl || "";
  const thumbnailUrl =
    preferredThumb.includes("branding/") && secondaryThumb && !secondaryThumb.includes("branding/")
      ? secondaryThumb
      : preferredThumb || secondaryThumb || undefined;

  return {
    ...secondary,
    ...preferred,
    storyTitleId: isSlugTitleFallback(preferred.storyTitleId, preferred.storySlug)
      ? secondary.storyTitleId || preferred.storyTitleId
      : preferred.storyTitleId,
    storyTitleEn: isSlugTitleFallback(preferred.storyTitleEn, preferred.storySlug)
      ? secondary.storyTitleEn || preferred.storyTitleEn
      : preferred.storyTitleEn,
    thumbnailUrl,
    views: Math.max(existing.views || 0, incoming.views || 0),
    likes: Math.max(existing.likes || 0, incoming.likes || 0),
    comments: Math.max(existing.comments || 0, incoming.comments || 0),
  };
}

/**
 * Monotonically merges two audit record lists while preserving existing Audit ID ordering
 * and appending unseen records without dropping historical or newly published releases.
 */
export function mergeAuditRecordLists<T extends AuditRecordLike>(
  incomingRecords: T[],
  existingRecords: T[],
  reIndex: boolean = true
): T[] {
  const orderedKeys: string[] = [];
  const mergedMap = new Map<string, T>();

  const upsert = (rec: T): void => {
    if (!rec || !rec.storySlug) return;
    const key = buildAuditRecordKey(rec);
    const prev = mergedMap.get(key);
    if (!prev) {
      orderedKeys.push(key);
      mergedMap.set(key, { ...rec });
      return;
    }
    mergedMap.set(key, mergeSingleAuditRecord(prev, rec));
  };

  for (const rec of existingRecords || []) {
    upsert(rec);
  }
  for (const rec of incomingRecords || []) {
    upsert(rec);
  }

  const combined = orderedKeys.map((key) => mergedMap.get(key)!);
  if (!reIndex) return combined;

  return combined.map((rec, index) => ({
    ...rec,
    id: "AUD-" + String(index + 1).padStart(3, "0"),
  }));
}

/**
 * Builds a stable key matching schedule slots across local, snapshot, and D1 representations.
 */
export function buildCalendarSlotKey(slot: Partial<CalendarSlotLike> | null | undefined): string {
  const date = String((slot && slot.date) || "").trim();
  const slug = String((slot && slot.bookSlug) || "").trim().toLowerCase();
  const lang = String((slot && slot.lang) || "id").trim().toLowerCase();
  return date + "::" + slug + "::" + lang;
}

/**
 * Monotonically merges calendar slot collections while preserving completion,
 * buffer flags, rich titles, and deterministic chronological order.
 */
export function mergeCalendarSlotLists<T extends CalendarSlotLike>(
  baseSlots: T[],
  overlaySlots: T[]
): T[] {
  const overlayMap = new Map<string, T>();
  for (const slot of overlaySlots || []) {
    if (!slot) continue;
    overlayMap.set(buildCalendarSlotKey(slot), slot);
  }

  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const base of baseSlots || []) {
    if (!base) continue;
    const key = buildCalendarSlotKey(base);
    seenKeys.add(key);
    const overlay = overlayMap.get(key);
    if (!overlay) {
      result.push({ ...base });
      continue;
    }

    const useOverlayIdTitle =
      isSlugTitleFallback(base.storyTitleId, base.bookSlug) &&
      !isSlugTitleFallback(overlay.storyTitleId, overlay.bookSlug);
    const useOverlayEnTitle =
      isSlugTitleFallback(base.storyTitleEn, base.bookSlug) &&
      !isSlugTitleFallback(overlay.storyTitleEn, overlay.bookSlug);

    result.push({
      ...base,
      storyTitleId: useOverlayIdTitle ? overlay.storyTitleId : base.storyTitleId,
      storyTitleEn: useOverlayEnTitle ? overlay.storyTitleEn : base.storyTitleEn,
      isCompleted: Boolean(base.isCompleted || overlay.isCompleted),
      hasPublishedAsset: Boolean(base.hasPublishedAsset || overlay.hasPublishedAsset),
      isBuffered: Boolean(base.isBuffered || overlay.isBuffered),
      hasAssets: Boolean(base.hasAssets || overlay.hasAssets),
    });
  }

  for (const extra of overlaySlots || []) {
    if (!extra) continue;
    const key = buildCalendarSlotKey(extra);
    if (!seenKeys.has(key)) {
      result.push({ ...extra });
    }
  }

  return result.sort((a, b) => {
    const dateDiff = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = String(a.timeSlot || "").localeCompare(String(b.timeSlot || ""));
    if (timeDiff !== 0) return timeDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/**
 * Recomputes slot status and completion monotonically against the current WIB date
 * using only published primary video platform releases.
 */
export function applyTodayStatusToSlots<T extends CalendarSlotLike>(
  slots: T[],
  auditRecords: Partial<AuditRecordLike>[],
  todayWibIso: string
): T[] {
  const publishedSlugs = new Set<string>();
  const publishedSlotPairs = new Set<string>();

  for (const r of auditRecords || []) {
    if (!isPrimaryPublishedRecord(r)) continue;
    const slug = String(r.storySlug || "").trim().toLowerCase();
    const lang = String(r.language || "id").trim().toLowerCase();
    publishedSlugs.add(slug);
    publishedSlotPairs.add(slug + "::" + lang);
  }

  return (slots || []).map((slot) => {
    const slugKey = String(slot.bookSlug || "").trim().toLowerCase();
    const langKey = String(slot.lang || "id").trim().toLowerCase();
    const isSlotPublished = publishedSlotPairs.has(slugKey + "::" + langKey);
    const hasPublishedAsset = Boolean(slot.hasPublishedAsset || publishedSlugs.has(slugKey));
    const hasAssets = Boolean(slot.hasAssets || hasPublishedAsset);

    if (slot.date < todayWibIso) {
      return {
        ...slot,
        status: "completed",
        isCompleted: true,
        hasPublishedAsset,
        hasAssets,
      };
    }

    if (slot.date === todayWibIso) {
      const isCompleted = Boolean(slot.isCompleted || isSlotPublished);
      return {
        ...slot,
        status: isCompleted ? "completed" : "today",
        isCompleted,
        hasPublishedAsset,
        hasAssets,
      };
    }

    return {
      ...slot,
      status: "upcoming",
      isCompleted: false,
      hasPublishedAsset,
      hasAssets,
    };
  });
}

/**
 * Resolves the unified visual status shared by Day Cards and Schedule Table rows.
 * Priority: Completed > Today (pending broadcast) > R2 Buffered > Local Assets > Queued.
 */
export function resolveSlotDisplayState(
  slot: Partial<CalendarSlotLike>,
  todayWibIso?: string
): SlotDisplayState {
  const isCompleted = Boolean(slot.isCompleted || slot.status === "completed");
  const isTodayDate = todayWibIso && slot.date ? slot.date === todayWibIso : slot.status === "today";
  const isTodayRow = Boolean(isTodayDate);
  const isTodayPending = !isCompleted && Boolean(isTodayDate);
  const isBuffered = Boolean(slot.isBuffered);
  const hasAssets = Boolean(slot.hasAssets);

  if (isCompleted) {
    return {
      isCompleted: true,
      isTodayRow,
      isTodayPending: false,
      isBuffered,
      hasAssets,
      statusClass: "completed",
      statusText: "✅ Done",
      footerKind: "completed",
    };
  }

  if (isTodayPending) {
    return {
      isCompleted: false,
      isTodayRow: true,
      isTodayPending: true,
      isBuffered,
      hasAssets,
      statusClass: "today",
      statusText: "🔥 Today",
      footerKind: "today",
    };
  }

  if (isBuffered) {
    return {
      isCompleted: false,
      isTodayRow,
      isTodayPending: false,
      isBuffered: true,
      hasAssets,
      statusClass: "buffered",
      statusText: "🟢 Ready",
      footerKind: "buffered",
    };
  }

  if (hasAssets) {
    return {
      isCompleted: false,
      isTodayRow,
      isTodayPending: false,
      isBuffered: false,
      hasAssets: true,
      statusClass: "assets-ready",
      statusText: "🟡 Assets",
      footerKind: "assets",
    };
  }

  return {
    isCompleted: false,
    isTodayRow,
    isTodayPending: false,
    isBuffered: false,
    hasAssets: false,
    statusClass: "upcoming",
    statusText: "⏳ Queued",
    footerKind: "queued",
  };
}

export interface PipelineSpotlightResolution {
  activeCard: "buffer" | "announce" | "morning" | "bedtime";
  badgeText: string;
  eventName: string;
  shortActionName: string;
  targetSecRemaining: number;
  metaDate: string;
  metaDayName: string;
  metaTime: string;
  metaType: string;
  metaFormat: string;
  titleText: string;
  descText: string;
  platformTags: string[];
}

/**
 * Extracts HH:MM:00 from a slot time string such as "15:00 WIB".
 */
export function extractSlotTimeHms(timeSlot?: string, fallback: string = "08:30:00"): string {
  const m = String(timeSlot || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

function slotDisplayTitle(slot: Partial<CalendarSlotLike> | undefined): string {
  if (!slot) return "Storybook Feature";
  const lang = String(slot.lang || "id").toLowerCase();
  const base =
    lang === "en"
      ? slot.storyTitleEn || slot.storyTitleId || formatSlugFallbackTitle(slot.bookSlug || "")
      : slot.storyTitleId || slot.storyTitleEn || formatSlugFallbackTitle(slot.bookSlug || "");
  return `${base} (${lang.toUpperCase()})`;
}

function summarizeSlotTargetDay(slots: CalendarSlotLike[]): string {
  if (!slots || slots.length === 0) return "Upcoming Bilingual Storybooks";
  return slots.map(slotDisplayTitle).join(" + ");
}

function formatReadinessSuffix(slot: CalendarSlotLike | undefined): string {
  if (!slot) return "";
  if (slot.isCompleted || slot.status === "completed") return " (✅ Done)";
  if (slot.isBuffered) return " (🟢 Ready in R2)";
  if (slot.hasAssets) return " (🟡 Assets Ready)";
  return " (⏳ Queued)";
}

/**
 * Computes consistent Spotlight banner copy, countdown target, and platform tags
 * matching the live WIB schedule without mixing event timestamps across slots.
 */
export function resolvePipelineSpotlight(params: {
  totalSecNow: number;
  wibDayOfWeek?: string;
  todaySlots: CalendarSlotLike[];
  tomorrowSlots: CalendarSlotLike[];
  todayMorning?: CalendarSlotLike;
  todayMotion?: CalendarSlotLike;
  todayBedtime?: CalendarSlotLike;
  tomorrowMorning?: CalendarSlotLike;
  tomorrowBedtime?: CalendarSlotLike;
}): PipelineSpotlightResolution {
  const {
    totalSecNow,
    todaySlots,
    tomorrowSlots,
    todayMorning,
    todayMotion,
    todayBedtime,
    tomorrowMorning,
    tomorrowBedtime,
  } = params;

  const SEC_BUFFER = 2 * 3600;
  const SEC_ANNOUNCE = 7 * 3600 + 15 * 60;
  const SEC_MORNING = 8 * 3600 + 30 * 60;
  const SEC_WAVE2 = 12 * 3600 + 30 * 60;
  const SEC_MOTION = 15 * 3600;
  const SEC_BEDTIME = 19 * 3600;
  const SEC_WAVE3 = 20 * 3600 + 30 * 60;

  const morningDone = !todayMorning || Boolean(todayMorning.isCompleted || todayMorning.status === "completed");
  const motionDone = !todayMotion || Boolean(todayMotion.isCompleted || todayMotion.status === "completed");
  const bedtimeDone = !todayBedtime || Boolean(todayBedtime.isCompleted || todayBedtime.status === "completed");

  const tomorrowBufferedCount = tomorrowSlots.filter((s) => s.isBuffered || s.isCompleted).length;
  const tomorrowAllBuffered = tomorrowSlots.length > 0 && tomorrowBufferedCount === tomorrowSlots.length;
  const tomorrowAnchor = tomorrowMorning || tomorrowBedtime || tomorrowSlots[0];
  const tomorrowDate = tomorrowAnchor?.date || "Tomorrow";
  const tomorrowDayName = tomorrowAnchor?.dayName || "Scheduled";

  if (totalSecNow < SEC_BUFFER && !tomorrowAllBuffered && tomorrowSlots.length > 0) {
    return {
      activeCard: "buffer",
      badgeText: "⚡ NEXT EVENT",
      eventName: "📦 Nightly Cloudflare R2 Pre-Render Buffer (02:00 WIB)",
      shortActionName: "R2 Buffer",
      targetSecRemaining: SEC_BUFFER - totalSecNow,
      metaDate: tomorrowDate,
      metaDayName: tomorrowDayName,
      metaTime: "02:00 WIB",
      metaType: "Pre-Render Queue (H+1..H+3)",
      metaFormat: "MP4 16:9 & 9:16",
      titleText: `${summarizeSlotTargetDay(tomorrowSlots)}`,
      descText: "Rendering upcoming 16:9 & 9:16 MP4 videos to Cloudflare R2 ahead of launch",
      platformTags: ["☁️ Cloudflare R2", "🎬 Remotion MP4"],
    };
  }

  if (totalSecNow < SEC_ANNOUNCE && todaySlots.length > 0) {
    const todayAnchor = todayMorning || todayBedtime || todaySlots[0];
    return {
      activeCard: "announce",
      badgeText: "⚡ NEXT EVENT",
      eventName: "📣 Daily Bilingual Social Announcement (07:15 WIB)",
      shortActionName: "Announcement",
      targetSecRemaining: SEC_ANNOUNCE - totalSecNow,
      metaDate: todayAnchor?.date || "Today",
      metaDayName: todayAnchor?.dayName || "Today",
      metaTime: "07:15 WIB",
      metaType: "Wave 1 Daily Lineup Teaser",
      metaFormat: "Social Carousel",
      titleText: summarizeSlotTargetDay(todaySlots),
      descText: `Today's bilingual teaser ahead of ${todayMorning ? "08:30" : ""}${todayMorning && todayBedtime ? " & " : ""}${todayBedtime ? "19:00" : ""} WIB broadcasts`,
      platformTags: ["📸 Instagram", "📘 Facebook", "🧵 Threads"],
    };
  }

  if (todayMorning && (!morningDone || totalSecNow < SEC_MORNING)) {
    const pendingAfterWindow = totalSecNow >= SEC_MORNING && !morningDone;
    return {
      activeCard: "morning",
      badgeText: pendingAfterWindow ? "⏳ SYNCING" : "⚡ NEXT EVENT",
      eventName: pendingAfterWindow
        ? "🌅 Morning English Broadcast (08:30 WIB · Syncing)"
        : "🌅 Morning English Broadcast (08:30 WIB)",
      shortActionName: "Morning [EN]",
      targetSecRemaining: Math.max(0, SEC_MORNING - totalSecNow),
      metaDate: todayMorning.date,
      metaDayName: todayMorning.dayName,
      metaTime: todayMorning.timeSlot || "08:30 WIB",
      metaType: todayMorning.slotType || "Morning English Feature",
      metaFormat: todayMorning.format || "Landscape (16:9) & Shorts (9:16)",
      titleText: `${slotDisplayTitle(todayMorning)}${formatReadinessSuffix(todayMorning)}`,
      descText: todayMorning.theme || "English Read-Aloud Story Premiere",
      platformTags: ["📺 YouTube", "📘 Facebook", "📸 Instagram"],
    };
  }

  if (todayMotion && !motionDone && totalSecNow < SEC_MOTION) {
    return {
      activeCard: "morning",
      badgeText: "⚡ NEXT EVENT",
      eventName: "🎬 Special Full-Motion Premiere (15:00 WIB)",
      shortActionName: "Full-Motion",
      targetSecRemaining: SEC_MOTION - totalSecNow,
      metaDate: todayMotion.date,
      metaDayName: todayMotion.dayName,
      metaTime: todayMotion.timeSlot || "15:00 WIB",
      metaType: todayMotion.slotType || "Full-Motion Animation",
      metaFormat: todayMotion.format || "Landscape (16:9) & Shorts (9:16)",
      titleText: `${slotDisplayTitle(todayMotion)}${formatReadinessSuffix(todayMotion)}`,
      descText: todayMotion.theme || "Animated Character Full-Motion Edition",
      platformTags: ["📺 YouTube", "📘 Facebook", "📸 Instagram"],
    };
  }

  if (totalSecNow < SEC_WAVE2 && todayMorning && morningDone && todayBedtime) {
    return {
      activeCard: "announce",
      badgeText: "⚡ NEXT EVENT",
      eventName: "🌊 Wave 2 Midday Watch-Now Funnel (12:30 WIB)",
      shortActionName: "Wave 2",
      targetSecRemaining: SEC_WAVE2 - totalSecNow,
      metaDate: todayMorning.date,
      metaDayName: todayMorning.dayName,
      metaTime: "12:30 WIB",
      metaType: "Wave 2 Post-Publish Funnel",
      metaFormat: "4:5 Portrait Feed",
      titleText: slotDisplayTitle(todayMorning),
      descText: `Midday social highlight driving viewers to tonight's 19:00 WIB premiere`,
      platformTags: ["📸 Instagram", "📘 Facebook", "🧵 Threads"],
    };
  }

  if (todayBedtime && (!bedtimeDone || totalSecNow < SEC_BEDTIME)) {
    const pendingAfterWindow = totalSecNow >= SEC_BEDTIME && !bedtimeDone;
    return {
      activeCard: "bedtime",
      badgeText: pendingAfterWindow ? "⏳ SYNCING" : "⚡ NEXT EVENT",
      eventName: pendingAfterWindow
        ? "🌙 Prime Bedtime Indonesian Broadcast (19:00 WIB · Syncing)"
        : "🌙 Prime Bedtime Indonesian Broadcast (19:00 WIB)",
      shortActionName: "Bedtime [ID]",
      targetSecRemaining: Math.max(0, SEC_BEDTIME - totalSecNow),
      metaDate: todayBedtime.date,
      metaDayName: todayBedtime.dayName,
      metaTime: todayBedtime.timeSlot || "19:00 WIB",
      metaType: todayBedtime.slotType || "Prime Bedtime Story",
      metaFormat: todayBedtime.format || "Landscape (16:9) & Shorts (9:16)",
      titleText: `${slotDisplayTitle(todayBedtime)}${formatReadinessSuffix(todayBedtime)}`,
      descText: todayBedtime.theme || "Indonesian Bedtime Tale Premiere",
      platformTags: ["📺 YouTube", "📘 Facebook", "📸 Instagram"],
    };
  }

  if (totalSecNow < SEC_WAVE3 && todayBedtime && bedtimeDone) {
    return {
      activeCard: "announce",
      badgeText: "✅ TODAY AIRED · NEXT WAVE",
      eventName: "🌊 Wave 3 Bedtime Highlight Funnel (20:30 WIB)",
      shortActionName: "Wave 3",
      targetSecRemaining: SEC_WAVE3 - totalSecNow,
      metaDate: todayBedtime.date,
      metaDayName: todayBedtime.dayName,
      metaTime: "20:30 WIB",
      metaType: "Wave 3 Bedtime Watch-Next Funnel",
      metaFormat: "4:5 Portrait Feed",
      titleText: slotDisplayTitle(todayBedtime),
      descText: `Nighttime social highlight for ${slotDisplayTitle(todayBedtime)}`,
      platformTags: ["📸 Instagram", "📘 Facebook", "🧵 Threads"],
    };
  }

  // Tonight/overnight after today's broadcasts complete -> point cleanly to next unbuffered cron or tomorrow 07:15 announcement + premiere summary
  if (!tomorrowAllBuffered && tomorrowSlots.length > 0) {
    return {
      activeCard: "buffer",
      badgeText: "🌙 TODAY DONE · UP NEXT",
      eventName: "📦 Cloudflare R2 Pre-Render Buffer (Tomorrow 02:00 WIB)",
      shortActionName: "R2 Buffer",
      targetSecRemaining: 86400 - totalSecNow + SEC_BUFFER,
      metaDate: tomorrowDate,
      metaDayName: tomorrowDayName,
      metaTime: "02:00 WIB",
      metaType: "Nightly Pre-Render Queue",
      metaFormat: `${tomorrowBufferedCount}/${tomorrowSlots.length} Buffered`,
      titleText: summarizeSlotTargetDay(tomorrowSlots),
      descText: `Preparing MP4 buffer ahead of tomorrow's 08:30 WIB premiere`,
      platformTags: ["☁️ Cloudflare R2", "🎬 Remotion MP4"],
    };
  }

  const nextPremiereSummary = tomorrowMorning
    ? `Next Video Premiere: ${tomorrowMorning.timeSlot || "08:30 WIB"} (${String(tomorrowMorning.lang || "en").toUpperCase()})`
    : "Next Launch Preparation";

  return {
    activeCard: "announce",
    badgeText: todaySlots.length > 0 && morningDone && bedtimeDone ? "✅ TODAY DONE · UP NEXT" : "⚡ NEXT EVENT",
    eventName: "📣 Daily Bilingual Social Announcement (Tomorrow 07:15 WIB)",
    shortActionName: "Announcement",
    targetSecRemaining: 86400 - totalSecNow + SEC_ANNOUNCE,
    metaDate: tomorrowDate,
    metaDayName: tomorrowDayName,
    metaTime: "07:15 WIB",
    metaType: "Wave 1 Bilingual Social Teaser",
    metaFormat: nextPremiereSummary,
    titleText: summarizeSlotTargetDay(tomorrowSlots),
    descText: `Tomorrow's dual teaser · ${nextPremiereSummary}${tomorrowBedtime ? ` & ${tomorrowBedtime.timeSlot || "19:00 WIB"}` : ""}`,
    platformTags: ["📸 Instagram", "📘 Facebook", "🧵 Threads"],
  };
}
