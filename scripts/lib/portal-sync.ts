import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  AuditRecordLike,
  CalendarSlotLike,
  isPrimaryPublishedRecord,
  isSlugTitleFallback,
} from "./portal-sync-browser";

export * from "./portal-sync-browser";

/**
 * Per-slot aggregated publication status and resolved title across channels.
 */
export interface RemoteSlotPublicationInfo {
  yt: boolean;
  fb: boolean;
  ig: boolean;
  ytLand: boolean;
  ytVert: boolean;
  fbLand: boolean;
  fbVert: boolean;
  title: string | null;
  sources: string[];
}

/**
 * Per-platform publication flags extracted from local or remote story state.
 */
export interface LocalPublicationFlags {
  yt?: boolean;
  fb?: boolean;
  ig?: boolean;
  ytLand?: boolean;
  ytVert?: boolean;
  fbLand?: boolean;
  fbVert?: boolean;
  title?: string | null;
}

/**
 * Combined multi-source deduplication verdict for a single `(bookSlug, lang)` edition.
 */
export interface ResolvedSlotPublications {
  yt: boolean;
  fb: boolean;
  ig: boolean;
  ytLand: boolean;
  ytVert: boolean;
  fbLand: boolean;
  fbVert: boolean;
  allPrimaryLive: boolean;
  title: string | null;
  sources: string[];
}

/**
 * Minimal fetch contract satisfied by global `fetch` and test doubles.
 */
export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  json: () => Promise<any>;
}>;

/**
 * Reads a JSON file returning an array, or `[]` when missing or malformed.
 */
export function loadJsonArraySafe<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Transpiles the browser-safe portal-sync helpers into standalone ES2020 JavaScript
 * so Node build tools and generated HTML execute identical merge and display logic.
 */
export function getBrowserPortalSyncScript(): string {
  const sourcePath = path.resolve(__dirname, "portal-sync-browser.ts");
  const rawSource = fs.readFileSync(sourcePath, "utf-8");
  const strippedExports = rawSource.replace(
    /^\s*export\s+(?=(?:type|interface|function|const|let|class)\b)/gm,
    ""
  );
  const transpiled = ts.transpileModule(strippedExports, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      removeComments: true,
    },
  });
  return transpiled.outputText.trim();
}

function getOrCreateRemoteEntry(
  targetMap: Map<string, RemoteSlotPublicationInfo>,
  key: string
): RemoteSlotPublicationInfo {
  const existing = targetMap.get(key);
  if (existing) return existing;
  const fresh: RemoteSlotPublicationInfo = {
    yt: false,
    fb: false,
    ig: false,
    ytLand: false,
    ytVert: false,
    fbLand: false,
    fbVert: false,
    title: null,
    sources: [],
  };
  targetMap.set(key, fresh);
  return fresh;
}

function isVerticalFormat(format?: string, aspectRatio?: string): boolean {
  const fmt = String(format || "").trim().toLowerCase();
  const ratio = String(aspectRatio || "").trim().toLowerCase();
  return (
    ratio === "9:16" ||
    fmt.includes("vertical") ||
    fmt.includes("short") ||
    fmt.includes("reel") ||
    fmt.includes("9:16")
  );
}

function applyPlatformPublicationFlags(
  entry: RemoteSlotPublicationInfo,
  platform: string,
  format: string | undefined,
  aspectRatio: string | undefined,
  sourceLabel: string
): void {
  const plat = platform.trim().toLowerCase();
  const isVert = isVerticalFormat(format, aspectRatio);
  if (plat === "youtube") {
    entry.yt = true;
    if (isVert) entry.ytVert = true;
    else entry.ytLand = true;
  } else if (plat === "facebook") {
    entry.fb = true;
    if (isVert) entry.fbVert = true;
    else entry.fbLand = true;
  } else if (plat === "instagram") {
    entry.ig = true;
  } else {
    return;
  }
  if (!entry.sources.includes(sourceLabel)) {
    entry.sources.push(sourceLabel);
  }
}

