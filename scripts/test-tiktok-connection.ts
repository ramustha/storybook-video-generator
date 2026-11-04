import fs from "fs";
import path from "path";

// Load environment variables if .env exists
if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf-8");
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

// Load config/tiktok-config.json if available
let config = {
  clientKey: process.env.PERSONAL_TIKTOK_CLIENT_KEY || "",
  clientSecret: process.env.PERSONAL_TIKTOK_CLIENT_SECRET || "",
  appId: process.env.PERSONAL_TIKTOK_APP_ID || "",
  redirectUri: process.env.TIKTOK_REDIRECT_URI || "http://localhost:3000/oauth/tiktok/callback",
};

const configPath = path.resolve("./config/tiktok-config.json");
if (fs.existsSync(configPath)) {
  try {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config = { ...config, ...fileConfig };
  } catch (e) {}
}

console.log("=========================================");
console.log("   TikTok Developer Connection Check     ");
console.log("=========================================");
console.log(`App ID:        ${config.appId}`);
console.log(`Client Key:    ${config.clientKey ? config.clientKey.slice(0, 4) + "..." + config.clientKey.slice(-4) : "MISSING"}`);
console.log(`Client Secret: ${config.clientSecret ? "PRESENT (length: " + config.clientSecret.length + ")" : "MISSING"}`);
console.log(`Redirect URI:  ${config.redirectUri}`);
console.log("=========================================\n");

if (!config.clientKey || !config.clientSecret) {
  console.error("❌ Error: Missing TikTok Client Key or Secret.");
  process.exit(1);
}

// Check client validity by querying TikTok oauth endpoint
async function testClientCredentials() {
  console.log("📡 Testing Client Key validity with TikTok API endpoint...");
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: "test_verification_code_dummy",
        redirect_uri: config.redirectUri,
      }),
    });

    const data = await res.json();
    console.log("TikTok API Response Status:", res.status);
    console.log("TikTok API Response Body:", JSON.stringify(data, null, 2));

    if (data.error === "invalid_grant" || (data.error && data.error.code === "invalid_grant")) {
      console.log("\n✅ SUCCESS: Client Key & Client Secret are 100% VALID and verified by TikTok!");
      console.log("(TikTok authenticated the credentials and is waiting for a valid user authorization code).");
    } else if (data.error === "invalid_client" || (data.error && data.error.code === "invalid_client")) {
      console.log("\n❌ FAIL: TikTok rejected Client Key or Client Secret as invalid.");
    } else {
      console.log("\nℹ Response code:", data.error, data.error_description);
    }
  } catch (err: any) {
    console.error("Connection failed:", err.message);
  }
}

testClientCredentials();
