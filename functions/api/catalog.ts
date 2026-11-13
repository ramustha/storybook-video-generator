// Cloudflare Pages Function: /api/catalog
// Queries live storybook & publication metadata from Cloudflare D1 (zayn-storybook-db)

interface Env {
  DB?: D1Database;
}

function formatSlugToTitle(slug: string): string {
  if (!slug) return "Story";
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export async function onRequest(context: { env: Env; request: Request }) {
  const method = context.request.method;

  // Handle CORS preflight securely
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Reject unsupported mutation methods
  if (method !== "GET" && method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Allow": "GET, HEAD, OPTIONS",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const db = context.env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({
        success: false,
        source: "fallback",
        message: "Cloudflare D1 binding 'DB' is not configured yet. Using static pre-rendered catalog.",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }

  try {
    // 1. Fetch books and publications from D1
    const { results: books } = await db
      .prepare("SELECT * FROM books ORDER BY id ASC")
      .all();

    const { results: publications } = await db
      .prepare(`
        SELECT p.*, s.views, s.likes, s.comments, s.shares, s.watch_time_minutes, s.recorded_at as stats_recorded_at
        FROM publications p
        LEFT JOIN publication_stats s ON p.external_id = s.external_id
        ORDER BY p.published_at DESC
      `)
      .all();

    const bookMap = new Map<string, any>();
    for (const b of books as any[]) {
      bookMap.set(b.slug, b);
    }

    // 2. Format into AuditRecord format expected by frontend
    const auditRecords: any[] = [];
    let counter = 1;

    for (const p of publications as any[]) {
      // Defensive filter: Skip invalid/unsupported platforms or entries without ID/URL
      if (p.platform === "announcements" || (!p.external_id && !p.video_url)) {
        continue;
      }

      const b = bookMap.get(p.book_slug) || {};
      const isMarathon = p.book_slug.includes("bedtime") || p.book_slug.includes("kompilasi");

      let platformName = "YouTube";
      let platformIcon = "youtube";
      if (p.platform === "facebook") {
        platformName = "Facebook";
        platformIcon = "facebook";
      } else if (p.platform === "instagram") {
        platformName = "Instagram";
        platformIcon = "instagram";
      } else if (p.platform === "threads") {
        platformName = "Threads";
        platformIcon = "threads";
      } else if (p.platform === "tiktok") {
        platformName = "TikTok";
        platformIcon = "tiktok";
      } else if (p.platform === "telegram") {
        platformName = "Telegram";
        platformIcon = "telegram";
      }

      let formatLabel = "Landscape (16:9)";
      let aspectRatio = "16:9";
      if (p.format === "vertical") {
        aspectRatio = "9:16";
        if (p.platform === "youtube") formatLabel = "Shorts (9:16)";
        else if (p.platform === "facebook") formatLabel = "Facebook Reel (9:16)";
        else if (p.platform === "instagram") formatLabel = "Instagram Reel (9:16)";
        else formatLabel = "Vertical (9:16)";
      } else if (p.format === "post") {
        aspectRatio = "4:5";
        formatLabel = p.platform === "threads" ? "Threads Post" : "Social Post";
      } else if (p.format === "notification") {
        aspectRatio = "16:9";
        formatLabel = "Telegram Notification";
      } else if (isMarathon) {
        formatLabel = "Marathon Video (16:9)";
      } else if (p.platform === "facebook") {
        formatLabel = "Watch Video (16:9)";
      }

      let thumbUrl = p.thumbnail_url;
      const isTargetVertical = p.format === "vertical";

      if (!thumbUrl) {
        // Priority 1: YouTube in same story with identical format AND identical language
        let ytPub = (publications as any[]).find(
          (other) =>
            other.book_slug === p.book_slug &&
            other.platform === "youtube" &&
            other.external_id &&
            other.lang === p.lang &&
            (isTargetVertical ? other.format === "vertical" : other.format !== "vertical")
        );

        // Priority 2: YouTube in same story with identical format (cross-language)
        if (!ytPub) {
          ytPub = (publications as any[]).find(
            (other) =>
              other.book_slug === p.book_slug &&
              other.platform === "youtube" &&
              other.external_id &&
              (isTargetVertical ? other.format === "vertical" : other.format !== "vertical")
          );
        }

        if (ytPub && ytPub.external_id) {
          thumbUrl = `https://img.youtube.com/vi/${ytPub.external_id}/hqdefault.jpg`;
        } else {
          // Priority 3: Fallback strictly to aspect-ratio matching brand emblem
          thumbUrl = isTargetVertical
            ? "branding/story-highlight-instagram-1080x1920.png"
            : "branding/cover-facebook-1640x924.png";
        }
      }

      const defaultStoryTitle = p.lang === "en" ? (b.title_en || b.title_id) : (b.title_id || b.title_en);

      auditRecords.push({
        id: `AUD-${String(counter++).padStart(3, "0")}`,
        storySlug: p.book_slug,
        storyTitleId: b.title_id || p.book_slug,
        storyTitleEn: b.title_en || b.title_id || p.book_slug,
        category: isMarathon ? "Compilation Marathon" : "Standalone Story",
        platform: platformName,
        platformIcon: platformIcon,
        language: p.lang || "id",
        format: formatLabel,
        aspectRatio,
        videoTitle: p.external_title || `${defaultStoryTitle || p.book_slug} - ${platformName}`,
        videoId: p.external_id || "",
        videoUrl: p.video_url || "",
        publishedAt: p.published_at || "",
        status: p.status || "published",
        privacy: "public",
        thumbnailUrl: thumbUrl,
        author: b.author || "Pratham Books Authors",
        illustrator: b.illustrator || "Ruchi Shah / StoryWeaver",
        license: b.license || "CC BY 4.0",
        sourceUrl: b.source_url || "https://storyweaver.org.in",
        views: p.views || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        shares: p.shares || 0,
        statsRecordedAt: p.stats_recorded_at || null,
      });
    }

    // 3. Optional: Fetch schedule calendar slots from D1
    let calendarSlots: any[] = [];
    try {
      const { results: cal } = await db
        .prepare(
          `SELECT 
            c.id as cal_id,
            c.scheduled_date,
            c.day_name,
            c.time_slot,
            c.slot_type,
            c.book_slug,
            c.lang,
            c.format,
            c.theme,
            c.is_completed,
            c.is_buffered,
            b.title_id,
            b.title_en,
            b.theme as book_theme
          FROM content_calendar c
          LEFT JOIN books b ON c.book_slug = b.slug
          ORDER BY c.scheduled_date ASC, c.time_slot ASC`
        )
        .all();

      if (Array.isArray(cal) && cal.length > 0) {
        const publishedSlugs = new Set(auditRecords.map((r) => r.storySlug));
        const todayIso = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        calendarSlots = (cal as any[]).map((c, idx) => {
          const dateStr = c.scheduled_date || "2026-11-07";
          const dayName = c.day_name || "Hari";
          const timeSlot = c.time_slot || "08:30 WIB";
          const slotType = c.slot_type || "Daily Broadcast";
          const bookSlug = c.book_slug || "story";
          const slotLang = c.lang || "id";
          const hasAsset = publishedSlugs.has(bookSlug);

          const isSlotPublished = auditRecords.some(
            (r) => r.storySlug === bookSlug && (r.language === slotLang || (!r.language && slotLang === "id"))
          );

          let isCompleted = Boolean(c.is_completed) || isSlotPublished;
          let status: "completed" | "today" | "upcoming" = "upcoming";
          if (dateStr < todayIso) {
            status = "completed";
            isCompleted = true;
          } else if (dateStr === todayIso) {
            status = isCompleted ? "completed" : "today";
          } else {
            status = "upcoming";
          }

          const fallbackTitle = formatSlugToTitle(bookSlug);
          const storyTitleId = c.title_id || fallbackTitle;
          const storyTitleEn = c.title_en || storyTitleId;

          const formatLabel =
            c.format === "both"
              ? "Landscape (16:9) & Shorts (9:16)"
              : c.format === "vertical"
              ? "Shorts / Reels (9:16)"
              : "Landscape (16:9)";

          const targetPlatforms =
            c.format === "vertical"
              ? ["YouTube Shorts", "Facebook Reels", "Instagram Reels"]
              : c.format === "landscape"
              ? ["YouTube (16:9)", "Facebook Watch (16:9)"]
              : ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"];

          const bookRecord = bookMap.get(bookSlug);
          const hasAssets = hasAsset || Boolean(bookRecord && Number(bookRecord.total_scenes || 0) > 0);
          const isBuffered = Boolean(c.is_buffered);

          return {
            id: `SLOT-${String(c.cal_id || idx + 1).padStart(4, "0")}`,
            date: dateStr,
            dayName,
            timeSlot,
            slotType,
            bookSlug,
            storyTitleId,
            storyTitleEn,
            lang: slotLang,
            format: formatLabel,
            targetPlatforms,
            theme: c.theme || c.book_theme || "Cerita Anak",
            status,
            isCompleted,
            hasPublishedAsset: hasAsset,
            isBuffered,
            hasAssets,
          };
        });
      }
    } catch {
      // Graceful fallback if table does not exist or empty
    }

    // Calculate aggregate metrics across all published assets
    const totalViews = auditRecords.reduce((sum, r) => sum + (r.views || 0), 0);
    const totalLikes = auditRecords.reduce((sum, r) => sum + (r.likes || 0), 0);
    const totalComments = auditRecords.reduce((sum, r) => sum + (r.comments || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        source: "cloudflare-d1",
        totalRecords: auditRecords.length,
        totalBooks: books.length,
        totalViews,
        totalLikes,
        totalComments,
        auditRecords,
        calendarSlots,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=0, s-maxage=10, must-revalidate",
          "CDN-Cache-Control": "max-age=10",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      }
    );
  } catch (err: any) {
    console.error("Cloudflare D1 Catalog API error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to retrieve catalog data",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}
