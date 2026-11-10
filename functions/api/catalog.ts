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
      .prepare("SELECT * FROM publications ORDER BY published_at DESC")
      .all();

    const bookMap = new Map<string, any>();
    for (const b of books as any[]) {
      bookMap.set(b.slug, b);
    }

    // 2. Format into AuditRecord format expected by frontend
    const auditRecords: any[] = [];
    let counter = 1;

    for (const p of publications as any[]) {
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
      }

      let formatLabel = "Landscape (16:9)";
      let aspectRatio = "16:9";
      if (p.format === "vertical") {
        aspectRatio = "9:16";
        if (p.platform === "youtube") formatLabel = "Shorts (9:16)";
        else if (p.platform === "facebook") formatLabel = "Facebook Reel (9:16)";
        else if (p.platform === "instagram") formatLabel = "Instagram Reel (9:16)";
        else formatLabel = "Vertical (9:16)";
      } else if (isMarathon) {
        formatLabel = "Marathon Video (16:9)";
      } else if (p.platform === "facebook") {
        formatLabel = "Watch Video (16:9)";
      }

      let thumbUrl = p.thumbnail_url;
      if (!thumbUrl) {
        const ytPub = (publications as any[]).find(
          (other) => other.book_slug === p.book_slug && other.platform === "youtube" && other.external_id
        );
        if (ytPub && ytPub.external_id) {
          thumbUrl = `https://img.youtube.com/vi/${ytPub.external_id}/hqdefault.jpg`;
        } else {
          thumbUrl = "branding/cover-facebook-1640x924.png";
        }
      }

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
        videoTitle: p.external_title || `${b.title_id || p.book_slug} - ${platformName}`,
        videoId: p.external_id || "",
        videoUrl: p.video_url || "",
        publishedAt: p.published_at || "",
        status: p.status || "published",
        privacy: "public",
        thumbnailUrl: thumbUrl,
        author: b.author || "Pratham Books Authors",
        illustrator: b.illustrator || "Pratham Books Illustrators",
        license: b.license || "CC BY 4.0",
        sourceUrl: b.source_url || "https://storyweaver.org.in",
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
          const hasAsset = publishedSlugs.has(bookSlug);

          let isCompleted = Boolean(c.is_completed);
          let status: "completed" | "today" | "upcoming" = "upcoming";
          if (dateStr < todayIso) {
            status = "completed";
            isCompleted = true;
          } else if (dateStr === todayIso) {
            status = "today";
            // Retain isCompleted from D1 (e.g. morning slot already broadcasted today)
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

          return {
            id: `SLOT-${String(c.cal_id || idx + 1).padStart(4, "0")}`,
            date: dateStr,
            dayName,
            timeSlot,
            slotType,
            bookSlug,
            storyTitleId,
            storyTitleEn,
            lang: c.lang || "id",
            format: formatLabel,
            targetPlatforms,
            theme: c.theme || c.book_theme || "Cerita Anak",
            status,
            isCompleted,
            hasPublishedAsset: hasAsset,
          };
        });
      }
    } catch {
      // Graceful fallback if table does not exist or empty
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "cloudflare-d1",
        totalRecords: auditRecords.length,
        totalBooks: books.length,
        auditRecords,
        calendarSlots,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60, s-maxage=120",
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
