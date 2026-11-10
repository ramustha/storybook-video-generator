# Dual-Track Architecture: Deterministic Book Archival vs. Dynamic Edu-Motion

> [!IMPORTANT]
> **Strict Dual-Track Separation Guarantee (Zero-Mixing Policy)**:
> Authentic published children's storybooks from **BUDI Kemendikdasmen RI** and **StoryWeaver** must **NEVER** have their original artist plates discarded or replaced with ad-hoc vector rigs. They operate 100% on **Track 1 (`original-illustration`)**. Conversely, text-only folklore, science explainers, and kinetic concept videos operate on **Track 2 (`edu-motion`)** using dynamic HTML5 + GSAP + Playwright. Both tracks produce identical 1080p Full HD MP4 deliverables (16:9 Landscape & 9:16 Vertical) that feed seamlessly into the content calendar and multi-platform publishing engine.

---

## 1. Track Comparison Matrix

| Dimension | 🎨 Track 1: Deterministic Book Archival | ⚡ Track 2: Probabilistic & Dynamic Edu-Motion |
| :--- | :--- | :--- |
| **Track Identifier** | `pipelineTrack: "original-illustration"` (or omitted) | `pipelineTrack: "edu-motion"` |
| **Best Used For** | Published picture books with authentic artist plates (BUDI Kemendikdasmen, StoryWeaver, SIBI Kemendikbud) | Text-only folklore (Fabel Kancil, Timun Mas), STEM science explainers, interactive anatomy/nature breakdowns |
| **Visual Source** | Authentic book page PDFs cleaned via Apple Vision OCR & text inpainting (`assets/scene_XX.png`) | Procedural layered SVGs (character rigs, biomes, diagrams, speech bubbles, x-ray scans) |
| **Animation Engine** | **Remotion** (React declarative compositions, Bang Motion camera laws, ambient pillarbox 9:16) | **Playwright Chromium + GSAP 3** (`render-motion-stage.ts` frame-stepping at 30 fps) |
| **Character Consistency** | 100% deterministic (locked to authentic published book illustrations) | Algorithmic consistency (shared SVG component definitions & color hex palette tokens) |
| **Audio & Voiceover** | Azure Neural Voice (`id-ID-GadisNeural`, `en-US-AnaNeural`) + BGM + Action Foley SFX | Same Azure Neural Voice + WebAudio/FFmpeg procedural SFX triggers (`boing`, `splash`, `chime`) |
| **Subtitles Engine** | Remotion kinetic bouncy karaoke with speaker accent colors | Embedded HTML/CSS kinetic word spans with real-time audio sync |
| **Storage in R2** | `story.json`, `assets/`, `bible/` (~5–15 MB) | `story.json`, `motion/{id,en}/`, `assets/thumbnails/` (~1.5 MB) |
| **Render Command** | `npx tsx scripts/render-book.ts --book <slug>` (Auto-routed to Remotion) | `npx tsx scripts/render-book.ts --book <slug>` (Auto-routed to Edu-Motion) |

---

## 2. Track 2: The 6 Dynamic Stage Archetypes

