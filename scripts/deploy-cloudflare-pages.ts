import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

async function main() {
  console.log("\n=======================================================");
  console.log("⛅ CLOUDFLARE PAGES STORYBOOK PORTAL DEPLOY HELPER");
  console.log("=======================================================\n");

  const args = process.argv.slice(2);
  const skipBuild = args.includes("--skip-build");
  const projectName = process.env.CLOUDFLARE_PAGES_PROJECT_NAME || "storybook-catalog";
  const branch = process.env.CLOUDFLARE_PAGES_BRANCH || "main";

  const rootDir = path.resolve(__dirname, "..");
  const docsDir = path.join(rootDir, "docs");

  // 1. Rebuild docs portal if not skipped
  if (!skipBuild) {
    console.log("📚 Step 1: Rebuilding static documentation & catalog portal...");
    try {
      execSync("npm run docs:portal", { cwd: rootDir, stdio: "inherit" });
    } catch (err: any) {
      console.error("❌ Failed to build docs portal:", err.message);
      process.exit(1);
    }
  } else {
    console.log("⏭️ Step 1: Skipping portal rebuild (--skip-build).");
  }

  if (!existsSync(docsDir) || !existsSync(path.join(docsDir, "index.html"))) {
    console.error("❌ docs/index.html not found! Please build the portal first.");
    process.exit(1);
  }

  // 2. Resolve Cloudflare Account ID if available in r2-config.json
  const r2Path = path.join(rootDir, "config", "r2-config.json");
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  if (!accountId && existsSync(r2Path)) {
    try {
      const r2 = JSON.parse(readFileSync(r2Path, "utf-8"));
      if (r2.accountId) accountId = r2.accountId;
    } catch {
      // Ignore if cannot parse
    }
  }

  const env = {
    ...process.env,
    ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
  };

  // 3. Check Wrangler authentication
  console.log("\n📡 Step 2: Checking Cloudflare authentication...");
  const hasToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  if (!hasToken) {
    try {
      const whoami = execSync("npx --yes wrangler whoami", {
        cwd: rootDir,
        encoding: "utf-8",
        env,
      });
      if (whoami.includes("You are not authenticated")) {
        console.log("⚠️ Wrangler is not authenticated in your terminal.");
        console.log("👉 Please run: npx wrangler login");
        console.log("   (Or set CLOUDFLARE_API_TOKEN in your environment).");
        process.exit(1);
      }
    } catch (err: any) {
      console.log("⚠️ Could not verify Wrangler session.");
      console.log("👉 If unauthenticated, run: npx wrangler login");
    }
  }

  // 4. Ensure Pages project exists
  console.log(`\n📦 Step 3: Ensuring Cloudflare Pages project '${projectName}' exists...`);
  try {
    execSync(`npx --yes wrangler pages project create ${projectName} --production-branch ${branch}`, {
      cwd: rootDir,
      stdio: "pipe",
      env,
    });
    console.log(`   ✔ Project '${projectName}' ready.`);
  } catch {
    // Project may already exist, continue to deploy
  }

  // 5. Deploy docs directory to Cloudflare Pages
  console.log(`\n🚀 Step 4: Deploying 'docs/' directory to Cloudflare Pages (${projectName})...`);
  try {
    execSync(
      `npx --yes wrangler pages deploy docs --project-name ${projectName} --branch ${branch} --commit-dirty=true`,
      {
        cwd: rootDir,
        stdio: "inherit",
        env,
      }
    );
    console.log("\n🎉 DEPLOYMENT TO CLOUDFLARE PAGES COMPLETE!");
    console.log(`   - Project: ${projectName}`);
    console.log(`   - Production Branch: ${branch}`);
    console.log(`   - Default Domain: https://${projectName}.pages.dev`);
  } catch (err: any) {
    console.error("\n❌ Deployment failed:", err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("deploy-cloudflare-pages")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
