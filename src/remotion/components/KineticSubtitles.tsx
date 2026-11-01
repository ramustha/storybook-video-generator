import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  speaker?: string;
  speakerName?: string;
  speakerColor?: string;
}

interface KineticSubtitlesProps {
  words: WordTiming[];
  isVertical: boolean;
}

const SPEAKER_ICONS: Record<string, string> = {
  guru: "👩‍🏫",
  ibu: "👩",
  mother: "👩",
  budi: "👦",
  manu: "👦",
  anak: "👦",
  protagonist: "👦",
  narator: "📖",
  narrator: "📖",
};

export const KineticSubtitles: React.FC<KineticSubtitlesProps> = ({ words, isVertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!words || words.length === 0) return null;

  // Group words into chunks of ~4-5 words for comfortable reading
  const chunkSize = isVertical ? 4 : 5;
  const activeWordIdx = words.findIndex((w) => currentTime >= w.start && currentTime <= w.end);
  const currentIdx = activeWordIdx !== -1 ? activeWordIdx : words.findIndex((w) => w.start > currentTime);
  const resolvedIdx = currentIdx !== -1 ? currentIdx : words.length - 1;

  // Split into chunks, but keep sentences/speakers coherent
  const chunkStartIdx = Math.floor(resolvedIdx / chunkSize) * chunkSize;
  const visibleWords = words.slice(chunkStartIdx, chunkStartIdx + chunkSize);

  // Active word details
  const activeWord = words[activeWordIdx] || words[resolvedIdx] || words[0];
  const activeSpeaker = activeWord?.speaker || "narator";
  const activeSpeakerName = activeWord?.speakerName || "Narator";
  const activeSpeakerColor = activeWord?.speakerColor || "#FDE047";
  const speakerIcon = SPEAKER_ICONS[activeSpeaker.toLowerCase()] || "💬";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: isVertical ? "18%" : "8%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 24px",
        zIndex: 50,
        pointerEvents: "none",
        gap: "12px",
      }}
    >
      {/* Dynamic Speaker Tag Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(15, 23, 42, 0.92)",
          border: `2px solid ${activeSpeakerColor}`,
          borderRadius: "9999px",
          padding: isVertical ? "6px 20px" : "6px 24px",
          color: activeSpeakerColor,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: isVertical ? "20px" : "18px",
          fontWeight: 800,
          boxShadow: `0 0 16px ${activeSpeakerColor}50, 0 4px 12px rgba(0,0,0,0.6)`,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        <span style={{ fontSize: isVertical ? "22px" : "20px" }}>{speakerIcon}</span>
        <span>{activeSpeakerName}</span>
      </div>

      {/* Glassmorphic Subtitle Bubble with Speaker Tint */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(18px)",
          border: `2px solid ${activeSpeakerColor}60`,
          borderRadius: "9999px",
          padding: isVertical ? "14px 28px" : "16px 36px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: isVertical ? "10px" : "14px",
          maxWidth: isVertical ? "92%" : "85%",
          boxShadow: `0 20px 45px rgba(0, 0, 0, 0.7), 0 0 25px ${activeSpeakerColor}20`,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        {visibleWords.map((item, idx) => {
          const isActive = currentTime >= item.start && currentTime <= item.end;
          const isPast = currentTime > item.end;

          let wordScale = 1.0;
          let bounceY = 0;
          let tiltDeg = 0;

          if (isActive) {
            const wordDuration = Math.max(0.08, item.end - item.start);
            const progress = Math.min(1, Math.max(0, (currentTime - item.start) / wordDuration));
            bounceY = -Math.sin(progress * Math.PI) * (isVertical ? 10 : 8);
            wordScale = 1.0 + Math.sin(progress * Math.PI) * 0.25;
            tiltDeg = (idx % 2 === 0 ? -2.5 : 2.5) * Math.sin(progress * Math.PI);
          }

          // Distinct color per speaker!
          const itemColor = item.speakerColor || (item.speaker === "guru" ? "#38BDF8" : "#FDE047");

          const textColor = isActive
            ? itemColor // Highlighted in that specific speaker's signature color!
            : isPast
            ? "#FFFFFF" // Spoken words: crisp white
            : "rgba(255, 255, 255, 0.45)"; // Upcoming words: translucent

          return (
            <span
              key={idx}
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: isVertical ? "32px" : "36px",
                fontWeight: isActive ? 900 : 700,
                color: textColor,
                transform: `translateY(${bounceY}px) scale(${wordScale}) rotate(${tiltDeg}deg)`,
                transition: "transform 0.04s ease-out",
                display: "inline-block",
                textShadow: isActive
                  ? `0 0 18px ${itemColor}90, 0 2px 6px rgba(0,0,0,0.9)`
                  : "0 2px 4px rgba(0,0,0,0.8)",
                WebkitTextStroke: isActive ? "1px rgba(0,0,0,0.6)" : "none",
              }}
            >
              {item.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
