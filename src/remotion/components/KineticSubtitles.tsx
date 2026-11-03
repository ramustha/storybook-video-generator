import React, { useMemo } from "react";
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
  raja: "👑",
  king: "👑",
  anjing: "🐕",
  dog: "🐕",
  narator: "📖",
  narrator: "📖",
};

/**
 * Groups words into natural, coherent sentence / thought units.
 * Never chops sentences arbitrarily into 4-5 word slices.
 * Displays all context together while maintaining word-by-word voiceover synchronization.
 */
function buildContextGroups(words: WordTiming[]): WordTiming[][] {
  if (!words || words.length === 0) return [];
  // For standard scenes up to 18 words, show the entire sentence/clause context at once
  if (words.length <= 18) {
    return [words];
  }

  const groups: WordTiming[][] = [];
  let currentGroup: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentGroup.push(w);

    const isSentenceEnd = /[.!?…]+$/.test(w.word.trim());
    const isClauseBoundary = /[,;:]+$/.test(w.word.trim());
    const hasEnoughContext = currentGroup.length >= 8;

    // Split at natural sentence ends or major clause boundaries if long
    if ((isSentenceEnd && hasEnoughContext) || (isClauseBoundary && currentGroup.length >= 12) || currentGroup.length >= 16) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    if (groups.length > 0 && currentGroup.length <= 4) {
      // Merge small tail into the preceding group to avoid orphaned single words
      groups[groups.length - 1].push(...currentGroup);
    } else {
      groups.push(currentGroup);
    }
  }

  return groups.length > 0 ? groups : [words];
}

export const KineticSubtitles: React.FC<KineticSubtitlesProps> = ({ words, isVertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!words || words.length === 0) return null;

  // Build context-preserving sentence groups
  const groups = useMemo(() => buildContextGroups(words), [words]);

  // Find the active group corresponding to current voiceover playback time
  let activeGroupIdx = groups.findIndex((g) => {
    const gStart = g[0].start;
    const gEnd = g[g.length - 1].end;
    // Keep group visible until 0.4s after the last word to prevent abrupt disappearing
    return currentTime >= gStart && currentTime <= gEnd + 0.45;
  });

  if (activeGroupIdx === -1) {
    // If between groups or before/after, find nearest logical group
    const nextIdx = groups.findIndex((g) => g[0].start > currentTime);
    activeGroupIdx = nextIdx !== -1 ? (nextIdx > 0 ? nextIdx - 1 : 0) : groups.length - 1;
  }

  const visibleWords = groups[activeGroupIdx] || words;

  // Identify currently active spoken word for speaker metadata and highlight
  const activeWord =
    words.find((w) => currentTime >= w.start && currentTime <= w.end) ||
    visibleWords.find((w) => currentTime >= w.start && currentTime <= w.end) ||
    visibleWords[0];

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
        // Positioned safely above YouTube Shorts bottom UI (0-220px) and comfortably in Landscape lower third
        bottom: isVertical ? "280px" : "28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: isVertical ? "0 24px" : "0 40px",
        zIndex: 50,
        pointerEvents: "none",
        gap: "10px",
      }}
    >
      {/* Dynamic Speaker Tag Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(10, 15, 29, 0.92)",
          border: `1.5px solid ${activeSpeakerColor}`,
          borderRadius: "9999px",
          padding: isVertical ? "5px 18px" : "5px 20px",
          color: activeSpeakerColor,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: isVertical ? "17px" : "16px",
          fontWeight: 800,
          boxShadow: `0 0 14px ${activeSpeakerColor}40, 0 4px 10px rgba(0,0,0,0.5)`,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        <span style={{ fontSize: isVertical ? "19px" : "18px" }}>{speakerIcon}</span>
        <span>{activeSpeakerName}</span>
      </div>

      {/* Full-Context Subtitle Container */}
      <div
        style={{
          background: "rgba(9, 14, 28, 0.92)",
          backdropFilter: "blur(20px)",
          border: `1.5px solid ${activeSpeakerColor}55`,
          borderRadius: "22px",
          padding: isVertical ? "14px 22px" : "14px 34px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          rowGap: isVertical ? "8px" : "10px",
          columnGap: isVertical ? "10px" : "12px",
          maxWidth: isVertical ? "92%" : "82%",
          boxShadow: `0 18px 45px rgba(0, 0, 0, 0.75), 0 0 25px ${activeSpeakerColor}15`,
          transition: "border-color 0.25s ease, box-shadow 0.25s ease",
          textAlign: "center",
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
            // Gentle playful spring bounce aligned with speech phonetics
            bounceY = -Math.sin(progress * Math.PI) * (isVertical ? 6 : 5);
            wordScale = 1.0 + Math.sin(progress * Math.PI) * 0.16;
            tiltDeg = (idx % 2 === 0 ? -1.5 : 1.5) * Math.sin(progress * Math.PI);
          }

          const itemColor = item.speakerColor || activeSpeakerColor;

          // Color & Contrast Strategy:
          // Active word: Vibrant glowing speaker accent color
          // Past words: Solid, crisp white (full context preserved)
          // Upcoming words: Soft translucent white (previewable context)
          const textColor = isActive
            ? itemColor
            : isPast
            ? "#FFFFFF"
            : "rgba(255, 255, 255, 0.58)";

          return (
            <span
              key={`${item.word}-${idx}`}
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: isVertical ? "26px" : "30px",
                lineHeight: 1.4,
                fontWeight: isActive ? 900 : isPast ? 750 : 600,
                color: textColor,
                transform: `translateY(${bounceY}px) scale(${wordScale}) rotate(${tiltDeg}deg)`,
                transition: "transform 0.05s ease-out, color 0.1s ease",
                display: "inline-block",
                textShadow: isActive
                  ? `0 0 16px ${itemColor}B0, 0 2px 6px rgba(0,0,0,0.95)`
                  : isPast
                  ? "0 2px 5px rgba(0,0,0,0.9)"
                  : "0 1px 3px rgba(0,0,0,0.6)",
                WebkitTextStroke: isActive ? "0.8px rgba(0,0,0,0.7)" : "none",
                letterSpacing: "0.2px",
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
