/**
 * Cloudflare Worker: Zayn Storybook Daily Broadcast Webhook Trigger
 * Runs reliably on exact Cron triggers without GitHub Actions queue delays.
 */
export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log(`⏰ Triggered by Cloudflare Cron: ${cron} at ${new Date().toISOString()}`);

    // Determine target slot based on UTC hour:
    // 01:30 UTC = 08:30 WIB (Morning Slot)
    // 12:00 UTC = 19:00 WIB (Evening / Bedtime Slot)
    const utcHour = new Date().getUTCHours();
    const slot = utcHour < 6 ? "morning" : "evening";

    const githubRepo = env.GITHUB_REPO || "ramustha/storybook-video-generator";
    const githubToken = env.GITHUB_TOKEN;

    if (!githubToken) {
      console.error("❌ GITHUB_TOKEN secret is not set in Cloudflare Worker!");
      return;
    }

    const url = `https://api.github.com/repos/${githubRepo}/actions/workflows/daily-broadcast.yml/dispatches`;

    const body = {
      ref: "main",
      inputs: {
        book: "auto",
        lang: "auto",
        slot: slot,
        dry_run: false,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ZaynStorybook-Cloudflare-CronTrigger",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 204) {
      console.log(`✔ Successfully dispatched GitHub Actions daily-broadcast (${slot} slot)!`);
    } else {
      const errText = await res.text();
      console.error(`❌ GitHub dispatch failed with HTTP ${res.status}: ${errText}`);
    }
  },

  // Also support manual trigger via HTTP GET/POST with simple authorization
  async fetch(request, env) {
    const url = new URL(request.url);
    const authKey = request.headers.get("X-Trigger-Key") || url.searchParams.get("key");

    if (env.TRIGGER_KEY && authKey !== env.TRIGGER_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const slot = url.searchParams.get("slot") || "auto";
    const book = url.searchParams.get("book") || "auto";
    const lang = url.searchParams.get("lang") || "auto";
    const dryRun = url.searchParams.get("dry_run") === "true";

    const githubRepo = env.GITHUB_REPO || "ramustha/storybook-video-generator";
    const githubToken = env.GITHUB_TOKEN;

    const res = await fetch(
      `https://api.github.com/repos/${githubRepo}/actions/workflows/daily-broadcast.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ZaynStorybook-Cloudflare-CronTrigger",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { book, lang, slot, dry_run: dryRun },
        }),
      }
    );

    if (res.status === 204) {
      return new Response(JSON.stringify({ success: true, message: "Workflow dispatched successfully!" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const err = await res.text();
    return new Response(JSON.stringify({ success: false, error: err }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
