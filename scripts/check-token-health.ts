import { existsSync, readFileSync } from "fs";
import path from "path";
import { notifyTelegramTokenRotation, TokenRotationIssue } from "./notify-telegram";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_OPENROUTER_LOW_CREDIT_USD = 0.25;

export interface TokenHealthEndpoints {
  youtubeTokenUrl?: string;
  metaGraphBase?: string;
  threadsGraphBase?: string;
  geminiBase?: string;
  groqBase?: string;
  openRouterBase?: string;
  cloudflareBase?: string;
}

export interface TokenHealthCheckOptions {
  env?: Record<string, string | undefined>;
  endpoints?: TokenHealthEndpoints;
  requireAllKeys?: boolean;
  nowMs?: number;
  openRouterLowCreditUsd?: number;
}

interface ResolvedContext {
  env?: Record<string, string | undefined>;
  endpoints: Required<TokenHealthEndpoints>;
  requireAllKeys: boolean;
  nowMs: number;
  openRouterLowCreditUsd: number;
}

function resolveContext(options: TokenHealthCheckOptions = {}): ResolvedContext {
  return {
    env: options.env,
    endpoints: {
      youtubeTokenUrl: options.endpoints?.youtubeTokenUrl ?? "https://oauth2.googleapis.com/token",
      metaGraphBase: options.endpoints?.metaGraphBase ?? "https://graph.facebook.com/v21.0",
      threadsGraphBase: options.endpoints?.threadsGraphBase ?? "https://graph.threads.net/v1.0",
      geminiBase: options.endpoints?.geminiBase ?? "https://generativelanguage.googleapis.com/v1beta",
      groqBase: options.endpoints?.groqBase ?? "https://api.groq.com/openai/v1",
      openRouterBase: options.endpoints?.openRouterBase ?? "https://openrouter.ai/api/v1",
      cloudflareBase: options.endpoints?.cloudflareBase ?? "https://api.cloudflare.com/client/v4",
    },
    requireAllKeys: options.requireAllKeys ?? process.env.CI === "true",
    nowMs: options.nowMs ?? Date.now(),
    openRouterLowCreditUsd: options.openRouterLowCreditUsd ?? DEFAULT_OPENROUTER_LOW_CREDIT_USD,
  };
}