function collectPublicationsBySlot(
  records: Partial<AuditRecordLike>[],
  sourceLabel: string,
  targetMap: Map<string, RemoteSlotPublicationInfo>
): void {
  for (const rec of records || []) {
    if (!rec || !rec.storySlug) continue;
    const slug = String(rec.storySlug).trim().toLowerCase();
    const lang = String(rec.language || "id").trim().toLowerCase();
    const key = slug + "::" + lang;
    const entry = getOrCreateRemoteEntry(targetMap, key);

    if (!entry.title) {
      const candidateTitle =
        lang === "en" ? rec.storyTitleEn || rec.storyTitleId : rec.storyTitleId || rec.storyTitleEn;
      if (candidateTitle && !isSlugTitleFallback(candidateTitle, slug)) {
        entry.title = candidateTitle;
      }
    }

    if (isPrimaryPublishedRecord(rec)) {
      applyPlatformPublicationFlags(
        entry,
        String(rec.platform || ""),
        rec.format,
        rec.aspectRatio,
        sourceLabel
      );
    }
  }
}

function collectSlotTitlesFromCalendar(
  slots: Partial<CalendarSlotLike>[],
  targetMap: Map<string, RemoteSlotPublicationInfo>
): void {
  for (const slot of slots || []) {
    if (!slot || !slot.bookSlug) continue;
    const slug = String(slot.bookSlug).trim().toLowerCase();
    const lang = String(slot.lang || "id").trim().toLowerCase();
    const key = slug + "::" + lang;
    const candidateTitle =
      lang === "en" ? slot.storyTitleEn || slot.storyTitleId : slot.storyTitleId || slot.storyTitleEn;
    if (!candidateTitle || isSlugTitleFallback(candidateTitle, slug)) continue;
    const existing = getOrCreateRemoteEntry(targetMap, key);
    if (!existing.title) {
      existing.title = candidateTitle;
    }
  }
}

function appendCacheBuster(url: string): string {
  if (!url || url.includes("?")) return url;
  return `${url}?_t=${Date.now()}`;
}

