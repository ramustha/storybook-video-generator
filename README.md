# Storybook Video Generator 📚🎬

> Automated, production-grade bilingual children's storybook video engine and AI coding skill for YouTube (16:9) and TikTok/Shorts/Reels (9:16), powered by **Remotion**, **Azure Cognitive Neural Voice**, **Gemini Imagen 3**, and **YouTube Data API v3**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Framework: Remotion](https://img.shields.io/badge/Powered%20By-Remotion-red.svg)](https://www.remotion.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

---

## 🌟 Key Architecture & Capabilities

1. **Bilingual Production by Default (ID & EN)**:
   - Exports 4 video deliverables per storybook: **ID Landscape (16:9)**, **ID Shorts (9:16)**, **EN Landscape (16:9)**, and **EN Shorts (9:16)**.
   - **Zero Visual Redundancy**: 100% of visual illustration plates are language-agnostic and shared across both language tracks.
2. **Remotion Headless Video Engine**:
   - Bang Motion cinematography laws: dynamic scale (`≥ 1.08x`), continuous breathing, multi-plane depth, and alternating camera pans.
   - **Ambient Pillarbox Canvas (9:16 Shorts/Reels)**: Zero-crop guarantee (blurred backdrop + floating 16:9 centerpiece plate + lower kinetic subtitles).
   - Word-level kinetic bounce subtitles synchronized with Azure Speech `WordBoundary` telemetry and automated punctuation restoration.
3. **High-CTR Remotion Thumbnail Generator**:
   - Programmatic still rendering via Remotion `renderStill` in <1 second per thumbnail.
   - **Popular Comic Hook (16:9)**: Tilted 3D typography, black stroke, curiosity stickers (`TUGAS DIMAKAN ANJING?!`), safe-zone adherence.
   - **Whimsical Bedtime (16:9)**: Embossed gilded picture frame, twilight starfield backdrop, gold display typography.
   - **Vertical Shorts Cover (9:16)**: Full-bleed portrait with centered sticker-bordered card.
4. **Idempotent Multi-Platform Publishing & Deduplication**:
   - 2-stage pre-upload deduplication (local manifest probe + remote `youtube.videos.list` / channel search).
   - In-place metadata resynchronization (`--resync-all` / `--update-metadata`) without re-uploading large video binaries.
   - Dynamic YouTube chapter generation, moral takeaways, and reciprocal cross-promotion links.
5. **Zero Credentials in Git / Environment Secret Native**:
   - All sensitive OAuth credentials and API tokens are loaded directly from environment variables/secrets (`.env` or GitHub Actions Secrets), ensuring zero credential leakage.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/gdncomm-ramadhani-musthofa/storybook-video-generator.git
cd storybook-video-generator
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Google Cloud / YouTube API secrets:
```ini
YOUTUBE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
YOUTUBE_CLIENT_SECRET="your-client-secret"
YOUTUBE_REFRESH_TOKEN="your-offline-refresh-token"
GEMINI_API_KEY="your-gemini-api-key"
```

---

## 🛠️ Production CLI Workflows

### 1. Story Management
```bash
# Inspect story structure and scene timing
npx tsx scripts/manage-story.ts --book <book-slug> --info

# Re-synthesize audio for a single scene
npx tsx scripts/manage-story.ts --book <book-slug> --lang en --scene 3 --asset audio --force
```

### 2. Render Thumbnails (<1s Still Render)
```bash
# Render all variants (Popular Comic, Bedtime, Vertical Shorts) for both ID & EN:
npm run thumbnail -- --book <book-slug> --lang all --variant all
```

### 3. Render Videos (1080p Full HD / 4K UHD)
```bash
# Render all 4 bilingual video deliverables (ID & EN × 16:9 & 9:16):
npm run render -- --book <book-slug> --lang all --format all

# Optional 4K UHD Master (Forces YouTube high-bitrate VP9/AV1 codec):
npm run render -- --book <book-slug> --format all --resolution 4k
```

### 4. Idempotent YouTube Publishing
```bash
# Safe upload (Idempotent: automatically skips if already live on channel):
npm run upload -- --book <book-slug> --lang all --format all --privacy unlisted

# Resync title, description, chapters & custom thumbnails without re-uploading videos:
npm run upload -- --book <book-slug> --lang all --resync-all

# Force replace video (deletes old remote video first before uploading new file):
npm run upload -- --book <book-slug> --lang all --force

# Update custom thumbnails only on existing published videos:
npx tsx scripts/upload-youtube.ts --book <book-slug> --lang all --update-thumbnails
```

### 5. Multi-Project Google Cloud Quota Pool
Scale YouTube upload capacity indefinitely (+10,000 units/day per GCP project):
```bash
# View active projects, quota status, and countdown to midnight PT reset:
npm run project:list

# Add a new Google Cloud project to the rotation pool:
npm run project:add project-3 ~/Downloads/client_secret_xxx.json

# Run unit tests for quota rotator engine:
npm test
```
*For the complete 60-second step-by-step setup guide with direct Google Cloud Console links, see [`docs/GOOGLE_CLOUD_PROJECT_SETUP.md`](docs/GOOGLE_CLOUD_PROJECT_SETUP.md).*

---

## 📋 Live Publication Catalog & Audit Portal

View the interactive, filterable multi-platform catalog and Creative Commons compliance audit directory for all published video assets across YouTube, Facebook, and Instagram:
* 🌐 **Live GitHub Pages Portal**: [https://ramustha.github.io/storybook-video-generator/](https://ramustha.github.io/storybook-video-generator/)
* 📁 **Source & Audit Data**: [`docs/index.html`](./docs/index.html) and [`docs/audit-data.json`](./docs/audit-data.json)
* ⚡ **Rebuild Portal**: `npm run docs:portal`

---

## 🤖 Using as an AI Coding Skill

This repository includes a universal agent skill definition in [`skills/storybook-video-generator/`](./skills/storybook-video-generator/) compatible with:
* **Google Antigravity / Gemini CLI**: Place in `~/.gemini/config/skills/storybook-video-generator/`
* **Anthropic Claude Code**: Place in `~/.claude/skills/storybook-video-generator/`
* **Cursor**: Symlink or copy to `.cursor/skills/`
* **Codex / AGENTS.md**: Deploy to `~/.agents/skills/storybook-video-generator/`

The skill contains comprehensive reference bibles for:
* [`consistency-bible.md`](./skills/storybook-video-generator/references/consistency-bible.md) (Character & World Bibles, 9:16 Masterboards)
* [`cinematography.md`](./skills/storybook-video-generator/references/cinematography.md) (Camera motions, ambient pillarbox canvas)
* [`limitations-and-workarounds.md`](./skills/storybook-video-generator/references/limitations-and-workarounds.md) (YouTube quota, rate-limits, TTS alignment)
* [`distribution-upload.md`](./skills/storybook-video-generator/references/distribution-upload.md) (Publishing pipeline, metadata packages)

---

## 🔒 Security & Credentials Policy

* **No Credentials in Repository**: `config/youtube-credentials.json`, `config/youtube-token.json`, and all `.env` files are strictly excluded by `.gitignore`.
* **CI/CD Native**: In GitHub Actions or containerized pipelines, configure `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` as Repository Secrets. The upload script loads them automatically without touching the filesystem.

---

## 📄 License & Attributions

* Pipeline Code: [MIT License](./LICENSE)
* Stories: Adapted from open-access children's literature licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)** (StoryWeaver / Pratham Books, SIBI Kemendikbud, Global Digital Library).
