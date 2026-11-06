# Operational Boundaries, Known Limitations & Workarounds

This document provides an exhaustive, engineering-grade catalog of real-world boundaries, platform constraints, API quota limits, and technical workarounds discovered across the `storybook-video-generator` production lifecycle.

---

## Limitation & Workaround Matrix

| Domain | Limitation / Platform Barrier | Impact & Error Signature | Proven Workaround / Mitigation |
| :--- | :--- | :--- | :--- |
| **YouTube API** | **10,000 Units/Day Quota** | `403 quotaExceeded` after ~1.5 full bilingual books (4 videos = 6,600 units) | Use `--resync-all` / `--update-metadata` (51 units/video) for revisions; stagger full uploads over calendar days. |
| **YouTube API** | **Shorts 180s Ceiling & Videos Section Duplication** | Uploading vertical (9:16) video >180s forces it into Long "Videos" tab with letterbox, creating exact duplicates | Restrict YouTube uploads to 16:9 Landscape by default (`--format landscape`); enforce Tier 4 block; route 9:16 to IG/FB Reels & TikTok. |
| **YouTube API** | **Thumbnail Velocity / Burst Rate-Limit** | `400/429 The user has uploaded too many thumbnails recently` when updating >3 thumbnails rapidly | Wait 15–30 min cooldown, then run `--update-thumbnails` for remaining videos, or drag-and-drop into YouTube Studio. |
| **YouTube API** | **Phone Verification Requirement** | `403 The authenticated user doesn't have permissions to upload and set custom video thumbnails` | Complete one-time channel verification at `https://www.youtube.com/verify` (Intermediate Features). |
| **YouTube API** | **Shorts Vertical Thumbnail UI Behavior** | API sets 9:16 thumbnail in library, but mobile Shorts feed dynamically grabs an animated video frame | Thumbnail displays on desktop, search, and channel playlists; choose primary frame during mobile upload if needed. |
| **Meta Graph API** | **Instagram Reels Cover Premature R2 Deletion** | Deleting Cloudflare R2 cover image during transcoding polling causes HTTP 404, resulting in missing Reels cover | Enforce R2 cover lifecycle: `coverCleanup()` runs strictly in `finally` AFTER `POST /media_publish` returns success. |
| **Meta Graph API** | **Burst Velocity Trigger & Algorithmic Suspension** | `Code 100 subcode 33 ("Object does not exist")` + HTTP 403 / Account Suspended when uploading >3 Reels rapidly | Enforce anti-burst cooldown (≥30–60 mins between Reels); prefer 1 post/day via `daily-broadcast.yml`; submit Instagram in-app appeal; re-link Page via Edit Profile. |
| **YouTube API** | **Processing Latency & SD Preview** | Newly published videos default to 360p/480p SD playback for the first 5–15 minutes | Switch player gear ⚙️ to 1080p HD; optional 4K triggers VP9/AV1 codec allocation for maximum clarity. |
| **Remotion** | **Headless Chrome WebSocket / CDP** | `connect EPERM 127.0.0.1` inside isolated sandbox environments | Run rendering scripts with sandbox network bypass (`BypassSandbox: true` / elevated socket permissions). |
| **Remotion** | **High Memory Spikes on 4K Canvas** | Chrome tab crash (`SIGKILL` / OOM) on machines with <8GB available RAM | Standardize on 1080p Full HD (`1920×1080`) by default; reserve 4K for dedicated high-RAM render nodes. |
| **Remotion** | **Audio Buffer vs Timeline Frame Drift** | Audio clipping or silent tail frames due to fractional frame rounding | Always compute `durationInFrames = Math.ceil(durationInSeconds * fps)` and add 0.1s silence padding to audio stems. |
| **Thumbnails** | **Legacy Story Title Bleed / Hardcoded Fallbacks** | Thumbnail renders title, hook, or sticker from a previous storybook | Decouple templates: define `thumbnailConfig` in `story.json` and use dynamic `splitHeadline()` and `deriveEmoji()` in `ThumbnailComposition.tsx`. |
| **AI Visuals** | **Image API Quota & Burst Throttle** | `429 / RESOURCE_EXHAUSTED` after 3–5 rapid image generation requests | Pause, present Decision Card (Option 1: Wait & Auto-Resume vs Option 2: Progressive Draft with storyboard placeholders). |
| **AI Visuals** | **Garbled AI Text Hallucination** | Image models generate distorted pseudo-text on signs, clothes, and book covers | Append negative prompt: `--no text, no watermark, no typography, no letters, no words, no signs`; prioritize authentic source plates. |
| **AI Visuals** | **Multi-Scene Character Drift** | Protagonist facial structure, attire, or hair color changes across scenes | Lock physical traits in `Character Bible` (`bible/character-bible.json`) and prepend exact descriptor formula to every scene prompt. |
| **AI Visuals** | **Vertical 9:16 Cropping Blindspot** | Standard `objectFit: cover` chops off >60% of horizontal action and side characters | Use **Ambient Pillarbox Canvas** (blurred backdrop + centered 16:9 plate + lower kinetic subtitles). |
| **PDF Ingestion** | **Portrait Cover & Single-Page Cropping Slice** | Naive bottom-aligned crop cuts off portrait covers and character heads on single pages | Keep full portrait aspect ratio for `cover.png` (`CoverScene.tsx` scales 3D book container); anchor single-page 16:9 crops centered on character faces/action with ~280px headroom. |
| **Thumbnails** | **Legacy Story Headline Leak** | Hardcoded thumbnail templates leak previous story titles into new projects | Enforce dynamic `thumbnailConfig` in `story.json` and algorithmic title splitting (`splitHeadline()`) with contextual emoji derivation. |
| **Voiceover & TTS** | **Azure WordBoundary Punctuation Stripping** | Subtitle tokens lose commas, question marks, and exclamation marks (`"kucing"` instead of `"kucing?"`) | Run `attachPunctuation()` mapping lexical timing tokens back to original manuscript words. |
| **Voiceover & TTS** | **Phonetic Mispronunciation of Acronyms** | Neural voice mispronounces acronyms or slang (e.g., reading *"PR"* as *"purr"*) | Pre-normalize text in manuscript: substitute acronyms with spaced letters (`P-R`) or full words (`tugas sekolah`). |
| **Voiceover & TTS** | **Sub-150ms Subtitle Word Flashing** | Single-syllable words flash too fast for young children to read | Clamp minimum visible word duration to ≥150ms in the subtitle spring-bounce component. |
| **Deduplication** | **Remote Search Eventual Consistency** | `youtube.search.list` misses videos uploaded <10 minutes ago, risking duplicate insertion | Deduplication engine prioritizes deterministic probing via `youtube.videos.list({ id })` using IDs recorded in `story.json`. |

