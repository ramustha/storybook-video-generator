import { chromium, type BrowserContext, type Page } from "playwright";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";

export interface BrowserUploadOptions {
  videoPath: string;
  title: string;
  description: string;
  thumbnailPath?: string;
  isMadeForKids?: boolean;
  privacy?: "public" | "unlisted" | "private";
  headless?: boolean;
  timeoutMs?: number;
}

export interface BrowserUploadResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  error?: string;
}

const SESSION_DIR = path.resolve("./config/youtube-browser-session");

/**
 * Checks if a saved browser session is already authenticated with YouTube Studio.
 */
export async function isBrowserSessionAuthenticated(): Promise<boolean> {
  if (!existsSync(SESSION_DIR)) return false;

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      channel: "chrome",
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });

    const page = await context.newPage();
    await page.goto("https://studio.youtube.com", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const currentUrl = page.url();
    const isLoggedIn =
      currentUrl.includes("studio.youtube.com") &&
      !currentUrl.includes("accounts.google.com");

    await context.close();
    return isLoggedIn;
  } catch {
    if (context) await context.close().catch(() => {});
    return false;
  }
}

/**
 * Interactive one-time login wizard that opens genuine native Google Chrome (no automation flags),
 * connects over CDP, and saves the session to config/youtube-browser-session.
 */
