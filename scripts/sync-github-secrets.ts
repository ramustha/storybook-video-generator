import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

async function main() {
  console.log("\n=======================================================");
  console.log("🔐 GITHUB ACTIONS SECRETS AUTOMATED SYNC");
  console.log("=======================================================\n");

  const secrets: Record<string, string> = {};

  // 1. Read ~/.zshenv
  const zshenvPath = path.join(process.env.HOME || "", ".zshenv");
  if (existsSync(zshenvPath)) {
    try {
      const lines = readFileSync(zshenvPath, "utf-8").split("\n");
      lines.forEach((l) => {
        const match = l.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*["']?(.*?)["']?\s*$/);
        if (match) {
          const k = match[1];
          const v = match[2];
          if (k.startsWith("PERSONAL_META_") || k.startsWith("PERSONAL_R2_")) {
            secrets[k] = v;
          }
        }
      });
    } catch (err: any) {
      console.warn("⚠️ Could not read ~/.zshenv directly, falling back to local configs.");
    }
  }

  // 2. Read config/r2-config.json
  const r2Path = path.resolve("./config/r2-config.json");
  if (existsSync(r2Path)) {
    try {
      const r2 = JSON.parse(readFileSync(r2Path, "utf-8"));
      if (r2.accountId) secrets["PERSONAL_R2_ACCOUNT_ID"] = r2.accountId;
      if (r2.accessKeyId) secrets["PERSONAL_R2_ACCESS_KEY_ID"] = r2.accessKeyId;
      if (r2.secretAccessKey) secrets["PERSONAL_R2_SECRET_ACCESS_KEY"] = r2.secretAccessKey;
      if (r2.publicDomain) secrets["PERSONAL_R2_PUBLIC_DOMAIN"] = r2.publicDomain;
    } catch {}
  }

  // 3. Read config/meta-config.json
  const metaPath = path.resolve("./config/meta-config.json");
  if (existsSync(metaPath)) {
    try {
      const m = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (m.pageAccessToken) secrets["PERSONAL_META_ACCESS_TOKEN"] = m.pageAccessToken;
      if (m.appId) secrets["PERSONAL_META_APP_ID"] = m.appId;
      if (m.facebookPageId) secrets["PERSONAL_META_FACEBOOK_PAGE_ID"] = m.facebookPageId;
      if (m.instagramUserId) secrets["PERSONAL_META_INSTAGRAM_USER_ID"] = m.instagramUserId;
    } catch {}
  }

  // 4. Read YouTube Credentials & Token
  const ytCredsPath = path.resolve("./config/youtube-credentials.json");
  if (existsSync(ytCredsPath)) {
    try {
      const creds = JSON.parse(readFileSync(ytCredsPath, "utf-8"));
      const c = creds.installed || creds.web;
      if (c?.client_id) secrets["YOUTUBE_CLIENT_ID"] = c.client_id;
      if (c?.client_secret) secrets["YOUTUBE_CLIENT_SECRET"] = c.client_secret;
    } catch {}
  }

  const ytTokenPath = path.resolve("./config/youtube-token.json");
  if (existsSync(ytTokenPath)) {
    try {
      const t = JSON.parse(readFileSync(ytTokenPath, "utf-8"));
      if (t.refresh_token) secrets["YOUTUBE_REFRESH_TOKEN"] = t.refresh_token;
    } catch {}
  }

  console.log(`Found ${Object.keys(secrets).length} secrets to sync to GitHub repository:\n`);
  Object.keys(secrets).forEach((k) => console.log(`   🔑 ${k}`));

  console.log("\n📡 Checking GitHub CLI auth status...");
  try {
    const user = execSync("gh api user --jq .login", { encoding: "utf-8" }).trim();
    console.log(`   ✔ Authenticated as: ${user}`);
  } catch (err: any) {
    console.log("\n⚠️ GitHub CLI not authenticated. Please run: gh auth login");
    console.log("Alternatively, add these secrets manually in repository Settings > Secrets and variables > Actions.");
    return;
  }

  console.log("\n🚀 Uploading secrets to GitHub...");
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue;
    try {
      execSync(`echo "${value}" | gh secret set ${key}`, { stdio: "pipe" });
      console.log(`   ✔ Synced: ${key}`);
    } catch (err: any) {
      console.error(`   ❌ Failed to sync ${key}:`, err.message);
    }
  }

  console.log("\n🎉 ALL SECRETS SYNCED SUCCESSFULLY TO GITHUB ACTIONS!");
}

main().catch(console.error);
