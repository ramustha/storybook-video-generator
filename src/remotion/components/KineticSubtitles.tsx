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
  verticalTop?: string;
  verticalBottom?: string;
}

const SPEAKER_ICONS: Record<string, string> = {
  guru: "👩‍🏫",
  ibu: "👩",
  mother: "👩",
  bunda: "👩",
  papa: "👨",
  ayah: "👨",
  father: "👨",
  budi: "👦",
  manu: "👦",
  chintu: "👦",
  anak: "👦",
  protagonist: "👧",
  child_protagonist: "👧",
  child_girl: "👧",
  aku: "👧",
  me: "👧",
  raja: "👑",
  king: "👑",
  anjing: "🐕",
  dog: "🐕",
  kucing: "🐱",
  cat: "🐱",
  kancil: "🦌",
  sapi: "🐄",
  cow: "🐄",
  bulan: "🌙",
  moon: "🌙",
  magical_entity: "🌙",
  animal_funny: "🐾",
  elder: "👴",
  kakek: "👴",
  nenek: "👵",
  villager: "🏘️",
  warga: "🏘️",
  tetangga: "🏘️",
  keluarga: "👨‍👩‍👧‍👦",
  family: "👨‍👩‍👧‍👦",
  narator: "📖",
  narrator: "📖",
};

/**
 * Groups words into natural, coherent sentence / thought units sized for
 * large, readable 2-3 line subtitle cards across Portrait (9:16) and Landscape (16:9).
 */
function buildContextGroups(words: WordTiming[], isVertical: boolean): WordTiming[][] {
  if (!words || words.length === 0) return [];
  const maxGroupWords = isVertical ? 10 : 13;
  const minClauseSplit = isVertical ? 5 : 6;
  const minSentenceSplit = isVertical ? 4 : 5;

  if (words.length <= maxGroupWords) {
    return [words];
  }

  const groups: WordTiming[][] = [];
  let currentGroup: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentGroup.push(w);

    const isSentenceEnd = /[.!?…]+$/.test(w.word.trim());
    const isClauseBoundary = /[,;:—–-]+$/.test(w.word.trim());

    const shouldSplit =
      (isSentenceEnd && currentGroup.length >= minSentenceSplit) ||
      (isClauseBoundary && currentGroup.length >= minClauseSplit) ||
      currentGroup.length >= maxGroupWords;

    if (shouldSplit && i < words.length - 1) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    if (groups.length > 0 && currentGroup.length <= 3) {
      // Merge small tail into the preceding group to avoid orphaned single words
      groups[groups.length - 1].push(...currentGroup);
    } else {
      groups.push(currentGroup);
    }
  }

  return groups.length > 0 ? groups : [words];
}

export const KineticSubtitles: React.FC<KineticSubtitlesProps> = ({
  words,
  isVertical,
  verticalTop,
  verticalBottom,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!words || words.length === 0) return null;

  // Build context-preserving sentence groups sized for large typography
  const groups = useMemo(() => buildContextGroups(words, isVertical), [words, isVertical]);

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
        // Universal Multi-Platform Safe Zone:
        // - Portrait (1080x1920): anchored at top 945px (41px directly below the 16:9 illustration ending at Y=904px),
        //   so 1-3 line subtitles sit cohesively at Y=945..1360px — completely clear of bottom platform UI (Y=1480..1920px)
        //   and right-side Like/Comment/Share buttons (symmetric 104px side margins).
        // - Landscape (1920x1080): bottom 56px clears YouTube/FB player scrubber bar and 5% SMPTE TV title-safe margin.
        top: isVertical ? (verticalBottom ? "auto" : (verticalTop || "945px")) : "auto",
        bottom: isVertical ? (verticalBottom || "auto") : "56px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: isVertical ? "0 104px" : "0 80px",
        zIndex: 50,
        pointerEvents: "none",
        gap: isVertical ? "14px" : "12px",
      }}
    >
      {/* Dynamic Speaker Tag Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(8, 13, 26, 0.95)",
          border: `2.5px solid ${activeSpeakerColor}`,
          borderRadius: "9999px",
          padding: isVertical ? "8px 26px" : "7px 26px",
          color: activeSpeakerColor,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: isVertical ? "24px" : "22px",
          fontWeight: 900,
          boxShadow: `0 0 18px ${activeSpeakerColor}50, 0 6px 14px rgba(0,0,0,0.65)`,
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        <span style={{ fontSize: isVertical ? "26px" : "24px" }}>{speakerIcon}</span>
        <span>{activeSpeakerName}</span>
      </div>

      {/* Full-Context Subtitle Container */}
      <div
        style={{
          background: "rgba(8, 13, 26, 0.94)",
          backdropFilter: "blur(22px)",
          border: `2.5px solid ${activeSpeakerColor}75`,
          borderRadius: "28px",
          padding: isVertical ? "22px 32px" : "20px 42px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          rowGap: isVertical ? "12px" : "12px",
          columnGap: isVertical ? "14px" : "15px",
          width: isVertical ? "100%" : "auto",
          maxWidth: isVertical ? "872px" : "86%",
          boxSizing: "border-box",
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px ${activeSpeakerColor}22`,
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
            bounceY = -Math.sin(progress * Math.PI) * (isVertical ? 7 : 6);
            wordScale = 1.0 + Math.sin(progress * Math.PI) * 0.14;
            tiltDeg = (idx % 2 === 0 ? -1.2 : 1.2) * Math.sin(progress * Math.PI);
          }

          const itemColor = item.speakerColor || activeSpeakerColor;

          // Color & Contrast Strategy:
          // Active word: Vibrant glowing speaker accent color
          // Past words: Solid, crisp white (full context preserved)
          // Upcoming words: High-contrast soft white (0.78 opacity for easy read-ahead)
          const textColor = isActive
            ? itemColor
            : isPast
            ? "#FFFFFF"
            : "rgba(255, 255, 255, 0.78)";

          return (
            <span
              key={`${item.word}-${idx}`}
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: isVertical ? "48px" : "46px",
                lineHeight: 1.32,
                fontWeight: isActive ? 900 : isPast ? 800 : 700,
                color: textColor,
                transform: `translateY(${bounceY}px) scale(${wordScale}) rotate(${tiltDeg}deg)`,
                transition: "transform 0.05s ease-out, color 0.1s ease",
                display: "inline-block",
                textShadow: isActive
                  ? `0 0 20px ${itemColor}C0, 0 3px 8px rgba(0,0,0,0.98)`
                  : isPast
                  ? "0 3px 7px rgba(0,0,0,0.95)"
                  : "0 2px 5px rgba(0,0,0,0.85)",
                WebkitTextStroke: isActive ? "1.2px rgba(0,0,0,0.75)" : "none",
                letterSpacing: "0.3px",
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
