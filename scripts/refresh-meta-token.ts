import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  buildMetaReauthInstructions,
  inspectMetaTokenHealth,
} from "./lib/meta-token-health";

interface RefreshOptions {
  token?: string;
  userToken?: string;
  appSecret?: string;
  checkOnly?: boolean;
}

function parseArgs(): RefreshOptions {
  const args = process.argv.slice(2);
  const options: RefreshOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--token" || arg === "-t") && args[i + 1]) {
      options.token = args[++i];
    } else if (arg === "--user-token" && args[i + 1]) {
      options.userToken = args[++i];
    } else if ((arg === "--secret" || arg === "-s") && args[i + 1]) {
      options.appSecret = args[++i];
    } else if (arg === "--check") {
      options.checkOnly = true;
    }
  }

  return options;
}

async function loadEnv(): Promise<void> {
  const envFiles = [
    path.resolve(".env"),
    path.join(process.env.HOME || "", ".zshenv"),
  ];

  for (const envPath of envFiles) {
    if (existsSync(envPath)) {
      try {
        const envContent = await fs.readFile(envPath, "utf-8");
        envContent.split("\n").forEach((line) => {
          const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let val = (match[2] || "").trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      } catch {}
    }
  }
}

async function main() {
  await loadEnv();
  const options = parseArgs();
  const configPath = path.resolve("./config/meta-config.json");

  if (!existsSync(configPath)) {
    throw new Error(`Meta configuration not found at ${configPath}`);
  }

  const raw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(raw);

  // Check process.env and .env / .zshenv overrides
  const userToken =
    options.userToken ||
    process.env.PERSONAL_META_LONG_LIVED_USER_TOKEN ||
    process.env.META_USER_TOKEN ||
    process.env.FACEBOOK_USER_TOKEN;

  const appSecret =
    options.appSecret ||
    process.env.PERSONAL_META_APP_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET;

  let candidatePageToken =
    options.token ||
    (options.checkOnly ? config.pageAccessToken : undefined) ||
    process.env.PERSONAL_META_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.PAGE_ACCESS_TOKEN;

  console.log("\n=======================================================");
  console.log("🔑 META ACCESS TOKEN REFRESH & VERIFICATION");
  console.log("=======================================================");
  console.log(`📱 App ID           : ${config.appId}`);
  console.log(`📘 Facebook Page ID : ${config.facebookPageId} (${config.facebookPageName || "Zayn Storybook"})`);
  console.log(`📸 Instagram ID     : ${config.instagramUserId} (@${config.instagramUsername || "zayn.storybook"})`);
  console.log("=======================================================\n");

  if (options.checkOnly) {
    if (!candidatePageToken) {
      throw new Error("No active pageAccessToken found in config/meta-config.json or environment.");
    }
    const report = await inspectMetaTokenHealth({
      appId: config.appId,
      facebookPageId: config.facebookPageId,
      instagramUserId: config.instagramUserId,
      pageAccessToken: candidatePageToken,
    });
    console.log(`🔎 Token Valid       : ${report.tokenValid ? "YES" : "NO"} (${report.tokenType || "unknown"}, expires_at=${report.expiresAt ?? "?"})`);
    console.log(`📜 Granted Scopes    : ${report.scopeAudit.grantedScopes.join(", ") || "none"}`);
    console.log(`📊 IG /insights      : ${report.igInsightsOk ? "✔ ACCESSIBLE" : `❌ BLOCKED (${report.igInsightsError || "missing permission"})`}`);
    if (report.scopeAudit.missingScopes.length > 0 || !report.igInsightsOk) {
      console.error("\n⚠️ TOKEN MISSING REQUIRED SCOPES / INSIGHTS PERMISSION:");
      for (const line of buildMetaReauthInstructions(config.appId, report.scopeAudit.missingScopes)) {
        console.error(`   ${line}`);
      }
      process.exit(1);
    }
    console.log("\n✅ Token has all required publishing & insights scopes!\n");
    return;
  }

  let longLivedUserToken = "";

  // Mode A: User provided Short-Lived User Token + App Secret (via CLI or .env / .zshenv) -> Auto-convert to Never-Expiring Page Token
  if (userToken && appSecret) {
    console.log("🔄 Step 1: Converting Short-Lived User Token to 60-day Long-Lived Token...");
    const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.appId}&client_secret=${appSecret}&fb_exchange_token=${userToken}`;
    const exchangeRes = await fetch(exchangeUrl);
    const exchangeData = await exchangeRes.json();

    if (exchangeData.error) {
      throw new Error(`Failed to exchange long-lived token: ${JSON.stringify(exchangeData.error)}`);
    }

    longLivedUserToken = exchangeData.access_token;
    console.log("   ✔ Acquired Long-Lived User Access Token!");

    console.log("\n🔄 Step 2: Fetching Permanent ('Never Expire') Page Access Token via /me/accounts...");
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`
    );
    const accountsData = await accountsRes.json();

    if (accountsData.error) {
      throw new Error(`Failed to fetch /me/accounts: ${JSON.stringify(accountsData.error)}`);
    }

    const matchedPage = accountsData.data?.find(
      (p: any) => p.id === config.facebookPageId
    );

    if (!matchedPage || !matchedPage.access_token) {
      console.error("Available pages for this token:", accountsData.data?.map((p: any) => ({ id: p.id, name: p.name })));
      throw new Error(`Page with ID ${config.facebookPageId} not found in user accounts or lacks access_token`);
    }

    candidatePageToken = matchedPage.access_token;
    console.log(`   ✔ Successfully generated PERMANENT Page Token for "${matchedPage.name}"!`);
  }

  if (!candidatePageToken) {
    console.log("❌ No token provided.");
    console.log("\nUsage Options:");
    console.log("1. Check active token scopes & /insights access:");
    console.log("   npx tsx scripts/refresh-meta-token.ts --check\n");
    console.log("2. Direct Page Token:");
    console.log("   npx tsx scripts/refresh-meta-token.ts --token <NEW_PAGE_ACCESS_TOKEN>\n");
    console.log("3. Auto Long-Lived Exchange (Permanent Never-Expire):");
    console.log("   npx tsx scripts/refresh-meta-token.ts --user-token <USER_TOKEN> --secret <APP_SECRET>\n");
    process.exit(1);
  }

  // Verification step
  console.log("🔍 Verifying Token Permissions against Facebook Page & Instagram...");

  const pageCheck = await fetch(
    `https://graph.facebook.com/v21.0/${config.facebookPageId}?fields=id,name,fan_count&access_token=${candidatePageToken}`
  );
  const pageData = await pageCheck.json();
  if (pageData.error) {
    throw new Error(`Facebook Page check failed: ${JSON.stringify(pageData.error)}`);
  }
  console.log(`   ✔ Facebook Page verified: "${pageData.name}" (ID: ${pageData.id})`);

  const igCheck = await fetch(
    `https://graph.facebook.com/v21.0/${config.instagramUserId}?fields=id,username&access_token=${candidatePageToken}`
  );
  const igData = await igCheck.json();
  if (igData.error) {
    throw new Error(`Instagram check failed: ${JSON.stringify(igData.error)}`);
  }
  console.log(`   ✔ Instagram Account verified: @${igData.username} (ID: ${igData.id})`);

  const health = await inspectMetaTokenHealth({
    appId: config.appId,
    facebookPageId: config.facebookPageId,
    instagramUserId: config.instagramUserId,
    pageAccessToken: candidatePageToken,
  });
  console.log(`   📜 Granted Scopes: ${health.scopeAudit.grantedScopes.join(", ") || "none"}`);
  console.log(`   📊 IG /insights  : ${health.igInsightsOk ? "✔ ACCESSIBLE" : `⚠️ BLOCKED (${health.igInsightsError || "missing permission"})`}`);
  if (health.scopeAudit.missingScopes.length > 0 || !health.igInsightsOk) {
    console.warn("\n   ⚠️ WARNING: Token was saved, but is still missing analytics scopes:");
    for (const line of buildMetaReauthInstructions(config.appId, health.scopeAudit.missingScopes)) {
      console.warn(`      ${line}`);
    }
  }

  // Save new token to config/meta-config.json
  config.pageAccessToken = candidatePageToken;
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Also update ~/.zshenv if present
  const zshenvPath = path.join(process.env.HOME || "", ".zshenv");
  if (existsSync(zshenvPath)) {
    try {
      let zshenvContent = await fs.readFile(zshenvPath, "utf-8");
      if (zshenvContent.includes("PERSONAL_META_ACCESS_TOKEN=")) {
        zshenvContent = zshenvContent.replace(
          /export PERSONAL_META_ACCESS_TOKEN=".*"/,
          `export PERSONAL_META_ACCESS_TOKEN="${candidatePageToken}"`
        );
      }
      if (longLivedUserToken && zshenvContent.includes("PERSONAL_META_LONG_LIVED_USER_TOKEN=")) {
        zshenvContent = zshenvContent.replace(
          /export PERSONAL_META_LONG_LIVED_USER_TOKEN=".*"/,
          `export PERSONAL_META_LONG_LIVED_USER_TOKEN="${longLivedUserToken}"`
        );
      }
      await fs.writeFile(zshenvPath, zshenvContent, "utf-8");
      console.log(`   ✔ Updated ~/.zshenv with new permanent tokens!`);
    } catch (err: any) {
      console.warn("   ⚠️ Note: ~/.zshenv could not be updated automatically:", err.message);
    }
  }

  console.log(`\n🎉 SUCCESS! New verified token saved to ${configPath}!`);
  console.log("📌 Remember to update GitHub Actions secret PERSONAL_META_ACCESS_TOKEN if refreshing scopes.");
  console.log("🚀 You can verify full insights access with: npx tsx scripts/test-meta-connection.ts\n");
}

main().catch((err) => {
  console.error("\n❌ Refresh error:", err.message);
  process.exit(1);
});