---

## 1. YouTube Data API v3 Boundaries & Quota Management

### Daily Quota Math (10,000 Units Default)
Google Cloud assigns 10,000 quota units per day per project (resetting at midnight Pacific Time / 07:00 UTC).

| API Method | Quota Cost | Purpose in Pipeline |
| :--- | :--- | :--- |
| `videos.insert` | **1,600 units** | Binary video upload (16:9 or Shorts) |
| `thumbnails.set` | **50 units** | Custom thumbnail upload |
| `videos.delete` | **50 units** | Removing older duplicate video |
| `videos.update` | **50 units** | Updating metadata (title, description, tags) |
| `videos.list` | **1 unit** | Idempotency status verification |
| `search.list` | **100 units** | Channel duplicate scan |

#### Complete Release Cost Calculation:
* **1 Bilingual Title Release (4 Videos)**:
  * 2 × Landscape uploads (`insert` + `thumbnail`): `(1600 + 50) × 2 = 3,300`
  * 2 × Shorts uploads (`insert` + `thumbnail`): `(1600 + 50) × 2 = 3,300`
  * Probes & listing checks: `~20`
  * **Total per Title**: **6,620 units**
* **Free Quota Ceiling**: You can publish **1 full bilingual story (4 videos)** or **3 single-language stories (6 videos)** per 24-hour cycle on a standard GCP project.

