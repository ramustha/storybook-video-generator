import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface RefreshOptions {
  token?: string;
  userToken?: string;
  appSecret?: string;
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
    console.log("1. Direct Page Token:");
    console.log("   npx tsx scripts/refresh-meta-token.ts --token <NEW_PAGE_ACCESS_TOKEN>\n");
    console.log("2. Auto Long-Lived Exchange (Permanent Never-Expire):");
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
  console.log("🚀 You can now proceed with: npm run sync:meta\n");
}

main().catch((err) => {
  console.error("\n❌ Refresh error:", err.message);
  process.exit(1);
});
