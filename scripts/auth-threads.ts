import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import http from "http";

const META_CONFIG_PATH = path.resolve("./config/meta-config.json");

interface ThreadsProfile {
  id: string;
  username: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
}

interface ThreadsTokenResponse {
  access_token: string;
  user_id?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Exchange a short-lived token for a 60-day long-lived token
 */
async function exchangeLongLivedToken(
  shortToken: string,
  appSecret: string
): Promise<{ token: string; expiresInSeconds?: number }> {
  console.log(`🔄 Exchanging token for 60-Day Long-Lived Token via graph.threads.net...`);
  const url = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortToken)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    console.warn(`⚠️ Long-lived exchange warning: ${data.error.message} (Proceeding with provided token)`);
    return { token: shortToken };
  }

  const expiresInDays = data.expires_in ? Math.round(data.expires_in / 86400) : 60;
  console.log(`✔ Successfully acquired 60-Day Long-Lived Token! (Expires in ~${expiresInDays} days)`);
  return { token: data.access_token, expiresInSeconds: data.expires_in };
}

/**
 * Verify token against Threads API /me endpoint
 */
async function verifyProfile(accessToken: string): Promise<ThreadsProfile> {
  console.log(`🔍 Verifying token against Threads API /me...`);
  const url = `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Threads Token Verification Failed: ${data.error.message} (Code: ${data.error.code})`);
  }

  return data as ThreadsProfile;
}

/**
 * Check publishing quota
 */
async function checkPublishingLimit(userId: string, accessToken: string): Promise<void> {
  try {
    const url = `https://graph.threads.net/v1.0/${userId}/threads_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data[0]) {
      const q = data.data[0];
      console.log(`📊 Publishing Quota  : ${q.quota_usage || 0} / ${q.config?.quota_total || 250} posts used in last 24h`);
    }
  } catch {
    // optional check
  }
}

/**
 * Save token and user details to config/meta-config.json
 */
async function saveToConfig(profile: ThreadsProfile, accessToken: string, appId?: string): Promise<void> {
  let config: any = {};
  if (existsSync(META_CONFIG_PATH)) {
    try {
      config = JSON.parse(await fs.readFile(META_CONFIG_PATH, "utf-8"));
    } catch {
      config = {};
    }
  }

  config.threadsUserId = profile.id;
  config.threadsUsername = profile.username;
  config.threadsAccessToken = accessToken;
  if (appId) {
    config.threadsAppId = appId;
  }

  await fs.writeFile(META_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(`💾 Configuration updated in: ${META_CONFIG_PATH}`);
}

/**
 * Run a local HTTP server to receive OAuth callback
 */
async function runLocalOAuthServer(
  appId: string,
  appSecret: string,
  port: number = 3000
): Promise<{ token: string; userId?: string }> {
  const redirectUri = `https://localhost:${port}/auth/threads/callback`;
  const authUrl = `https://threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=threads_basic,threads_content_publish&response_type=code`;

  console.log(`\n======================================================`);
  console.log(`🌐 LOCAL OAUTH LOGIN SERVER RUNNING ON PORT ${port}`);
  console.log(`======================================================`);
  console.log(`👉 Please open the following link in your browser:`);
  console.log(`\n${authUrl}\n`);
  console.log(`⏳ Waiting for authorization callback...`);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith("/auth/threads/callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const urlObj = new URL(req.url, `http://localhost:${port}`);
        const code = urlObj.searchParams.get("code");
        const error = urlObj.searchParams.get("error");
        const errorDesc = urlObj.searchParams.get("error_description");

        if (error || !code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h2>❌ Authorization Failed</h2><p>${errorDesc || error || "No code provided"}</p>`);
          server.close();
          reject(new Error(errorDesc || error || "No code provided"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h2>🎉 Authorization Successful!</h2><p>You can close this tab and return to the terminal.</p>`);
        server.close();

        console.log(`✔ Authorization code received! Exchanging for access token...`);

        // Exchange code for short-lived token
        const exchangeParams = new URLSearchParams();
        exchangeParams.append("client_id", appId);
        exchangeParams.append("client_secret", appSecret);
        exchangeParams.append("grant_type", "authorization_code");
        exchangeParams.append("redirect_uri", redirectUri);
        exchangeParams.append("code", code.replace(/#_$/, ""));

        const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: exchangeParams.toString(),
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          throw new Error(`Code Exchange Failed: ${tokenData.error.message}`);
        }

        resolve({ token: tokenData.access_token, userId: tokenData.user_id });
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(port);
  });
}

/**
 * Main Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const inputToken = getArg("--token") || getArg("-t");
  const inputSecret = getArg("--secret") || getArg("-s") || process.env.THREADS_APP_SECRET;
  const inputAppId = getArg("--app-id") || process.env.THREADS_APP_ID;
  const isInteractive = args.includes("--login") || args.includes("--oauth");

  console.log(`\n======================================================`);
  console.log(`🔑 META THREADS TOKEN SETUP & VERIFIER`);
  console.log(`======================================================`);

  let activeToken = inputToken;

  if (isInteractive && inputAppId && inputSecret) {
    const oauthResult = await runLocalOAuthServer(inputAppId, inputSecret);
    activeToken = oauthResult.token;
  }

  if (!activeToken) {
    console.log(`❌ No token provided.`);
    console.log(`\nUsage Options:`);
    console.log(`1. Fast Setup with Token from Meta Dashboard:`);
    console.log(`   npx tsx scripts/auth-threads.ts --token <TOKEN_FROM_DASHBOARD> [--secret <APP_SECRET>]\n`);
    console.log(`2. Browser OAuth Login:`);
    console.log(`   npx tsx scripts/auth-threads.ts --login --app-id <THREADS_APP_ID> --secret <THREADS_APP_SECRET>\n`);
    process.exit(1);
  }

  // If app secret is provided, auto-upgrade to 60-day token
  if (inputSecret) {
    const exchange = await exchangeLongLivedToken(activeToken, inputSecret);
    activeToken = exchange.token;
  }

  // Verify and fetch profile
  const profile = await verifyProfile(activeToken);

  console.log(`\n🎉 THREADS ACCOUNT VERIFIED SUCCESSFULLY!`);
  console.log(`------------------------------------------------------`);
  console.log(`👤 Username        : @${profile.username}`);
  console.log(`🆔 User ID         : ${profile.id}`);
  console.log(`📝 Biography       : ${profile.threads_biography || "(empty)"}`);
  console.log(`🖼️  Profile Picture : ${profile.threads_profile_picture_url || "(none)"}`);
  console.log(`------------------------------------------------------`);

  await checkPublishingLimit(profile.id, activeToken);

  // Save to config
  await saveToConfig(profile, activeToken, inputAppId);

  console.log(`\n✨ Done! You are now ready to publish stories to Threads with:`);
  console.log(`   npm run promo:threads -- --book terlalu-banyak-suara --lang id\n`);
}

if (process.argv[1] && process.argv[1].includes("auth-threads")) {
  main().catch((err) => {
    console.error(`\n❌ Error setting up Threads token:`, err.message);
    process.exit(1);
  });
}