#### Best Practice for Quota Conservation:
* Never re-upload video binaries to fix typos, descriptions, or thumbnails. Always use:
  ```bash
  npm run upload -- --book <book-slug> --lang all --resync-all
  ```
  *(Cost: ~204 units total vs 6,600 units for a full re-upload).*

---

### Thumbnail Velocity Throttling (Burst Limit)
Even when daily quota remains available, YouTube enforces an unadvertised **burst velocity throttle** on thumbnail uploads:
* **Symptom**: After successfully setting 3 custom thumbnails in rapid succession, the 4th call fails with:
  ```
  ⚠️ Thumbnail upload warning: The user has uploaded too many thumbnails recently. Please try the request again later.
  ```
* **Engine Handling**: The upload script traps this error gracefully with a warning rather than aborting the pipeline or failing the overall build.
* **Resolution**:
  1. Allow a 15–30 minute cooldown window.
  2. Run the targeted thumbnail-only update command:
     ```bash
     npx tsx scripts/upload-youtube.ts --book <book-slug> --lang en --update-thumbnails
     ```
  3. Or upload the rendered thumbnail directly via [YouTube Studio](https://studio.youtube.com).

---

### YouTube Channel Verification (Intermediate Features)
* Custom thumbnails are locked behind YouTube's **Intermediate Features**.
* If a channel is not phone-verified, the API rejects thumbnail uploads with:
  ```
  403 The authenticated user doesn't have permissions to upload and set custom video thumbnails
  ```
* **One-Time Fix**: The channel owner must visit [https://www.youtube.com/verify](https://www.youtube.com/verify) and complete standard SMS or voice verification.

---

### YouTube Shorts 180s Ceiling & Channel Videos Section Duplication
* **Hard Platform Constraint**: YouTube officially limits vertical (9:16) Shorts to a maximum duration of **180 seconds (3 minutes)**.
* **Failure Mode & Duplicate Trap**: If a vertical 9:16 video exceeding 180 seconds is uploaded to YouTube:
  1. YouTube's ingestion pipeline rejects it from the Shorts shelf.
  2. YouTube reclassifies the video as a standard **Long Video**, rendering it with ugly pillarbox/letterbox black bars on desktop and TV.
  3. The video appears directly in the channel's public **"Videos" tab**, creating an exact title and content duplicate right next to the 16:9 widescreen master video.
* **Engineering Policy & Standard Operating Procedure**:
  - **YouTube is Landscape-Only by Default**: The automated distribution pipeline (`publish-all.ts`) MUST always pass `--format landscape` to `upload-youtube.ts`.
  - **Tier 4 (>180s) Automatic Guardrail**: `upload-youtube.ts` automatically rejects vertical uploads if `durationTier === "tier4"` (>180s), routing execution exclusively to 16:9 Landscape.
  - **Vertical Distribution Boundary**: Vertical 9:16 storybook renders belong on **Instagram Reels, Facebook Reels, and TikTok**, which natively support long vertical viewing without channel duplication.
  - **Channel Audit & Cleanup**: Run `scripts/list-channel-videos.ts` to detect duplicate titles, and `scripts/remedy-youtube-duplicates-and-thumbnails.ts` to safely purge vertical duplicates from YouTube while preserving Meta (IG/FB) records in `story.json`.

---

### Meta Graph API Instagram Reels Cloudflare R2 Cover Lifecycle
* **Asynchronous Cover Ingestion**: In the Meta Graph API container workflow, passing a public `cover_url` stages the cover image for download. However, Meta's media crawler downloads the image asynchronously during or right before the `POST /{ig-user-id}/media_publish` call.
* **Failure Mode (HTTP 404 Cover Fetch)**: If the Cloudflare R2 temporary cover object is deleted during container transcoding polling (`pollInstagramContainer()`), Meta encounters an HTTP 404 error when attempting to fetch the cover file and quietly falls back to an uncurated, random video frame.
* **Engineering Policy**: The cleanup routine (`coverCleanup()`) MUST strictly execute in the `finally` block **after** `media_publish` completes and returns a valid `mediaId`.

---

### Meta Graph API Instagram Velocity Limits, Bot Heuristics & Account Suspension
* **The Platform Constraint**:
  * While Meta documentation quotes a daily publishing limit of 25–50 posts per 24 hours (`content_publishing_limit`), Instagram employs a separate, undocumented **velocity / burst anti-spam heuristic**.
  * On young or low-trust accounts (<30 days old, low follower count), pushing multiple high-resolution video reels through the API within minutes (e.g. 8 reels in 3 minutes) triggers immediate bot-farm protection.
* **Failure Signatures**:
  1. **Soft Disconnect**: Meta quietly disconnects the `instagram_business_account` node from the Facebook Page (`GET /{page-id}?fields=instagram_business_account` returns empty).
  2. **Subcode 33 Masking**: Subsequent API calls fail with `GraphMethodException: Object with ID '...' does not exist, cannot be loaded due to missing permissions, or does not support this operation. (code: 100, error_subcode: 33)`.
  3. **Temporary Account Suspension**: Visiting the account returns HTTP 403 Forbidden; opening the Instagram app shows *"We suspended your account on [Date]... Inauthentic automated activity"*.
* **Mitigation & Operational Rules**:
  * **Strict Anti-Burst Guard**: Never publish multiple Reels back-to-back without human-cadence delays. Automated batch uploads must enforce a mandatory delay of ≥30–60 minutes between posts.
  * **Default to Daily Scheduled Broadcast**: Use the GitHub Actions daily workflow (`.github/workflows/daily-broadcast.yml`) to publish 1 storybook Reel per day at 19:00 WIB (12:00 UTC), blending seamlessly into organic platform traffic.
  * **Recovery Workflow**:
    1. Submit an appeal in the Instagram mobile app by completing SMS verification, email code confirmation, and a video selfie.
    2. Provide an appeal statement stating that uploads were performed via registered Meta Developer App through official Meta Graph API endpoints for an educational children's storybook channel.
    3. Once restored by Meta (typically within hours to 24h), reconnect the Facebook Page from the Instagram App: **Edit Profile ➔ Public Business Information ➔ Page ➔ Select Zayn Storybook**.
    4. Generate a fresh token in [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/) with `instagram_basic` and `instagram_content_publish` granted for the restored account.

---

## 2. Headless Video Rendering Constraints (Remotion)

### Chrome DevTools Protocol (CDP) WebSocket Loopback
* **Architecture**: Remotion launches a headless Chromium instance and establishes a bidirectional WebSocket connection to `ws://127.0.0.1:<port>`.
* **Sandbox Barrier**: Sandboxed development environments restrict local socket binding, causing:
  ```
  Error: connect EPERM 127.0.0.1
  ```
* **Rule**: All video rendering (`render-book.ts`) and still thumbnail exports (`render-thumbnail.ts`) must execute outside the sandbox (`BypassSandbox: true` / elevated permissions).

### Memory & Resolution Profiles
| Profile | Resolution | Average RAM Usage | Render Speed (1-min video) | Recommended For |
| :--- | :--- | :--- | :--- | :--- |
| **1080p Full HD (Default)** | 1920×1080 / 1080×1920 | ~400 MB | ~45–60 seconds | Production default; fast, lightweight, rock-solid stability. |
| **4K UHD (Optional)** | 3840×2160 / 2160×3840 | ~1.8 GB – 3.2 GB | ~3.5–5 minutes | Premium master; forces YouTube high-bitrate VP9/AV1 codec allocation. Requires ≥8GB free system RAM. |

---

## 3. Visual Generation & Art Consistency Boundaries

### AI Image Generation Quota Limits & Burst Throttling
* **Quota Envelope**: Cloud image generation endpoints (Gemini Imagen 3, Google GenAI SDK, or subagents) enforce burst limits (typically 3 to 5 images per burst on free/developer tiers, resetting every ~4 to 5 hours) and daily rate limits.
* **Error Signatures**: `429 Too Many Requests`, `RESOURCE_EXHAUSTED`, or status code `8`.
* **Standard Operating Procedure**:
  1. **Never fail silently or crash the workflow**: Catch the quota exception immediately.
  2. **Update Manifest**: Tag missing scene visual states as `"status": "quota_pending"`.
  3. **Present Decision Card**:
     - **Option 1 (Wait & Auto-Resume)**: Pause and set a resume schedule for when the cooldown resets.
     - **Option 2 (Progressive Storyboard Mode)**: Generate dark-themed storyboard placeholder plates for pending scenes so Remotion can proceed to render complete audio, subtitles, and preview video drafts without blocking.
     - **Option 3 (Secondary Key / Source Ingestion)**: Switch to an alternative key or ingest clean H5P plates.

### Preventing AI Text Hallucination
* Diffusion and autoregressive image models often try to render text onto storefronts, signs, papers, or clothing, resulting in unreadable gibberish.
* **Mandatory Prompt Guard**: Every generation prompt MUST append:
  ```
  --no text, no watermark, no typography, no letters, no words, no signs
  ```
* **Clean Plate Ingestion Priority**: Always prefer extracting authentic, high-resolution, text-free plates from open-source H5P bundles (e.g. Global Digital Library, StoryWeaver) over AI generation. Authentic plates provide 100% human artist fidelity with zero AI drift.

### The Vertical 9:16 Crop Trap
* **The Flaw**: Applying standard CSS `object-fit: cover` to adapt a 16:9 illustration for 9:16 vertical video crops out 66% of the image, slicing off characters and crucial story context.
* **The Solution**: Always use the **Ambient Pillarbox Canvas**:
  1. **Background**: Full-bleed 9:16 layer using the scene plate with heavy Gaussian blur (`blur(40px)`), brightness dimming (`brightness(0.4)`), and subtle continuous scale breathing.
  2. **Centerpiece**: Uncropped 16:9 floating card with 10px white sticker border and 3D elevation shadow (`0 20px 50px rgba(0,0,0,0.8)`).
  3. **Lower Third**: Elastic kinetic subtitles positioned in the lower safe-zone (`bottom-[18%]`), completely clear of TikTok / Shorts UI overlays.

---

## 4. Voiceover & Subtitle Synchronization Constraints

### Azure WordBoundary Punctuation Stripping
* In Azure / Edge TTS, the native `WordBoundary` telemetry events return lexical words without surrounding punctuation (e.g., `"makan"`, `"tidak"` instead of `"makan,"`, `"tidak!"`).
* **Workaround**: The pipeline applies `attachPunctuation(words, rawManuscript)`:
  1. Tokenizes the raw manuscript preserving original punctuation marks.
  2. Re-attaches commas, question marks, exclamation marks, and ellipses to the corresponding timing tokens.
  3. Ensures viewers see natural expressive grammar matching the narrator's vocal inflection.

### Acronym & Phonetic Normalization
Neural voices struggle with non-standard acronyms or informal spelling:
* **Indonesian**:
  * `"PR"` (Pekerjaan Rumah) → neural voice may say *"purr"* → Pre-normalize to `"P-R"` or `"tugas sekolah"`.
  * `"ga"` / `"gak"` → Pre-normalize to `"nggak"`.
* **English**:
  * `"Dr."` → normalize to `"Doctor"`.
  * `"Mr."` → normalize to `"Mister"`.

---

## 5. Pre-Publishing Idempotency & Duplicate Prevention

### Eventual Consistency of Remote Platform APIs
* When querying YouTube for recently published videos, `youtube.search.list(forMine: true)` can lag by up to 15 minutes due to index propagation delays.
* **Architecture**: The deduplication engine uses a tiered verification hierarchy:
  1. **Tier 1 (Local Manifest)**: Probes `story.json.publications[platform]` for saved video IDs.
  2. **Tier 2 (Deterministic API Probe)**: Calls `youtube.videos.list({ id: savedId })` directly. This endpoint is strictly consistent and returns immediate status regardless of search index lag.
  3. **Tier 3 (Channel Search Fallback)**: Queries channel video list only when local records are missing or invalid.