function loadEnvFallback(key: string, envOverride?: Record<string, string | undefined>): string | undefined {
  if (envOverride) {
    const val = envOverride[key]?.trim();
    return val || undefined;
  }
  const direct = process.env[key]?.trim();
  if (direct) return direct;
  const envPath = path.resolve("./.env");
  if (!existsSync(envPath)) return undefined;
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function checkYouTubeToken(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const clientId = loadEnvFallback("YOUTUBE_CLIENT_ID", ctx.env);
  const clientSecret = loadEnvFallback("YOUTUBE_CLIENT_SECRET", ctx.env);
  const refreshToken = loadEnvFallback("YOUTUBE_REFRESH_TOKEN", ctx.env);

  if (!clientId || !clientSecret || !refreshToken) {
    console.log("⏭️ YouTube token check skipped (credentials not configured in env).");
    return;
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch(ctx.endpoints.youtubeTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data?.access_token) {
      if (res.status >= 500) {
        console.warn(`⚠️ YouTube token check transient error (HTTP ${res.status}).`);
        return;
      }
      issues.push({
        platform: "YouTube OAuth",
        status: "EXPIRED",
        detail: `${data?.error || res.status}: ${data?.error_description || "Refresh token rejected"}`,
        actionCommand: "npm run auth:youtube",
      });
      return;
    }
    console.log("✔ YouTube OAuth refresh token is valid.");
  } catch (err: any) {
    console.warn(`⚠️ YouTube token check network error: ${err.message}`);
  }
}

async function checkMetaToken(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const token =
    loadEnvFallback("META_ACCESS_TOKEN", ctx.env) ||
    loadEnvFallback("PERSONAL_META_ACCESS_TOKEN", ctx.env);
  const appId =
    loadEnvFallback("META_APP_ID", ctx.env) || loadEnvFallback("PERSONAL_META_APP_ID", ctx.env);
  const appSecret =
    loadEnvFallback("META_APP_SECRET", ctx.env) ||
    loadEnvFallback("PERSONAL_META_APP_SECRET", ctx.env);

  if (!token) {
    console.log("⏭️ Meta token check skipped (META_ACCESS_TOKEN not configured).");
    return;
  }

  try {
    if (appId && appSecret) {
      const url = `${ctx.endpoints.metaGraphBase}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
      const json = await parseJsonSafe(res);
      const info = json?.data;
      if (res.status >= 500) {
        console.warn(`⚠️ Meta token check transient error (HTTP ${res.status}).`);
        return;
      }
      if (!res.ok || !info || info.is_valid === false) {
        issues.push({
          platform: "Meta (Facebook & Instagram)",
          status: "EXPIRED",
          detail: info?.error?.message || json?.error?.message || `HTTP ${res.status}`,
          actionCommand: "npm run refresh:meta",
        });
        return;
      }

      const expCandidates = [info.expires_at, info.data_access_expires_at].filter(
        (v: any) => typeof v === "number" && v > 0
      );
      if (expCandidates.length > 0) {
        const soonestSec = Math.min(...expCandidates);
        const daysLeft = (soonestSec * 1000 - ctx.nowMs) / 86400000;
        if (daysLeft <= 0) {
          issues.push({
            platform: "Meta (Facebook & Instagram)",
            status: "EXPIRED",
            detail: `Token expired on ${new Date(soonestSec * 1000).toISOString().slice(0, 10)}`,
            actionCommand: "npm run refresh:meta",
          });
          return;
        }
        if (daysLeft <= 7) {
          issues.push({
            platform: "Meta (Facebook & Instagram)",
            status: "EXPIRING_SOON",
            detail: `Expires in ${Math.ceil(daysLeft)} day(s) (${new Date(soonestSec * 1000).toISOString().slice(0, 10)})`,
            actionCommand: "npm run refresh:meta",
          });
          return;
        }
      }
      console.log("✔ Meta (Facebook & Instagram) token is valid.");
      return;
    }

    const res = await fetch(
      `${ctx.endpoints.metaGraphBase}/me?access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
    );
    const json = await parseJsonSafe(res);
    if (res.status >= 500) {
      console.warn(`⚠️ Meta token check transient error (HTTP ${res.status}).`);
      return;
    }
    if (!res.ok || json?.error) {
      issues.push({
        platform: "Meta (Facebook & Instagram)",
        status: "EXPIRED",
        detail: json?.error?.message || `HTTP ${res.status}`,
        actionCommand: "npm run refresh:meta",
      });
      return;
    }
    console.log("✔ Meta (Facebook & Instagram) token is valid.");
  } catch (err: any) {
    console.warn(`⚠️ Meta token check network error: ${err.message}`);
  }
}

async function checkThreadsToken(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const token =
    loadEnvFallback("THREADS_ACCESS_TOKEN", ctx.env) ||
    loadEnvFallback("PERSONAL_THREADS_ACCESS_TOKEN", ctx.env);
  if (!token) {
    console.log("⏭️ Threads token check skipped (THREADS_ACCESS_TOKEN not configured).");
    return;
  }

  try {
    const res = await fetch(
      `${ctx.endpoints.threadsGraphBase}/me?fields=id,username&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
    );
    const json = await parseJsonSafe(res);
    if (res.status >= 500) {
      console.warn(`⚠️ Threads token check transient error (HTTP ${res.status}).`);
      return;
    }
    if (!res.ok || json?.error) {
      issues.push({
        platform: "Threads",
        status: "EXPIRED",
        detail: json?.error?.message || `HTTP ${res.status}`,
        actionCommand: "npm run auth:threads",
      });
      return;
    }
    console.log(`✔ Threads token is valid (@${json?.username || json?.id || "ok"}).`);
  } catch (err: any) {
    console.warn(`⚠️ Threads token check network error: ${err.message}`);
  }
}

async function checkGeminiKey(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const apiKey =
    loadEnvFallback("GEMINI_API_KEY", ctx.env) ||
    loadEnvFallback("PERSONAL_GEMINI_API_KEY", ctx.env);

  if (!apiKey) {
    if (ctx.requireAllKeys) {
      issues.push({
        platform: "Google Gemini AI (GEMINI_API_KEY)",
        status: "MISSING",
        detail: "GEMINI_API_KEY / PERSONAL_GEMINI_API_KEY is not configured.",
        actionCommand: "Update PERSONAL_GEMINI_API_KEY & GEMINI_API_KEY in .env / GitHub Secrets",
      });
    } else {
      console.log("⏭️ Gemini AI key check skipped (GEMINI_API_KEY not configured).");
    }
    return;
  }

  try {
    const res = await fetch(`${ctx.endpoints.geminiBase}/models?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const json = await parseJsonSafe(res);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      issues.push({
        platform: "Google Gemini AI (GEMINI_API_KEY)",
        status: "INVALID",
        detail: json?.error?.message || `HTTP ${res.status} (API key rejected or revoked)`,
        actionCommand: "Rotate GEMINI_API_KEY & PERSONAL_GEMINI_API_KEY in AI Studio / GitHub Secrets",
      });
      return;
    }
    if (res.status === 429) {
      issues.push({
        platform: "Google Gemini AI (GEMINI_API_KEY)",
        status: "QUOTA_EXCEEDED",
        detail: json?.error?.message || "HTTP 429 (Gemini API quota or rate limit exceeded)",
        actionCommand: "Check Google AI Studio billing/quota or rotate GEMINI_API_KEY",
      });
      return;
    }
    if (!res.ok) {
      console.warn(`⚠️ Gemini API key check transient error (HTTP ${res.status}).`);
      return;
    }
    console.log("✔ Google Gemini API key is valid.");
  } catch (err: any) {
    console.warn(`⚠️ Gemini API key check network error: ${err.message}`);
  }
}

async function checkGroqKey(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const apiKey =
    loadEnvFallback("GROQ_API_KEY", ctx.env) ||
    loadEnvFallback("PERSONAL_GROQ_API_KEY", ctx.env);

  if (!apiKey) {
    if (ctx.requireAllKeys) {
      issues.push({
        platform: "Groq AI (GROQ_API_KEY)",
        status: "MISSING",
        detail: "GROQ_API_KEY / PERSONAL_GROQ_API_KEY is not configured.",
        actionCommand: "Update PERSONAL_GROQ_API_KEY & GROQ_API_KEY in .env / GitHub Secrets",
      });
    } else {
      console.log("⏭️ Groq AI key check skipped (GROQ_API_KEY not configured).");
    }
    return;
  }

  try {
    const res = await fetch(`${ctx.endpoints.groqBase}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const json = await parseJsonSafe(res);
    if (res.status === 401 || res.status === 403) {
      issues.push({
        platform: "Groq AI (GROQ_API_KEY)",
        status: "INVALID",
        detail: json?.error?.message || `HTTP ${res.status} (API key rejected or revoked)`,
        actionCommand: "Rotate GROQ_API_KEY & PERSONAL_GROQ_API_KEY in Groq Console / GitHub Secrets",
      });
      return;
    }
    if (res.status === 429) {
      issues.push({
        platform: "Groq AI (GROQ_API_KEY)",
        status: "QUOTA_EXCEEDED",
        detail: json?.error?.message || "HTTP 429 (Groq quota or rate limit exceeded)",
        actionCommand: "Check Groq Console quota or rotate GROQ_API_KEY",
      });
      return;
    }
    if (!res.ok) {
      console.warn(`⚠️ Groq API key check transient error (HTTP ${res.status}).`);
      return;
    }
    console.log("✔ Groq API key is valid.");
  } catch (err: any) {
    console.warn(`⚠️ Groq API key check network error: ${err.message}`);
  }
}

async function checkOpenRouterKey(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const apiKey = loadEnvFallback("OPENROUTER_API_KEY", ctx.env);

  if (!apiKey) {
    if (ctx.requireAllKeys) {
      issues.push({
        platform: "OpenRouter AI (OPENROUTER_API_KEY)",
        status: "MISSING",
        detail: "OPENROUTER_API_KEY is not configured.",
        actionCommand: "Set OPENROUTER_API_KEY in .env / GitHub Secrets",
      });
    } else {
      console.log("⏭️ OpenRouter AI key check skipped (OPENROUTER_API_KEY not configured).");
    }
    return;
  }

  try {
    const res = await fetch(`${ctx.endpoints.openRouterBase}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const json = await parseJsonSafe(res);
    if (res.status === 401 || res.status === 403) {
      issues.push({
        platform: "OpenRouter AI (OPENROUTER_API_KEY)",
        status: "INVALID",
        detail: json?.error?.message || `HTTP ${res.status} (API key rejected or revoked)`,
        actionCommand: "Rotate OPENROUTER_API_KEY in openrouter.ai/keys & GitHub Secrets",
      });
      return;
    }
    if (res.status === 402 || res.status === 429) {
      issues.push({
        platform: "OpenRouter AI (OPENROUTER_API_KEY)",
        status: "QUOTA_EXCEEDED",
        detail: json?.error?.message || `HTTP ${res.status} (OpenRouter credits/quota exhausted)`,
        actionCommand: "Top up OpenRouter credits or rotate OPENROUTER_API_KEY",
      });
      return;
    }
    if (!res.ok) {
      console.warn(`⚠️ OpenRouter API key check transient error (HTTP ${res.status}).`);
      return;
    }

    const data = json?.data;
    if (typeof data?.limit === "number" && data.limit > 0 && typeof data?.limit_remaining === "number") {
      if (data.limit_remaining <= 0) {
        issues.push({
          platform: "OpenRouter AI (OPENROUTER_API_KEY)",
          status: "QUOTA_EXCEEDED",
          detail: `Key credit limit exhausted ($0.00 remaining of $${data.limit.toFixed(2)})`,
          actionCommand: "Top up OpenRouter credits or raise key limit in openrouter.ai/keys",
        });
        return;
      }
      if (data.limit_remaining <= ctx.openRouterLowCreditUsd) {
        issues.push({
          platform: "OpenRouter AI (OPENROUTER_API_KEY)",
          status: "LOW_CREDIT",
          detail: `Remaining credit is low ($${data.limit_remaining.toFixed(2)} of $${data.limit.toFixed(2)})`,
          actionCommand: "Top up OpenRouter credits in openrouter.ai/credits",
        });
        return;
      }
      console.log(
        `✔ OpenRouter API key is valid ($${data.limit_remaining.toFixed(2)} / $${data.limit.toFixed(2)} remaining).`
      );
      return;
    }
    console.log(
      `✔ OpenRouter API key is valid (${data?.is_free_tier ? "free tier" : "unlimited key limit"}).`
    );
  } catch (err: any) {
    console.warn(`⚠️ OpenRouter API key check network error: ${err.message}`);
  }
}

async function checkCloudflareToken(issues: TokenRotationIssue[], ctx: ResolvedContext) {
  const token = loadEnvFallback("CLOUDFLARE_API_TOKEN", ctx.env);
  const accountId = loadEnvFallback("CLOUDFLARE_ACCOUNT_ID", ctx.env);

  if (!token) {
    if (ctx.requireAllKeys) {
      issues.push({
        platform: "Cloudflare API Token (CLOUDFLARE_API_TOKEN)",
        status: "MISSING",
        detail: "CLOUDFLARE_API_TOKEN is not configured.",
        actionCommand: "Set CLOUDFLARE_API_TOKEN in Cloudflare Dashboard & GitHub Secrets",
      });
    } else {
      console.log("⏭️ Cloudflare API token check skipped (CLOUDFLARE_API_TOKEN not configured).");
    }
    return;
  }

  try {
    let res = await fetch(`${ctx.endpoints.cloudflareBase}/user/tokens/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    let json = await parseJsonSafe(res);

    // Account-owned Cloudflare tokens must verify against /accounts/:id/tokens/verify.
    if ((res.status === 401 || res.status === 403 || json?.success === false) && accountId) {
      const acctRes = await fetch(
        `${ctx.endpoints.cloudflareBase}/accounts/${encodeURIComponent(accountId)}/tokens/verify`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        }
      );
      const acctJson = await parseJsonSafe(acctRes);
      if (acctRes.ok && acctJson?.success) {
        res = acctRes;
        json = acctJson;
      }
    }

    if (res.status >= 500) {
      console.warn(`⚠️ Cloudflare API token check transient error (HTTP ${res.status}).`);
      return;
    }
    if (res.status === 401 || res.status === 403 || !res.ok || json?.success === false) {
      const cfMsg = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      issues.push({
        platform: "Cloudflare API Token (CLOUDFLARE_API_TOKEN)",
        status: "INVALID",
        detail: cfMsg,
        actionCommand: "Rotate CLOUDFLARE_API_TOKEN in Cloudflare Dashboard & GitHub Secrets",
      });
      return;
    }

    const result = json?.result;
    if (result?.status && result.status !== "active") {
      issues.push({
        platform: "Cloudflare API Token (CLOUDFLARE_API_TOKEN)",
        status: result.status === "expired" ? "EXPIRED" : "INVALID",
        detail: `Cloudflare token status is "${result.status}"`,
        actionCommand: "Rotate CLOUDFLARE_API_TOKEN in Cloudflare Dashboard & GitHub Secrets",
      });
      return;
    }

    if (typeof result?.expires_on === "string" && result.expires_on.trim()) {
      const expMs = Date.parse(result.expires_on);
      if (!Number.isNaN(expMs)) {
        const daysLeft = (expMs - ctx.nowMs) / 86400000;
        if (daysLeft <= 0) {
          issues.push({
            platform: "Cloudflare API Token (CLOUDFLARE_API_TOKEN)",
            status: "EXPIRED",
            detail: `Token expired on ${result.expires_on.slice(0, 10)}`,
            actionCommand: "Rotate CLOUDFLARE_API_TOKEN in Cloudflare Dashboard & GitHub Secrets",
          });
          return;
        }
        if (daysLeft <= 7) {
          issues.push({
            platform: "Cloudflare API Token (CLOUDFLARE_API_TOKEN)",
            status: "EXPIRING_SOON",
            detail: `Expires in ${Math.ceil(daysLeft)} day(s) (${result.expires_on.slice(0, 10)})`,
            actionCommand: "Rotate CLOUDFLARE_API_TOKEN in Cloudflare Dashboard & GitHub Secrets",
          });
          return;
        }
      }
    }
    console.log("✔ Cloudflare API token is valid.");
  } catch (err: any) {
    console.warn(`⚠️ Cloudflare API token check network error: ${err.message}`);
  }
}

export async function runTokenHealthCheck(
  dryRun = false,
  options: TokenHealthCheckOptions = {}
): Promise<TokenRotationIssue[]> {
  console.log("\n🔑 Checking OAuth, AI provider & Cloudflare token health...");
  const ctx = resolveContext(options);
  const issues: TokenRotationIssue[] = [];
  await checkYouTubeToken(issues, ctx);
  await checkMetaToken(issues, ctx);
  await checkThreadsToken(issues, ctx);
  await checkGeminiKey(issues, ctx);
  await checkGroqKey(issues, ctx);
  await checkOpenRouterKey(issues, ctx);
  await checkCloudflareToken(issues, ctx);

  if (issues.length > 0) {
    console.warn(`⚠️ Found ${issues.length} credential issue(s) requiring attention!`);
    await notifyTelegramTokenRotation(issues, dryRun);
  } else {
    console.log("✔ All configured OAuth, AI provider & Cloudflare credentials are healthy.");
  }
  return issues;
}

if (process.argv[1]?.includes("check-token-health")) {
  const dryRun = process.argv.includes("--dry-run");
  const strict = process.argv.includes("--strict");
  runTokenHealthCheck(dryRun, { requireAllKeys: strict || process.env.CI === "true" }).catch(
    (err) => {
      console.error("❌ Token health check error:", err);
      process.exit(0);
    }
  );
}
