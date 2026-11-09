// Cloudflare Pages Function: /api/catalog
// Queries live storybook & publication metadata from Cloudflare D1 (zayn-storybook-db)

interface Env {
  DB?: D1Database;
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
        thumbnailUrl: p.thumbnail_url || (p.external_id ? `https://img.youtube.com/vi/${p.external_id}/hqdefault.jpg` : undefined),
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
        .prepare("SELECT * FROM content_calendar ORDER BY scheduled_date ASC, time_slot ASC")
        .all();
      if (Array.isArray(cal)) {
        calendarSlots = cal;
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
