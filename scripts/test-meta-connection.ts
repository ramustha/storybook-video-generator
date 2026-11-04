import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface MetaConfig {
  appId: string;
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  pageAccessToken: string;
}

async function main() {
  console.log("\n🔍 Testing Meta Graph API Connection (Facebook & Instagram)...\n");

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

  const configPath = path.resolve("./config/meta-config.json");
  let config: MetaConfig;
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to read config/meta-config.json:", err);
    process.exit(1);
  }

  if (process.env.PERSONAL_META_ACCESS_TOKEN) config.pageAccessToken = process.env.PERSONAL_META_ACCESS_TOKEN;
  if (process.env.META_PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (process.env.PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.PAGE_ACCESS_TOKEN;
  if (process.env.PERSONAL_META_APP_ID) config.appId = process.env.PERSONAL_META_APP_ID;
  if (process.env.META_APP_ID) config.appId = process.env.META_APP_ID;
  if (process.env.FACEBOOK_PAGE_ID) config.facebookPageId = process.env.FACEBOOK_PAGE_ID;
  if (process.env.INSTAGRAM_USER_ID) config.instagramUserId = process.env.INSTAGRAM_USER_ID;

  const { facebookPageId, instagramUserId, pageAccessToken } = config;

  let hasError = false;

  // 1. Verify Facebook Page
  console.log(`📡 1. Querying Facebook Page [${facebookPageId}]...`);
  const pageRes = await fetch(
    `https://graph.facebook.com/v21.0/${facebookPageId}?fields=id,name,link,fan_count&access_token=${pageAccessToken}`
  );
  const pageData = await pageRes.json();
  if (pageData.error) {
    hasError = true;
    console.error("   ❌ Facebook Page check failed:", pageData.error);
  } else {
    console.log(`   ✔ Page Name: "${pageData.name}" (ID: ${pageData.id})`);
  }

  // 2. Verify Instagram Business Account
  console.log(`\n📸 2. Querying Instagram Account [${instagramUserId}]...`);
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${instagramUserId}?fields=id,username,name,biography,followers_count,media_count&access_token=${pageAccessToken}`
  );
  const igData = await igRes.json();
  if (igData.error) {
    hasError = true;
    console.error("   ❌ Instagram Account check failed:", igData.error);
  } else {
    console.log(`   ✔ Username : @${igData.username}`);
    console.log(`   ✔ Name     : ${igData.name}`);
    console.log(`   ✔ Media    : ${igData.media_count || 0} posts`);
  }

  // 3. Verify Content Publishing Quota
  console.log(`\n📊 3. Checking Instagram Reels Publishing Quota...`);
  const quotaRes = await fetch(
    `https://graph.facebook.com/v21.0/${instagramUserId}/content_publishing_limit?fields=config,quota_usage&access_token=${pageAccessToken}`
  );
  const quotaData = await quotaRes.json();
  if (quotaData.error) {
    hasError = true;
    console.error("   ❌ Publishing Quota check failed:", quotaData.error);
  } else {
    const usage = quotaData.data?.[0]?.quota_usage ?? 0;
    const total = quotaData.data?.[0]?.config?.quota_total ?? 100;
    console.log(`   ✔ Daily Publishing Quota: ${usage}/${total} posts used`);
    console.log(`   ✔ Remaining Quota       : ${total - usage} posts available today`);
  }

  if (hasError) {
    console.error("\n❌ META CONNECTION FAILED: Access token is invalid or lacks required permissions.");
    process.exit(1);
  }

  console.log("\n🎉 ALL META CONNECTION CHECKS PASSED SUCCESSFULLY!");
  console.log("🚀 Ready to publish Instagram Reels (9:16) & Facebook Videos (16:9)!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
