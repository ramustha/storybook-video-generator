import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface ChapterBumperProps {
  nextStoryTitle: string;
  nextStoryCover?: string;
  chapterIndex: number;
  totalChapters: number;
  lang?: "id" | "en";
  isVertical?: boolean;
}

export const ChapterBumper: React.FC<ChapterBumperProps> = ({
  nextStoryTitle,
  nextStoryCover,
  chapterIndex,
  totalChapters,
  lang = "id",
  isVertical = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isEn = lang === "en";

  // Spring entrance for central book preview card
  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const badgeEntrance = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 12, stiffness: 110 },
  });

  const titleEntrance = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  // Floating gentle motion
  const floatY = Math.sin(frame / 16) * 8;
  const floatRotate = Math.sin(frame / 22) * 1.8;

  // Background slow zoom
  const bgScale = interpolate(frame, [0, 120], [1.08, 1.18], { extrapolateRight: "clamp" });

  // Countdown progress bar (0% to 100% over the bumper duration)
  const progressPercent = interpolate(frame, [10, 110], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const badgeText = isEn
    ? `✨ NEXT STORY • CHAPTER ${chapterIndex} OF ${totalChapters} ✨`
    : `✨ CERITA SELANJUTNYA • BABAK ${chapterIndex} DARI ${totalChapters} ✨`;

  const subtitleText = isEn
    ? "Get ready for the next fun adventure! 📖✨"
    : "Yuk bersiap mendengarkan cerita seru berikutnya! 📖✨";

  const coverSrc = nextStoryCover ? staticFile(nextStoryCover) : null;

  // Floating ambient sparkles
  const sparkles = [
    { x: "12%", y: "20%", size: 36, delay: 0, icon: "⭐" },
    { x: "85%", y: "18%", size: 32, delay: 6, icon: "✨" },
    { x: "16%", y: "78%", size: 30, delay: 12, icon: "🌟" },
    { x: "82%", y: "75%", size: 34, delay: 18, icon: "🌙" },
    { x: "50%", y: "10%", size: 28, delay: 8, icon: "🎈" },
  ];

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B0F19",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Fredoka', 'Quicksand', 'Nunito', sans-serif",
      }}
    >
      {/* Layer 1: Ambient Background Glow & Particles */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 45%, #1e1b4b 0%, #0f172a 60%, #020617 100%)",
          transform: `scale(${bgScale})`,
          zIndex: 1,
        }}
      />

      {/* Floating Sparkles */}
      {sparkles.map((sp, idx) => {
        const spFloat = Math.sin((frame + sp.delay * 4) / 14) * 12;
        const spOpacity = interpolate(
          (frame + sp.delay * 3) % 45,
          [0, 22, 45],
          [0.35, 0.95, 0.35]
        );
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: sp.x,
              top: sp.y,
              fontSize: `${sp.size}px`,
              transform: `translateY(${spFloat}px)`,
              opacity: spOpacity,
              zIndex: 3,
              userSelect: "none",
              filter: "drop-shadow(0 4px 12px rgba(251, 191, 36, 0.4))",
            }}
          >
            {sp.icon}
          </div>
        );
      })}

      {/* Main Content Container */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: isVertical ? "92%" : "82%",
          textAlign: "center",
        }}
      >
        {/* Top Chapter Pill Badge */}
        <div
          style={{
            transform: `scale(${badgeEntrance})`,
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#FFFFFF",
            fontSize: isVertical ? "20px" : "24px",
            fontWeight: 800,
            padding: isVertical ? "8px 24px" : "10px 32px",
            borderRadius: "9999px",
            letterSpacing: "1px",
            boxShadow: "0 10px 25px rgba(245, 158, 11, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.3)",
            border: "2px solid #FCD34D",
            marginBottom: isVertical ? "28px" : "32px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {badgeText}
        </div>

        {/* 3D Floating Book Preview Card */}
        <div
          style={{
            transform: `scale(${entrance}) translateY(${floatY}px) rotate(${floatRotate}deg)`,
            marginBottom: isVertical ? "24px" : "28px",
            perspective: "1000px",
          }}
        >
          <div
            style={{
              width: isVertical ? "460px" : "480px",
              height: isVertical ? "320px" : "300px",
              borderRadius: "28px",
              overflow: "hidden",
              border: "6px solid #FEF08A",
              boxShadow:
                "0 24px 60px rgba(0, 0, 0, 0.7), 0 0 45px rgba(251, 191, 36, 0.35)",
              backgroundColor: "#1E293B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {coverSrc ? (
              <Img
                src={coverSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div style={{ fontSize: "72px" }}>📖</div>
            )}

            {/* Glowing Corner Badge */}
            <div
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                backgroundColor: "rgba(15, 23, 42, 0.85)",
                backdropFilter: "blur(8px)",
                color: "#FDE047",
                fontSize: "14px",
                fontWeight: 800,
                padding: "4px 12px",
                borderRadius: "9999px",
                border: "1.5px solid rgba(253, 224, 71, 0.5)",
              }}
            >
              Cerita #{chapterIndex}
            </div>
          </div>
        </div>

        {/* Next Story Title */}
        <div
          style={{
            transform: `scale(${titleEntrance})`,
            marginBottom: "12px",
          }}
        >
          <h2
            style={{
              fontSize: isVertical ? "42px" : "54px",
              fontWeight: 900,
              color: "#FFFFFF",
              margin: 0,
              lineHeight: 1.15,
              textShadow: "0 6px 20px rgba(0, 0, 0, 0.8), 0 2px 0 #000000",
              letterSpacing: "-0.5px",
            }}
          >
            {nextStoryTitle}
          </h2>
        </div>

        {/* Subtitle / Encouragement */}
        <div
          style={{
            fontSize: isVertical ? "20px" : "24px",
            fontWeight: 600,
            color: "#93C5FD",
            marginBottom: isVertical ? "30px" : "36px",
            textShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
          }}
        >
          {subtitleText}
        </div>

        {/* Progress Bar Container */}
        <div
          style={{
            width: isVertical ? "320px" : "420px",
            height: "10px",
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            borderRadius: "9999px",
            overflow: "hidden",
            position: "relative",
            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #F59E0B, #10B981)",
              borderRadius: "9999px",
              boxShadow: "0 0 12px rgba(245, 158, 11, 0.8)",
            }}
          />
        </div>
      </div>
    </div>
  );
};
