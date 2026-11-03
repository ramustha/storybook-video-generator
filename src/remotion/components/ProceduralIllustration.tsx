import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface ProceduralIllustrationProps {
  scene: any;
  book: any;
  isVertical: boolean;
  isCover?: boolean;
}

export const ProceduralIllustration: React.FC<ProceduralIllustrationProps> = ({
  scene,
  book,
  isVertical,
  isCover = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Continuous subtle motion
  const breath = Math.sin(frame * 0.04) * 6;
  const floatY = Math.sin(frame * 0.05) * 8;
  const floatRotate = Math.sin(frame * 0.03) * 1.5;

  // Detect scene theme from metadata or text
  const textHint = `${book?.title || ""} ${scene?.visual?.setting || ""} ${scene?.visual?.mood || ""} ${scene?.atmosphere?.weather || ""} ${scene?.audio?.text || ""}`.toLowerCase();

  let theme: "night" | "rain" | "sunset" | "palace" | "meadow" = "meadow";
  if (textHint.includes("malam") || textHint.includes("night") || textHint.includes("tidur") || textHint.includes("bedtime") || textHint.includes("bintang") || textHint.includes("star")) {
    theme = "night";
  } else if (textHint.includes("hujan") || textHint.includes("rain") || textHint.includes("badai") || textHint.includes("storm") || textHint.includes("petir")) {
    theme = "rain";
  } else if (textHint.includes("sore") || textHint.includes("sunset") || textHint.includes("senja") || textHint.includes("senja")) {
    theme = "sunset";
  } else if (textHint.includes("istana") || textHint.includes("palace") || textHint.includes("raja") || textHint.includes("king") || textHint.includes("kerajaan")) {
    theme = "palace";
  }

  // Derive story character/scene icon
  let storyIcon = "📖";
  if (textHint.includes("raja") || textHint.includes("king")) storyIcon = "👑";
  else if (textHint.includes("anjing") || textHint.includes("dog")) storyIcon = "🐕";
  else if (textHint.includes("kucing") || textHint.includes("cat")) storyIcon = "🐱";
  else if (textHint.includes("harimau") || textHint.includes("tiger") || textHint.includes("singa")) storyIcon = "🐯";
  else if (textHint.includes("hujan") || textHint.includes("rain")) storyIcon = "🌧️";
  else if (textHint.includes("rambut") || textHint.includes("haircut") || textHint.includes("cukur")) storyIcon = "✂️";
  else if (textHint.includes("bintang") || textHint.includes("star")) storyIcon = "⭐";
  else if (textHint.includes("anak") || textHint.includes("budi") || textHint.includes("manu")) storyIcon = "👦";

  // Palette configurations
  const palettes = {
    meadow: {
      sky: "linear-gradient(180deg, #38BDF8 0%, #BAE6FD 55%, #FEF08A 100%)",
      celestialColor: "#FBBF24",
      hillBack: "#4ADE80",
      hillFront: "#16A34A",
      cardBorder: "rgba(251, 191, 36, 0.7)",
      accent: "#F59E0B",
    },
    night: {
      sky: "linear-gradient(180deg, #020617 0%, #0F172A 50%, #1E1B4B 100%)",
      celestialColor: "#FEF08A",
      hillBack: "#1E293B",
      hillFront: "#0F172A",
      cardBorder: "rgba(167, 139, 250, 0.7)",
      accent: "#A78BFA",
    },
    rain: {
      sky: "linear-gradient(180deg, #1E293B 0%, #334155 60%, #475569 100%)",
      celestialColor: "#94A3B8",
      hillBack: "#334155",
      hillFront: "#1E293B",
      cardBorder: "rgba(56, 189, 248, 0.6)",
      accent: "#38BDF8",
    },
    sunset: {
      sky: "linear-gradient(180deg, #7C2D12 0%, #C2410C 30%, #EA580C 60%, #FDE047 100%)",
      celestialColor: "#F97316",
      hillBack: "#9A3412",
      hillFront: "#431407",
      cardBorder: "rgba(251, 146, 60, 0.7)",
      accent: "#F97316",
    },
    palace: {
      sky: "linear-gradient(180deg, #3B0764 0%, #581C87 40%, #7E22CE 75%, #FDE047 100%)",
      celestialColor: "#FDE047",
      hillBack: "#6B21A8",
      hillFront: "#4C1D95",
      cardBorder: "rgba(250, 204, 21, 0.8)",
      accent: "#FACC15",
    },
  };

  const p = palettes[theme];

  // Drifting clouds animation (modulo wrap around width)
  const cloudOffset1 = (frame * 1.2) % (width + 300) - 150;
  const cloudOffset2 = (frame * 0.8 + width * 0.5) % (width + 300) - 150;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: p.sky,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 1. Celestial Body (Sun / Moon) */}
      {theme === "night" ? (
        // Crescent Moon & Stars
        <div
          style={{
            position: "absolute",
            top: isVertical ? "160px" : "90px",
            right: isVertical ? "120px" : "240px",
            width: "130px",
            height: "130px",
            borderRadius: "50%",
            boxShadow: "15px 15px 0 0 #FEF08A, 0 0 45px rgba(254, 240, 138, 0.6)",
            transform: `rotate(-15deg) translateY(${breath * 0.5}px)`,
          }}
        />
      ) : (
        // Radiant Glowing Sun
        <div
          style={{
            position: "absolute",
            top: isVertical ? "160px" : "80px",
            right: isVertical ? "100px" : "220px",
            width: "140px",
            height: "140px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${p.celestialColor} 0%, rgba(251, 191, 36, 0.4) 70%, transparent 100%)`,
            boxShadow: `0 0 60px ${p.celestialColor}`,
            transform: `scale(${1 + Math.sin(frame * 0.05) * 0.06})`,
          }}
        />
      )}

      {/* 2. Floating Vector Clouds */}
      <svg
        style={{
          position: "absolute",
          top: isVertical ? "240px" : "120px",
          left: `${cloudOffset1}px`,
          width: "280px",
          opacity: 0.75,
          filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.1))",
        }}
        viewBox="0 0 24 24"
        fill="white"
      >
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
      </svg>
      <svg
        style={{
          position: "absolute",
          top: isVertical ? "340px" : "180px",
          left: `${cloudOffset2}px`,
          width: "220px",
          opacity: 0.6,
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.1))",
        }}
        viewBox="0 0 24 24"
        fill="white"
      >
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
      </svg>

      {/* 3. Parallax Layered Hills (SVG Waves) */}
      <svg
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: isVertical ? "50%" : "45%",
          pointerEvents: "none",
        }}
        viewBox="0 0 1440 600"
        preserveAspectRatio="none"
      >
        {/* Back Hill */}
        <path
          d="M0,280 C360,180 720,360 1080,240 C1260,180 1380,220 1440,260 L1440,600 L0,600 Z"
          fill={p.hillBack}
          opacity="0.9"
        />
        {/* Front Hill */}
        <path
          d="M0,380 C320,290 640,440 960,330 C1200,250 1360,320 1440,360 L1440,600 L0,600 Z"
          fill={p.hillFront}
        />
      </svg>

      {/* 4. Central Storybook Medallion / Hero Token */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${floatY}px) rotate(${floatRotate}deg)`,
          padding: isVertical ? "30px 40px" : "40px 60px",
          background: "rgba(15, 23, 42, 0.78)",
          backdropFilter: "blur(20px)",
          borderRadius: "32px",
          border: `3px solid ${p.cardBorder}`,
          boxShadow: `0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px ${p.accent}33`,
          maxWidth: isVertical ? "85%" : "70%",
        }}
      >
        {/* Animated Icon Avatar Circle */}
        <div
          style={{
            width: isVertical ? "160px" : "190px",
            height: isVertical ? "160px" : "190px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${p.accent}33 0%, rgba(15,23,42,0.9) 80%)`,
            border: `3px solid ${p.accent}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isVertical ? "85px" : "105px",
            boxShadow: `0 12px 30px rgba(0,0,0,0.5), inset 0 0 20px ${p.accent}55`,
            marginBottom: "20px",
            transform: `scale(${1 + Math.sin(frame * 0.06) * 0.04})`,
          }}
        >
          {storyIcon}
        </div>

        {/* Scene Headline / Book Title */}
        <div
          style={{
            color: "#FFFBEB",
            fontSize: isVertical ? "32px" : "38px",
            fontWeight: 800,
            textAlign: "center",
            textShadow: "0 4px 14px rgba(0,0,0,0.8)",
            letterSpacing: "0.5px",
            fontFamily: "'Fredoka', 'Quicksand', system-ui, sans-serif",
            marginBottom: "8px",
          }}
        >
          {isCover ? book.title : `Adegan ${scene.index || 1}`}
        </div>

        {/* Scene Setting or Context Badge */}
        <div
          style={{
            background: "rgba(254, 240, 138, 0.15)",
            border: "1px solid rgba(254, 240, 138, 0.4)",
            borderRadius: "9999px",
            padding: "6px 18px",
            color: "#FEF08A",
            fontSize: isVertical ? "18px" : "20px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {scene.visual?.setting || (theme.charAt(0).toUpperCase() + theme.slice(1))}
        </div>
      </div>
    </div>
  );
};
