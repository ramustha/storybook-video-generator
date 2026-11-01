# Neural Voiceover & Kinetic Subtitles Guide

This document specifies the speech synthesis configuration, word-level timestamp extraction, and spring-bounce kinetic subtitle styling.

---

## 1. Dual-Language Neural TTS (Bahasa Indonesia & English)

We use Microsoft Azure Cognitive Neural Voices via `msedge-tts` (100% free, studio grade, natural child cadence).

> [!TIP]
> **100% Visual Plate Reuse Across Languages**:  
> Because all visual illustration plates (`assets/scene_XX.png`) are generated completely free of baked-in text overlays (`--no text, no watermark`), **the exact same illustration plates and camera motions are reused for both Bahasa Indonesia and English**. Only speech audio (`.mp3`) and word boundaries (`_words.json`) are synthesized per language!

### Voice Configurations by Language:

| Language | Persona | Voice Identifier | Pitch | Rate (Speed) | Emotional Tone |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Indonesian (`id-ID`)** | **Female Child Storyteller** | `id-ID-GadisNeural` | `+20%` | `+4%` to `+6%` | Warm, cheerful, gentle storytelling |
| **Indonesian (`id-ID`)** | **Male Child Storyteller** | `id-ID-ArdiNeural` | `+20%` | `+5%` to `+7%` | Energetic, curious, playful |
| **English (`en-US`)** | **Child Storyteller (Ana)** | `en-US-AnaNeural` | `+10%` | `+0%` to `+3%` | Sweet, friendly, authentic young child voice |
| **English (`en-US`)** | **Warm Bedtime (Emma)** | `en-US-EmmaNeural` | `+5%` | `-2%` to `+2%` | Expressive, comforting bedtime narrator |
| **English (`en-GB`)** | **British Child (Maisie)** | `en-GB-MaisieNeural` | `+8%` | `+2%` | Playful fairytale storybook narrator |

### Dual-Language Synthesis Script Pattern:
```ts
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const voiceMap = {
  id: "id-ID-GadisNeural",
  en: "en-US-AnaNeural",
};

export async function synthesizeLanguageAudio(lang: "id" | "en", text: string, outputPath: string) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceMap[lang], OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });

  const { audioFilePath, metadataFilePath } = await tts.toFile(tempDir, text, {
    pitch: lang === "id" ? "+20%" : "+10%",
    rate: "+4%",
  });
  // ... copies audio to assets/<lang>/scene_XX.mp3 and saves word boundaries
}
```

---

## 2. WordBoundary Timestamp Extraction & Punctuation Preservation

Exact word timestamps enable precise karaoke-style word highlighting.

Azure metadata provides tick counts (1 tick = 100 nanoseconds = `1e-7` seconds):

```ts
const startSec = item.Data.Offset / 10000000;
const durSec = item.Data.Duration / 10000000;
const endSec = startSec + durSec;
```

### Critical Punctuation (*Tanda Baca*) Recovery:
> [!IMPORTANT]
> Azure TTS `WordBoundary` events strip all punctuation (e.g., returning `tugas`, `Bu`, `kucing` without `?`, `!`, `,`).  
> Subtitles without punctuation degrade reading comprehension for children. Always align Azure word items with the original manuscript tokens:

```ts
function attachPunctuation(azureWords: string[], originalText: string): string[] {
  const originalTokens = originalText.trim().split(/\s+/);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-zA-Z0-9-]/g, "");

  let tokenIdx = 0;
  return azureWords.map((azWord) => {
    for (let i = tokenIdx; i < originalTokens.length; i++) {
      const orig = originalTokens[i];
      if (clean(orig).includes(clean(azWord)) || clean(azWord).includes(clean(orig))) {
        tokenIdx = i + 1;
        return orig; // Preserves ?, !, ,, ., and ...
      }
    }
    return azWord;
  });
}
```

---

## 3. Multi-Speaker Color & Dialogue Tagging

When dialogue alternates between multiple characters (e.g., adult teacher/mother vs. young protagonist child), assign distinct colors and dynamic speaker pill badges to maintain narrative clarity for young viewers:

| Persona Role | Target Character | Signature Glow Color | Badge Icon |
| :--- | :--- | :--- | :--- |
| **Teacher / Mother (Adult)** | Ibu Guru, Ibu, Mbok | `#38BDF8` (Brilliant Sky Blue) | 👩‍🏫 |
| **Child Protagonist** | Budi, Timun Mas, Kancil | `#FDE047` (Radiant Golden Yellow) | 👦 |
| **Narrator / Storyteller** | Story voice, Title cover | `#34D399` (Emerald Mint) | 📖 |

