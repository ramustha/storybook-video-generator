import { execSync } from "child_process";
import path from "path";

async function main() {
  console.log("\n=======================================================");
  console.log("⛅ CLOUDFLARE WORKER CRON TRIGGER DEPLOY HELPER");
  console.log("=======================================================\n");

  const cwd = path.resolve("./cloudflare/daily-broadcast-cron");

  // Check login status
  try {
    const whoami = execSync("npx --yes wrangler whoami", { encoding: "utf-8" });
    if (whoami.includes("You are not authenticated")) {
      console.log("⚠️ Wrangler is not authenticated in your terminal.");
      console.log("👉 Please run in your terminal: npx wrangler login");
      console.log("   (It will open your browser to log in with 1 click).");
      process.exit(1);
    }
  } catch (err: any) {
    // If whoami failed
  }

  // Get GitHub Token
  let ghToken = "";
  try {
    ghToken = execSync("gh auth token -u ramustha", { encoding: "utf-8" }).trim();
  } catch {
    console.error("❌ Could not get GitHub token for ramustha from gh CLI.");
    process.exit(1);
  }

  console.log("🚀 Step 1: Deploying Worker to Cloudflare...");
  try {
    const deployOut = execSync("npx --yes wrangler deploy", { cwd, encoding: "utf-8" });
    console.log(deployOut);
  } catch (err: any) {
    console.error("❌ Deploy failed:", err.message);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }

  console.log("\n🔑 Step 2: Setting GITHUB_TOKEN secret in Cloudflare Worker...");
  try {
    execSync(`echo "${ghToken}" | npx --yes wrangler secret put GITHUB_TOKEN`, {
      cwd,
      encoding: "utf-8",
      stdio: "inherit",
    });
    console.log("✔ GITHUB_TOKEN successfully configured in Cloudflare Worker!");
  } catch (err: any) {
    console.error("❌ Failed to set secret:", err.message);
  }

  console.log("\n🎉 WORKER DEPLOYMENT & CRON TRIGGER SETUP COMPLETE!");
  console.log("   - Morning slot : 08:30 WIB (01:30 UTC)");
  console.log("   - Evening slot : 19:00 WIB (12:00 UTC)");
}

if (process.argv[1]?.includes("setup-cloudflare-worker")) {
  main();
}