export async function launchInteractiveLogin(): Promise<boolean> {
  console.log("\n========================================================");
  console.log("🔑 YouTube Studio Interactive Login (Native Chrome)");
  console.log("========================================================");
  console.log("Launching genuine Google Chrome instance...");
  console.log("Please log in to your Google Account and select your YouTube channel.");
  console.log("Once you reach YouTube Studio, the session will be saved automatically.\n");

  await fs.mkdir(SESSION_DIR, { recursive: true });

  const port = 9222;
  const isMac = process.platform === "darwin";

  if (isMac) {
    spawn(
      "open",
      [
        "-na",
        "Google Chrome",
        "--args",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${SESSION_DIR}`,
        "https://studio.youtube.com",
      ],
      { stdio: "ignore" }
    );
  } else {
    spawn(
      "google-chrome",
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${SESSION_DIR}`,
        "https://studio.youtube.com",
      ],
      { stdio: "ignore" }
    );
  }

  console.log("⏳ Connecting to Chrome over CDP on port 9222...");
  let browser: any = null;
  for (let i = 0; i < 20; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (!browser) {
    console.warn("⚠️ Could not connect via CDP, falling back to persistent context...");
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    });
    const page = await context.newPage();
    await page.goto("https://studio.youtube.com", { timeout: 60000 });
    try {
      await page.waitForSelector("#create-icon, ytcp-button#create-icon, #channel-title", {
        timeout: 240000,
      });
      console.log("✔ Login detected! Session successfully captured in:", SESSION_DIR);
      await page.waitForTimeout(2000);
      await context.close();
      return true;
    } catch {
      await context.close().catch(() => {});
      return false;
    }
  }

  console.log("✔ Connected! Waiting for you to log in to YouTube Studio (up to 5 minutes)...");

  try {
    const startTime = Date.now();
    const timeoutMs = 300000; // 5 minutes

    while (Date.now() - startTime < timeoutMs) {
      const contexts = browser.contexts();
      for (const ctx of contexts) {
        for (const p of ctx.pages()) {
          const url = p.url();
          if (url.includes("studio.youtube.com") && !url.includes("accounts.google.com")) {
            const isStudioReady = await p
              .$("#create-icon, ytcp-button#create-icon, #channel-title")
              .catch(() => null);
            if (isStudioReady) {
              console.log("\n🎉 Login detected! Session successfully saved in:", SESSION_DIR);
              await p.waitForTimeout(3000);
              await browser.close().catch(() => {});
              return true;
            }
          }
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.error("❌ Login timed out after 5 minutes.");
    await browser.close().catch(() => {});
    return false;
  } catch (err: any) {
    console.error("❌ Error during login monitoring:", err.message);
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

/**
 * Uploads a video to YouTube Studio using Playwright browser automation (Zero API Quota).
 */
export async function uploadVideoViaBrowser(
  options: BrowserUploadOptions
): Promise<BrowserUploadResult> {
  const {
    videoPath,
    title,
    description,
    thumbnailPath,
    isMadeForKids = false,
    privacy = "public",
    headless = true,
    timeoutMs = 300000, // 5 minutes default
  } = options;

  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found at: ${videoPath}`);
  }

  await fs.mkdir(SESSION_DIR, { recursive: true });

  let isCDP = false;
  let browser: any = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
    isCDP = true;
    console.log("🔗 Connected to active Google Chrome instance via CDP (port 9222)!");
    context = browser.contexts()[0] || (await browser.newContext());
    const existingPages = context.pages();
    page = existingPages.find((p: Page) => p.url().includes("studio.youtube.com")) || null;
    if (!page) {
      page = await context.newPage();
      await page.goto("https://studio.youtube.com", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
    } else {
      console.log(`📌 Using active YouTube Studio tab: ${page.url()}`);
      await page.bringToFront().catch(() => {});
    }
  } catch {
    console.log(`\n🚀 Launching Playwright browser uploader (Headless: ${headless})...`);
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      channel: "chrome",
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
      viewport: { width: 1280, height: 900 },
    });
    page = await context.newPage();
    console.log("🌐 Navigating to YouTube Studio...");
    await page.goto("https://studio.youtube.com", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
  }

  page.setDefaultTimeout(timeoutMs);

  try {
    // 1. Verify Authentication
    const currentUrl = page.url();
    if (currentUrl.includes("accounts.google.com") || currentUrl.includes("ServiceLogin")) {
      console.log("\n⚠️ Browser session is not authenticated yet.");
      console.log("🔑 Opening native Google Chrome for one-time YouTube Studio authentication...");
      if (isCDP && browser) await browser.close();
      else if (context) await context.close();

      const loginSuccess = await launchInteractiveLogin();
      if (!loginSuccess) {
        return {
          success: false,
          error:
            "One-time login was not completed or timed out. Please run 'npm run upload:login'.",
        };
      }
      console.log("✔ Session successfully authenticated! Resuming video upload...\n");
      return uploadVideoViaBrowser(options);
    }

    // 2. Check if upload dialog is already open, if not open it
    const existingFileInput = page.locator('input[type="file"]');
    if ((await existingFileInput.count()) === 0) {
      console.log("📤 Opening Upload Video dialog...");
      const createBtn = page
        .locator('ytcp-button:has-text("Create"), [aria-label="Create"], #create-icon, ytcp-button#create-icon')
        .first();
      await createBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const uploadItem = page
        .locator('tp-yt-paper-item:has-text("Upload videos"), [role="menuitem"]:has-text("Upload videos"), #text-item-0')
        .first();
      await uploadItem.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 3. Attach Video File to File Input
    console.log(`📁 Attaching file: ${path.basename(videoPath)}...`);
    const fileInput = await page.waitForSelector('input[type="file"]', {
      state: "attached",
      timeout: 20000,
    });
    await fileInput.setInputFiles(videoPath);

    // 4. Fill Metadata (Details Step)
    console.log("📝 Filling video details...");
    await page.waitForSelector(
      "#textbox[aria-label*='title' i], #title-textarea #textbox, [aria-label*='title' i][contenteditable='true']",
      { timeout: 60000 }
    );

    // Set Title
    const titleBox = page
      .locator(
        "#textbox[aria-label*='title' i], #title-textarea #textbox, [aria-label*='title' i][contenteditable='true']"
      )
      .first();
    if ((await titleBox.count()) > 0) {
      await titleBox.click({ force: true });
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.insertText(title);
      console.log(`   • Title set: "${title.slice(0, 50)}..."`);
    }

    // Set Description
    const descBox = page
      .locator(
        "#description-textarea #textbox, #textbox[aria-label*='description' i], [aria-label*='description' i][contenteditable='true']"
      )
      .first();
    if ((await descBox.count()) > 0 && description) {
      await descBox.click({ force: true });
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.insertText(description);
      console.log("   • Description populated.");
    }

    // Upload Custom Thumbnail if provided
    if (thumbnailPath && existsSync(thumbnailPath)) {
      try {
        console.log(`🖼️ Uploading custom thumbnail: ${path.basename(thumbnailPath)}...`);
        const thumbInput = await page.$(
          'input#file-loader, input[type="file"][accept*="image"]'
        );
        if (thumbInput) {
          await thumbInput.setInputFiles(thumbnailPath);
          console.log("   • Thumbnail attached.");
        }
      } catch (thumbErr: any) {
        console.warn(`   ⚠️ Thumbnail attach failed: ${thumbErr.message}`);
      }
    }

    // Set Audience ("Made for Kids")
    console.log(`👶 Setting Audience (${isMadeForKids ? "Made for Kids" : "Not for Kids"})...`);
    const audienceSelector = isMadeForKids
      ? 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"], [name="VIDEO_MADE_FOR_KIDS_MFK"]'
      : 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], [name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]';

    const audienceRadio = page.locator(audienceSelector).first();
    await audienceRadio.click({ force: true });

    // 5. Navigate through steps until Visibility tab is reached
    console.log("➡️ Advancing wizard steps to Visibility...");
    const visibilityRadioSelector =
      privacy === "public"
        ? 'tp-yt-paper-radio-button[name="PUBLIC"], [name="PUBLIC"]'
        : privacy === "private"
        ? 'tp-yt-paper-radio-button[name="PRIVATE"], [name="PRIVATE"]'
        : 'tp-yt-paper-radio-button[name="UNLISTED"], [name="UNLISTED"]';

    for (let step = 0; step < 5; step++) {
      const visRadio = page.locator(visibilityRadioSelector).first();
      if ((await visRadio.count()) > 0 && (await visRadio.isVisible())) {
        break;
      }
      const nextBtn = page
        .locator('#next-button:not([disabled]):not([aria-disabled="true"]), ytcp-button#next-button')
        .first();
      if ((await nextBtn.count()) > 0) {
        await nextBtn.click({ force: true });
        await page.waitForTimeout(1200);
      }
    }

    // 6. Set Visibility
    console.log(`🔒 Setting Visibility to [${privacy.toUpperCase()}]...`);
    const visibilityRadio = page.locator(visibilityRadioSelector).first();
    await visibilityRadio.click({ force: true });

    // 7. Extract Video ID / Link
    let videoId: string | undefined;
    let videoUrl: string | undefined;
    try {
      const linkElement = page
        .locator('a.ytcp-video-info, span.ytcp-video-info a, a.video-url-fadeable, a[href*="youtu.be"]')
        .first();
      if ((await linkElement.count()) > 0) {
        videoUrl = (await linkElement.getAttribute("href")) || undefined;
        if (videoUrl) {
          const match = videoUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
          if (match) videoId = match[1];
        }
      }
    } catch {
      // Ignore link extraction error
    }

    // 8. Publish / Save
    console.log("💾 Publishing video...");
    const doneBtn = page
      .locator('#done-button, ytcp-button#done-button, ytcp-button:has-text("Publish"), ytcp-button:has-text("Save")')
      .first();
    await doneBtn.click({ force: true });

    // Wait for the upload & saving completion
    console.log("⏳ Waiting for YouTube Studio save confirmation...");
    await page.waitForTimeout(5000);

    // If a completion close button appears, click it
    const closeBtn = page
      .locator("#close-button, ytcp-button#close-button, ytcp-button[aria-label*='Close' i]")
      .first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click({ force: true }).catch(() => {});
    }

    if (isCDP && browser) {
      await browser.close().catch(() => {});
    } else if (context) {
      await context.close().catch(() => {});
    }

    console.log(`🎉 Browser upload complete! Video URL: ${videoUrl || "Saved in YouTube Studio"}`);

    return {
      success: true,
      videoId,
      videoUrl,
    };
  } catch (err: any) {
    if (isCDP && browser) await browser.close().catch(() => {});
    else if (context) await context.close().catch(() => {});
    return {
      success: false,
      error: `Playwright browser upload failed: ${err.message}`,
    };
  }
}
