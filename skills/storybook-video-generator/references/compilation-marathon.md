# Compilation & Marathon Video Architecture

> Reference guide for producing high-retention multi-story compilation videos (10–30+ minutes) for YouTube, Facebook Watch, and YouTube Kids.

---

## 1. Why Compilations are Critical for Channel Growth

Single storybooks (1.5–3 minutes) excel for Shorts/Reels and quick discovery. Compilations (marathons) serve family viewing behavior:
* **"Set and Forget" Screen Time**: Parents playing videos on Smart TVs or tablets during bedtime, mealtime, or car rides do not want to tap the screen every 2 minutes.
* **Algorithmic Watch Time (AVD)**: YouTube heavily rewards high total watch time and Average View Duration.
* **Mid-Roll Ad Monetization**: Videos longer than **8 minutes** qualify for YouTube Mid-Roll ads, multiplying creator RPM.
* **Content Multiplier**: Repackages existing rendered story scenes and assets into new long-form assets with zero incremental illustration or voiceover generation cost.

---

## 2. Auto-Recommendation Engine & Threshold Heuristics

The recommendation engine scans `stories/*/story.json`, analyzes durations and themes, and automatically suggests thematic compilation packs when enough content exists.

### Qualification Thresholds:
* **Minimum Stories**: $\ge 3$ complete stories.
* **Minimum Target Duration**: $\ge 8.0$ minutes (480 seconds) to unlock Mid-Roll Ads.
* **Thematic Coherence**: Curated by mood, age group, or viewing occasion.

### Built-in Thematic Presets:
1. **🌙 Bedtime Stories Marathon (`bedtime`)**:
   * *Target*: 3–8 years bedtime wind-down.
   * *Sequence*: Gara-Gara Kucing $\to$ Hari Cukur Rambut $\to$ Jas Hujan Merah $\to$ Raja Gemuk, Anjing Kurus.
   * *Mood*: Gentle, soothing, comforting.
2. **🐱 Funny Animals & Wit (`animals`)**:
   * *Target*: Weekend morning entertainment, humor, laughter.
   * *Sequence*: Gara-Gara Kucing $\to$ Hari Cukur Rambut $\to$ Raja Gemuk.
   * *Mood*: Upbeat, hilarious, expressive.
3. **💖 Character & Moral Values (`moral`)**:
   * *Target*: Character building, honesty, patience, empathy.
   * *Sequence*: Gara-Gara Kucing (Honesty) $\to$ Jas Hujan Merah (Patience) $\to$ Hari Cukur Rambut (Courage) $\to$ Raja Gemuk (Health & Friendship).

### CLI Command:
```bash
# Scan catalog and report compilation recommendations:
npm run compilation:recommend
```

---

## 3. Retention Architecture: The Anchor Sequence & Interstitials

### A. The 4-Part Sequencing Formula:
1. **Posisi 1 (The Anchor / Hook)**: Highest retention, funniest, or most dynamic story (e.g. *Gara-Gara Kucing!*).
2. **Posisi 2 (The Momentum Story)**: Creative problem solving or adventure to lock viewers past minute 4 (e.g. *Hari Cukur Rambut*).
3. **Posisi 3 (The Emotional Core)**: Deeper empathy, patience, or heartwarming tale (e.g. *Jas Hujan Merah*).
4. **Posisi 4 (The Calming Finale)**: Peaceful, relaxing story leading into sleep (e.g. *Raja Gemuk, Anjing Kurus!*).

### B. Outro Suppression & Interstitial Chapter Bumper:
* **Intermediate Stories (Stories 1 to N-1)**: Individual story subscribe outros (`type: "outro"`) are automatically **suppressed** so viewers are not given a premature closing signal.
* **Chapter Bumper (`ChapterBumper.tsx`)**: A 4-second (120 frames) animated transition card between stories:
  * Floating 3D Book Preview of the upcoming story.
  * Chapter Pill Badge: `✨ CERITA SELANJUTNYA • BABAK X DARI Y ✨`.
  * Animated countdown progress bar.
  * Gentle audio chime or transition sound.
* **Final Story (Story N)**: Plays the full master outro with moral takeaway and subscribe call-to-action.

---

## 4. Automated YouTube Chapters & Metadata

Every compilation render automatically generates a companion `kompilasi-<theme>-<lang>-metadata.txt` file containing copy-paste ready YouTube Chapters and SEO description:

