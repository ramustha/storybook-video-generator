import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface BookRecord {
  id?: number;
  slug: string;
  title_id: string;
  title_en: string;
  original_title?: string;
  author: string;
  illustrator: string;
  publisher?: string;
  license?: string;
  reading_level?: number;
  source_url?: string;
  pdf_url?: string;
  theme?: string;
  moral_headline_id?: string;
  moral_spoken_id?: string;
  moral_headline_en?: string;
  moral_spoken_en?: string;
  character_bible_json?: string;
  world_bible_json?: string;
  thumbnail_config_json?: string;
  total_scenes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SceneRecord {
  id?: number;
  book_slug: string;
  scene_index: number;
  page_number?: number;
  scene_type: string;
  text_id: string;
  text_en: string;
  audio_path_id?: string;
  audio_path_en?: string;
  duration_seconds_id?: number;
  duration_seconds_en?: number;
  words_alignment_id_json?: string;
  words_alignment_en_json?: string;
  camera_motion_json?: string;
  created_at?: string;
}

export interface PublicationRecord {
  id?: number;
  book_slug: string;
  platform: string;
  lang: string;
  format: string;
  external_id?: string;
  video_url?: string;
  external_title?: string;
  thumbnail_url?: string;
  published_at?: string;
  status: string;
  error_message?: string;
  created_at?: string;
}

export interface CalendarRecord {
  id?: number;
  scheduled_date: string;
  day_name: string;
  time_slot: string;
  slot_type: string;
  book_slug?: string;
  lang: string;
  format: string;
  theme?: string;
  is_completed?: boolean | number;
  completed_at?: string;
  created_at?: string;
}

export interface CuratedBookRecord {
  id?: number;
  slug: string;
  title_en: string;
  title_id: string;
  author?: string;
  illustrator?: string;
  source_url: string;
  pdf_url?: string;
  license?: string;
  reading_level?: number;
  theme?: string;
  status?: string;
  ingested_at?: string;
  created_at?: string;
}

export interface AnnouncementRecordD1 {
  id?: number;
  scheduled_date: string;
  time_slot: string;
  lang: string;
  book_slug: string;
  slot_type: string;
  title: string;
  theme?: string;
  hook?: string;
  moral?: string;
  photo_url?: string;
  caption_instagram: string;
  caption_facebook: string;
  caption_threads: string;
  caption_youtube_community?: string;
  status?: string;
  announced_at?: string;
  created_at?: string;
}

export interface D1Config {
  accountId: string;
  databaseId: string;
  databaseName?: string;
  region?: string;
}

class StorybookDB {
  private config: D1Config;
  private token: string | null = null;
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.resolve(process.cwd(), ".cache/stories");
    this.config = this.loadConfig();
    this.token = this.resolveAuthToken();
  }

  private loadConfig(): D1Config {
    const defaultAccountId = "e5c0394bca4b8239f091b55cb3e9d3e6";
    const defaultDbId = "a979ff27-bed2-4428-a4af-eae976a24253";

    const configPath = path.resolve(process.cwd(), "config/d1-config.json");
    if (fs.existsSync(configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return {
          accountId: parsed.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || defaultAccountId,
          databaseId: parsed.databaseId || defaultDbId,
          databaseName: parsed.databaseName || "zayn-storybook-db",
          region: parsed.region || "APAC",
        };
      } catch (e) {
        // Fallback to env or defaults
      }
    }

    return {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || defaultAccountId,
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || defaultDbId,
      databaseName: "zayn-storybook-db",
      region: "APAC",
    };
  }

  private resolveAuthToken(): string | null {
    // 1. Explicit D1 token environment variable
    if (process.env.CLOUDFLARE_D1_TOKEN) return process.env.CLOUDFLARE_D1_TOKEN;

    // 2. Wrangler OAuth token from local preferences (contains d1:write scope)
    const home = process.env.HOME || "";
    const candidatePaths = [
      path.join(home, "Library/Preferences/.wrangler/config/default.toml"),
      path.join(home, ".wrangler/config/default.toml"),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, "utf-8");
          const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1];
          }
        } catch {}
      }
    }

    // 3. Fallback to generic Cloudflare API Token if provided in CI
    if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

    return null;
  }

  /**
   * Executes a SQL statement against Cloudflare D1.
   * Uses direct REST API when token is present, falling back to wrangler CLI.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const token = this.token || this.resolveAuthToken();

    if (token) {
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.success && data.result && data.result[0]) {
            return data.result[0].results as T[];
          }
          if (!data.success && data.errors && data.errors.length > 0) {
            throw new Error(`D1 API Error: ${data.errors.map((e: any) => e.message).join(", ")}`);
          }
        }
      } catch (err: any) {
        if (err.message?.includes("D1 API Error") || err.message?.includes("D1 HTTP 400")) {
          throw err;
        }
        // Fall back to wrangler CLI if direct REST call fails
      }
    }

    // Fallback: execute via wrangler CLI with JSON output
    return this.queryViaWrangler<T>(sql, params);
  }

  /**
   * Executes an INSERT / UPDATE / DELETE statement.
   */
  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastRowId: number }> {
    const token = this.token || this.resolveAuthToken();

    if (token) {
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.success && data.result && data.result[0]) {
            const meta = data.result[0].meta || {};
            return {
              changes: meta.changes || 0,
              lastRowId: meta.last_row_id || 0,
            };
          }
          if (!data.success && data.errors && data.errors.length > 0) {
            throw new Error(`D1 API Error: ${data.errors.map((e: any) => e.message).join(", ")}`);
          }
        } else {
          const errText = await res.text();
          throw new Error(`D1 HTTP ${res.status}: ${errText}`);
        }
      } catch (err: any) {
        if (err.message?.includes("D1 API Error") || err.message?.includes("D1 HTTP 400")) {
          throw err;
        }
        if (!process.env.CI) {
          // In local dev, if auth/network fails, fallback to wrangler
          return { changes: this.queryViaWrangler(sql, params).length, lastRowId: 0 };
        }
        throw err;
      }
    }

    // Fallback to wrangler CLI
    const out = this.queryViaWrangler(sql, params);
    return { changes: 1, lastRowId: 0 };
  }

  private queryViaWrangler<T>(sql: string, params: any[] = []): T[] {
    // Escape single quotes for shell-embedded SQL without clobbering '?' inside text strings
    let paramIndex = 0;
    const formattedSql = sql.replace(/\?/g, () => {
      if (paramIndex >= params.length) return "?";
      const p = params[paramIndex++];
      if (typeof p === "string") {
        return `'${p.replace(/'/g, "''")}'`;
      } else if (p === null || p === undefined) {
        return "NULL";
      } else {
        return String(p);
      }
    });

    const cmd = `npx --yes wrangler d1 execute ${this.config.databaseName || "zayn-storybook-db"} --command="${formattedSql.replace(/"/g, '\\"')}" --remote --json`;
    const stdout = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)) {
      return parsed[0].results as T[];
    }
    return [];
  }

  // ============================================================================
  // BOOK & STORY MANIFEST OPERATIONS
  // ============================================================================

  async getBook(slug: string): Promise<BookRecord | null> {
    const rows = await this.query<BookRecord>("SELECT * FROM books WHERE slug = ? LIMIT 1", [slug]);
    return rows[0] || null;
  }

  async getAllBooks(): Promise<BookRecord[]> {
    return this.query<BookRecord>("SELECT * FROM books ORDER BY id ASC");
  }

  async getScenes(bookSlug: string): Promise<SceneRecord[]> {
    return this.query<SceneRecord>(
      "SELECT * FROM scenes WHERE book_slug = ? ORDER BY scene_index ASC",
      [bookSlug]
    );
  }

  async getPublications(bookSlug?: string): Promise<PublicationRecord[]> {
    if (bookSlug) {
      return this.query<PublicationRecord>(
        "SELECT * FROM publications WHERE book_slug = ? ORDER BY published_at DESC",
        [bookSlug]
      );
    }
    return this.query<PublicationRecord>("SELECT * FROM publications ORDER BY published_at DESC");
  }

  /**
   * Reconstructs full Story manifest compatible with legacy story.json from D1 tables.
   * Also ensures transparent offline fallback using .cache/stories/${slug}.json or stories/${slug}/story.json.
   */
  async getStory(slug: string): Promise<any | null> {
    try {
      const book = await this.getBook(slug);
      if (!book) {
        return this.getLocalFallbackStory(slug);
      }

      const scenes = await this.getScenes(slug);
      const pubs = await this.getPublications(slug);

      // Format publications into nested dictionary structure: pub[platform][lang][format]
      const publicationsTree: Record<string, any> = {};
      for (const p of pubs) {
        if (!publicationsTree[p.platform]) publicationsTree[p.platform] = {};
        if (!publicationsTree[p.platform][p.lang]) publicationsTree[p.platform][p.lang] = {};
        publicationsTree[p.platform][p.lang][p.format] = {
          id: p.external_id,
          url: p.video_url,
          title: p.external_title,
          thumbnailUrl: p.thumbnail_url,
          publishedAt: p.published_at,
          status: p.status,
          error: p.error_message,
        };
      }

      // Parse JSON blobs
      const characterBible = book.character_bible_json ? JSON.parse(book.character_bible_json) : {};
      const worldBible = book.world_bible_json ? JSON.parse(book.world_bible_json) : {};
      const thumbnailConfig = book.thumbnail_config_json ? JSON.parse(book.thumbnail_config_json) : {};

      // Map scenes
      const mappedScenes = scenes.map((s) => ({
        index: s.scene_index,
        sceneId: s.scene_index === 0 ? "cover" : `scene_${String(s.scene_index).padStart(2, "0")}`,
        type: s.scene_type,
        sourcePage: s.page_number,
        durationSeconds: s.duration_seconds_id || s.duration_seconds_en || 0,
        camera: s.camera_motion_json ? JSON.parse(s.camera_motion_json) : undefined,
        visual: {
          imagePath: s.scene_index === 0 ? "assets/cover.png" : `assets/scene_${String(s.scene_index).padStart(2, "0")}.png`,
          status: "ready",
        },
        audio: {
          text: s.text_id,
          audioPath: s.audio_path_id,
          wordsPath: s.words_alignment_id_json ? `assets/id/scene_${String(s.scene_index).padStart(2, "0")}_words.json` : undefined,
          en: {
            text: s.text_en,
            audioPath: s.audio_path_en,
            wordsPath: s.words_alignment_en_json ? `assets/en/scene_${String(s.scene_index).padStart(2, "0")}_words.json` : undefined,
            durationSeconds: s.duration_seconds_en,
            status: "ready",
          },
        },
      }));

      const manifest = {
        slug: book.slug,
        title: book.title_id,
        titleEn: book.title_en,
        originalTitle: book.original_title,
        author: book.author,
        illustrator: book.illustrator,
        publisher: book.publisher,
        license: book.license,
        readingLevel: book.reading_level,
        source: {
          repository: book.publisher || "Pratham Books",
          license: book.license || "CC BY 4.0",
          originalAuthor: book.author,
          originalIllustrator: book.illustrator,
          sourceUrl: book.source_url,
          pdfUrl: book.pdf_url,
        },
        theme: book.theme,
        moral: {
          id: {
            headline: book.moral_headline_id,
            spoken: book.moral_spoken_id,
          },
          en: {
            headline: book.moral_headline_en,
            spoken: book.moral_spoken_en,
          },
        },
        characterBible,
        worldBible,
        thumbnailConfig,
        scenes: mappedScenes,
        publications: publicationsTree,
      };

      // Save local cache copy
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        fs.writeFileSync(path.join(this.cacheDir, `${slug}.json`), JSON.stringify(manifest, null, 2), "utf-8");
      } catch {}

      return manifest;
    } catch (err: any) {
      return this.getLocalFallbackStory(slug);
    }
  }

  private getLocalFallbackStory(slug: string): any | null {
    const localStoryPath = path.resolve(process.cwd(), `stories/${slug}/story.json`);
    if (fs.existsSync(localStoryPath)) {
      try {
        return JSON.parse(fs.readFileSync(localStoryPath, "utf-8"));
      } catch {}
    }
    const cachePath = path.join(this.cacheDir, `${slug}.json`);
    if (fs.existsSync(cachePath)) {
      try {
        return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      } catch {}
    }
    return null;
  }

  /**
   * Upserts a story manifest into D1 (books, scenes, and publications).
   */
  async saveStory(manifest: any): Promise<void> {
    const slug = manifest.slug;
    const titleId = manifest.title || "";
    const titleEn = manifest.titleEn || manifest.originalTitle || "";
    const originalTitle = manifest.originalTitle || "";
    const author = manifest.author || manifest.source?.originalAuthor || "Unknown";
    const illustrator = manifest.illustrator || manifest.source?.originalIllustrator || "Unknown";
    const publisher = manifest.publisher || manifest.source?.repository || "Pratham Books";
    const license = manifest.license || manifest.source?.license || "CC BY 4.0";
    const readingLevel = manifest.readingLevel || 2;
    const sourceUrl = manifest.source?.sourceUrl || "";
    const pdfUrl = manifest.source?.pdfUrl || "";
    const theme = manifest.theme || "";
    const moralHeadlineId = manifest.moral?.id?.headline || "";
    const moralSpokenId = manifest.moral?.id?.spoken || "";
    const moralHeadlineEn = manifest.moral?.en?.headline || "";
    const moralSpokenEn = manifest.moral?.en?.spoken || "";

    const characterBibleJson = manifest.characterBible ? JSON.stringify(manifest.characterBible) : null;
    const worldBibleJson = manifest.worldBible ? JSON.stringify(manifest.worldBible) : null;
    const thumbnailConfigJson = manifest.thumbnailConfig ? JSON.stringify(manifest.thumbnailConfig) : null;
    const totalScenes = Array.isArray(manifest.scenes) ? manifest.scenes.length : 0;

    // 1. Upsert book record
    const bookSql = `
      INSERT INTO books (
        slug, title_id, title_en, original_title, author, illustrator, publisher, license,
        reading_level, source_url, pdf_url, theme, moral_headline_id, moral_spoken_id,
        moral_headline_en, moral_spoken_en, character_bible_json, world_bible_json,
        thumbnail_config_json, total_scenes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title_id = excluded.title_id,
        title_en = excluded.title_en,
        original_title = excluded.original_title,
        author = excluded.author,
        illustrator = excluded.illustrator,
        publisher = excluded.publisher,
        license = excluded.license,
        reading_level = excluded.reading_level,
        source_url = excluded.source_url,
        pdf_url = excluded.pdf_url,
        theme = excluded.theme,
        moral_headline_id = excluded.moral_headline_id,
        moral_spoken_id = excluded.moral_spoken_id,
        moral_headline_en = excluded.moral_headline_en,
        moral_spoken_en = excluded.moral_spoken_en,
        character_bible_json = excluded.character_bible_json,
        world_bible_json = excluded.world_bible_json,
        thumbnail_config_json = excluded.thumbnail_config_json,
        total_scenes = excluded.total_scenes,
        updated_at = CURRENT_TIMESTAMP;
    `;

    await this.execute(bookSql, [
      slug,
      titleId,
      titleEn,
      originalTitle,
      author,
      illustrator,
      publisher,
      license,
      readingLevel,
      sourceUrl,
      pdfUrl,
      theme,
      moralHeadlineId,
      moralSpokenId,
      moralHeadlineEn,
      moralSpokenEn,
      characterBibleJson,
      worldBibleJson,
      thumbnailConfigJson,
      totalScenes,
    ]);

    // 2. Upsert scenes
    if (Array.isArray(manifest.scenes)) {
      for (const s of manifest.scenes) {
        const textId = s.audio?.text || s.text || "";
        const textEn = s.audio?.en?.text || "";
        const audioPathId = s.audio?.audioPath || "";
        const audioPathEn = s.audio?.en?.audioPath || "";
        const durationId = s.audio?.durationSeconds || s.durationSeconds || 0;
        const durationEn = s.audio?.en?.durationSeconds || 0;
        const cameraMotionJson = s.camera ? JSON.stringify(s.camera) : null;

        const sceneSql = `
          INSERT INTO scenes (
            book_slug, scene_index, page_number, scene_type, text_id, text_en,
            audio_path_id, audio_path_en, duration_seconds_id, duration_seconds_en,
            camera_motion_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(book_slug, scene_index) DO UPDATE SET
            page_number = excluded.page_number,
            scene_type = excluded.scene_type,
            text_id = excluded.text_id,
            text_en = excluded.text_en,
            audio_path_id = excluded.audio_path_id,
            audio_path_en = excluded.audio_path_en,
            duration_seconds_id = excluded.duration_seconds_id,
            duration_seconds_en = excluded.duration_seconds_en,
            camera_motion_json = excluded.camera_motion_json;
        `;

        await this.execute(sceneSql, [
          slug,
          s.index,
          s.sourcePage || s.page_number || null,
          s.type || "story",
          textId,
          textEn,
          audioPathId,
          audioPathEn,
          durationId,
          durationEn,
          cameraMotionJson,
        ]);
      }
    }

    // 3. Upsert multi-platform publications (YouTube, Facebook, Instagram, Threads, Telegram)
    if (manifest.publications && typeof manifest.publications === "object") {
      for (const [platform, platformData] of Object.entries(manifest.publications)) {
        if (!platformData || typeof platformData !== "object") continue;
        if (platform === "announcements" || platform === "socialPromotion") continue;

        for (const [langKey, langData] of Object.entries(platformData as Record<string, any>)) {
          if (!langData || typeof langData !== "object") continue;
          const lang = langKey === "en" ? "en" : "id";
          const fallbackTitle = lang === "en" ? (manifest.originalTitle || manifest.title) : manifest.title;

          // Helper to resolve YouTube thumbnail matching aspect ratio
          const resolveFallbackThumb = (targetFormat: string): string | null => {
            const yt = manifest.publications?.youtube;
            if (!yt) return null;
            const isVert = targetFormat === "vertical";
            const fmtKey = isVert ? "vertical" : "landscape";
            const otherLang = lang === "en" ? "id" : "en";
            const ytId = yt[lang]?.[fmtKey]?.id || yt[otherLang]?.[fmtKey]?.id;
            if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
            return isVert
              ? "branding/story-highlight-instagram-1080x1920.png"
              : "branding/cover-facebook-1640x924.png";
          };

          // Case A: 2-level structure (e.g. instagram[lang] = { id, url }, threads[lang] = { id, url }, telegram[lang] = { id, url })
          if (langData.id || langData.url) {
            const format = platform === "instagram" ? "vertical" : platform === "telegram" ? "notification" : "post";
            const thumb = langData.thumbnailUrl || (platform === "youtube" && langData.id ? `https://img.youtube.com/vi/${langData.id}/hqdefault.jpg` : resolveFallbackThumb(format));

            await this.recordPublication({
              bookSlug: slug,
              platform,
              lang,
              format,
              externalId: langData.id ? String(langData.id) : undefined,
              videoUrl: langData.url,
              externalTitle: langData.title || fallbackTitle,
              thumbnailUrl: thumb || undefined,
              publishedAt: langData.publishedAt,
              status: langData.status || "published",
              errorMessage: langData.error,
            });
            continue;
          }

          // Case B: 3-level structure (e.g. youtube[lang][format] = { id, url }, facebook[lang][format] = { id, url })
          for (const [format, p] of Object.entries(langData as Record<string, any>)) {
            if (!p || typeof p !== "object" || (!p.id && !p.url)) continue;
            const thumb = p.thumbnailUrl || (platform === "youtube" && p.id ? `https://img.youtube.com/vi/${p.id}/hqdefault.jpg` : resolveFallbackThumb(format));

            await this.recordPublication({
              bookSlug: slug,
              platform,
              lang,
              format,
              externalId: p.id ? String(p.id) : undefined,
              videoUrl: p.url,
              externalTitle: p.title || fallbackTitle,
              thumbnailUrl: thumb || undefined,
              publishedAt: p.publishedAt,
              status: p.status || "published",
              errorMessage: p.error,
            });
          }
        }
      }
    }

    // Write to local cache
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      fs.writeFileSync(path.join(this.cacheDir, `${slug}.json`), JSON.stringify(manifest, null, 2), "utf-8");
    } catch {}
  }

  // ============================================================================
  // PUBLICATION TRACKING OPERATIONS
  // ============================================================================

  async recordPublication(record: {
    bookSlug: string;
    platform: string;
    lang: string;
    format: string;
    externalId?: string;
    videoUrl?: string;
    externalTitle?: string;
    thumbnailUrl?: string;
    publishedAt?: string;
    status?: string;
    errorMessage?: string;
  }): Promise<void> {
    const publishedAt = record.publishedAt || new Date().toISOString();
    const status = record.status || "published";

    const sql = `
      INSERT INTO publications (
        book_slug, platform, lang, format, external_id, video_url, external_title,
        thumbnail_url, published_at, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_slug, platform, lang, format) DO UPDATE SET
        external_id = excluded.external_id,
        video_url = excluded.video_url,
        external_title = excluded.external_title,
        thumbnail_url = excluded.thumbnail_url,
        published_at = excluded.published_at,
        status = excluded.status,
        error_message = excluded.error_message;
    `;

    await this.execute(sql, [
      record.bookSlug,
      record.platform,
      record.lang,
      record.format,
      record.externalId || null,
      record.videoUrl || null,
      record.externalTitle || null,
      record.thumbnailUrl || null,
      publishedAt,
      status,
      record.errorMessage || null,
    ]);
  }

  // ============================================================================
  // CONTENT CALENDAR OPERATIONS
  // ============================================================================

  async getCalendar(targetDate?: string): Promise<CalendarRecord[]> {
    if (targetDate) {
      return this.query<CalendarRecord>(
        "SELECT * FROM content_calendar WHERE scheduled_date = ? ORDER BY time_slot ASC, lang ASC",
        [targetDate]
      );
    }
    return this.query<CalendarRecord>(
      "SELECT * FROM content_calendar ORDER BY scheduled_date ASC, time_slot ASC"
    );
  }

  async saveCalendarSlot(slot: CalendarRecord): Promise<void> {
    const sql = `
      INSERT INTO content_calendar (
        scheduled_date, day_name, time_slot, slot_type, book_slug, lang, format, theme, is_completed, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scheduled_date, time_slot, lang) DO UPDATE SET
        day_name = excluded.day_name,
        slot_type = excluded.slot_type,
        book_slug = excluded.book_slug,
        format = excluded.format,
        theme = excluded.theme,
        is_completed = excluded.is_completed,
        completed_at = excluded.completed_at;
    `;

    await this.execute(sql, [
      slot.scheduled_date,
      slot.day_name,
      slot.time_slot,
      slot.slot_type,
      slot.book_slug || null,
      slot.lang,
      slot.format || "both",
      slot.theme || null,
      slot.is_completed ? 1 : 0,
      slot.completed_at || null,
    ]);
  }

  async markCalendarSlotCompleted(date: string, timeSlot: string, lang: string): Promise<void> {
    const sql = `
      UPDATE content_calendar
      SET is_completed = 1, completed_at = CURRENT_TIMESTAMP
      WHERE scheduled_date = ? AND time_slot = ? AND lang = ?;
    `;
    await this.execute(sql, [date, timeSlot, lang]);
  }

  async markCalendarSlotBuffered(bookSlug: string, lang?: string): Promise<void> {
    if (lang) {
      const sql = `
        UPDATE content_calendar
        SET is_buffered = 1
        WHERE book_slug = ? AND lang = ?;
      `;
      await this.execute(sql, [bookSlug, lang]);
    } else {
      const sql = `
        UPDATE content_calendar
        SET is_buffered = 1
        WHERE book_slug = ?;
      `;
      await this.execute(sql, [bookSlug]);
    }
  }

  // ============================================================================
  // CURATED POOL (INGESTION BACKLOG)
  // ============================================================================

  async getCuratedPool(status?: string): Promise<CuratedBookRecord[]> {
    if (status) {
      return this.query<CuratedBookRecord>(
        "SELECT * FROM curated_pool WHERE status = ? ORDER BY id ASC",
        [status]
      );
    }
    return this.query<CuratedBookRecord>("SELECT * FROM curated_pool ORDER BY id ASC");
  }

  async upsertCuratedBook(book: CuratedBookRecord): Promise<void> {
    const sql = `
      INSERT INTO curated_pool (
        slug, title_id, title_en, source_url, pdf_url, reading_level, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title_id = excluded.title_id,
        title_en = excluded.title_en,
        source_url = excluded.source_url,
        pdf_url = excluded.pdf_url,
        reading_level = excluded.reading_level,
        status = excluded.status;
    `;

    await this.execute(sql, [
      book.slug,
      book.title_id,
      book.title_en,
      book.source_url,
      book.pdf_url,
      book.reading_level || 2,
      book.status || "backlog",
    ]);
  }

  async markCuratedBookStatus(slug: string, status: string): Promise<void> {
    const sql = `
      UPDATE curated_pool
      SET status = ?, ingested_at = ${status === "ingested" ? "CURRENT_TIMESTAMP" : "ingested_at"}
      WHERE slug = ?;
    `;
    await this.execute(sql, [status, slug]);
  }

  // ============================================================================
  // GCP QUOTA POOL
  // ============================================================================

  async getQuotaPool(): Promise<any[]> {
    return this.query("SELECT * FROM gcp_quota_pool ORDER BY project_id ASC");
  }

  async updateQuotaProject(projectId: string, quotaUsed: number, isActive: boolean = true): Promise<void> {
    const sql = `
      UPDATE gcp_quota_pool
      SET quota_used_today = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?;
    `;
    await this.execute(sql, [quotaUsed, isActive ? 1 : 0, projectId]);
  }

  async resetDailyQuota(): Promise<void> {
    await this.execute("UPDATE gcp_quota_pool SET quota_used_today = 0, last_reset_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP;");
  }

  // ============================================================================
  // AUDIT & CATALOG SUMMARY
  // ============================================================================

  async getCatalogAudit(): Promise<any[]> {
    const books = await this.getAllBooks();
    const pubs = await this.getPublications();

    return books.map((b) => {
      const bookPubs = pubs.filter((p) => p.book_slug === b.slug);
      const platforms = {
        youtube: {
          id: {
            landscape: bookPubs.find((p) => p.platform === "youtube" && p.lang === "id" && p.format === "landscape")?.video_url,
            vertical: bookPubs.find((p) => p.platform === "youtube" && p.lang === "id" && p.format === "vertical")?.video_url,
          },
          en: {
            landscape: bookPubs.find((p) => p.platform === "youtube" && p.lang === "en" && p.format === "landscape")?.video_url,
            vertical: bookPubs.find((p) => p.platform === "youtube" && p.lang === "en" && p.format === "vertical")?.video_url,
          },
        },
        facebook: {
          id: {
            landscape: bookPubs.find((p) => p.platform === "facebook" && p.lang === "id" && p.format === "landscape")?.video_url,
            vertical: bookPubs.find((p) => p.platform === "facebook" && p.lang === "id" && p.format === "vertical")?.video_url,
          },
          en: {
            landscape: bookPubs.find((p) => p.platform === "facebook" && p.lang === "en" && p.format === "landscape")?.video_url,
            vertical: bookPubs.find((p) => p.platform === "facebook" && p.lang === "en" && p.format === "vertical")?.video_url,
          },
        },
      };

      return {
        slug: b.slug,
        title: b.title_id,
        titleEn: b.title_en,
        author: b.author,
        illustrator: b.illustrator,
        publisher: b.publisher,
        license: b.license,
        totalScenes: b.total_scenes,
        platforms,
      };
    });
  }

  // ============================================================================
  // PRE-BROADCAST ANNOUNCEMENT OPERATIONS
  // ============================================================================

  async saveAnnouncement(ann: AnnouncementRecordD1): Promise<void> {
    const sql = `
      INSERT INTO announcements (
        scheduled_date, time_slot, lang, book_slug, slot_type, title,
        theme, hook, moral, photo_url,
        caption_instagram, caption_facebook, caption_threads, caption_youtube_community,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scheduled_date, time_slot, lang) DO UPDATE SET
        book_slug = excluded.book_slug,
        slot_type = excluded.slot_type,
        title = excluded.title,
        theme = excluded.theme,
        hook = excluded.hook,
        moral = excluded.moral,
        photo_url = excluded.photo_url,
        caption_instagram = excluded.caption_instagram,
        caption_facebook = excluded.caption_facebook,
        caption_threads = excluded.caption_threads,
        caption_youtube_community = excluded.caption_youtube_community,
        status = excluded.status;
    `;
    await this.execute(sql, [
      ann.scheduled_date,
      ann.time_slot,
      ann.lang,
      ann.book_slug,
      ann.slot_type,
      ann.title,
      ann.theme || null,
      ann.hook || null,
      ann.moral || null,
      ann.photo_url || null,
      ann.caption_instagram,
      ann.caption_facebook,
      ann.caption_threads,
      ann.caption_youtube_community || null,
      ann.status || "scheduled",
    ]);
  }

  async getAnnouncement(date: string, timeSlot: string, lang: string): Promise<AnnouncementRecordD1 | null> {
    const rows = await this.query<AnnouncementRecordD1>(
      "SELECT * FROM announcements WHERE scheduled_date = ? AND time_slot = ? AND lang = ? LIMIT 1",
      [date, timeSlot, lang]
    );
    return rows[0] || null;
  }

  async getAllAnnouncements(): Promise<AnnouncementRecordD1[]> {
    return this.query<AnnouncementRecordD1>("SELECT * FROM announcements ORDER BY scheduled_date ASC, time_slot ASC");
  }

  async savePublicationStats(stats: PublicationStatsRecord[]): Promise<void> {
    if (!stats || stats.length === 0) return;
    for (const s of stats) {
      const sql = `
        INSERT INTO publication_stats (
          external_id, platform, views, likes, comments, shares, watch_time_minutes, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(external_id) DO UPDATE SET
          views = excluded.views,
          likes = excluded.likes,
          comments = excluded.comments,
          shares = excluded.shares,
          watch_time_minutes = excluded.watch_time_minutes,
          recorded_at = CURRENT_TIMESTAMP;
      `;
      await this.execute(sql, [
        s.external_id,
        s.platform.toLowerCase(),
        s.views || 0,
        s.likes || 0,
        s.comments || 0,
        s.shares || 0,
        s.watch_time_minutes || 0,
      ]);
    }
  }

  async getAllPublicationStats(): Promise<PublicationStatsRecord[]> {
    return this.query<PublicationStatsRecord>("SELECT * FROM publication_stats ORDER BY views DESC");
  }
}

export interface PublicationStatsRecord {
  external_id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_minutes?: number;
  recorded_at?: string;
}

export const db = new StorybookDB();
