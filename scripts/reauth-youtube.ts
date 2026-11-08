import fs from "fs/promises";
import http from "http";
import url from "url";
import path from "path";
import { execSync } from "child_process";
import { google } from "googleapis";

const CREDENTIALS_PATH = path.resolve("./config/youtube-credentials.json");
const TOKEN_PATH = path.resolve("./config/youtube-token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube",
];

async function main() {
  const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf-8"));
  const inst = creds.installed || creds.web;
  const redirectUri = (inst.redirect_uris && inst.redirect_uris[0]) || "http://localhost:3000/oauth2callback";

  const oauth2Client = new google.auth.OAuth2(inst.client_id, inst.client_secret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n=======================================================");
  console.log("🔐 YouTube 1-Click Re-Authorization");
  console.log("=======================================================");
  console.log("Membuka browser untuk otorisasi YouTube (@ZaynAdyanRamadhan)...");
  console.log(`URL: ${authUrl}\n`);

  try {
    if (process.platform === "darwin") {
      execSync(`open "${authUrl}"`);
    }
  } catch {
    // Ignore error if open fails
  }

  const code = await new Promise<string>((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url || "", true);
      if (parsedUrl.pathname === "/oauth2callback") {
        const authCode = parsedUrl.query.code as string;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>✅ Otorisasi YouTube Berhasil!</h2>
              <p>Token baru telah disimpan. Anda bisa menutup tab ini dan kembali ke terminal.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3000, () => {
      console.log("⏳ Menunggu konfirmasi login di browser (http://localhost:3000/oauth2callback) ...");
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✔ Token baru berhasil disimpan di: ${TOKEN_PATH}`);

  if (tokens.refresh_token) {
    console.log("🔄 Memperbarui GitHub Secrets & .env...");
    const envPath = path.resolve("./.env");
    let envContent = await fs.readFile(envPath, "utf-8");
    if (envContent.includes("YOUTUBE_REFRESH_TOKEN=")) {
      envContent = envContent.replace(/YOUTUBE_REFRESH_TOKEN=".*"/g, `YOUTUBE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    } else {
      envContent += `\nYOUTUBE_REFRESH_TOKEN="${tokens.refresh_token}"\n`;
    }
    await fs.writeFile(envPath, envContent, "utf-8");

    try {
      execSync(`gh auth switch -u ramustha && gh secret set YOUTUBE_REFRESH_TOKEN --body "${tokens.refresh_token}" --repo ramustha/storybook-video-generator && gh auth switch -u gdncomm-ramadhani-musthofa`, { stdio: "inherit" });
      console.log("✔ GitHub Actions secret YOUTUBE_REFRESH_TOKEN berhasil diperbarui!");
    } catch (err: any) {
      console.warn("⚠️ Warning updating GitHub secret:", err.message);
    }
  }

  console.log("\n🎉 YouTube re-auth selesai! Anda dapat langsung menjalankan upload.");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
