# Visual Consistency Bibles & Art Direction

This document details how to construct the Character Bible, World Bible, and Chained Scene Prompts to guarantee 100% visual consistency with zero character drift across every video scene.

---

## 1. Character Bible Specification

The **Character Bible** establishes an immutable visual definition for the protagonist and key supporting characters. Every prompt generated for a scene must inject these traits verbatim.

### Schema:
```json
{
  "name": "Timun Mas",
  "role": "protagonist",
  "visualAnchor": "A cheerful 7-year-old Indonesian girl with warm olive skin, bright round joyful eyes, and jet-black hair in two neat braided pigtails tied with yellow ribbon bows. She wears a soft teal/toska cotton kebaya with subtle yellow striped trim, paired with a terracotta-brown batik kawung sarong.",
  "expressionRules": "Always friendly, brave, respectful, and smiling warmly. Never aggressive or distressed.",
  "colorPalette": {
    "primary": "#0D9488",
    "secondary": "#FBBF24",
    "accent": "#7C2D12"
  }
}
```

### Essential Character Consistency Rules:
1. **Source-Fidelity Grounding**: When authentic clean plates are absent and AI generation is required, always extract visual traits directly from the source manuscript first. If the story specifies a black cat, never prompt for an orange cat; if a red notebook is mentioned, retain the red color.
2. **Always Specify Age and Ethnicity**: e.g., *"7-year-old Indonesian girl"*, *"elderly Javanese mother"*, *"playful black cat with round green eyes"*.
3. **Explicit Hair & Accessories**: e.g., *"two braided pigtails with yellow ribbon bows"*, *"traditional hair bun with yellow sash"*.
4. **Specific Clothing & Textile Names**: Never write generic "wearing clothes". Use exact garment names: *"teal cotton kebaya"*, *"batik kawung sarong"*, *"floral daster dress"*, *"white school uniform with red tie"*.

---

## 2. World Bible Specification

The **World Bible** anchors the environment, time period, architectural cues, and lighting palette across all scenes so the world feels cohesive.

### Schema:
```json
{
  "settingName": "Desa Lereng Gunung Nusantara",
  "timePeriod": "Traditional Indonesian Fairytale / Nusantara Folkloric",
  "biome": "Fertile terraced volcanic hillside village, lush tropical banana and mango foliage, morning mist, warm golden sunbeams streaming through leaves.",
  "colorPalette": {
    "primary": "#064E3B",
    "secondary": "#FBBF24",
    "accent": "#F59E0B",
    "description": "Luminous golden dawn sunbeams over emerald green terraces and warm fertile soil"
  },
  "artStyleAnchor": "Whimsical fairytale watercolor children's picture book illustration, soft wet-on-wet washes, organic paper texture, luminous sunbeams, rich atmospheric depth, clean composition, no text, no watermark, no typography"
}
```

---

## 3. Art Style Presets

Select one medium preset per storybook project and adhere to it strictly across all scenes:

### A. Whimsical Fairytale Watercolor (Ideal for Folktales & Nature Stories)
* **Prompt Anchor**:
  > `"Whimsical fairytale watercolor children's picture book illustration, soft wet-on-wet washes, organic watercolor paper texture, delicate ink pen outlines, luminous warm sunlight, Beatrix Potter and Quentin Blake aesthetic, clean composition, full bleed, no text, no watermark, no words on image."`
* **Best suited for**: *Timun Mas*, *Sahabat Pohon Rindang*, *Kancil*.

### B. Priya Kuriyan Folk Art Gouache (Ideal for Humorous & Urban/Village Stories)
* **Prompt Anchor**:
  > `"Signature folk art gouache children's picture book illustration in the style of Priya Kuriyan from StoryWeaver Pratham Books, textured artisanal brushstrokes, lively expressive characters, warm earthy palette (ochre, terracotta, olive green, warm slate), rich storytelling, clean composition, full bleed, no text, no watermark."`
* **Best suited for**: *Gara-Gara Kucing!*, animal mischief, family comedy.

---

## 4. Chained Scene Prompt Engineering

When constructing prompts for consecutive scenes, chain the previous scene's outcome and visual anchors:

```
[Medium Preset] + Setting: [World Bible Biome] + Featuring: [Character Bible Visual Anchor] + Action: [Current Narrative Action] + Lighting & Mood: [Lighting Anchor] + [Negative Constraints]
```

### Universal Negative Constraints:
Every prompt must end with:
```
no text, no watermark, no typography, no letters, no subtitles, no words on image, professional publication quality, 16:9 aspect ratio
```
This prevents the generative model from hallucinating chapter headings or book titles on the artwork.

---

## 5. Visual Masterboard: Infographic Storyboard Poster Sheet

Before generating individual scene plates, generate a single-image **9:16 Infographic Storyboard Poster** (saved to `stories/<book-slug>/assets/storyboard-poster.png`). This serves as the master production sheet locking character appearance, costume, environment, and chronological scene progression.

