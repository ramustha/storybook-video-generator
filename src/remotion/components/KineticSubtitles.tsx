import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  buildSentenceAwareGroups,
  normalizeKaraokeWords,
  resolveActiveWordState,
} from "../../subtitles/sync-timings";

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

export const KineticSubtitles: React.FC<KineticSubtitlesProps> = ({
  words,
  isVertical,
  verticalTop,
  verticalBottom,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const normalizedWords = useMemo(() => normalizeKaraokeWords(words || []), [words]);
  const groups = useMemo(
    () => buildSentenceAwareGroups(normalizedWords, { isVertical }),
    [normalizedWords, isVertical]
  );

  if (normalizedWords.length === 0) return null;

  let activeGroupIdx = groups.findIndex((g, idx) => {
    const gStart = Math.max(0, g[0].start - 0.06);
    const nextGroup = idx + 1 < groups.length ? groups[idx + 1] : undefined;
    const gEnd = nextGroup
      ? Math.min(nextGroup[0].start - 0.04, g[g.length - 1].activeEnd + 0.35)
      : g[g.length - 1].activeEnd + 0.45;
    return currentTime >= gStart && currentTime <= Math.max(gStart, gEnd);
  });

  if (activeGroupIdx === -1) {
    const nextIdx = groups.findIndex((g) => g[0].start > currentTime);
    activeGroupIdx = nextIdx !== -1 ? (nextIdx > 0 ? nextIdx - 1 : 0) : groups.length - 1;
  }

  const visibleWords = groups[activeGroupIdx] || normalizedWords;
  const wordState = resolveActiveWordState(normalizedWords, currentTime);
  const anchorWord = wordState.activeWord || visibleWords[0];

  const activeSpeaker = anchorWord?.speaker || "narator";
  const activeSpeakerName = anchorWord?.speakerName || "Narator";
  const activeSpeakerColor = anchorWord?.speakerColor || "#FDE047";
  const speakerIcon = SPEAKER_ICONS[activeSpeaker.toLowerCase()] || "💬";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: isVertical ? (verticalBottom ? "auto" : verticalTop || "945px") : "auto",
        bottom: isVertical ? verticalBottom || "auto" : "56px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: isVertical ? "0 104px" : "0 80px",
        zIndex: 50,
        pointerEvents: "none",
        gap: isVertical ? "14px" : "12px",
      }}
    >
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

      <div
        style={{
          background: "rgba(8, 13, 26, 0.94)",
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
          const isActive = wordState.isSpeakingNow && wordState.activeWord === item;
          const isPast = !isActive && currentTime >= item.phoneticEnd;

          let wordScale = 1.0;
          let bounceY = 0;
          let tiltDeg = 0;

          if (isActive) {
            const wave = Math.sin(wordState.wordProgress * Math.PI);
            bounceY = -wave * (isVertical ? 7 : 6);
            wordScale = 1.0 + wave * 0.14;
            tiltDeg = (idx % 2 === 0 ? -1.2 : 1.2) * wave;
          }

          const itemColor = item.speakerColor || activeSpeakerColor;
          const textColor = isActive
            ? itemColor
            : isPast
            ? "#FFFFFF"
            : "rgba(255, 255, 255, 0.78)";

          return (
            <span
              key={`${item.word}-${item.start}-${idx}`}
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: isVertical ? "48px" : "46px",
                lineHeight: 1.32,
                fontWeight: isActive ? 900 : isPast ? 800 : 700,
                color: textColor,
                transform: `translateY(${bounceY}px) scale(${wordScale}) rotate(${tiltDeg}deg)`,
                transition: "transform 0.05s ease-out, color 0.08s ease",
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
