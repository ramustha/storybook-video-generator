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
    const scheduledDate = new Date(event.scheduledTime || Date.now());
    const utcHour = scheduledDate.getUTCHours();
    console.log(`⏰ Triggered by Cloudflare Cron: "${cron}" at ${scheduledDate.toISOString()} (UTC Hour: ${utcHour})`);

    // 1. Wave 1 Daily Unified Bilingual Announcement (00:15 UTC = 07:15 WIB)
    if (cron === "15 0 * * *" || cron === "30 0 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "announcement",
          slot: "daily",
          book: "auto",
          lang: "auto",
          dry_run: false,
        })
      );
    }
    // 2. Daily Morning Broadcast (01:30 UTC = 08:30 WIB) - English Feature
    else if (cron === "30 1 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "broadcast",
          slot: "morning",
          book: "auto",
          lang: "en",
          dry_run: false,
        })
      );
    }
    // 3. Wave 2 (05:30 UTC = 12:30 WIB) & Wave 3 (13:30 UTC = 20:30 WIB) Post-Publish Funnel
    else if (cron === "30 5,13 * * *") {
      const isWave2 = utcHour < 10;
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: isWave2 ? "wave2" : "wave3",
          slot: isWave2 ? "morning" : "evening",
          book: "auto",
          lang: isWave2 ? "en" : "id",
          dry_run: false,
        })
      );
    }
    // 4. Consolidated 00:00 / 12:00 / 19:00 UTC trigger
    else if (cron === "0 0,12,19 * * *") {
      if (utcHour === 0) {
        ctx.waitUntil(
          dispatchWorkflow(env, "daily-story-ingest.yml", {
            book: "auto",
            batch_size: "1",
            force: false,
            dry_run: false,
            skip_qc: false,
          })
        );
        if (scheduledDate.getUTCDay() === 1) {
          ctx.waitUntil(dispatchWorkflow(env, "weekly-analytics.yml"));
          ctx.waitUntil(
            dispatchWorkflow(env, "storage-cleanup.yml", {
              dry_run: false,
              keep_latest: "1",
              min_age_hours: "48",
            })
          );
        }
      } else if (utcHour === 12) {
        ctx.waitUntil(
          dispatchWorkflow(env, "daily-broadcast.yml", {
            action: "broadcast",
            slot: "evening",
            book: "auto",
            lang: "id",
            dry_run: false,
          })
        );
      } else {
        ctx.waitUntil(
          dispatchWorkflow(env, "buffer-prerender.yml", {
            days: "3",
            force: false,
            dry_run: false,
          })
        );
      }
    }
    // Legacy individual cron fallbacks (kept for manual Cloudflare Dashboard tests)
    else if (cron === "0 12 * * *" || cron === "30 11 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-broadcast.yml", {
          action: "broadcast",
          slot: "evening",
          book: "auto",
          lang: "id",
          dry_run: false,
        })
      );
    }
    else if (cron === "0 0 * * *" || cron === "0 0 * * 1,4") {
      ctx.waitUntil(
        dispatchWorkflow(env, "daily-story-ingest.yml", {
          book: "auto",
          batch_size: "1",
          force: false,
          dry_run: false,
          skip_qc: false,
        })
      );

      if (scheduledDate.getUTCDay() === 1) {
        ctx.waitUntil(dispatchWorkflow(env, "weekly-analytics.yml"));
        ctx.waitUntil(
          dispatchWorkflow(env, "storage-cleanup.yml", {
            dry_run: false,
            keep_latest: "1",
            min_age_hours: "48",
          })
        );
      }
    }
    else if (cron === "0 19 * * *") {
      ctx.waitUntil(
        dispatchWorkflow(env, "buffer-prerender.yml", {
          days: "3",
          force: false,
          dry_run: false,
        })
      );
    }
    else {
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
        run_buffer: url.searchParams.get("run_buffer") !== "false",
      };
    } else if (workflow === "buffer-prerender.yml") {
      inputs = {
        days: url.searchParams.get("days") || "3",
        force: url.searchParams.get("force") === "true",
        dry_run: dryRun,
      };
    }

    const result = await dispatchWorkflow(env, workflow, inputs);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : (result.status || 500),
      headers: { "Content-Type": "application/json" },
    });
  },
};