### Master Poster Prompt Template:
```text
Vertical 9:16 infographic production storyboard poster in a sleek dark modern UI layout titled "[TITLE]".
TOP SECTION:
- Bold typographic header displaying "[TITLE]" in clean uppercase sans-serif with a gold or pastel accent.
- Subtitle: "[ART MEDIUM PRESET] | Children's Picture Book Production Sheet".
- High-contrast hero split-thumbnail showcasing the protagonist alongside the main story setting.
METADATA BAR:
- Clean modular badge strip featuring icons: Scenes "[TOTAL SCENES]", Aspect Ratio "16:9 & 9:16", Style "[ART MEDIUM PRESET]", Language "[LANGUAGE]".
MAIN CONTENT (Vertical Stack of [TOTAL SCENES] chronological rows):
Each row features:
- Left Column: Prominent numbered badge "[SCENE NUMBER]" with estimated timestamp "[START - END]".
- Middle Column: Illustrated 16:9 preview thumbnail depicting [SPECIFIC SCENE VISUAL STATE] in [ART MEDIUM PRESET] style.
- Right Column: Bold Scene Title, Shot Mode tag "[CAMERA MOTION]", Narrative summary "[ACTION DESCRIPTION]", and Sound Cue tag "[FOLEY / ASMR CUE]".
FOOTER:
- Production notes: "Character Anchor: [CHARACTER ANCHOR SUMMARY] | Palette: [PALETTE HEX CODES] | License: [LICENSE]".
Clean vector framing, crisp readable typography, high visual contrast, professional children's book video production reference sheet.
```

---

## 6. Illustration Quota Limit Detection & Progressive Storyboard Protocol

When generating visual plates via AI image generation APIs (e.g. Gemini Imagen 3) or subagents, API endpoints enforce rate limits and burst quotas (typically 3 to 5 images per burst on free/developer tiers, resetting every ~4 to 5 hours, or daily request limits).

### A. Quota Exhaustion Signatures
The pipeline actively intercepts the following error signatures during visual synthesis:
* `429 Too Many Requests`
* `RESOURCE_EXHAUSTED`
* `"Quota exceeded for quota metric 'Generate Content API Requests'..."`
* Google GenAI API status code `8` / `RESOURCE_EXHAUSTED`

### B. Manifest State Tracking (`story.json`)
Every scene tracks visual plate readiness in `story.json`:
```json
"visual": {
  "imagePath": "assets/scene_04.png",
  "prompt": "...",
  "status": "quota_pending",
  "quotaPausedAt": "2026-11-01T20:25:00.000Z",
  "estimatedResetAt": "2026-11-02T01:00:00.000Z"
}
```

### C. The Interactive Decision Card Protocol
Whenever a visual quota limit is encountered, the generator MUST NOT fail silently or abort the task. It must pause immediately and present an interactive Decision Card to the user:

```markdown
### ⚠️ Visual Generation Quota Reached

Generated: Scene 1–3 (3/9 scenes ready).
Remaining: Scene 4–9 paused due to API quota rate limit (`RESOURCE_EXHAUSTED`).
Estimated Quota Reset: ~4–5 hours (or next UTC cycle).

| Option | Action | Blast Radius & Flow Impact | Reversibility | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Option 1: Wait & Auto-Resume** | Pause workflow and set a timer until quota reset window. | Delays final video completion by ~4–5 hours; 100% final authentic illustrations. | High (can switch options anytime) | **Recommended if final video is needed without interim draft.** |
| **Option 2: Continue the Rest (Progressive Draft)** | Slot in stylish storyboard placeholder plates for pending scenes, continue voiceover synthesis (ID & EN), kinetic subtitles, and export draft MP4s. | Zero delay: user can review audio, timing, and narrative pacing right away. Final plates slotted in later in <60s via `scripts/manage-story.ts`. | High (single command swaps plates) | **Recommended for active development & review.** |
| **Option 3: Secondary Key / Source Ingestion** | Provide secondary `GEMINI_API_KEY` or ingest clean open-access plates directly from StoryWeaver / GDL. | Resumes generation immediately without waiting. | Instant | Feasible if backup key exists. |
```

### D. Progressive Storyboard Placeholder Mode (Option 2)
If the user selects Option 2 (or in non-interactive pipeline runs):
1. **Generate Styled Placeholder Plates**: Creates dark-themed 1920×1080 storyboard cards at `assets/scene_XX.png` displaying scene number, scene prompt snippet, and duration badge.
2. **Mark Status**: Sets `visual.status: "placeholder"` in `story.json`.
3. **Continue Downstream Pipeline**: Synthesizes all voiceovers (Indonesian and English), extracts `WordBoundary` telemetry, generates audio stems, and renders preview MP4 videos.
4. **Resuming Later**: Once quota resets, execute:
   ```bash
   npx tsx scripts/manage-story.ts --book <book-slug> --asset visual --resume-quota
   npm run render -- --book <book-slug> --lang all --format all
   ```

