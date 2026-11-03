import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import http from "http";
import url from "url";
import readline from "readline";
import { google } from "googleapis";
import { QuotaRotator, getTimeUntilResetPT } from "./quota-rotator";

const CONFIG_DIR = path.resolve("./config");
const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
];

async function printProjectList(rotator: QuotaRotator) {
  const report = rotator.getStatusReport();
  const reset = getTimeUntilResetPT();

  console.log("\n========================================================");
  console.log("🌐 YouTube Google Cloud Multi-Project Quota Pool");
  console.log("========================================================");
  console.log(`• Total Configured Projects: ${report.configuredCount}`);
  console.log(`• Available (Active Quota):  ${report.availableCount}`);
  console.log(`• Current Active Project:    \x1b[36m${report.activeProjectId.toUpperCase()}\x1b[0m`);
  console.log(`• Daily Quota Reset:         In ${reset.formatted}\n`);

  if (report.projects.length === 0) {
    console.log("⚠️ No projects configured yet in config/projects/.");
    console.log("💡 Run 'npm run project:add <project-name> <path/to/credentials.json>' to add one.\n");
    return;
  }

  console.log("Projects in pool:");
  for (const p of report.projects) {
    const isCurrent = p.id === report.activeProjectId;
    const prefix = isCurrent ? "👉 " : "   ";
    let statusBadge = "\x1b[32m[AVAILABLE - 10,000 units]\x1b[0m";
    if (p.status === "EXHAUSTED") {
      statusBadge = `\x1b[31m[EXHAUSTED at ${p.exhaustedAt?.slice(11, 19)} UTC]\x1b[0m`;
    } else if (p.status === "UNCONFIGURED") {
      statusBadge = "\x1b[33m[UNCONFIGURED - missing token]\x1b[0m";
    }

    console.log(`${prefix}• \x1b[1m${p.id}\x1b[0m ${statusBadge}`);
  }

  const capacity = report.configuredCount * 10000;
  const approxVideos = Math.floor(capacity / 1600);
  console.log("\n📊 Total Pool Capacity:");
  console.log(`   ${capacity.toLocaleString()} API units/day (~${approxVideos} Full HD video uploads/day)`);
  console.log("========================================================\n");
}

async function authorizeProject(projectName: string, credsPath: string) {
  const projDir = path.join(PROJECTS_DIR, projectName);
  await fs.mkdir(projDir, { recursive: true });

  const destCredsPath = path.join(projDir, "credentials.json");
  const destTokenPath = path.join(projDir, "token.json");

  // Copy credentials into project directory
  if (path.resolve(credsPath) !== path.resolve(destCredsPath)) {
    await fs.copyFile(credsPath, destCredsPath);
  }

  const credsRaw = JSON.parse(await fs.readFile(destCredsPath, "utf-8"));
  const creds = credsRaw.installed || credsRaw.web;
  if (!creds || !creds.client_id || !creds.client_secret) {
    throw new Error("Invalid Google Cloud credentials JSON format.");
  }

  const redirectUri = creds.redirect_uris?.[0] || "http://localhost:3000/oauth2callback";
  const oauth2Client = new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n========================================================");
  console.log(`🔐 Authorizing Google Cloud Project: \x1b[36m${projectName.toUpperCase()}\x1b[0m`);
  console.log("========================================================");
  console.log("1. Open the following authorization URL in your browser:\n");
  console.log(`   👉 \x1b[36m${authUrl}\x1b[0m\n`);
  console.log("2. Sign in with the Google Account managing @ZaynAdyanRamadhan.");
  console.log("3. Grant permissions to YouTube.\n");

  const code = await new Promise<string>((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url || "", true);
      if (parsedUrl.pathname === "/oauth2callback" && parsedUrl.query.code) {
        const authCode = parsedUrl.query.code as string;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authentication Successful!</h1><p>You can close this tab now.</p>");
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3000, () => {
      console.log("⏳ Waiting for browser callback on http://localhost:3000/oauth2callback ...");
    });

    server.on("error", () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Paste authorization code here: ", (manualCode) => {
        rl.close();
        resolve(manualCode.trim());
      });
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(destTokenPath, JSON.stringify(tokens, null, 2));

  // Verify channel
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channelRes = await youtube.channels.list({ part: ["snippet"], mine: true });
  const channelTitle = channelRes.data.items?.[0]?.snippet?.title || "Unknown Channel";
  const customUrl = channelRes.data.items?.[0]?.snippet?.customUrl || "";

  console.log(`\n🎉 Project \x1b[32m${projectName}\x1b[0m added successfully!`);
  console.log(`   Connected Channel: \x1b[36m${channelTitle} (${customUrl})\x1b[0m`);
  console.log(`   Added Capacity:    \x1b[32m+10,000 units/day (~6 uploads/day)\x1b[0m\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const rotator = new QuotaRotator();
  await rotator.init();

  if (args.includes("--reset")) {
    await rotator.resetAllQuotas();
    await printProjectList(rotator);
    return;
  }

  if (args.includes("--add")) {
    const addIdx = args.indexOf("--add");
    const projName = args[addIdx + 1];
    const credsPath = args[addIdx + 2];

    if (!projName || !credsPath) {
      console.error("Usage: npm run project:add <project-name> <path/to/credentials.json>");
      process.exit(1);
    }

    if (!existsSync(credsPath)) {
      console.error(`Error: Credentials file not found at: ${credsPath}`);
      process.exit(1);
    }

    await authorizeProject(projName, credsPath);
    // Refresh rotator
    await rotator.init();
    await printProjectList(rotator);
    return;
  }

  // Default: list all projects
  await printProjectList(rotator);
}

main().catch((err) => {
  console.error("❌ Error in manage-projects:", err.message);
  process.exit(1);
});
