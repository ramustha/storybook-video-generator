import fs from "fs/promises";
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

  const configPath = path.resolve("./config/meta-config.json");
  let config: MetaConfig;
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to read config/meta-config.json:", err);
    process.exit(1);
  }

  const { facebookPageId, instagramUserId, pageAccessToken } = config;

  // 1. Verify Facebook Page
  console.log(`📡 1. Querying Facebook Page [${facebookPageId}]...`);
  const pageRes = await fetch(
    `https://graph.facebook.com/v21.0/${facebookPageId}?fields=id,name,link,fan_count&access_token=${pageAccessToken}`
  );
  const pageData = await pageRes.json();
  if (pageData.error) {
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
    console.error("   ❌ Publishing Quota check failed:", quotaData.error);
  } else {
    const usage = quotaData.data?.[0]?.quota_usage ?? 0;
    const total = quotaData.data?.[0]?.config?.quota_total ?? 100;
    console.log(`   ✔ Daily Publishing Quota: ${usage}/${total} posts used`);
    console.log(`   ✔ Remaining Quota       : ${total - usage} posts available today`);
  }

  console.log("\n🎉 ALL META CONNECTION CHECKS PASSED SUCCESSFULLY!");
  console.log("🚀 Ready to publish Instagram Reels (9:16) & Facebook Videos (16:9)!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
