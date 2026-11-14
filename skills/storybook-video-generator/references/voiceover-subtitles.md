# Neural Voiceover & Kinetic Subtitles Guide

This document specifies the speech synthesis configuration, word-level timestamp extraction, and spring-bounce kinetic subtitle styling.

---

## 1. Dual-Language Neural TTS & Universal Voice Actor System

We use Microsoft Azure Cognitive Neural Voices via `msedge-tts` (100% free, studio grade, natural child cadence) combined with our modular **Universal Voice Actor Casting & Synthesis System (`src/audio/voice-actors.ts` & `src/audio/tts-engine.ts`)**.

> [!TIP]
> **Universal Multi-Speaker Casting**:  
> Stories can define multi-speaker dialogue lines per scene where Narrator, Child Protagonist, Mother, Father, and Magical Entities (e.g. The Moon) have distinct voices, pitch/rate prosody tuning, signature glow colors, and subtitle badges.

### Standard Voice Actor Casting Registry (`src/audio/voice-actors.ts`):

> [!IMPORTANT]
> **Pure Child Voice Rule (No Adult Male Formants):**  
> Never use `id-ID-ArdiNeural` for child narrators. Because `ArdiNeural` is fundamentally an adult male model, pitch-shifting upwards leaves heavy adult chest resonance (*formants*).  
> In Indonesian, use `id-ID-GadisNeural` for all child personas with **dual-cadence prosody**:
> - **Narrator (Zayn Child Host)**: `pitch: +18%`, `rate: +10%` (Energetic, funny, joyful, presentation cadence).
> - **Protagonist (Aku / Child Character)**: `pitch: +32%`, `rate: +4%` (Sweet, cute, expressive, innocent child storytelling).

| Role Identifier | Indonesian Persona (`id-ID`) | English Persona (`en-US`) | Icon & Glow Color | Tuning & Cadence |
| :--- | :--- | :--- | :--- | :--- |
| **`narrator`** | `id-ID-GadisNeural` (`+18%`, `+10%`) | `en-US-AnaNeural` (`+15%`, `+8%`) | 📖 `#34D399` (Mint) | Lively, funny, attractive, energetic child host (Zayn Storyteller) |
| **`child_protagonist`** | `id-ID-GadisNeural` (`+32%`, `+4%`) | `en-US-AnaNeural` (`+28%`, `+4%`) | 👧 `#FACC15` (Gold) | Sweet, cute, expressive, innocent young storytelling child |
| **`child_girl`** | `id-ID-GadisNeural` (`+34%`, `+5%`) | `en-US-AnaNeural` (`+30%`, `+4%`) | 👧 `#F472B6` (Pink) | Sweet, bright, playful young girl |
| **`child_boy`** | `id-ID-GadisNeural` (`+20%`, `+6%`) | `en-US-AnaNeural` (`+16%`, `+4%`) | 👦 `#FBBF24` (Amber) | Cheerful, spunky little brother / boy friend |
| **`mother`** | `id-ID-GadisNeural` (`-6Hz`, `-8%`) | `en-US-JennyNeural` (`-2Hz`, `-4%`) | 👩 `#38BDF8` (Sky Blue) | Maternal, gentle, soothing adult female |
| **`father`** | `id-ID-ArdiNeural` (`-2Hz`, `-2%`) | `en-US-BrianNeural` (`default`, `-2%`) | 👨 `#FB923C` (Orange) | Warm, grounded, reassuring adult male |
| **`elder`** | `id-ID-ArdiNeural` (`-8Hz`, `-10%`) | `en-US-RogerNeural` (`-4Hz`, `-8%`) | 👴 `#A3E635` (Lime) | Wise grandparent / village elder |
| **`magical_entity`** | `id-ID-ArdiNeural` (`-5Hz`, `-8%`) | `en-US-BrianNeural` (`-4Hz`, `-6%`) | 🌙 `#FEF08A` (Moon Gold)| Ethereal, echoing, serene bedtime cadence |
| **`animal_funny`** | `id-ID-GadisNeural` (`+36%`, `+10%`) | `en-US-AnaNeural` (`+32%`, `+8%`) | 🐾 `#C084FC` (Lavender) | High-speed, witty, bouncy cartoon animals |

### Multi-Speaker Synthesis CLI:
```bash
# Synthesize all scenes and multi-speaker dialogue lines automatically:
npm run audio:synthesize -- --book <book-slug> --lang all
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

### Large Read-Aloud Capsule & Universal Safe-Zone Placement:
* **Landscape 16:9**: `fontSize: 46px`, `bottom: 56px`, `left: 48px`, `right: 48px`, `padding: "16px 28px"`, rounded pill corners (`borderRadius: "20px"`).
* **Portrait 9:16 (Universal Shorts / Reels / TikTok Safe Zone)**: `fontSize: 48px`, `bottom: 420px`, `left: 36px`, `right: 148px` (stays cleanly above 0–400px bottom descriptions/nav chrome and clear of 120–132px right-rail action buttons).
* **High-Contrast Compositor-Safe Styling**: Solid slate background (`rgba(15, 23, 42, 0.92)`) with golden gradient/stroke accent (`rgba(251, 191, 36, 0.55)`). **Omit `backdropFilter: "blur(...)"`** on `>= 0.90` opaque subtitle boxes to prevent redundant GPU framebuffer readbacks on every animated frame.

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