```text
⏳ TIMESTAMPS / DAFTAR CERITA:
00:00 - Cerita 1: Gara-Gara Kucing!
01:21 - Cerita 2: Hari Cukur Rambut Sringeri Srinivas!
04:14 - Cerita 3: Jas Hujan Merah
06:12 - Cerita 4: Raja Gemuk, Anjing Kurus!
07:47 - Pesan Moral & Ucapan Selamat Tidur
```

---

## 5. Dedicated Compilation Thumbnail Architecture

Compilations require a distinct, high-CTR thumbnail strategy that differs from single storybooks. A parent scrolling YouTube needs to instantly distinguish a marathon collection from a single 2-minute video.

### Visual Design Rules (`CompilationThumbnailComposition.tsx`):
1. **3D Fanned Storybook Cards**: Showcases 3–4 preview covers from the compiled stories tilted dynamically (`-14deg`, `+12deg`, `-5deg`, `+4deg`) with white borders, drop shadows, and glowing golden halos.
2. **Eye-Catcher Marathon Pill**: Bright red or golden pill badge: `⏱️ 12 MENIT NON-STOP MARATHON` (ID) or `⏱️ 12 MINS NON-STOP MARATHON` (EN).
3. **Parent Benefit Sub-Hook**: Emphasizes emotional convenience:
   - *Indonesian*: *"Bikin Si Kecil Tertidur Nyenyak, Tenang & Penuh Pesan Moral 💤✨"*
   - *English*: *"Calming, Delightful Bedtime Stories for Sweet Dreams & Warm Smiles 💤✨"*
4. **Instant Base64 Injection**: Pre-encodes source book covers to base64 Data URIs to eliminate Remotion web server file-lookup latency during 1080p `renderStill`.

### CLI Thumbnail Commands:
```bash
# Render Indonesian compilation thumbnail:
npm run compilation:thumbnail -- --theme bedtime --lang id

# Render English compilation thumbnail:
npm run compilation:thumbnail -- --theme bedtime --lang en

# Render both language thumbnails simultaneously:
npm run compilation:thumbnail -- --theme bedtime --lang all
```

---

## 6. Multi-Platform Publication Workflow for Compilations

Compilations (~10–30+ mins, 16:9 Landscape) are targeted specifically for **YouTube** and **Facebook Watch**.

### A. Facebook Watch (16:9 Landscape Video):
* Utilizes **Cloudflare R2 Edge Ingestion** (`file_url`) to upload large binary videos (~250MB+) without consuming local network upload bandwidth for Facebook's transcoding.
* Automatically attaches the dedicated compilation thumbnail as the preferred video poster.
* Commands:
  ```bash
  # Indonesian Edition:
  npx tsx scripts/upload-meta.ts --compilation bedtime --lang id

  # English Edition:
  npx tsx scripts/upload-meta.ts --compilation bedtime --lang en
  ```

### B. YouTube (16:9 Long-Form Master with Chapters):
* Automatically embeds formatted chapters from `kompilasi-<theme>-<lang>-metadata.txt` into the description.
* Attaches the distinct compilation thumbnail (`thumbnail-compilation-<theme>-<lang>.png`).
* Automatically logs video ID and permalink in `exports/compilations/publication-status.json`.
* Commands:
  ```bash
  # Indonesian Edition (Public):
  npx tsx scripts/upload-youtube.ts --compilation bedtime --lang id --privacy public

  # English Edition (Public):
  npx tsx scripts/upload-youtube.ts --compilation bedtime --lang en --privacy public

  # Dual-Language Sequential Upload (Both ID & EN):
  npx tsx scripts/upload-youtube.ts --compilation bedtime --lang all --privacy public
  ```

---

## 7. Bilingual Compilation Marathon Architecture

The compilation engine enforces 100% dual-language feature parity:

