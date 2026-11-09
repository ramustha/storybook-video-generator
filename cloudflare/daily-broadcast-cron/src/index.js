/**
 * Cloudflare Worker: Zayn Storybook Master Scheduler & Webhook Trigger
 * Runs reliably on exact Cron triggers without GitHub Actions queue delays.
 */

async function dispatchWorkflow(env, workflowFile, inputs = null) {
  const githubRepo = env.GITHUB_REPO || "ramustha/storybook-video-generator";
  const githubToken = env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error(`❌ GITHUB_TOKEN secret is not set in Cloudflare Worker!`);
    return { success: false, error: "Missing GITHUB_TOKEN" };
  }

  const url = `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowFile}/dispatches`;

  const body = {
    ref: "main",
    ...(inputs ? { inputs } : {}),
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
    console.log(`✔ Successfully dispatched ${workflowFile}!`);
    return { success: true };
  } else {
    const errText = await res.text();
    console.error(`❌ Dispatch ${workflowFile} failed with HTTP ${res.status}: ${errText}`);
    return { success: false, status: res.status, error: errText };
  }
}

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    const now = new Date();
    console.log(`⏰ Triggered by Cloudflare Cron: "${cron}" at ${now.toISOString()}`);

    // 1. Morning Teaser Announcement (00:30 UTC = 07:30 WIB)
    if (cron === "30 0 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "announcement",
          slot: "morning",
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
    // 2. Morning Full Broadcast (01:30 UTC = 08:30 WIB)
    else if (cron === "30 1 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "broadcast",
          slot: "morning",
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
    // 3. Evening Teaser Announcement (11:00 UTC = 18:00 WIB)
    else if (cron === "0 11 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "announcement",
          slot: "evening",
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
    // 4. Evening Prime Bedtime Broadcast (12:00 UTC = 19:00 WIB)
    else if (cron === "0 12 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "broadcast",
          slot: "evening",
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
    // 5. Ingestion & Analytics (00:00 UTC = 07:00 WIB Mon & Thu)
    else if (cron === "0 0 * * 1,4") {
      // Ingest buffer on Monday & Thursday
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-story-ingest.yml", {
          book: "auto",
          batch_size: "4",
          force: false,
          dry_run: false,
          skip_qc: false,
        })
      );

      // Weekly analytics on Monday only (UTC Day 1)
      if (now.getUTCDay() === 1) {
        ctx.waitUntil(dispatchWorkflow(env, "weekly-analytics.yml"));
      }
    }
    else {
      // Fallback based on hour if invoked by manual cron testing
      const utcHour = now.getUTCHours();
      const slot = utcHour < 6 ? "morning" : "evening";
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "broadcast",
          slot: slot,
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
  },

  // Manual HTTP trigger support (e.g. curl https://zayn-storybook-cron-trigger.../?workflow=daily-broadcast.yml)
  async fetch(request, env) {
    const url = new URL(request.url);
    const authKey = request.headers.get("X-Trigger-Key") || url.searchParams.get("key");

    if (env.TRIGGER_KEY && authKey !== env.TRIGGER_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const workflow = url.searchParams.get("workflow") || "daily-broadcast.yml";
    const action = url.searchParams.get("action") || "broadcast";
    const slot = url.searchParams.get("slot") || "auto";
    const book = url.searchParams.get("book") || "auto";
    const lang = url.searchParams.get("lang") || "auto";
    const dryRun = url.searchParams.get("dry_run") === "true";

    let inputs = null;
    if (workflow === "daily-broadcast.yml") {
      inputs = { action, slot, book, lang, dry_run: dryRun };
    } else if (workflow === "daily-story-ingest.yml") {
      inputs = {
        book,
        batch_size: url.searchParams.get("batch_size") || "4",
        force: url.searchParams.get("force") === "true",
        dry_run: dryRun,
        skip_qc: url.searchParams.get("skip_qc") === "true",
      };
    }

    const result = await dispatchWorkflow(env, workflow, inputs);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : (result.status || 500),
      headers: { "Content-Type": "application/json" },
    });
  },
};
