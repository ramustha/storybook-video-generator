import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import { spawn } from "child_process";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  appId: string;
  redirectUri: string;
  scopes?: string[];
}

interface TikTokToken {
  open_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp ms
  refresh_expires_at: number; // Unix timestamp ms
  scope: string;
  token_type: string;
  user?: {
    display_name?: string;
    avatar_url?: string;
    username?: string;
  };
}

interface R2Config {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

// 1. Configuration & Env Loaders
function loadEnv() {
  if (existsSync(".env")) {
    const envContent = readFileSync(".env", "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...parts] = trimmed.split("=");
        const val = parts.join("=").trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
}

async function loadTikTokConfig(): Promise<TikTokConfig> {
  loadEnv();
  const configPath = path.resolve("./config/tiktok-config.json");
  let fileConfig: Partial<TikTokConfig> = {};

  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    } catch (e) {}
  }

  const clientKey = fileConfig.clientKey || process.env.PERSONAL_TIKTOK_CLIENT_KEY || "";
  const clientSecret = fileConfig.clientSecret || process.env.PERSONAL_TIKTOK_CLIENT_SECRET || "";
  const appId = fileConfig.appId || process.env.PERSONAL_TIKTOK_APP_ID || "";
  const redirectUri =
    fileConfig.redirectUri || process.env.TIKTOK_REDIRECT_URI || "http://localhost:3000/oauth/tiktok/callback";

  if (!clientKey || !clientSecret) {
    throw new Error(
      "Missing TikTok credentials. Please set PERSONAL_TIKTOK_CLIENT_KEY and PERSONAL_TIKTOK_CLIENT_SECRET in .env or config/tiktok-config.json."
    );
  }

  return {
    clientKey,
    clientSecret,
    appId,
    redirectUri,
    scopes: fileConfig.scopes || ["user.info.basic", "video.publish"],
  };
}

async function loadTikTokToken(): Promise<TikTokToken | null> {
  const tokenPath = path.resolve("./config/tiktok-token.json");
  if (!existsSync(tokenPath)) return null;
  try {
    const raw = await fs.readFile(tokenPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function saveTikTokToken(token: TikTokToken) {
  const tokenPath = path.resolve("./config/tiktok-token.json");
  await fs.writeFile(tokenPath, JSON.stringify(token, null, 2), "utf-8");
}

async function loadR2Config(): Promise<R2Config> {
  const configPath = path.resolve("./config/r2-config.json");
  if (!existsSync(configPath)) {
    throw new Error(`R2 configuration not found at ${configPath}.`);
  }
  const raw = await fs.readFile(configPath, "utf-8");
  return JSON.parse(raw);
}

// 2. PKCE Helpers
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// 3. User Profile Fetcher
async function fetchTikTokUserInfo(accessToken: string): Promise<any> {
  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const data = await res.json();
    if (data.data?.user) {
      return data.data.user;
    }
  } catch (e) {}
  return null;
}

// 4. Token Refresh
async function ensureValidAccessToken(config: TikTokConfig): Promise<string> {
  let token = await loadTikTokToken();
  if (!token) {
    throw new Error("No TikTok token found. Please run: npm run upload:tiktok -- --login");
  }

  // Check if token expires within 5 minutes
  const now = Date.now();
  if (token.expires_at && now > token.expires_at - 300000) {
    console.log("🔄 TikTok access token expired or expiring soon. Refreshing token...");
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    });

    const data = await res.json();
    if (data.error && data.error !== "ok") {
      throw new Error(`Failed to refresh TikTok token: ${data.error_description || JSON.stringify(data.error)}`);
    }

    const payload = data.data || data;
    token.access_token = payload.access_token;
    token.refresh_token = payload.refresh_token || token.refresh_token;
    token.expires_at = now + (payload.expires_in || 86400) * 1000;
    if (payload.refresh_expires_in) {
      token.refresh_expires_at = now + payload.refresh_expires_in * 1000;
    }

    await saveTikTokToken(token);
    console.log("✔ TikTok access token refreshed successfully!");
  }

  return token.access_token;
}

// 5. Interactive OAuth PKCE Login Flow
async function loginTikTok(options: { manualCode?: string; redirectUri?: string }) {
  const config = await loadTikTokConfig();
  const redirectUri = options.redirectUri || config.redirectUri;

  const urlObj = new URL(redirectUri);
  const port = parseInt(urlObj.port) || 3000;
  const callbackPath = urlObj.pathname || "/oauth/tiktok/callback";

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  const scopes = (config.scopes || ["user.info.basic", "video.publish"]).join(",");
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${config.clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  // If user already passed --code
  if (options.manualCode) {
    await exchangeCodeForToken(config, options.manualCode, redirectUri, codeVerifier);
    return;
  }

  console.log("\n=======================================================");
  console.log("       TikTok Developer OAuth 2.0 PKCE Login           ");
  console.log("=======================================================");
  console.log(`Redirect URI: ${redirectUri}`);
  console.log(`Port:         ${port}`);
  console.log(`Scopes:       ${scopes}`);
  console.log("=======================================================\n");

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "", `http://localhost:${port}`);
        if (reqUrl.pathname === callbackPath) {
          const code = reqUrl.searchParams.get("code");
          const returnedState = reqUrl.searchParams.get("state");
          const error = reqUrl.searchParams.get("error");
          const errorDesc = reqUrl.searchParams.get("error_description");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h2 style="color:red">Authentication Failed</h2><p>${error}: ${errorDesc}</p>`);
            server.close();
            reject(new Error(`OAuth error: ${error} - ${errorDesc}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h2>Missing authorization code</h2>");
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0F172A; color:#fff;">
                <h1 style="color:#10B981;">✔ Authentication Successful!</h1>
                <p>Zayn Storybook Publisher has connected to your TikTok account.</p>
                <p style="color:#94A3B8;">You can close this browser tab and return to the terminal.</p>
              </body>
            </html>
          `);

          server.close();
          console.log("\n✔ Authorization code received from browser!");
          await exchangeCodeForToken(config, code, redirectUri, codeVerifier);
          resolve();
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (err: any) {
        server.close();
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`🌐 Local OAuth callback server listening on port ${port}...`);
      console.log(`👉 If browser doesn't open automatically, visit this URL:\n\n${authUrl}\n`);

      // Try opening default browser on macOS
      spawn("open", [authUrl]).on("error", () => {});
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use.`);
        console.log(`Tip: specify a different port or pass code directly: --login --code <code>`);
      }
      reject(err);
    });
  });
}

async function exchangeCodeForToken(
  config: TikTokConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string
) {
  console.log("📡 Exchanging authorization code for TikTok access tokens...");

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const data = await res.json();
  if (data.error && data.error !== "ok") {
    throw new Error(`Token exchange failed: ${data.error_description || JSON.stringify(data.error)}`);
  }

  const payload = data.data || data;
  const now = Date.now();

  const tokenObj: TikTokToken = {
    open_id: payload.open_id,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: now + (payload.expires_in || 86400) * 1000,
    refresh_expires_at: now + (payload.refresh_expires_in || 31536000) * 1000,
    scope: payload.scope || "user.info.basic,video.publish",
    token_type: payload.token_type || "Bearer",
  };

  // Fetch creator profile
  console.log("👤 Fetching TikTok user profile...");
  const user = await fetchTikTokUserInfo(tokenObj.access_token);
  if (user) {
    tokenObj.user = user;
    console.log(`✔ Connected to: ${user.display_name || user.username || user.open_id} (@${user.username || "creator"})`);
  }

  await saveTikTokToken(tokenObj);
  console.log("💾 Saved token and profile to config/tiktok-token.json");
  console.log("\n🎉 TikTok integration is ready to publish videos!");
}

// 6. R2 Storage Upload Helper
async function uploadVideoToR2(
  videoPath: string,
  bookSlug: string
): Promise<{ publicVideoUrl: string; cleanup: () => Promise<void> }> {
  const r2 = await loadR2Config();
  const stats = await fs.stat(videoPath);
  const fileSize = stats.size;

  const endpoint = r2.accountId
    ? `https://${r2.accountId}.r2.cloudflarestorage.com`
    : `https://${r2.publicDomain}`;

  const s3 = new S3Client({
    region: "auto",
    endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });

  const timestamp = Date.now();
  const objectKey = `tiktok-temp-uploads/${bookSlug}-${timestamp}-9x16.mp4`;

  console.log(`📦 Staging video to Cloudflare R2: ${objectKey} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);
  const fileBuffer = await fs.readFile(videoPath);

  await s3.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: "video/mp4",
    })
  );

  const cleanDomain = r2.publicDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const publicVideoUrl = `https://${cleanDomain}/${objectKey}`;
  console.log(`✔ Video staged on R2 CDN: ${publicVideoUrl}`);

  const cleanup = async () => {
    try {
      console.log(`🧹 Cleaning up temporary R2 video object: ${objectKey}...`);
      await s3.send(new DeleteObjectCommand({ Bucket: r2.bucketName, Key: objectKey }));
      console.log("✔ Temporary R2 video purged successfully (zero storage cost).");
    } catch (e: any) {
      console.warn("R2 cleanup warning:", e.message);
    }
  };

  return { publicVideoUrl, cleanup };
}

// 7. Video Caption Builder
function buildTikTokCaption(story: any, lang: "id" | "en"): string {
  const isEn = lang === "en";
  let moral = "";
  if (isEn) {
    moral = story.moral?.summaryEn || story.moral?.headlineEn;
    if (!moral) {
      const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
      if (moralScene?.audio?.en?.text) {
        moral = moralScene.audio.en.text.replace(/^The moral of the story:\s*/i, "").split(".")[0].trim();
      }
    }
    if (!moral) moral = "Kindness and honesty always win!";
  } else {
    moral = story.moral?.summaryId || story.moral?.headlineId;
    if (!moral) {
      const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
      if (moralScene?.audio?.text) {
        moral = moralScene.audio.text.replace(/^Pesan moral cerita ini:\s*/i, "").split(".")[0].trim();
      }
    }
    if (!moral) moral = "Selalu tolong menolong dan berbuat baik!";
  }

  if (isEn) {
    const rawTitle = story.originalTitle || story.title || "Children Storybook";
    const hook = story.thumbnailConfig?.en?.hook || story.thumbnailConfig?.en?.headlineTop || "A wonderful bedtime story!";
    return `${rawTitle} 📖✨\n\n${hook}\n\n📖 Zayn Storybook - Animated Children's Stories\n✨ Moral: ${moral}\n\n#kidsbooks #storytime #bedtimestory #animation #childrensbook #zaynstorybook`;
  } else {
    const rawTitle = (story.title || "Cerita Anak Bergambar").replace(/\(.*\)/, "").trim();
    const hook = story.thumbnailConfig?.id?.hook || story.thumbnailConfig?.id?.headlineTop || "Kisah seru dan edukatif!";
    return `${rawTitle} 📖✨\n\n${hook}\n\n📖 Zayn Storybook - Animasi Cerita Anak\n✨ Nilai Kebaikan: ${moral}\n\n#ceritaanak #dongeng #edukasianak #kartunanak #zaynstorybook #animasianak`;
  }
}

// 8. Publish Video to TikTok
async function uploadToTikTok(options: {
  bookSlug: string;
  lang?: "id" | "en";
  privacy?: string;
  dryRun?: boolean;
}) {
  const config = await loadTikTokConfig();
  const accessToken = await ensureValidAccessToken(config);
  const token = await loadTikTokToken();

  const bookSlug = options.bookSlug || "gara-gara-kucing";
  const lang = options.lang || "id";
  const privacyLevel = options.privacy || "SELF_ONLY"; // Default to SELF_ONLY during Sandbox/Audit

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Story manifest not found at ${manifestPath}`);
  }

  const storyData = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const caption = buildTikTokCaption(storyData, lang);

  // Locate 9:16 vertical video
  const possiblePaths = [
    path.join(storyDir, `exports/${bookSlug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/${bookSlug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/annual-haircut-day-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/the-red-raincoat-9x16.mp4`),
  ];

  let videoPath = "";
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      videoPath = p;
      break;
    }
  }

  if (!videoPath) {
    throw new Error(`Vertical 9:16 video not found for ${bookSlug}. Run npm run render -- --book ${bookSlug} first.`);
  }

  console.log("\n=======================================================");
  console.log("          TikTok Content Posting Pipeline              ");
  console.log("=======================================================");
  console.log(`Story:         ${storyData.title}`);
  console.log(`Account:       ${token?.user?.display_name || "Zayn Storybook"} (@${token?.user?.username || "zayn.storybook"})`);
  console.log(`Video File:    ${videoPath}`);
  console.log(`Privacy Level: ${privacyLevel}`);
  console.log(`Dry Run:       ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log("=======================================================\n");

  if (options.dryRun) {
    console.log("Caption Preview:\n", caption);
    console.log("\n✔ Dry run completed successfully! Video not posted.");
    return;
  }

  // Upload to R2 for PULL_FROM_URL
  const { publicVideoUrl, cleanup } = await uploadVideoToR2(videoPath, bookSlug);

  try {
    console.log("🚀 Initializing TikTok Content Posting API (/v2/post/publish/video/init/)...");
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: publicVideoUrl,
        },
      }),
    });

    const initData = await initRes.json();
    console.log("TikTok Init Response:", JSON.stringify(initData, null, 2));

    if (initData.error && initData.error.code !== "ok" && initData.error !== "ok") {
      throw new Error(`TikTok Video Init failed: ${initData.error?.message || JSON.stringify(initData.error)}`);
    }

    const publishId = initData.data?.publish_id;
    console.log(`✔ TikTok Ingestion Initiated! Publish ID: ${publishId}`);

    // Poll status until PUBLISHED or FAILED
    console.log("⏳ Polling TikTok video transcoding and publishing status...");
    let status = "PROCESSING_DOWNLOAD";
    let attempts = 0;

    while (status !== "PUBLISH_COMPLETE" && status !== "FAILED" && attempts < 20) {
      await new Promise((r) => setTimeout(r, 4000));
      attempts++;

      const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      const statusData = await statusRes.json();
      status = statusData.data?.status || status;
      console.log(`[Attempt ${attempts}] Status: ${status}`);

      if (status === "PUBLISH_COMPLETE") {
        console.log(`\n🎉 SUCCESS! Story video successfully published to TikTok!`);
        break;
      }
    }

    // Save to story.json
    if (!storyData.distribution) storyData.distribution = {};
    if (!storyData.distribution.tiktok) storyData.distribution.tiktok = {};
    storyData.distribution.tiktok = {
      status: "published",
      publishId,
      publishedAt: new Date().toISOString(),
      privacyLevel,
    };
    await fs.writeFile(manifestPath, JSON.stringify(storyData, null, 2), "utf-8");

  } finally {
    await cleanup();
  }
}

