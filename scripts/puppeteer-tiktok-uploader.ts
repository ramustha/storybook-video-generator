import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import readline from "readline";

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export interface TikTokUploadOptions {
  videoPath: string;
  caption: string;
  privacy?: "public" | "friends" | "private";
  headless?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
}

export interface TikTokUploadResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

export const SESSION_DIR = path.resolve("./config/tiktok-browser-session");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Checks if a saved browser session is already authenticated with TikTok Studio.
 */
export async function isTikTokSessionAuthenticated(): Promise<boolean> {
  if (!existsSync(SESSION_DIR)) return false;

  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      executablePath: existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      userDataDir: SESSION_DIR,
      headless: true,
      defaultViewport: { width: 1440, height: 900 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();
    await page.goto("https://www.tiktok.com/tiktokstudio/upload", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    // Wait for client-side routing to settle
    await new Promise((r) => setTimeout(r, 4000));

    const finalUrl = page.url();
    const isLoginPage = finalUrl.includes("/login");
    const isStudio = finalUrl.includes("tiktokstudio") || finalUrl.includes("creator-center");

    const fileInput = await page.$('input[type="file"]');
    const isLoggedIn = isStudio && !isLoginPage && !!fileInput;

    await browser.close();
    return isLoggedIn;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

/**
 * Launches an interactive headful browser window for the user to log into TikTok once.
 */
export async function launchInteractiveLogin(): Promise<boolean> {
  console.log("\n=======================================================");
  console.log("       TikTok Studio Interactive Browser Login         ");
  console.log("=======================================================");
  console.log(`📁 Session directory: ${SESSION_DIR}`);
  console.log("👉 Opening Chrome browser window directly to TikTok Studio...");
  console.log("👉 Please complete your login (Google, QR code, phone/email).");
  console.log("👉 Once you see your TikTok Studio upload page, press [ENTER] here.");
  console.log("=======================================================\n");

  await fs.mkdir(SESSION_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    userDataDir: SESSION_DIR,
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
    ],
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  // Navigate directly to TikTok Studio Upload
  await page.goto("https://www.tiktok.com/tiktokstudio/upload", {
    waitUntil: "domcontentloaded",
  });

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const cleanup = async (success: boolean) => {
      if (resolved) return;
      resolved = true;
      try {
        await browser.close();
      } catch (e) {}
      resolve(success);
    };

    browser.on("disconnected", () => {
      cleanup(false);
    });

    // 1. Interactive terminal prompt (User confirms when done)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("\n➡️  Log in on the open Chrome window, then press [ENTER] here: ", async () => {
      rl.close();
      console.log("\n🔍 Verifying login status on TikTok Studio...");

      try {
        // Navigate or check current page state
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);

        if (currentUrl.includes("/login")) {
          // If still on login page, give one more try to navigate to studio
          await page.goto("https://www.tiktok.com/tiktokstudio/upload", {
            waitUntil: "domcontentloaded",
          });
          await new Promise((r) => setTimeout(r, 4000));
        }

        const finalUrl = page.url();
        console.log(`Final verified URL: ${finalUrl}`);

        const fileInput = await page.$('input[type="file"]');
        const isStudio =
          (finalUrl.includes("tiktokstudio") || finalUrl.includes("creator-center")) &&
          !finalUrl.includes("/login");

        if (isStudio || fileInput) {
          console.log("🎉 SUCCESS: Logged in and verified! Session saved successfully.");
          await cleanup(true);
        } else {
          console.warn("⚠️ Warning: Could not detect Studio dashboard. Session might still be incomplete.");
          await cleanup(false);
        }
      } catch (err: any) {
        console.error("Verification error:", err.message);
        await cleanup(false);
      }
    });

    // 2. Background auto-checker (in case user finishes quickly)
    const checkInterval = setInterval(async () => {
      if (resolved) {
        clearInterval(checkInterval);
        return;
      }
      try {
        const finalUrl = page.url();
        const isStudio =
          (finalUrl.includes("tiktokstudio") || finalUrl.includes("creator-center")) &&
          !finalUrl.includes("/login");

        if (isStudio) {
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            clearInterval(checkInterval);
            console.log("\n🎉 Auto-detected active TikTok Studio upload dashboard!");
            rl.close();
            await cleanup(true);
          }
        }
      } catch (e) {}
    }, 3000);
  });
}

/**
 * Uploads video to TikTok via Puppeteer browser automation.
 */
