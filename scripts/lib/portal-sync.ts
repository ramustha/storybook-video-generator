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
    const entry = targetMap.get(key) || {
      yt: false,
      fb: false,
      ig: false,
      title: null,
      sources: [],
    };

    if (!entry.title) {
      const candidateTitle =
        lang === "en" ? rec.storyTitleEn || rec.storyTitleId : rec.storyTitleId || rec.storyTitleEn;
      if (candidateTitle && !isSlugTitleFallback(candidateTitle, slug)) {
        entry.title = candidateTitle;
      }
    }

    if (isPrimaryPublishedRecord(rec)) {
      const platform = String(rec.platform || "").trim().toLowerCase();
      if (platform === "youtube") entry.yt = true;
      if (platform === "facebook") entry.fb = true;
      if (platform === "instagram") entry.ig = true;
      if (!entry.sources.includes(sourceLabel)) {
        entry.sources.push(sourceLabel);
      }
    }

    targetMap.set(key, entry);
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
    const existing = targetMap.get(key) || {
      yt: false,
      fb: false,
      ig: false,
      title: null,
      sources: [],
    };
    if (!existing.title) {
      existing.title = candidateTitle;
      targetMap.set(key, existing);
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
