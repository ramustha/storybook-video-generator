import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { KineticSubtitles, WordTiming } from "./KineticSubtitles";

interface StorySceneProps {
  scene: any;
  book: any;
  isVertical: boolean;
  words: WordTiming[];
}

export const StoryScene: React.FC<StorySceneProps> = ({ scene, book, isVertical, words }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalSceneFrames = Math.ceil((scene.durationSeconds || 6.0) * fps);

  // Bang Motion Law 2: Continuous Camera Breathing
  const cameraBreath = Math.sin(frame * 0.035) * 0.012;

  // Bang Motion Law 3: Alternating Motions
  const motionType = scene.camera?.motion || "slow_zoom_in";
  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;

  if (isVertical) {
    // In Vertical (9:16), subtle cinematic motion on the uncropped centerpiece plate
    if (motionType === "slow_zoom_in") {
      scale = interpolate(frame, [0, totalSceneFrames], [1.0, 1.06], {
        extrapolateRight: "clamp",
      }) + cameraBreath;
    } else if (motionType === "pan_right") {
      scale = 1.03 + cameraBreath;
      translateX = interpolate(frame, [0, totalSceneFrames], [-16, 16], {
        extrapolateRight: "clamp",
      });
    } else if (motionType === "tilt_up") {
      scale = 1.03 + cameraBreath;
      translateY = interpolate(frame, [0, totalSceneFrames], [12, -12], {
        extrapolateRight: "clamp",
      });
    }
  } else {
    // In Landscape (16:9), full-bleed camera scale >= 1.08
    if (motionType === "slow_zoom_in") {
      const startScale = (scene.camera?.scaleStart as number) || 1.08;
      const endScale = (scene.camera?.scaleEnd as number) || 1.20;
      scale = (interpolate(frame, [0, totalSceneFrames], [startScale, endScale], {
        extrapolateRight: "clamp",
      }) as number) + cameraBreath;
    } else if (motionType === "pan_right") {
      scale = 1.12 + cameraBreath;
      const startX = (scene.camera?.panStart?.x as number) || -45;
      const endX = (scene.camera?.panEnd?.x as number) || 45;
      translateX = interpolate(frame, [0, totalSceneFrames], [startX, endX], {
        extrapolateRight: "clamp",
      }) as number;
    } else if (motionType === "tilt_up") {
      scale = 1.12 + cameraBreath;
      const startY = (scene.camera?.panStart?.y as number) || 35;
      const endY = (scene.camera?.panEnd?.y as number) || -35;
      translateY = interpolate(frame, [0, totalSceneFrames], [startY, endY], {
        extrapolateRight: "clamp",
      }) as number;
    }
  }

  const imgSrc = staticFile(scene.visual.imagePath);
  const bgScale = 1.25 + cameraBreath * 2;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#080C14",
      }}
    >
      {isVertical ? (
        <>
          {/* Layer 1: Ambient Blurred Background Plate (Zero-Crop Pillarbox Adaptation) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${bgScale})`,
              filter: "blur(48px) brightness(0.38) saturate(1.3)",
              zIndex: 1,
            }}
          >
            <Img
              src={imgSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

          {/* Layer 2: Soft Dark Vignette for Cinematic Focus */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at center, rgba(15,23,42,0.1) 0%, rgba(2,6,23,0.85) 100%)",
              zIndex: 2,
            }}
          />

          {/* Layer 3: Top Story & Scene Badge */}
          <div
            style={{
              position: "absolute",
              top: "70px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(15, 23, 42, 0.85)",
              backdropFilter: "blur(14px)",
              border: "1.5px solid rgba(251, 191, 36, 0.4)",
              borderRadius: "9999px",
              padding: "8px 24px",
              color: "#FEF08A",
              fontSize: "20px",
              fontWeight: 800,
              letterSpacing: "0.6px",
              zIndex: 30,
              boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
              whiteSpace: "nowrap",
            }}
          >
            {book.title} • Adegan {scene.index}
          </div>

          {/* Layer 4: Floating Uncropped 16:9 Centerpiece Illustration (100% Visible) */}
          <div
            style={{
              position: "absolute",
              top: "20%",
              left: "50%",
              transform: `translateX(-50%) scale(${scale}) translate(${translateX}px, ${translateY}px)`,
              width: "1000px",
              height: "562px", // Exact 16:9 ratio (1000 x 562.5)
              borderRadius: "20px",
              overflow: "hidden",
              border: "3px solid rgba(251, 191, 36, 0.5)",
              boxShadow: "0 30px 70px rgba(0, 0, 0, 0.85), 0 0 40px rgba(251, 191, 36, 0.15)",
              zIndex: 20,
              backgroundColor: "#0B0F19",
            }}
          >
            <Img
              src={imgSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />

            {/* Inner Gilded Highlight */}
            <div
              style={{
                position: "absolute",
                inset: "6px",
                border: "1px solid rgba(254, 240, 138, 0.3)",
                borderRadius: "14px",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Layer 5: Subtitles safely in the lower section without occluding artwork */}
          <KineticSubtitles words={words} isVertical={isVertical} />
        </>
      ) : (
        <>
          {/* Landscape 16:9 Full-Bleed Mode */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
              transition: "transform 0.05s linear",
              transformOrigin: "center center",
            }}
          >
            <Img
              src={imgSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

          {/* Subtle Top & Bottom Cinematic Vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(2,6,23,0.4) 0%, transparent 15%, transparent 75%, rgba(2,6,23,0.6) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Top Badge */}
          <div
            style={{
              position: "absolute",
              top: "32px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(251, 191, 36, 0.4)",
              borderRadius: "9999px",
              padding: "6px 20px",
              color: "#FEF08A",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              zIndex: 40,
            }}
          >
            {book.title} • Adegan {scene.index}
          </div>

          {/* Subtitles */}
          <KineticSubtitles words={words} isVertical={isVertical} />
        </>
      )}
    </div>
  );
};
