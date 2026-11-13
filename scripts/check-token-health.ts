import { existsSync, readFileSync } from "fs";
import path from "path";
import { notifyTelegramTokenRotation, TokenRotationIssue } from "./notify-telegram";

function loadEnvFallback(key: string): string | undefined {
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

async function checkYouTubeToken(issues: TokenRotationIssue[]) {
  const clientId = loadEnvFallback("YOUTUBE_CLIENT_ID");
  const clientSecret = loadEnvFallback("YOUTUBE_CLIENT_SECRET");
  const refreshToken = loadEnvFallback("YOUTUBE_REFRESH_TOKEN");

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
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data: any = await res.json();
    if (!res.ok || !data.access_token) {
      issues.push({
        platform: "YouTube OAuth",
        status: "EXPIRED",
        detail: `${data.error || res.status}: ${data.error_description || "Refresh token rejected"}`,
        actionCommand: "npm run auth:youtube",
      });
      return;
    }
    console.log("✔ YouTube OAuth refresh token is valid.");
  } catch (err: any) {
    console.warn(`⚠️ YouTube token check network error: ${err.message}`);
  }
}

async function checkMetaToken(issues: TokenRotationIssue[]) {
  const token = loadEnvFallback("META_ACCESS_TOKEN") || loadEnvFallback("PERSONAL_META_ACCESS_TOKEN");
  const appId = loadEnvFallback("META_APP_ID") || loadEnvFallback("PERSONAL_META_APP_ID");
  const appSecret = loadEnvFallback("META_APP_SECRET") || loadEnvFallback("PERSONAL_META_APP_SECRET");

  if (!token) {
    console.log("⏭️ Meta token check skipped (META_ACCESS_TOKEN not configured).");
    return;
  }

  try {
    if (appId && appSecret) {
      const url = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
      const res = await fetch(url);
      const json: any = await res.json();
      const info = json?.data;
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
        const daysLeft = (soonestSec * 1000 - Date.now()) / 86400000;
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

    const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
    const json: any = await res.json();
    if (!res.ok || json.error) {
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

async function checkThreadsToken(issues: TokenRotationIssue[]) {
  const token = loadEnvFallback("THREADS_ACCESS_TOKEN") || loadEnvFallback("PERSONAL_THREADS_ACCESS_TOKEN");
  if (!token) {
    console.log("⏭️ Threads token check skipped (THREADS_ACCESS_TOKEN not configured).");
    return;
  }

  try {
    const res = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`
    );
    const json: any = await res.json();
    if (!res.ok || json.error) {
      issues.push({
        platform: "Threads",
        status: "EXPIRED",
        detail: json?.error?.message || `HTTP ${res.status}`,
        actionCommand: "npm run auth:threads",
      });
      return;
    }
    console.log(`✔ Threads token is valid (@${json.username || json.id}).`);
  } catch (err: any) {
    console.warn(`⚠️ Threads token check network error: ${err.message}`);
  }
}

export async function runTokenHealthCheck(dryRun = false): Promise<TokenRotationIssue[]> {
  console.log("\n🔑 Checking OAuth & social API token health...");
  const issues: TokenRotationIssue[] = [];
  await checkYouTubeToken(issues);
  await checkMetaToken(issues);
  await checkThreadsToken(issues);

  if (issues.length > 0) {
    console.warn(`⚠️ Found ${issues.length} token issue(s) requiring rotation!`);
    await notifyTelegramTokenRotation(issues, dryRun);
  } else {
    console.log("✔ All configured OAuth & social tokens are healthy.");
  }
  return issues;
}

if (process.argv[1]?.includes("check-token-health")) {
  const dryRun = process.argv.includes("--dry-run");
  runTokenHealthCheck(dryRun).catch((err) => {
    console.error("❌ Token health check error:", err);
    process.exit(0);
  });
}
