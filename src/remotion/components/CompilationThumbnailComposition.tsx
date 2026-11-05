import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";

export interface CompilationThumbnailProps {
  badge?: string;
  headlineTop?: string;
  headlineMain?: string;
  marathonPill?: string;
  subHook?: string;
  storyCovers?: string[];
  theme?: string;
  lang?: "id" | "en";
}

export const CompilationThumbnailComposition: React.FC<CompilationThumbnailProps> = ({
  badge = "🌙 DONGENG PENGANTAR TIDUR",
  headlineTop = "KUMPULAN 5 CERITA",
  headlineMain = "DONG-EN-G ANAK",
  marathonPill = "⏱️ 12 MENIT NON-STOP MARATHON",
  subHook = "Bikin Si Kecil Tertidur Nyenyak, Tenang & Penuh Pesan Moral 💤✨",
  storyCovers = [
    "stories/pisang-terlalu-banyak/assets/cover.png",
    "stories/hari-cukur-rambut/assets/cover.png",
    "stories/jas-hujan-merah/assets/cover.png",
    "stories/gara-gara-kucing/assets/cover.png",
  ],
  lang = "id",
}) => {
  const getCoverSrc = (cover?: string) => {
    if (!cover) return "";
    return cover.startsWith("data:") || cover.startsWith("http") ? cover : staticFile(cover);
  };
  const videoConfig = useVideoConfig();
  const width = videoConfig?.width || 1920;
  const height = videoConfig?.height || 1080;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#020617",
        fontFamily: "'Fredoka', 'Quicksand', 'Arial Rounded MT Bold', sans-serif",
      }}
    >
      {/* 1. Deep Midnight Cosmic Gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 75% 40%, #1E1B4B 0%, #0F172A 45%, #020617 100%)",
        }}
      />

      {/* 2. Soft Ambient Moon Halo */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: 200,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* 3. Golden Border Frame */}
      <div
        style={{
          position: "absolute",
          inset: 24,
          border: "3px solid rgba(251, 191, 36, 0.35)",
          borderRadius: 32,
          pointerEvents: "none",
          zIndex: 20,
        }}
      />

      {/* 4. Main Two-Column Layout */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 72px",
          boxSizing: "border-box",
        }}
      >
        {/* Left Column: High-Impact Typography */}
        <div
          style={{
            width: "52%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 20,
          }}
        >
          {/* Top Golden Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 28px",
              borderRadius: 999,
              background: "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(79, 70, 229, 0.9))",
              border: "3px solid #FDE047",
              boxShadow: "0 0 30px rgba(253, 224, 71, 0.45)",
              transform: "rotate(-1.5deg)",
            }}
          >
            <span style={{ fontSize: 26 }}>⭐</span>
            <span
              style={{
                color: "#FDE047",
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {badge}
            </span>
          </div>

          {/* Top Line Title */}
          <div
            style={{
              color: "#38BDF8",
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              textShadow: "0 4px 16px rgba(56, 189, 248, 0.6)",
              marginTop: 4,
            }}
          >
            {headlineTop}
          </div>

          {/* Massive Main Title */}
          <h1
            style={{
              margin: 0,
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              background: "linear-gradient(180deg, #FFFFFF 0%, #FEF08A 45%, #F59E0B 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 8px 24px rgba(0, 0, 0, 0.9))",
            }}
          >
            {headlineMain}
          </h1>

          {/* Marathon Eyecatcher Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 32px",
              borderRadius: 24,
              backgroundColor: "#DC2626",
              border: "4px solid #FFFFFF",
              boxShadow: "0 10px 35px rgba(220, 38, 38, 0.75)",
              transform: "rotate(1deg)",
            }}
          >
            <span
              style={{
                color: "#FFFFFF",
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {marathonPill}
            </span>
          </div>

          {/* Sub-hook / Emotional Selling Point */}
          <div
            style={{
              color: "#E2E8F0",
              fontSize: 26,
              fontWeight: 600,
              lineHeight: 1.35,
              maxWidth: 780,
              textShadow: "0 3px 10px rgba(0, 0, 0, 0.8)",
              marginTop: 6,
            }}
          >
            {subHook}
          </div>

          {/* Chapter Quick Preview Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              padding: "10px 20px",
              borderRadius: 16,
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#94A3B8",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            <span>✨ 5 Kisah Penuh Tawa & Budi Pekerti Zayn Storybook</span>
          </div>
        </div>

        {/* Right Column: Fan of 3D Storybook Cards */}
        <div
          style={{
            width: "44%",
            height: "100%",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Card 4: Bottom / Underneath */}
          {storyCovers[3] && (
            <div
              style={{
                position: "absolute",
                width: 380,
                height: 270,
                borderRadius: 24,
                overflow: "hidden",
                border: "6px solid #FFFFFF",
                boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
                transform: "translate(-80px, 140px) rotate(-14deg)",
                zIndex: 1,
              }}
            >
              <Img
                src={getCoverSrc(storyCovers[3])}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Card 3: Middle Back */}
          {storyCovers[2] && (
            <div
              style={{
                position: "absolute",
                width: 400,
                height: 285,
                borderRadius: 24,
                overflow: "hidden",
                border: "6px solid #FFFFFF",
                boxShadow: "0 30px 70px rgba(0,0,0,0.85)",
                transform: "translate(90px, -110px) rotate(12deg)",
                zIndex: 2,
              }}
            >
              <Img
                src={getCoverSrc(storyCovers[2])}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Card 2: Middle Front */}
          {storyCovers[1] && (
            <div
              style={{
                position: "absolute",
                width: 420,
                height: 300,
                borderRadius: 28,
                overflow: "hidden",
                border: "8px solid #FFFFFF",
                boxShadow: "0 35px 80px rgba(0,0,0,0.9)",
                transform: "translate(-50px, -70px) rotate(-5deg)",
                zIndex: 3,
              }}
            >
              <Img
                src={getCoverSrc(storyCovers[1])}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Card 1: Main Center Hero (Pak Srinivas / Bananas) */}
          {storyCovers[0] && (
            <div
              style={{
                position: "absolute",
                width: 450,
                height: 320,
                borderRadius: 32,
                overflow: "hidden",
                border: "10px solid #FFFFFF",
                boxShadow:
                  "0 40px 90px rgba(0, 0, 0, 0.95), 0 0 50px rgba(253, 224, 71, 0.4)",
                transform: "translate(40px, 40px) rotate(4deg)",
                zIndex: 4,
              }}
            >
              <Img
                src={getCoverSrc(storyCovers[0])}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {/* Golden Badge on Hero Card */}
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  right: 16,
                  backgroundColor: "#FACC15",
                  color: "#000",
                  fontWeight: 900,
                  fontSize: 22,
                  padding: "8px 18px",
                  borderRadius: 14,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                }}
              >
                5 Cerita Seru! 🌙✨
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
