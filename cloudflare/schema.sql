-- ==============================================================================
-- Zayn Storybook Engine: Cloudflare D1 Relational Database Schema
-- Database: zayn-storybook-db
-- ==============================================================================

-- 1. Master Buku Cerita (Books Manifest)
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title_id TEXT NOT NULL,
  title_en TEXT NOT NULL,
  original_title TEXT,
  author TEXT NOT NULL,
  illustrator TEXT NOT NULL,
  publisher TEXT DEFAULT 'Pratham Books',
  license TEXT DEFAULT 'CC BY 4.0',
  reading_level INTEGER DEFAULT 2,
  source_url TEXT,
  pdf_url TEXT,
  theme TEXT,
  moral_headline_id TEXT,
  moral_spoken_id TEXT,
  moral_headline_en TEXT,
  moral_spoken_en TEXT,
  character_bible_json TEXT, -- JSON blob for protagonist profiles and voices
  world_bible_json TEXT,     -- JSON blob for color palettes and settings
  thumbnail_config_json TEXT,-- JSON blob for hooks, stickers, and headlines
  total_scenes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_slug ON books(slug);

-- 2. Adegan Cerita (Scenes & Narrative Alignment)
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_slug TEXT NOT NULL REFERENCES books(slug) ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  page_number INTEGER,
  scene_type TEXT DEFAULT 'story', -- 'cover', 'story', 'moral'
  text_id TEXT NOT NULL,
  text_en TEXT NOT NULL,
  audio_path_id TEXT,
  audio_path_en TEXT,
  duration_seconds_id REAL,
  duration_seconds_en REAL,
  words_alignment_id_json TEXT, -- JSON array of exact word timestamps [{word, start, end}]
  words_alignment_en_json TEXT,
  camera_motion_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_slug, scene_index)
);

CREATE INDEX IF NOT EXISTS idx_scenes_book_slug ON scenes(book_slug);

-- 3. Rekam Jejak Publikasi Multi-Platform
CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_slug TEXT NOT NULL REFERENCES books(slug) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'youtube', 'facebook', 'instagram', 'threads', 'tiktok', 'telegram'
  lang TEXT NOT NULL,     -- 'id', 'en'
  format TEXT NOT NULL,   -- 'landscape', 'vertical', 'both', 'post'
  external_id TEXT,       -- YouTube videoId, IG mediaId, FB videoId
  video_url TEXT,
  external_title TEXT,
  thumbnail_url TEXT,
  published_at DATETIME,
  status TEXT DEFAULT 'pending', -- 'pending', 'published', 'failed'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_slug, platform, lang, format)
);

CREATE INDEX IF NOT EXISTS idx_publications_lookup ON publications(book_slug, platform, lang);
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);

-- 4. Kalender Siaran Harian (Content Calendar 30 Hari & Rutin)
CREATE TABLE IF NOT EXISTS content_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_date DATE NOT NULL,
  day_name TEXT NOT NULL,
  time_slot TEXT NOT NULL,      -- '08:30 WIB', '19:00 WIB', '19:30 WIB'
  slot_type TEXT NOT NULL,      -- 'morning_feature', 'bedtime_story', 'marathon', 'short'
  book_slug TEXT REFERENCES books(slug),
  lang TEXT NOT NULL,           -- 'id', 'en'
  format TEXT DEFAULT 'both',   -- 'both', 'landscape', 'vertical'
  theme TEXT,
  is_completed BOOLEAN DEFAULT 0,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scheduled_date, time_slot, lang)
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_calendar_slug ON content_calendar(book_slug);

-- 5. Antrean Kurasi Buku CC BY 4.0 (Ingestion Backlog)
CREATE TABLE IF NOT EXISTS curated_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title_id TEXT NOT NULL,
  title_en TEXT NOT NULL,
  source_url TEXT NOT NULL,
  pdf_url TEXT,
  status TEXT DEFAULT 'backlog', -- 'backlog', 'processing', 'ingested', 'archived'
  reading_level INTEGER DEFAULT 2,
  ingested_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_curated_status ON curated_pool(status);

-- 6. Status Kuota Google Cloud Multi-Project (YouTube API Pool)
CREATE TABLE IF NOT EXISTS gcp_quota_pool (
  project_id TEXT PRIMARY KEY,
  daily_quota_limit INTEGER DEFAULT 10000,
  quota_used_today INTEGER DEFAULT 0,
  last_reset_date DATE,
  is_active BOOLEAN DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Snapshot Metrik Kinerja Multi-Platform (Weekly Performance Analytics)
CREATE TABLE IF NOT EXISTS publication_stats (
  external_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  watch_time_minutes REAL DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pub_stats_platform ON publication_stats(platform);