async function fetchJsonWithTimeout(
  url: string,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(appendCacheBuster(url), { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches read-only remote publication records from deployed portal snapshot and live D1 API
 * so CLI schedule checks stay accurate even before `npm run story:pull` syncs local story.json.
 */
export async function fetchRemoteSlotPublicationMap(options: {
  localAuditRecords?: Partial<AuditRecordLike>[];
  localCalendarSlots?: Partial<CalendarSlotLike>[];
  catalogApiUrl?: string;
  snapshotAuditUrl?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
} = {}): Promise<Map<string, RemoteSlotPublicationInfo>> {
  const result = new Map<string, RemoteSlotPublicationInfo>();
  const fetcher: FetchLike = options.fetcher || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 4000;
  const catalogUrl = options.catalogApiUrl ?? "https://storybook-catalog.pages.dev/api/catalog";
  const snapshotUrl = options.snapshotAuditUrl ?? "https://storybook-catalog.pages.dev/audit-data.json";

  if (options.localAuditRecords && options.localAuditRecords.length > 0) {
    collectPublicationsBySlot(options.localAuditRecords, "docs/audit-data.json", result);
  }
  if (options.localCalendarSlots && options.localCalendarSlots.length > 0) {
    collectSlotTitlesFromCalendar(options.localCalendarSlots, result);
  }

  const [catalogJson, snapshotJson] = await Promise.all([
    catalogUrl ? fetchJsonWithTimeout(catalogUrl, fetcher, timeoutMs) : Promise.resolve(null),
    snapshotUrl ? fetchJsonWithTimeout(snapshotUrl, fetcher, timeoutMs) : Promise.resolve(null),
  ]);

  if (catalogJson && Array.isArray(catalogJson.auditRecords)) {
    collectPublicationsBySlot(catalogJson.auditRecords, "pages.dev/api/catalog", result);
  }
  if (catalogJson && Array.isArray(catalogJson.calendarSlots)) {
    collectSlotTitlesFromCalendar(catalogJson.calendarSlots, result);
  }
  if (Array.isArray(snapshotJson)) {
    collectPublicationsBySlot(snapshotJson, "pages.dev/audit-data.json", result);
  }

  return result;
}

/**
 * Resolves unified multi-source publication flags across local manifest state,
 * direct D1 rows, and deployed portal snapshots to prevent duplicate uploads.
 */
export async function resolveExistingSlotPublications(options: {
  bookSlug: string;
  lang: "id" | "en" | string;
  localFlags?: LocalPublicationFlags;
  localAuditRecords?: Partial<AuditRecordLike>[];
  localCalendarSlots?: Partial<CalendarSlotLike>[];
  queryD1Publications?: (
    bookSlug: string,
    lang: string
  ) => Promise<Array<{ platform?: string; format?: string; status?: string; external_id?: string; video_url?: string }>>;
  catalogApiUrl?: string;
  snapshotAuditUrl?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
}): Promise<ResolvedSlotPublications> {
  const slugKey = String(options.bookSlug || "").trim().toLowerCase();
  const langKey = String(options.lang || "id").trim().toLowerCase();
  const slotKey = `${slugKey}::${langKey}`;

  const merged: RemoteSlotPublicationInfo = {
    yt: Boolean(options.localFlags?.yt),
    fb: Boolean(options.localFlags?.fb),
    ig: Boolean(options.localFlags?.ig),
    ytLand: Boolean(options.localFlags?.ytLand),
    ytVert: Boolean(options.localFlags?.ytVert),
    fbLand: Boolean(options.localFlags?.fbLand),
    fbVert: Boolean(options.localFlags?.fbVert),
    title: options.localFlags?.title || null,
    sources: options.localFlags && (options.localFlags.yt || options.localFlags.fb || options.localFlags.ig)
      ? ["story.json"]
      : [],
  };

  const [remoteMap, d1Rows] = await Promise.all([
    fetchRemoteSlotPublicationMap({
      localAuditRecords: options.localAuditRecords,
      localCalendarSlots: options.localCalendarSlots,
      catalogApiUrl: options.catalogApiUrl,
      snapshotAuditUrl: options.snapshotAuditUrl,
      timeoutMs: options.timeoutMs,
      fetcher: options.fetcher,
    }),
    options.queryD1Publications
      ? options.queryD1Publications(slugKey, langKey).catch(() => [])
      : Promise.resolve([]),
  ]);

  const remoteInfo = remoteMap.get(slotKey);
  if (remoteInfo) {
    merged.yt = merged.yt || remoteInfo.yt;
    merged.fb = merged.fb || remoteInfo.fb;
    merged.ig = merged.ig || remoteInfo.ig;
    merged.ytLand = merged.ytLand || remoteInfo.ytLand;
    merged.ytVert = merged.ytVert || remoteInfo.ytVert;
    merged.fbLand = merged.fbLand || remoteInfo.fbLand;
    merged.fbVert = merged.fbVert || remoteInfo.fbVert;
    if (!merged.title && remoteInfo.title) {
      merged.title = remoteInfo.title;
    }
    for (const s of remoteInfo.sources) {
      if (!merged.sources.includes(s)) merged.sources.push(s);
    }
  }

  for (const row of d1Rows || []) {
    if (!row) continue;
    const status = row.status ? String(row.status).trim().toLowerCase() : "published";
    if (status !== "published") continue;
    if (!row.external_id && !row.video_url) continue;
    applyPlatformPublicationFlags(
      merged,
      String(row.platform || ""),
      row.format,
      undefined,
      "d1:publications"
    );
  }

  return {
    ...merged,
    allPrimaryLive: Boolean(merged.yt && merged.fb && merged.ig),
  };
}
