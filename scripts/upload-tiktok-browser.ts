import {
  launchInteractiveLogin,
  isTikTokSessionAuthenticated,
  uploadVideoViaPuppeteer,
  SESSION_DIR,
} from "./puppeteer-tiktok-uploader";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

function buildTikTokCaption(story: any, lang: "id" | "en"): string {
  if (lang === "id") {
    const rawTitle = (story.title || "Cerita Anak Bergambar").replace(/\(.*\)/, "").trim();
    const hook = story.thumbnailConfig?.id?.hook || story.thumbnailConfig?.id?.headlineTop || "Kisah seru dan edukatif!";
    return `${rawTitle} 🐱📚\n\n${hook}\n\n📖 Seri Animasi Dongeng Zayn Storybook\n✨ Nilai Moral: Selalu tolong menolong dan berbuat baik!\n\n#ceritaanak #dongeng #edukasianak #kartunanak #zaynstorybook #animasianak #reels`;
  } else {
    const rawTitle = story.originalTitle || story.title || "Children Storybook";
    const hook = story.thumbnailConfig?.en?.hook || story.thumbnailConfig?.en?.headlineTop || "A wonderful bedtime story!";
    return `${rawTitle} 🐱📚\n\n${hook}\n\n📖 Zayn Storybook - Animated Children's Stories\n✨ Moral: Kindness and honesty always win!\n\n#kidsbooks #storytime #bedtimestory #animation #childrensbook #zaynstorybook`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isLogin = args.includes("--login");
  const isStatus = args.includes("--status");
  const isDryRun = args.includes("--dry-run");
  const isHeadless = args.includes("--headless");
  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const lang = (getArg("--lang") || "id") as "id" | "en";

  if (isLogin) {
    const loginOk = await launchInteractiveLogin();
    process.exit(loginOk ? 0 : 1);
  }

  if (isStatus) {
    console.log("\n=========================================");
    console.log("    TikTok Browser Session Status        ");
    console.log("=========================================");
    console.log(`Session Dir:  ${SESSION_DIR}`);
    console.log(`Directory:    ${existsSync(SESSION_DIR) ? "EXISTS" : "NOT FOUND"}`);
    const isAuth = await isTikTokSessionAuthenticated();
    console.log(`Auth Status:  ${isAuth ? "LOGGED IN ✔" : "NOT LOGGED IN ❌"}`);
    console.log("=========================================\n");
    if (!isAuth) {
      console.log("👉 Run: npm run upload:tiktok:browser -- --login to authenticate.");
    }
    return;
  }

  // Check login
  const isAuth = await isTikTokSessionAuthenticated();
  if (!isAuth) {
    console.error("❌ TikTok browser session not authenticated.");
    console.log("👉 Please run: npm run upload:tiktok:browser -- --login to log in via Chrome first.");
    process.exit(1);
  }

  // Load story
  const storyDir = path.resolve("./stories", bookSlug);
  const manifestPath = path.join(storyDir, "story.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Story manifest not found at ${manifestPath}`);
  }

  const storyData = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const caption = buildTikTokCaption(storyData, lang);

  // Locate 9:16 vertical video
  const possiblePaths = [
    path.join(storyDir, `exports/${bookSlug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/${bookSlug}-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/annual-haircut-day-9x16.mp4`),
    path.join(storyDir, `exports/${lang}/the-red-raincoat-9x16.mp4`),
  ];

  let videoPath = "";
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      videoPath = p;
      break;
    }
  }

  if (!videoPath) {
    throw new Error(`Vertical 9:16 video not found for ${bookSlug}. Run npm run render -- --book ${bookSlug} first.`);
  }

  const result = await uploadVideoViaPuppeteer({
    videoPath,
    caption,
    dryRun: isDryRun,
    headless: isHeadless,
  });

  if (result.success) {
    console.log(`\n🎉 Upload successful! URL: ${result.postUrl || "TikTok Studio"}`);
  } else {
    console.error(`\n❌ Upload failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
