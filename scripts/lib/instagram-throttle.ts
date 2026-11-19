import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadR2Config } from "../manage-story-storage";

export type InstagramPublishKind = "reel" | "feed" | "carousel";
export type InstagramAnnouncementMode = "off" | "wave1-only" | "all";

export interface InstagramPublishEntry {
  publishedAt: string;
  kind: InstagramPublishKind;
  bookSlug?: string;
  mediaId?: string;
}

export interface InstagramThrottleState {
  blockedUntil?: string;
  blockReason?: string;
  lastBlockedAt?: string;
  history: InstagramPublishEntry[];
  updatedAt?: string;
}

export interface InstagramThrottlePolicy {
  maxPostsPerDay: number;
  minIntervalMinutes: number;
  blockCooldownHours: number;
  announcementMode: InstagramAnnouncementMode;
}

export interface InstagramThrottleDecision {
  allowed: boolean;
  reason?: "cooldown_2207051" | "daily_cap" | "min_interval";
  message: string;
  todayCount: number;
  maxPostsPerDay: number;
  nextAllowedAt?: string;
}

const THROTTLE_R2_KEY = "system/instagram-throttle.json";

export function getInstagramThrottlePolicy(): InstagramThrottlePolicy {
  const maxPostsPerDay = Math.max(1, Number(process.env.INSTAGRAM_MAX_POSTS_PER_DAY || 2));
  const minIntervalMinutes = Math.max(0, Number(process.env.INSTAGRAM_MIN_INTERVAL_MINUTES || 240));
  const blockCooldownHours = Math.max(1, Number(process.env.INSTAGRAM_BLOCK_COOLDOWN_HOURS || 48));
  const rawMode = (process.env.INSTAGRAM_ANNOUNCEMENT_MODE || "off").toLowerCase().trim();
  const announcementMode: InstagramAnnouncementMode =
    rawMode === "all" || rawMode === "wave1-only" ? rawMode : "off";

  return {
    maxPostsPerDay,
    minIntervalMinutes,
    blockCooldownHours,
    announcementMode,
  };
}

export function shouldAllowInstagramAnnouncement(
  wave: "dailyLineup" | "wave2" | "wave3" | "motion",
  mode: InstagramAnnouncementMode = getInstagramThrottlePolicy().announcementMode
): boolean {
  if (mode === "all") return true;
  if (mode === "wave1-only") return wave === "dailyLineup";
  return false;
}

export function isInstagramActionBlockedError(errOrObj: unknown): boolean {
  if (!errOrObj) return false;
  if (typeof errOrObj === "object") {
    const obj = errOrObj as Record<string, any>;
    if (obj.error_subcode === 2207051 || obj.code === 4) return true;
    if (obj.error && isInstagramActionBlockedError(obj.error)) return true;
  }
  const text =
    errOrObj instanceof Error
      ? errOrObj.message
      : typeof errOrObj === "string"
      ? errOrObj
      : JSON.stringify(errOrObj);
  return /2207051|Action is blocked|restrict certain activity to protect our community|Application request limit reached/i.test(
    text
  );
}

function getWibDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function evaluateInstagramThrottle(
  state: InstagramThrottleState,
  policy: InstagramThrottlePolicy = getInstagramThrottlePolicy(),
  now: Date = new Date()
): InstagramThrottleDecision {
  const nowMs = now.getTime();
  const todayWib = getWibDateString(now);

  const history = Array.isArray(state.history) ? state.history : [];
  const todayEntries = history.filter((e) => {
    const d = new Date(e.publishedAt);
    return !Number.isNaN(d.getTime()) && getWibDateString(d) === todayWib;
  });

  if (state.blockedUntil) {
    const blockedUntilMs = new Date(state.blockedUntil).getTime();
    if (!Number.isNaN(blockedUntilMs) && nowMs < blockedUntilMs) {
      const remainingHrs = ((blockedUntilMs - nowMs) / 3600_000).toFixed(1);
      return {
        allowed: false,
        reason: "cooldown_2207051",
        message: `Instagram action-block cooldown active until ${state.blockedUntil} (~${remainingHrs}h remaining; reason: ${state.blockReason || "Meta 2207051"}).`,
        todayCount: todayEntries.length,
        maxPostsPerDay: policy.maxPostsPerDay,
        nextAllowedAt: state.blockedUntil,
      };
    }
  }

  if (todayEntries.length >= policy.maxPostsPerDay) {
    return {
      allowed: false,
      reason: "daily_cap",
      message: `Instagram daily throttle cap reached (${todayEntries.length}/${policy.maxPostsPerDay} posts today in WIB).`,
      todayCount: todayEntries.length,
      maxPostsPerDay: policy.maxPostsPerDay,
    };
  }

  if (policy.minIntervalMinutes > 0 && history.length > 0) {
    const sorted = [...history]
      .map((e) => new Date(e.publishedAt).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => b - a);
    const lastMs = sorted[0];
    if (lastMs !== undefined) {
      const elapsedMin = (nowMs - lastMs) / 60_000;
      if (elapsedMin < policy.minIntervalMinutes) {
        const nextAllowedAt = new Date(lastMs + policy.minIntervalMinutes * 60_000).toISOString();
        const waitMin = Math.ceil(policy.minIntervalMinutes - elapsedMin);
        return {
          allowed: false,
          reason: "min_interval",
          message: `Instagram minimum spacing active (${Math.floor(elapsedMin)}m elapsed < ${policy.minIntervalMinutes}m minimum; wait ~${waitMin}m until ${nextAllowedAt}).`,
          todayCount: todayEntries.length,
          maxPostsPerDay: policy.maxPostsPerDay,
          nextAllowedAt,
        };
      }
    }
  }

  return {
    allowed: true,
    message: `OK (${todayEntries.length}/${policy.maxPostsPerDay} today)`,
    todayCount: todayEntries.length,
    maxPostsPerDay: policy.maxPostsPerDay,
  };
}