### Dialogue Switching Rule:
* In multi-speaker scenes, the subtitle container dynamically displays the active speaker's badge above the speech bubble.
* Active word spring bounce glows in that specific speaker's signature hex color, immediately signaling who is talking even before the child reads the whole sentence.

---

## 4. Kinetic Subtitle Animation & Styling

### 3-Tier Visual Hierarchy:
1. **Active Word (Spoken Right Now)**:
   - **Color**: Glowing golden yellow (`#FEF08A` / `#FDE047`).
   - **Physics**: Elastic spring bounce (`scale: 1.25x`, terangkat `-8px`, tilt `±2.5deg`).
   - **Glow**: Subtle warm aura capsule behind the active word.
   - **Text Stroke**: Dark stroke (`-webkit-text-stroke: 1.8px #000`) for 100% legibility on any background.
2. **Spoken Words (Past)**:
   - **Color**: Crisp solid white (`#FFFFFF`) with shadow.
3. **Upcoming Words (Future)**:
   - **Color**: Soft translucent white (`rgba(255, 255, 255, 0.45)`).

### Spring Bounce Code Recipe (Remotion):
```tsx
const isActive = currentTime >= item.start && currentTime <= item.end;
let wordScale = 1.0;
let bounceY = 0;
let tiltDeg = 0;

if (isActive) {
  const wordDuration = Math.max(0.08, item.end - item.start);
  const progress = Math.min(1, Math.max(0, (currentTime - item.start) / wordDuration));
  bounceY = -Math.sin(progress * Math.PI) * (isVertical ? 10 : 8);
  wordScale = 1.0 + Math.sin(progress * Math.PI) * (isVertical ? 0.28 : 0.22);
  tiltDeg = (idx % 2 === 0 ? -2.5 : 2.5) * Math.sin(progress * Math.PI);
}
```

### Floating Glassmorphic Capsule:
* Background: `rgba(15, 23, 42, 0.85)` with `backdrop-filter: blur(16px)`.
* Rounded pill borders (`rounded-3xl` or `rounded-full`).
* Subtle golden gradient border (`p-[2.5px] bg-gradient-to-r from-amber-400/50 via-yellow-300/60 to-amber-500/50`).
* Never use opaque rectangular blocks that hide the background artwork.

---

## 4. Synchronized ASMR & Foley Sound Design

Pairing neural voiceover with tactile sound effects (Foley/ASMR) elevates storybook videos from flat read-alongs to rich, multi-sensory cinematic experiences.

### The 4-Part Foley Prompt Formula:
When generating sound cues (via ElevenLabs Sound Effects, AudioCraft, or MMAudio):
```text
[Primary Action Sound] + [Material Interaction] + [Acoustic Environment] + [Rhythmic Pace]
```

### Examples for Children's Storybooks:
* **Liquid Spill / Accident**:
  > `"Crisp foley sound effect: glass cup tipping over rustic wood, liquid milk splashing dynamically across tabletop, soft puddle droplets dripping onto floor, warm indoor acoustic."`
* **Animal / Character Movement**:
  > `"Soft ASMR foley: gentle feline paw pads padding softly across wooden planks, low rhythmic cat purring vibration, soft whiskers brushing paper."`
* **Magical Event / Discovery**:
  > `"Enchanting fairytale sound effect: high-frequency crystal bell chime ringing softly, warm ambient golden shimmer whoosh, gentle sparkling resonance."`
* **Folklore Giant / Nature Rumble**:
  > `"Deep sub-bass earth rumble: heavy ground thud reverberating through fertile soil, tree foliage rustling and leaves shaking in morning breeze."`

### Multi-Track Audio Mixing Rules (Remotion):
| Audio Track | Target Volume | Processing & Pan |
| :--- | :--- | :--- |
| **Voiceover (`assets/scene_XX.mp3`)** | `1.00` | Centered, crystal clear child storytelling speech |
| **Foley & ASMR (`assets/sfx_scene_XX.mp3`)**| `0.65 - 0.75` | Synchronized with visual action; 0.05s crossfade |
| **Background Music (BGM)** | `0.12 - 0.15` | Soft acoustic strings / glockenspiel; ducked during speech |
