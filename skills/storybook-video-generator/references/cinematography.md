# Cinematography & Camera Movement Guide

This document details the cinematic camera laws, multi-plane depth separation, and layout safe-zones based on the `bang-motion` standard.

---

## 1. The Bang Motion Camera Laws

Videos must never feel like a static slide presentation. Every second on screen must convey continuous cinematic life:

### Law 1: Never Go Wide (< 1.08x Scale)
* **The Rule**: Always start scenes at `scale >= 1.08` to prevent edge letterboxing or blank background glimpses during camera motion.
* **Implementation**:
  ```ts
  const baseScale = 1.08 + Math.sin(frame * 0.035) * 0.014;
  ```

### Law 2: Continuous Camera Breathing (Never Frozen)
* Even during static dialogue or holding shots, the camera must continuously breathe with gentle sinusoidal oscillation:
  ```ts
  const cameraBreath = Math.sin(frame * 0.035) * 0.014;
  ```

### Law 3: Alternating Motion Grammar Across Scenes
Never use the same camera move on two consecutive scenes. Alternate across:
1. `slow_zoom_in`: Push-in from `1.08` to `1.22` (drawing emotional focus into the character).
2. `pan_right`: Translate from `-45px` to `+45px` (following character movement across the frame).
3. `pan_left`: Translate from `+45px` to `-45px` (reversing perspective).
4. `tilt_up`: Translate from `+35px` to `-35px` (revealing a grand tree, cloud, or tall object).

---

## 2. Multi-Plane Depth Separation (Parallax)

When rendering layered environments, apply different translation multipliers to each plane:

| Layer Plane | Depth Role | Translation Multiplier | Blur & Scale |
| :--- | :--- | :--- | :--- |
| **Layer 0 (Background)** | Far sky, mountains, distant hills | `0.25x` | `scale: 1.08`, sharp |
| **Layer 1 (Midground)** | Main scene plate, character interaction | `0.65x` | `scale: 1.12`, sharp |
| **Layer 2 (Foreground)** | Silhouetted grass, leaves, framing branches | `1.45x` | `scale: 1.18`, subtle blur (`blur(2px)`) |

---

## 3. 3D Floating Book Cover Scene (Opener)

Every storybook video begins with a **2.5-second (75 frames @ 30fps)** 3D animated book cover:

* **Cover Presentation**:
  - Gilded inner rim highlight (`ring-1 ring-inset ring-white/20`).
  - Left spine shadow crease (`w-8 bg-gradient-to-r from-black/80 via-white/10 to-transparent`).
  - Floating tilt & subtle elevation (`translateY(Math.sin(frame / 20) * 10px)`).
* **Atmospheric Backdrop**:
  - Ambient blurred version of the cover art (`scale: 1.25`, `blur-3xl`, `opacity: 40%`).
  - Overlay gradient (`from-slate-950 via-slate-950/60 to-slate-950/80`).
* **Title Animation**:
  - Spring-powered entrance with `damping: 14`, `stiffness: 90`.

---

## 4. Social Media Safe-Zone Specifications

### A. 16:9 Landscape (`1920 x 1080` px)
* **Title / Header**: Top safe margin `60px`.
* **Subtitles**: Anchored at `bottom-8` to `bottom-10` (`~80px` from bottom edge).
* **Max Width**: `max-w-4xl` (~1152px) centered horizontally.

### B. 9:16 Vertical Shorts/Reels/TikTok (`1080 x 1920` px)
* **Top Header**: Anchored at `top-10` (`~120px` from top) with pill badge (`Halaman X / Adegan X`).
* **Bottom UI Safe Margin**: Never place text in the bottom 15% where TikTok/Reels captions, account names, and sound buttons reside.
* **Subtitles**: Anchored safely at `bottom-[18%]` (`~345px` from bottom edge).
* **Max Width**: `w-[92%]` (`max-w-[920px]`).

### C. Zero-Crop Vertical Adaptation (Single Source for Both Formats)
When rendering 9:16 vertical videos from 16:9 illustration plates, **never use raw `objectFit: cover`**, which crops off >60% of the horizontal illustration (cutting off characters and side actions). Instead, use the **Ambient Pillarbox Canvas**:
1. **Background Layer**: Full-bleed blurred plate (`scale: 1.25`, `filter: blur(48px) brightness(0.38) saturate(1.3)`).
2. **Vignette Layer**: Soft radial gradient overlay (`radial-gradient(circle at center, rgba(15,23,42,0.15) 0%, rgba(2,6,23,0.85) 100%)`).
3. **Centerpiece Layer**: Floating uncropped 16:9 illustration (`width: 1000px, height: 562px`, `objectFit: contain`, `borderRadius: 20px`, golden rim `3px solid rgba(251, 191, 36, 0.5)`). Preserves 100% of the artwork!
4. **Subtitle Layer**: Subtitles float in the lower third (`bottom-[18%]`), completely below the artwork, avoiding occluding the illustration while staying clear of TikTok UI buttons.

---

## 5. Advanced Tier: AI Video Interpolation (I2V Start-to-End Frame Motion)

While programmatic 2.5D camera breathing in Remotion is the standard baseline, scenes featuring fast physical action or magical transformation (e.g. a golden cucumber swelling, seeds bursting into vines, a cat leaping across the table) can optionally be interpolated using generative video engines.

### Start-to-End Frame Pairing Workflow:
* **Generative Engines**: Kling AI 1.5, Runway Gen-3 Alpha, Luma Ray 2, Google Veo 2.
* **Input Pair**:
  - `Start Frame`: `assets/scene_01.png`
  - `End Frame`: `assets/scene_02.png`
* **Golden Rule for I2V Prompts**:
  - **Zero Description Redundancy**: Do not repeat the setting or character traits already visible in the keyframes.
  - **100% Focus on Motion & Speed**: Describe solely the physical delta, trajectory, and speed connecting the two frames.
  - **Camera Stability**: Always lock the camera (`Locked-off camera, seamless motion transition from start frame to end frame, no jitter`).

### Example I2V Prompt:
> `"Fast hyperlapse transformation. Vines shoot dynamically from the fertile soil, wrapping outward with organic momentum as the golden cucumber swells and glows brightly with warm sunlight. Seamless fluid transition from start frame to end frame, locked-off camera."`

### Integration in Remotion:
Generated clips are saved as `assets/clip_01_02.mp4` and referenced in `story.json` as `visual.videoPath`. Remotion renders `<Video src={...} />` instead of `<Img />` seamlessly within the same composition.
