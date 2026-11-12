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
