import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

interface CoverSceneProps {
  scene: any;
  book: any;
  isVertical: boolean;
}

export const CoverScene: React.FC<CoverSceneProps> = ({ scene, book, isVertical }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const floatY = Math.sin(frame / 18) * 8;
  const floatRotate = Math.sin(frame / 24) * 1.5;

  const bgScale = interpolate(frame, [0, 90], [1.1, 1.25], { extrapolateRight: "clamp" });
  const coverImgSrc = staticFile(scene.visual.imagePath);

  // Support both portrait (aspect ratio < 1.0) and landscape (aspect ratio > 1.0) picture books
  const isCoverPortrait =
    book.coverOrientation === "portrait" ||
    scene.visual?.isPortrait === true ||
    (typeof book.coverAspectRatio === "number" && book.coverAspectRatio < 1.0);

  // Scaled up to maximize screen presence and minimize empty space (Best practice: 65-75% screen fill)
  const bookWidth = isCoverPortrait
    ? isVertical
      ? 860
      : 560
    : isVertical
      ? 1000
      : 1160;

  const bookHeight = isCoverPortrait
    ? isVertical
      ? 1180
      : 760
    : isVertical
      ? 562
      : 652;

  const isEn = book.language?.startsWith("en");

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#070B14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Ambient Blurred Background (Zero-Crop Pillarbox Canvas) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${bgScale})`,
          filter: "blur(40px) brightness(0.42) saturate(1.4)",
          zIndex: 1,
        }}
      >
        <Img src={coverImgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Warm Golden Fairytale Glow & Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, rgba(254, 240, 138, 0.12) 0%, rgba(15, 23, 42, 0.5) 60%, rgba(2, 6, 23, 0.92) 100%)",
          zIndex: 2,
        }}
      />

      {/* Floating Sparkles & Magical Fairytale Particles */}
      {[
        { x: isVertical ? 90 : 160, y: isVertical ? 240 : 140, size: 30, delay: 0, icon: "⭐" },
        { x: isVertical ? 960 : 1740, y: isVertical ? 320 : 180, size: 36, delay: 10, icon: "✨" },
        { x: isVertical ? 140 : 220, y: isVertical ? 1550 : 880, size: 32, delay: 20, icon: "🌟" },
        { x: isVertical ? 940 : 1700, y: isVertical ? 1580 : 860, size: 34, delay: 15, icon: "✨" },
      ].map((star, idx) => {
        const starFloat = Math.sin((frame + star.delay * 4) / 16) * 8;
        const starScale = 1.0 + Math.sin((frame + star.delay * 3) / 20) * 0.15;
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: `${star.x}px`,
              top: `${star.y}px`,
              transform: `translateY(${starFloat}px) scale(${starScale})`,
              fontSize: `${star.size}px`,
              zIndex: 4,
              opacity: 0.85,
              pointerEvents: "none",
              filter: "drop-shadow(0 0 12px rgba(254, 240, 138, 0.9))",
            }}
          >
            {star.icon}
          </div>
        );
      })}

      {/* 3D Floating Book Container */}
      <div
        style={{
          zIndex: 10,
          transform: `scale(${entrance}) translateY(${floatY}px) rotate(${floatRotate}deg)`,
          perspective: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* 3D Picture Book Cover Frame (Zero Crop) */}
        <div
          style={{
            width: `${bookWidth}px`,
            height: `${bookHeight}px`,
            position: "relative",
            borderRadius: "24px",
            overflow: "hidden",
            boxShadow:
              "0 35px 85px rgba(0,0,0,0.92), 0 0 60px rgba(251, 191, 36, 0.35), 0 0 0 4px rgba(251, 191, 36, 0.8)",
            backgroundColor: "#0B0F19",
          }}
        >
          <Img src={coverImgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />

          {/* Spine crease shadow on left */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "48px",
              background:
                "linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(255,255,255,0.18) 25%, transparent 100%)",
            }}
          />

          {/* Gilded Inner Border Highlight */}
          <div
            style={{
              position: "absolute",
              inset: "10px",
              border: "2px solid rgba(254, 240, 138, 0.6)",
              borderRadius: "16px",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Title and Attribution Badge (Scaled up for instant mobile readability) */}
        <div
          style={{
            marginTop: isVertical ? "32px" : "20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <h1
            style={{
              fontFamily: "'Fredoka', 'Quicksand', system-ui, -apple-system, sans-serif",
              fontSize: isVertical ? "56px" : "46px",
              fontWeight: 900,
              color: "#FEF08A",
              textShadow:
                "0 4px 18px rgba(0,0,0,0.95), 0 0 24px rgba(251, 191, 36, 0.7), 0 2px 4px #78350F",
              margin: 0,
              letterSpacing: "0.5px",
            }}
          >
            {book.title}
          </h1>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.92)",
              border: "2px solid rgba(251, 191, 36, 0.5)",
              borderRadius: "9999px",
              padding: isVertical ? "8px 28px" : "8px 24px",
              color: "#FEF9C3",
              fontSize: isVertical ? "22px" : "20px",
              fontWeight: 700,
              boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
              letterSpacing: "0.2px",
            }}
          >
            {isEn
              ? `By ${book.source.originalAuthor} • ${book.source.license}`
              : `Karya ${book.source.originalAuthor} • ${book.source.license}`}
          </div>
        </div>
      </div>
    </div>
  );
};