| Aspect | Indonesian Edition (`id`) | English Edition (`en`) |
| :--- | :--- | :--- |
| **Visual Artwork** | 100% Shared Clean Plates (zero redundant generation) | 100% Shared Clean Plates (zero redundant generation) |
| **Voiceover Synthesis** | `id-ID-GadisNeural` & `id-ID-ArdiNeural` | `en-US-AnaNeural` |
| **Average 5-Book Duration** | ~11:04 (11.1 min) $\to$ **✔ Mid-Roll Eligible** | ~09:19 (9.3 min) $\to$ **✔ Mid-Roll Eligible** |
| **Interstitials (`ChapterBumper`)** | `✨ CERITA SELANJUTNYA • BABAK X DARI Y ✨` | `✨ NEXT STORY • PART X OF Y ✨` |
| **Outro Chapter Marker** | `Pesan Moral & Ucapan Selamat Tidur` | `Bedtime Wish & Goodnight` |
| **Thumbnail Pill** | `⏱️ 12 MENIT NON-STOP MARATHON` | `⏱️ 12 MINS NON-STOP MARATHON` |
| **SEO Tags** | `#DongengAnak`, `#CeritaAnak`, `#KompilasiDongeng` | `#BedtimeStories`, `#ChildrenStorybook`, `#KidsMarathon` |
| **Single CLI Command** | `npm run compilation:render -- --theme bedtime --lang all` | `npm run compilation:render -- --theme bedtime --lang all` |

---

## 8. Compilation CLI Commands Summary

```bash
# 1. Preview recommendations and eligibility:
npm run compilation:recommend

# 2. Dry-run timeline and timestamps for all languages:
npm run compilation:render -- --theme bedtime --lang all --dry-run

# 3. Render Dual-Language Bedtime Marathon (ID & EN 16:9 Landscape):
npm run compilation:render -- --theme bedtime --lang all

# 4. Render single language (Indonesian or English):
npm run compilation:render -- --theme bedtime --lang id
npm run compilation:render -- --theme bedtime --lang en

# 5. Render custom story sequence:
npm run compilation:render -- --books gara-gara-kucing,jas-hujan-merah,raja-gemuk-anjing-kurus --lang all

# 6. Render distinct high-CTR compilation thumbnails (both languages, enlarged edge-to-edge):
npm run compilation:thumbnail -- --theme bedtime --lang all

# 7. Render high-resolution standalone chapter preview thumbnails (ID & EN):
npm run compilation:chapters -- --theme bedtime --lang all

# 8. Publish compilation to Facebook Watch:
npx tsx scripts/upload-meta.ts --compilation bedtime --lang id
npx tsx scripts/upload-meta.ts --compilation bedtime --lang en

# 9. Publish compilation to YouTube Public:
npx tsx scripts/upload-youtube.ts --compilation bedtime --lang id --privacy public
npx tsx scripts/upload-youtube.ts --compilation bedtime --lang en --privacy public
```

---

## 9. Chapter Thumbnails & YouTube Scrubber Previews

### How YouTube Chapter Thumbnails Function
1. **Dynamic Video Frame Extraction**: YouTube does **not** provide an API to upload separate static image files for chapters. Instead, YouTube's desktop player, mobile scrubber, and chapters drawer automatically capture a frame from the video stream at the exact timestamp specified in the description (`00:00`, `01:54`, `03:45`, etc.).
2. **Frame 0 Guarantee**:
   * Previously, spring animations in `CoverScene` and `ChapterBumper` started at scale `0.0`, resulting in a blank or tiny card if YouTube sampled the very first frame of a chapter.
   * `CoverScene` and `ChapterBumper` now initialize with `cardScale = interpolate(entrance, [0, 1], [0.94, 1.0])`.
   * Frame 0 is guaranteed to display a crisp, full-scale 3D storybook cover and title badge, ensuring maximum impact in YouTube scrubbers and mobile chapter cards.
3. **Standalone Chapter Thumbnail Export**:
   * Run `npm run compilation:chapters -- --theme <theme> --lang all`.
   * Renders dedicated 1920×1080 still cards for every story in the compilation (`exports/compilations/chapters/<theme>-<lang>/chapter-XX-<slug>.png`).
   * Generates `chapters-manifest.json` containing exact timestamps, chapter indices, story titles, and image paths for use in YouTube Community Posts, social media carousels (Instagram, Facebook), and external embeds.

### Edge-to-Edge Thumbnail Sizing (Zero Dead Space)
To maximize mobile click-through rates (CTR) and eliminate empty margins:
* **Fanned Compilation Hero**: The foreground hero book card is enlarged to **620×440px** (from 450×320px) with background supporting cards scaled at 570px, 540px, and 520px, occupying ≥80% of the right canvas half.
* **Single-Story Popular Variant**: Enlarged hero frame to **860×720px** with high-contrast sticker border.
* **Single-Story Bedtime Variant**: Enlarged gilded frame to **860×680px**.
* **9:16 Shorts/Reels Variant**: Centerpiece hero card enlarged to **1000×980px** with reduced top/bottom padding to dominate vertical smartphone feeds.