// 9. Main CLI Entrypoint
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isLogin = args.includes("--login");
  const isStatus = args.includes("--status");
  const isDryRun = args.includes("--dry-run");
  const manualCode = getArg("--code");
  const redirectUri = getArg("--redirect-uri");
  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const lang = (getArg("--lang") || "id") as "id" | "en";
  const privacy = getArg("--privacy") || "SELF_ONLY";

  if (isLogin) {
    await loginTikTok({ manualCode, redirectUri });
    return;
  }

  if (isStatus) {
    const config = await loadTikTokConfig();
    const token = await loadTikTokToken();
    console.log("\n=========================================");
    console.log("       TikTok Integration Status         ");
    console.log("=========================================");
    console.log(`App ID:      ${config.appId}`);
    console.log(`Client Key:  ${config.clientKey.slice(0, 4)}...${config.clientKey.slice(-4)}`);
    if (token) {
      const isExpired = token.expires_at ? Date.now() > token.expires_at : false;
      console.log(`Account:     ${token.user?.display_name || "Authorized"} (@${token.user?.username || "creator"})`);
      console.log(`Token:       ${isExpired ? "EXPIRED" : "ACTIVE"}`);
      console.log(`Expires At:  ${new Date(token.expires_at).toLocaleString()}`);
      console.log(`Scopes:      ${token.scope}`);
    } else {
      console.log("Token:       NOT CONNECTED (Run: npm run upload:tiktok -- --login)");
    }
    console.log("=========================================\n");
    return;
  }

  // Publish video
  await uploadToTikTok({ bookSlug, lang, privacy, dryRun: isDryRun });
}

main().catch((err) => {
  console.error("Execution error:", err.message);
  process.exit(1);
});
