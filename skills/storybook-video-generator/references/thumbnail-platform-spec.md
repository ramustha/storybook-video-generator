# Multi-Platform Thumbnail Specification

> **Canonical reference** for thumbnail dimensions, platform targets, safe zones, CLI usage, and pipeline gate behaviour.
> Read this before creating, rendering, or troubleshooting thumbnails.

---

## 1. Required Thumbnail Matrix

Every story **must** have all 4 types for **each language** (`id` and `en`) before any platform publish.

| File Name | Dimensions (px) | Aspect Ratio | Platforms | Remotion Composition |
|---|---|---|---|---|
| `thumbnail-popular.png` | 1920 × 1080 | 16:9 landscape | YouTube (primary), Facebook Video | `StorybookThumbnail` variant `popular` |
| `thumbnail-bedtime.png` | 1920 × 1080 | 16:9 landscape | YouTube Bedtime/Niche playlists | `StorybookThumbnail` variant `bedtime` |
| `thumbnail.png` | 1920 × 1080 | 16:9 landscape | Default fallback, Facebook Link Card, SEO OpenGraph | `StorybookThumbnail` variant `popular` (copy) |
| `thumbnail-vertical.png` | 1080 × 1920 | 9:16 portrait | YouTube Shorts, Instagram Reels, Facebook Reels, TikTok | `StorybookThumbnail-Vertical` |

**Expected directory layout per story:**
```
stories/<slug>/exports/
├── id/
│   ├── thumbnail-popular.png   ← 1920×1080 (required)
│   ├── thumbnail-bedtime.png   ← 1920×1080 (required)
│   ├── thumbnail.png           ← 1920×1080 (required, copy of popular)
│   └── thumbnail-vertical.png  ← 1080×1920 (required)
└── en/
    ├── thumbnail-popular.png
    ├── thumbnail-bedtime.png
    ├── thumbnail.png
    └── thumbnail-vertical.png
```

---

## 2. Platform-Specific Safe Zones

Safe zones define the content area free of native platform UI overlays (buttons, progress bars, text fields).

### 2.1 YouTube Landscape (16:9 · 1920×1080)
- **Full frame**: 1920 × 1080
- **Action-safe**: 1760 × 880 (inset 80 px each side, 100 px top/bottom)
- **Title / logo placement**: top-right quadrant, avoid bottom-left corner (CC/subtitle overlap)
- **Text size**: minimum 72 pt / 96 px for readability at 320 px wide (mobile thumbnail)

### 2.2 YouTube Shorts (9:16 · 1080×1920)
- **UI-safe vertical band**: top 110 px and bottom 190 px are covered by native overlays
- **Content sweet spot**: rows 110 – 1730 px (1620 px usable height)
- Keep title text in the center 60 % of the frame

### 2.3 Instagram Reels Grid Crop
- Instagram displays a **1:1 square crop** in the profile grid
- Crop region: horizontal center 430 × 430 px from the center of 1080 × 1920
  → Y offset: (1920 − 430) / 2 = 745 px from top
- Ensure primary character and logo are within this center square

### 2.4 Facebook Reels (9:16)
- Same safe zone as YouTube Shorts (top 110, bottom 190)
- Facebook renders a **preview card at 540 × 960**; keep UI-safe zone identical

### 2.5 TikTok (9:16 · 1080×1920)
- **UI-safe band**: top 100 px, bottom 200 px
- **Content sweet spot**: rows 100 – 1720 px
- Hashtag / description overlay appears at the bottom-left; keep primary text out of bottom 30 % of frame

---

## 3. CLI Reference

```bash
# Render all 4 types for one story (both ID and EN)
npm run thumbnail -- --book <slug>

# Render for one language only
npm run thumbnail -- --book <slug> --lang id
npm run thumbnail -- --book <slug> --lang en

# Audit existing thumbnails (exit 0 = all valid, exit 1 = failures found)
npm run thumbnail -- --book <slug> --verify

# Audit all stories in the repo
npm run thumbnail:verify

# Auto-render any missing or invalid thumbnails across all stories
npm run thumbnail:repair

# Repair a single story without touching others
npm run thumbnail -- --book <slug> --repair
```

---

## 4. Auto-Verification in the Publish Pipeline

`scripts/publish-all.ts` runs a **pre-publish thumbnail verification gate** before any platform upload:

1. Calls `verifyStoryThumbnails(bookSlug, lang)` — fast byte-level IHDR check, no Remotion startup cost.
2. For each language that has missing or invalid thumbnails:
   - **Live run**: auto-renders via `renderStoryThumbnails` (triggers Remotion CDP — requires `BypassSandbox: true`).
   - **Dry-run** (`--dry-run`): logs a warning but does **not** render; publish continues with existing assets.
3. Only after all thumbnails pass validation does the platform upload sequence begin.

**Gate behaviour table:**

| Condition | Live run | Dry-run |
|---|---|---|
| All thumbnails valid | ✔ proceed | ✔ proceed |
| Missing thumbnail detected | 🔧 auto-render, then proceed | ⚠️ warn, proceed with existing |
| Remotion render fails | ❌ fatal error, abort publish | ⚠️ warn, proceed |

> **Note**: Remotion `renderStill` requires a live Chromium CDP socket. The publish pipeline always runs with `BypassSandbox: true`; this is correct and expected.

---

## 5. Quality Gate Checklist (Pre-Publish)

Before running `npm run publish:all` for a **new story**:

- [ ] `npm run thumbnail:verify` passes for both `id` and `en`
- [ ] All 4 thumbnail types exist in `exports/id/` and `exports/en/`
- [ ] Dimensions confirmed: landscape = 1920×1080, vertical = 1080×1920
- [ ] Primary character and logo are within the vertical safe zone (top 110 px / bottom 190 px clear)
- [ ] Instagram grid crop test: title/face visible in center 430×430 px of vertical thumbnail

---

## 6. Known Limitations

| Limitation | Detail |
|---|---|
| Cannot update Instagram Reel cover post-publish | Meta Graph API does not support PATCH on published media. The vertical thumbnail **must** be ready and correct before `upload-meta.ts` runs. |
| Cannot delete Instagram / Facebook posts via API | `DELETE /{mediaId}` returns `code 100/33 Unsupported`. Use the native app for manual removal if needed. |
| Facebook link-card thumbnail | The `thumbnail.png` (16:9) is used as OpenGraph image; cache busting after change requires a new URL or `og:image` version param. |
| Remotion cold start | First `renderStill` takes ~8–12 s due to Chromium startup. Subsequent stills in the same run are faster (~2–4 s each). |

---

## 7. Rendering Architecture

```
render-thumbnail.ts
├── verifyStoryThumbnails(slug, lang)      → exported, used by publish-all.ts
│   └── getPngDimensions(filePath)         → byte-level IHDR reader, no deps
│
└── renderStoryThumbnails(options)         → exported, used by publish-all.ts
    ├── selectComposition()                → picks StorybookThumbnail or -Vertical
    ├── renderStill() × 3                  → popular, bedtime, vertical variants
    └── fs.copyFile()                      → creates thumbnail.png from popular
```