export async function uploadVideoViaPuppeteer(
  options: TikTokUploadOptions
): Promise<TikTokUploadResult> {
  const isHeadless = options.headless ?? false; // default headful for live observation
  const timeoutMs = options.timeoutMs || 120000;

  console.log("\n=======================================================");
  console.log("       TikTok Studio Browser Uploader (Puppeteer)      ");
  console.log("=======================================================");
  console.log(`📁 Video:     ${path.basename(options.videoPath)}`);
  console.log(`🧪 Mode:      ${options.dryRun ? "DRY RUN (Preview Only)" : "LIVE PUBLISH"}`);
  console.log(`🖥️ Headless:  ${isHeadless ? "YES" : "NO (Visual Window)"}`);
  console.log("=======================================================\n");

  if (!existsSync(options.videoPath)) {
    return { success: false, error: `Video file not found at ${options.videoPath}` };
  }

  const browser = await puppeteer.launch({
    executablePath: existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    userDataDir: SESSION_DIR,
    headless: isHeadless,
    defaultViewport: isHeadless ? { width: 1440, height: 900 } : null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1440,900",
    ],
  });

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    console.log("🌐 Navigating to TikTok Studio Upload Page...");
    await page.goto("https://www.tiktok.com/tiktokstudio/upload", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // Wait for initial DOM hydration
    await new Promise((r) => setTimeout(r, 4000));

    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      await browser.close();
      return {
        success: false,
        error: "Session expired or not logged in. Please run: npm run upload:tiktok:browser -- --login",
      };
    }

    console.log("✔ Upload page loaded. Locating file input element...");

    // Wait for file input (might be in an iframe or direct on page)
    let fileInputHandle: any = null;
    try {
      fileInputHandle = await page.waitForSelector('input[type="file"]', {
        timeout: 15000,
      });
    } catch (e) {
      // Check inside iframes if not found directly
      for (const frame of page.frames()) {
        try {
          const input = await frame.$('input[type="file"]');
          if (input) {
            fileInputHandle = input;
            console.log("✔ Located file input inside iframe!");
            break;
          }
        } catch {}
      }
    }

    if (!fileInputHandle) {
      // Try searching by accept attribute
      fileInputHandle = await page.$('input[accept*="video"]');
    }

    if (!fileInputHandle) {
      await page.screenshot({ path: "stories/branding/tiktok-error-upload.png" });
      await browser.close();
      return {
        success: false,
        error: "Could not find file input on TikTok upload page. Screenshot saved to stories/branding/tiktok-error-upload.png",
      };
    }

    console.log(`📤 Uploading file: ${options.videoPath}...`);
    await fileInputHandle.uploadFile(options.videoPath);

    console.log("⏳ Waiting for video upload processing...");
    // Wait for the video processing container to render
    await new Promise((r) => setTimeout(r, 6000));

    // Fill caption
    console.log("✍️ Entering video caption and hashtags...");
    const captionSelectors = [
      'div[contenteditable="true"]',
      'div[role="combobox"]',
      'div.DraftEditor-root',
      'div.notranslate',
      'textarea',
    ];

    let captionElement: any = null;
    for (const sel of captionSelectors) {
      captionElement = await page.$(sel);
      if (captionElement) break;
    }

    if (captionElement) {
      await captionElement.click();
      // Clear existing default text (filename)
      await page.keyboard.down("Meta");
      await page.keyboard.press("a");
      await page.keyboard.up("Meta");
      await page.keyboard.press("Backspace");

      // Type the caption
      await page.keyboard.type(options.caption, { delay: 20 });
      console.log("✔ Caption typed successfully!");
    } else {
      console.warn("⚠️ Could not locate caption box automatically.");
    }

    // Wait for upload progress to complete (e.g. "Uploaded" or "100%")
    console.log("⏳ Waiting for upload progress completion...");
    await new Promise((r) => setTimeout(r, 8000));

    if (options.dryRun) {
      console.log("\n🧪 DRY RUN MODE: Video uploaded and caption typed.");
      console.log("📌 Skipping final 'Post' click. Taking preview screenshot...");
      await page.screenshot({ path: "stories/branding/tiktok-preview.png" });
      console.log("📸 Screenshot saved to stories/branding/tiktok-preview.png");
      await new Promise((r) => setTimeout(r, 4000));
      await browser.close();
      return { success: true, postUrl: "https://www.tiktok.com/tiktokstudio/upload (preview)" };
    }

    // Live Post: Click Post Button
    console.log("🚀 Clicking 'Post' button...");
    const postButtons = await page.$$('button');
    let posted = false;

    for (const btn of postButtons) {
      const text = await page.evaluate((el: any) => el.textContent?.trim(), btn);
      if (text === "Post" || text === "Publish" || text === "Posting") {
        await btn.click();
        posted = true;
        console.log(`✔ Clicked '${text}' button!`);
        break;
      }
    }

    if (!posted) {
      await page.screenshot({ path: "stories/branding/tiktok-post-btn-not-found.png" });
      await browser.close();
      return {
        success: false,
        error: "Could not find 'Post' button. Screenshot saved to stories/branding/tiktok-post-btn-not-found.png",
      };
    }

    // Wait for post confirmation modal or redirect
    console.log("⏳ Waiting for publish confirmation...");
    await new Promise((r) => setTimeout(r, 8000));

    await page.screenshot({ path: "stories/branding/tiktok-published.png" });
    console.log("🎉 Video published successfully to TikTok!");
    await browser.close();

    return {
      success: true,
      postUrl: "https://www.tiktok.com/@zayn.storybook",
    };
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: err.message };
  }
}
