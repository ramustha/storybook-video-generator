/**
 * BUDI Kemendikdasmen Authentication Utility
 * 
 * Automates login session creation for https://budi.kemendikdasmen.go.id/
 * Handles CSRF tokens, math captcha solving, and cookie persistence.
 * 
 * Usage:
 *   npx tsx scripts/budi-auth.ts [--email <email>] [--password <password>] [--captcha <answer>]
 */

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import readline from "readline";

const SESSION_PATH = path.resolve(process.cwd(), "config/budi-session.json");
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function promptQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

export async function loginBudi(email?: string, password?: string, captchaAnswer?: string): Promise<string[]> {
  const userEmail = email || process.env.BUDI_EMAIL || "atkcollection110@gmail.com";
  const userPassword = password || process.env.BUDI_PASSWORD || "vmZicB$04orbI@";

  console.log(`🔐 Initiating BUDI login for: ${userEmail}`);

  // 1. Fetch login page to get CSRF token and initial cookies
  const loginPageRes = await fetch("https://budi.kemendikdasmen.go.id/login", {
    headers: { "User-Agent": USER_AGENT },
  });

  const html = await loginPageRes.text();
  const tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/i);
  if (!tokenMatch) {
    throw new Error("Failed to extract CSRF token from BUDI login page");
  }
  const csrfToken = tokenMatch[1];

  // Extract cookies
  // @ts-ignore
  const rawCookies: string[] = loginPageRes.headers.getSetCookie ? loginPageRes.headers.getSetCookie() : [loginPageRes.headers.get("set-cookie") || ""];
  const cookieHeaders = rawCookies.map((c) => c.split(";")[0]).filter(Boolean);

  // Extract captcha image url
  const captchaImgMatch = html.match(/<img[^>]+src="([^">]*captcha\/default[^">]*)"/i);
  let captchaUrl = captchaImgMatch ? captchaImgMatch[1] : "";
  if (captchaUrl.startsWith("/")) {
    captchaUrl = `https://budi.kemendikdasmen.go.id${captchaUrl}`;
  }

  console.log(`🖼️  Captcha image URL: ${captchaUrl}`);

  // 2. Fetch captcha image
  let answer = captchaAnswer;
  if (!answer && captchaUrl) {
    const captchaRes = await fetch(captchaUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookieHeaders.join("; "),
      },
    });

    const buffer = Buffer.from(await captchaRes.arrayBuffer());
    const tempCaptchaPath = path.resolve(process.cwd(), "tmp/budi-captcha.png");
    await fs.mkdir(path.dirname(tempCaptchaPath), { recursive: true });
    await fs.writeFile(tempCaptchaPath, buffer);

    console.log(`📥 Saved captcha image to: ${tempCaptchaPath}`);
    console.log(`👉 Please view the image above and input the math solution (e.g. 12 + 5 = 17)`);
    answer = await promptQuestion("Enter Captcha Answer: ");
  }

  if (!answer) {
    throw new Error("No captcha answer provided");
  }

  // 3. Post login credentials
  const params = new URLSearchParams();
  params.set("_token", csrfToken);
  params.set("email", userEmail);
  params.set("password", userPassword);
  params.set("captcha", answer);

  const authRes = await fetch("https://budi.kemendikdasmen.go.id/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Cookie: cookieHeaders.join("; "),
    },
    body: params.toString(),
    redirect: "manual",
  });

  // A redirect (302) means successful authentication
  if (authRes.status === 302 || authRes.status === 200) {
    // @ts-ignore
    const authCookies: string[] = authRes.headers.getSetCookie ? authRes.headers.getSetCookie() : [authRes.headers.get("set-cookie") || ""];
    const mergedCookies = [...cookieHeaders, ...authCookies.map((c) => c.split(";")[0])];

    const sessionData = {
      authenticatedAt: new Date().toISOString(),
      email: userEmail,
      cookies: mergedCookies,
    };

    await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
    await fs.writeFile(SESSION_PATH, JSON.stringify(sessionData, null, 2), "utf-8");
    console.log(`✅ Logged in successfully! Session saved to: ${SESSION_PATH}`);
    return mergedCookies;
  } else {
    const errorHtml = await authRes.text();
    const errorMatch = errorHtml.match(/class="alert alert-danger"[^>]*>([\s\S]*?)<\/div>/i);
    const errorMsg = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, "").trim() : `HTTP ${authRes.status}`;
    throw new Error(`Login failed: ${errorMsg}`);
  }
}

// CLI execution
if (require.main === module || process.argv[1].endsWith("budi-auth.ts")) {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf("--email");
  const email = emailIdx !== -1 ? args[emailIdx + 1] : undefined;

  const passIdx = args.indexOf("--password");
  const pass = passIdx !== -1 ? args[passIdx + 1] : undefined;

  const capIdx = args.indexOf("--captcha");
  const captcha = capIdx !== -1 ? args[capIdx + 1] : undefined;

  loginBudi(email, pass, captcha).catch((err) => {
    console.error("❌ Auth Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