Defined in [`src/motion/types.ts`](file:///Users/ramadhani.musthofa/Work/personal/next-storybook/src/motion/types.ts), each Edu-Motion episode chooses a **Stage Archetype** suited to its core pedagogical or narrative motif:

1. **`diorama-cross-section`** (*Nature, Rivers, Oceans, Fables*):
   - Multi-depth diorama with water surface line, sky/tree canopy, and underwater swimming depth.
   - Example: *Kancil dan Buaya* (Kancil jumping on crocodile backs across river ripples).
2. **`vertical-tower`** (*Trees, Towers, Sky, Space*):
   - Tall vertical climbing composition with atmospheric layer transitions (ground $\to$ canopy $\to$ clouds $\to$ stars).
   - Example: *Kisah Pohon Beringin Raksasa*, *Petualangan Burung Pipit ke Langit*.
3. **`exploded-layers`** (*Anatomy, Science, Cultural Craft, How Things Work*):
   - Exploded technical or anatomical schematic with dashed callout lines and X-Ray reveal panels.
   - Example: *Bagaimana Paru-Paru Bekerja*, *Rahasia Kapal Pinisi*.
4. **`horizontal-track`** (*Journeys, Relays, Races, Timeline Progressions*):
   - Side-scrolling panoramic journey with progressive milestone markers.
   - Example: *Lomba Lari Kura-Kura & Kelinci*, *Perjalanan Sebutir Padi*.
5. **`magnifying-lens`** (*Microbiology, Insects, Detective Investigations*):
   - Floating circular lens vignette with magnified high-detail vector interiors.
   - Example: *Dunia Semut di Bawah Daun*, *Misteri Jejak Kaki di Hutan*.
6. **`acoustic-emotion`** (*Sound, Music, Social-Emotional Learning*):
   - Dynamic soundwave ripples, animated musical staves, and expressive character reaction bubbles.
   - Example: *Mengapa Suara Gendang Berbunyi*, *Mengenal Nada dan Irama*.

---

## 3. Directory Structure for Edu-Motion Stories

Edu-Motion stories follow the standardized root directory structure, substituting video plate folders with the interactive `motion/` stage bundle:

```
stories/<book-slug>/
├── story.json                    # Manifest: "pipelineTrack": "edu-motion", archetype, scenes
├── raw/
│   ├── source-manuscript-id.txt  # Indonesian narrative & moral takeaway
│   └── source-manuscript-en.txt  # English translation & moral takeaway
├── bible/
│   ├── character-bible.json      # Vector character definitions (parts, colors, scale)
│   └── world-bible.json          # Biome palette, stage background, lighting
├── motion/
│   ├── id/
│   │   ├── index.html            # Responsive standalone HTML5/GSAP stage
│   │   ├── timeline.json         # Exact cue points, word timestamps, SFX events
│   │   └── vo_combined.mp3       # Concatenated neural voiceover track
│   └── en/
│       ├── index.html            # English responsive stage
│       ├── timeline.json         # English cue points
│       └── vo_combined.mp3       # English voiceover track
└── exports/                      # Identical deliverable output structure
    ├── id/
    │   ├── <slug>-16x9.mp4       # 1080p Widescreen YouTube video
    │   ├── <slug>-9x16.mp4       # 1080p Vertical Shorts/Reels/TikTok video
    │   ├── thumbnail-popular.png
    │   └── thumbnail-vertical.png
    └── en/
        ├── <slug>-16x9.mp4
        ├── <slug>-9x16.mp4
        ├── thumbnail-popular.png
        └── thumbnail-vertical.png
```

---

## 4. Responsive Dual-Ratio Stage Design

A key architectural advantage of Edu-Motion is that **a single `index.html` file natively handles both 16:9 and 9:16 aspect ratios** through fluid CSS Grid and Flexbox layouts:

```
┌───────────────────────────────────────────────┐
│              16:9 WIDESCREEN                  │
│ ┌──────────────────────┐ ┌──────────────────┐ │
│ │                      │ │ 🏷️ Topic Pill     │ │
│ │                      │ │ 📌 Title & Moral  │ │
│ │   DYNAMIC STAGE      │ │ ──────────────── │ │
│ │   (Diorama / Rigs)   │ │ 💬 Kinetic       │ │
│ │                      │ │    Karaoke       │ │
│ │                      │ │    Subtitles     │ │
│ └──────────────────────┘ └──────────────────┘ │
└───────────────────────────────────────────────┘

┌────────────────────────┐
│      9:16 VERTICAL     │
│ ┌────────────────────┐ │
│ │ 🏷️ Topic & Header  │ │
│ ├────────────────────┤ │
│ │                    │ │
│ │   DYNAMIC STAGE    │ │
│ │   (Centerpiece)    │ │
│ │                    │ │
│ ├────────────────────┤ │
│ │ 💬 Kinetic         │ │
│ │    Subtitles Card  │ │
│ │ 💡 Moral Takeaway  │ │
│ └────────────────────┘ │
└────────────────────────┘
```

- **Landscape (16:9, `1920x1080`)**: 2-Column layout. The left side hosts the immersive animated stage (62% width), while the right side hosts the topic header, structured chapter meter, and kinetic karaoke typography box.
- **Vertical (9:16, `1080x1920`)**: 3-Zone vertical layout. Top safe zone (0–220px) hosts badges; middle zone (220–1350px) hosts the active stage; bottom safe zone (1350–1750px) hosts the high-contrast subtitles card well above mobile platform UI controls.

---

## 5. Rendering Engine: Deterministic Frame Stepping

The rendering engine ([`src/motion/render-motion-stage.ts`](file:///Users/ramadhani.musthofa/Work/personal/next-storybook/src/motion/render-motion-stage.ts)) guarantees 100% deterministic, zero-frame-drop video capture without real-time screen recording artifacts:

1. **Headless Browser Launch**: Playwright launches headless Chromium locked to `--window-size=1920,1080` (or `1080,1920`).
2. **Audio Clock Synchronization**: The browser window exposes `window.__seekToTime(seconds)`.
3. **Discrete Frame Stepping**: For every frame at 30 fps ($dt = 1/30 = 0.0333\text{s}$):
   - Playwright calls `window.__seekToTime(t)`.
   - GSAP instantly updates all tweens, physics, wave oscillations, and character rigs.
   - Playwright captures an uncompressed PNG frame buffer.
   - Pipes raw frames directly into an `ffmpeg` child process standard input (`image2pipe`).
4. **Audio & SFX Multiplexing**: FFmpeg combines the frame stream with `vo_combined.mp3` and procedural WebAudio SFX cues, outputting high-bitrate H.264/AAC MP4 in under 60 seconds.

---

## 6. End-to-End CLI Commands

```bash
# 1. Compile & Pack an Edu-Motion story package (HTML5 + Timeline + Voiceover):
npx tsx scripts/pack-edu-motion-story.ts

# 2. Preview the interactive stage in any browser before rendering:
open stories/edu-fabel-kancil-buaya/motion/id/index.html

# 3. Render 1080p MP4 deliverables (Universal command auto-routes to Edu-Motion):
npx tsx scripts/render-book.ts --book edu-fabel-kancil-buaya --lang all --format both

# 4. Synchronize HTML/SVG motion assets to Cloudflare R2:
npx tsx scripts/manage-story-storage.ts push edu-fabel-kancil-buaya

# 5. Pre-render buffer caching (H-3 days ahead in Cloudflare R2):
npx tsx scripts/buffer-prerender.ts --days 3

# 6. Multi-platform broadcast (YouTube, Instagram Reels, Facebook, Threads):
npm run publish:all -- --book edu-fabel-kancil-buaya
```
