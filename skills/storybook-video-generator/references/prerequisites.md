# Prerequisites & Tooling Guide

This document lists all system dependencies, runtime environments, external CLI tools, and API credentials required by the `storybook-video-generator` pipeline.

---

## 1. System Runtime Requirements

| Dependency | Minimum Version | Purpose | Verification Command |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.18.0` (v20+ recommended) | JavaScript/TypeScript execution runtime | `node -v` |
| **npm / npx** | `>= 9.0.0` | Package manager and script runner | `npm -v` |
| **tsx** | `>= 4.0.0` | TypeScript script execution without build step | `npx tsx -v` |
| **Headless Chrome / Chromium** | Latest stable | Remotion headless frame rendering | Automatic via Puppeteer/Remotion |

> **Note on Sandbox / Network**: When executing Remotion media rendering (`renderMedia`) via headless Chrome, ensure local WebSocket connections to `127.0.0.1` are permitted (`BypassSandbox: true` if running in constrained sandbox environments).

---

## 2. Core NPM Dependencies

The following packages are required in any project implementing this pipeline:

```bash
npm install remotion @remotion/player @remotion/renderer @remotion/bundler
npm install msedge-tts @google/genai lucide-react clsx tailwind-merge
npm install -D tsx typescript @types/node
```

### Purpose of Core Packages:
* **`remotion` & `@remotion/*`**: Programmatic video creation engine, frame-by-frame canvas compositor, and MP4 renderer.
* **`msedge-tts`**: Connects to Microsoft Azure Cognitive Neural Voice endpoints for high-fidelity speech synthesis with zero API cost.
* **`@google/genai`**: Official Google GenAI SDK for Gemini Imagen 3 image generation.
* **`lucide-react`**: Vector icons for storybook preview players and UI components.

---

## 3. Audio & Media Tooling (Optional but Recommended)

| Tool | Platform | Purpose | Command |
| :--- | :--- | :--- | :--- |
| **ffmpeg** | macOS, Linux, Windows | Audio duration probing, format conversion, and stream analysis | `ffmpeg -version` |
| **afinfo / afconvert** | macOS built-in | Quick audio duration checks and WAV/AIFF conversion | `afinfo <audio-file>` |
| **sips** | macOS built-in | Fast image dimension and metadata inspection | `sips -g pixelWidth -g pixelHeight <image>` |

---

## 4. API Credentials & Environment Variables

Place these environment variables in your project's `.env` file:

```env
# Optional: Google GenAI API Key for Imagen 3 batch generation
# When omitted, the built-in IDE agent image tool can be used directly
GEMINI_API_KEY="your-gemini-api-key-here"

# Optional: ElevenLabs API Key (only if custom voice cloning is needed)
ELEVENLABS_API_KEY=""
```

---

## 5. Rate Limits & Concurrency Safeguards

When using AI image generation (Gemini Imagen 3 / `gemini-3.1-flash-image`):
1. **Sequential Generation**: Never invoke image generation concurrently across scenes. Always generate scene plates sequentially.
2. **Buffer Delay**: Maintain a **2 to 3 second pause** between consecutive image generation calls to avoid `429 RATE_LIMIT_EXCEEDED ("quota will reset after 2s")`.
3. **Burst Capacity**: Free/included developer endpoints typically permit **3 to 5 images per burst**, resetting every ~4 to 5 hours. For mass generation, configure a standard `GEMINI_API_KEY`.

---

## 6. AI Model Recommendation Matrix

| Production Task | Recommended Primary | Capable Alternative | Key Strengths & Use Cases |
| :--- | :--- | :--- | :--- |
| **Visual Masterboard Sheet** | **Ideogram v2** | GPT-4o Image / Imagen 3 | Accurate layout composition, rendered typography for poster reference |
| **Anchor Keyframe Plates** | **Gemini Imagen 3** | Midjourney v6.1 / Flux.1 | Storybook art styles (watercolor, gouache), high fidelity without text artifacts |
| **Progressive Consistent Edits** | **Chained Anchors** | Midjourney (`--cref`/`--cw`) | Preserves character identity, costume, and environmental anchors |
| **Voiceover Synthesis** | **Azure Neural (`id-ID-GadisNeural`)** | ElevenLabs Multilingual v2 | Zero-cost natural Indonesian child cadence with exact word-level timestamps |
| **Foley & ASMR Sound Effects** | **ElevenLabs SFX** | MMAudio / AudioCraft | Crisp tactile audio textures (milk splash, paws padding, door creak) |
| **Video Motion (Camera Laws)** | **Remotion (Code-based)** | CapCut Desktop | Deterministic 60fps/30fps camera breathing, kinetic spring subtitles |
| **Video Motion (AI Interpolation)**| **Kling AI 1.5 (Pro)** | Runway Gen-3 / Luma Ray 2 | Fluid start-to-end frame morphing for magical transformations |
