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

  const bookWidth = isCoverPortrait
    ? isVertical
      ? 640
      : 440
    : isVertical
      ? 920
      : 680;

  const bookHeight = isCoverPortrait
    ? isVertical
      ? 894
      : 614
    : isVertical
      ? 518
      : 382;

  const isEn = book.language?.startsWith("en");

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#090D16",
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
          filter: "blur(48px) brightness(0.38) saturate(1.3)",
          zIndex: 1,
        }}
      >
        <Img src={coverImgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Dark Vignette Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at center, rgba(15,23,42,0.15) 0%, rgba(2,6,23,0.85) 100%)",
          zIndex: 2,
        }}
      />

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
        {/* 16:9 Widescreen Picture Book Cover Frame (Zero Crop) */}
        <div
          style={{
            width: `${bookWidth}px`,
            height: `${bookHeight}px`,
            position: "relative",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 30px 70px rgba(0,0,0,0.85), 0 0 45px rgba(251, 191, 36, 0.25)",
            border: "4px solid rgba(251, 191, 36, 0.75)",
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
              width: "42px",
              background: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(255,255,255,0.15) 25%, transparent 100%)",
            }}
          />

          {/* Gilded Inner Border Highlight */}
          <div
            style={{
              position: "absolute",
              inset: "8px",
              border: "1.5px solid rgba(254, 240, 138, 0.5)",
              borderRadius: "12px",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Title and Attribution Badge */}
        <div
          style={{
            marginTop: isVertical ? "36px" : "24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <h1
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: isVertical ? "46px" : "40px",
              fontWeight: 900,
              color: "#FEF08A",
              textShadow: "0 4px 16px rgba(0,0,0,0.9), 0 0 20px rgba(251, 191, 36, 0.6)",
              margin: 0,
              letterSpacing: "0.5px",
            }}
          >
            {book.title}
          </h1>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.88)",
              border: "1.5px solid rgba(251, 191, 36, 0.35)",
              borderRadius: "9999px",
              padding: "8px 24px",
              color: "#E2E8F0",
              fontSize: isVertical ? "20px" : "18px",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
            }}
          >
            {isEn ? `By ${book.source.originalAuthor} • ${book.source.license}` : `Karya ${book.source.originalAuthor} • ${book.source.license}`}
          </div>
        </div>
      </div>
    </div>
  );
};