async function getThrottleClient(): Promise<{ s3: S3Client; bucket: string } | null> {
  try {
    const r2 = await loadR2Config();
    const s3 = new S3Client({
      region: "auto",
      endpoint: r2.endpoint,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });
    return { s3, bucket: r2.bucketName };
  } catch {
    return null;
  }
}

export async function loadInstagramThrottleState(): Promise<InstagramThrottleState> {
  const client = await getThrottleClient();
  if (!client) return { history: [] };
  try {
    const res = await client.s3.send(
      new GetObjectCommand({ Bucket: client.bucket, Key: THROTTLE_R2_KEY })
    );
    const body = await res.Body?.transformToString();
    if (!body) return { history: [] };
    const parsed = JSON.parse(body);
    return {
      blockedUntil: parsed.blockedUntil,
      blockReason: parsed.blockReason,
      lastBlockedAt: parsed.lastBlockedAt,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { history: [] };
  }
}

export async function saveInstagramThrottleState(state: InstagramThrottleState): Promise<void> {
  const client = await getThrottleClient();
  if (!client) return;
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;
  const prunedHistory = (state.history || []).filter((e) => {
    const t = new Date(e.publishedAt).getTime();
    return !Number.isNaN(t) && t >= sevenDaysAgo;
  });
  const payload: InstagramThrottleState = {
    ...state,
    history: prunedHistory,
    updatedAt: new Date().toISOString(),
  };
  await client.s3.send(
    new PutObjectCommand({
      Bucket: client.bucket,
      Key: THROTTLE_R2_KEY,
      Body: JSON.stringify(payload, null, 2),
      ContentType: "application/json",
    })
  );
}

export async function checkInstagramPublishAllowed(): Promise<InstagramThrottleDecision> {
  if (process.env.INSTAGRAM_BYPASS_THROTTLE === "true") {
    return {
      allowed: true,
      message: "Throttle bypassed via INSTAGRAM_BYPASS_THROTTLE=true",
      todayCount: 0,
      maxPostsPerDay: getInstagramThrottlePolicy().maxPostsPerDay,
    };
  }
  const state = await loadInstagramThrottleState();
  return evaluateInstagramThrottle(state);
}

export async function recordInstagramPublishSuccess(entry: {
  kind: InstagramPublishKind;
  bookSlug?: string;
  mediaId?: string;
}): Promise<void> {
  try {
    const state = await loadInstagramThrottleState();
    state.history = [
      ...(state.history || []),
      {
        publishedAt: new Date().toISOString(),
        kind: entry.kind,
        bookSlug: entry.bookSlug,
        mediaId: entry.mediaId,
      },
    ];
    await saveInstagramThrottleState(state);
  } catch (err: any) {
    console.warn("⚠️ Could not update Instagram throttle history in R2:", err.message);
  }
}

export async function recordInstagramActionBlock(reason: string, cooldownHours?: number): Promise<string> {
  const policy = getInstagramThrottlePolicy();
  const hours = cooldownHours ?? policy.blockCooldownHours;
  const blockedUntil = new Date(Date.now() + hours * 3600_000).toISOString();
  try {
    const state = await loadInstagramThrottleState();
    state.blockedUntil = blockedUntil;
    state.blockReason = reason.slice(0, 240);
    state.lastBlockedAt = new Date().toISOString();
    await saveInstagramThrottleState(state);
  } catch (err: any) {
    console.warn("⚠️ Could not save Instagram action-block cooldown to R2:", err.message);
  }
  return blockedUntil;
}
