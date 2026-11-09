import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { KineticSubtitles, WordTiming } from "./KineticSubtitles";

interface OutroSceneProps {
  scene: any;
  book: any;
  isVertical: boolean;
  words?: WordTiming[];
}

export const OutroScene: React.FC<OutroSceneProps> = ({ scene, book, isVertical, words }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isEn = book.language?.startsWith("en");

  // Spring entrance animations
  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const pulse = Math.sin(frame / 12) * 0.05;
  const floatY = Math.sin(frame / 18) * 6;

  // Background ambient scale
  const bgScale = interpolate(frame, [0, 180], [1.1, 1.2], { extrapolateRight: "clamp" });

  const bgImgSrc = scene.visual?.imagePath
    ? staticFile(scene.visual.imagePath)
    : null;

  // Next story recommendation details (Fully Dynamic & General)
  const rec = scene.recommendation || book.nextStory || {};

  // Dynamic Title: user-defined or universal engaging default
  const defaultTitle = isEn ? "Next Exciting Adventure!" : "Dongeng Seru Berikutnya!";
  const nextTitle = isEn
    ? (rec.titleEn || rec.title || defaultTitle)
    : (rec.title || defaultTitle);

  // Dynamic Subtitle
  const defaultSubtitle = isEn ? "Click to Watch Full Story" : "Klik untuk Menonton Cerita Lengkap";
  const nextSubtitle = isEn
    ? (rec.subtitleEn || rec.subtitle || defaultSubtitle)
    : (rec.subtitle || defaultSubtitle);

  // Dynamic Badge Tag
  const defaultBadge = isEn ? "UP NEXT" : "REKOMENDASI";
  const badgeText = isEn
    ? (rec.badgeEn || rec.badge || defaultBadge)
    : (rec.badge || defaultBadge);

  const hasCustomRecImage = Boolean(rec.imagePath);
  const nextImgSrc = rec.imagePath ? staticFile(rec.imagePath) : bgImgSrc;

  // Header Pill Banner
  const headerPillText = scene.headerText || (isEn
    ? "🌟 WATCH NEXT ADVENTURE 🌟"
    : "🌟 TONTON DONGENG BERIKUTNYA 🌟");

  // Channel Branding (Configurable per book or fallback)
  const channelHandle = book.channelHandle || scene.channelHandle || "@zayn.storybook";
  const channelTagline = book.channelTagline || scene.channelTagline || (isEn
    ? "New Storybooks Every Week!"
    : "Dongeng Cerita Baru Tiap Minggu!");

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#070B16",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Fredoka', 'Quicksand', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Layer 1: Ambient Blurred Backdrop Plate */}
      {bgImgSrc ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${bgScale})`,
            filter: "blur(42px) brightness(0.38) saturate(1.4)",
            zIndex: 1,
          }}
        >
          <Img src={bgImgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #0F172A 0%, #1E1B4B 50%, #312E81 100%)",
            zIndex: 1,
          }}
        />
      )}

      {/* Layer 2: Radial Fairytale Gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.65) 60%, rgba(2, 6, 23, 0.94) 100%)",
          zIndex: 2,
        }}
      />

      {/* Layer 3: Floating Animated Star & Arrow Particles */}
      {[
        { x: isVertical ? 100 : 180, y: isVertical ? 200 : 120, size: 30, icon: "⭐" },
        { x: isVertical ? 960 : 1720, y: isVertical ? 260 : 140, size: 34, icon: "✨" },
        { x: isVertical ? 120 : 200, y: isVertical ? 1620 : 920, size: 32, icon: "🌟" },
        { x: isVertical ? 940 : 1680, y: isVertical ? 1660 : 900, size: 30, icon: "💖" },
      ].map((p, idx) => (
        <div
          key={idx}
          style={{
            position: "absolute",
            left: `${p.x}px`,
            top: `${p.y}px`,
            transform: `translateY(${Math.sin((frame + idx * 8) / 16) * 8}px)`,
            fontSize: `${p.size}px`,
            zIndex: 3,
            filter: "drop-shadow(0 0 12px rgba(254, 240, 138, 0.8))",
          }}
        >
          {p.icon}
        </div>
      ))}

      {/* Layer 4: Main Content Container */}
      <div
        style={{
          zIndex: 10,
          transform: `scale(${entrance}) translateY(${floatY}px)`,
          width: isVertical ? "92%" : "1380px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isVertical ? "28px" : "32px",
        }}
      >
        {/* Playful Top Pill Badge */}
        <div
          style={{
            background: "linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)",
            border: "3.5px solid #FFFFFF",
            borderRadius: "9999px",
            padding: isVertical ? "12px 32px" : "14px 44px",
            boxShadow: "0 10px 30px rgba(2, 132, 199, 0.5), 0 0 25px rgba(56, 189, 248, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: isVertical ? "22px" : "28px",
              fontWeight: 900,
              color: "#FFFFFF",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              textShadow: "0 2px 4px rgba(0,0,0,0.4)",
            }}
          >
            {headerPillText}
          </span>
        </div>

        {/* Dual Recommendation Cards (Landscape: Left Video Frame + Right Subscribe Frame) */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: isVertical ? "column" : "row",
            alignItems: "center",
            justifyContent: "center",
            gap: isVertical ? "32px" : "48px",
          }}
        >
          {/* Card 1: Next Video Preview Frame (Pixel-Matched to YouTube End Screen 16:9 Element) */}
          <div
            style={{
              width: isVertical ? "100%" : "680px",
              height: isVertical ? "420px" : "382px",
              background: "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(240, 249, 255, 0.92) 100%)",
              borderRadius: "32px",
              border: "4px solid #38BDF8",
              boxShadow: "0 25px 65px rgba(0,0,0,0.5), 0 0 40px rgba(56, 189, 248, 0.3)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            {/* Top Preview Artwork */}
            <div
              style={{
                width: "100%",
                height: isVertical ? "300px" : "270px",
                position: "relative",
                overflow: "hidden",
                backgroundColor: "#0B0F19",
              }}
            >
              {nextImgSrc ? (
                <Img
                  src={nextImgSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: hasCustomRecImage ? "none" : "brightness(0.85) saturate(1.2)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "72px",
                    background: "linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)",
                  }}
                >
                  🎬
                </div>
              )}

              {/* Play Badge Overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: hasCustomRecImage ? "rgba(0,0,0,0.25)" : "rgba(15, 23, 42, 0.35)",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.95)",
                    border: "3.5px solid #FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.55), 0 0 20px rgba(239, 68, 68, 0.4)",
                    transform: `scale(${1 + pulse})`,
                    fontSize: "30px",
                    color: "#FFFFFF",
                    paddingLeft: "4px",
                  }}
                >
                  ▶
                </div>
              </div>

              {/* Top Banner Tag */}
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  left: "14px",
                  background: "linear-gradient(135deg, #F59E0B, #D97706)",
                  color: "#FFFFFF",
                  fontWeight: 900,
                  fontSize: "14px",
                  padding: "5px 14px",
                  borderRadius: "9999px",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                  letterSpacing: "0.5px",
                }}
              >
                {badgeText}
              </div>

              {!hasCustomRecImage && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(15, 23, 42, 0.75)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "9999px",
                    padding: "4px 16px",
                    color: "#FEF08A",
                    fontSize: "13px",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isEn ? "✨ BEST FOR YOU ✨" : "✨ PILIHAN TERBAIK ✨"}
                </div>
              )}
            </div>

            {/* Bottom Title & Action Bar */}
            <div
              style={{
                flex: 1,
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#FFFFFF",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" }}>
                <span
                  style={{
                    fontSize: isVertical ? "22px" : "24px",
                    fontWeight: 900,
                    color: "#0F172A",
                    letterSpacing: "-0.5px",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                  }}
                >
                  {nextTitle}
                </span>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#64748B" }}>
                  {nextSubtitle}
                </span>
              </div>
              <div
                style={{
                  background: "#0284C7",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontSize: "16px",
                  padding: "8px 20px",
                  borderRadius: "9999px",
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                  flexShrink: 0,
                  marginLeft: "12px",
                }}
              >
                {isEn ? "Play ▶" : "Tonton ▶"}
              </div>
            </div>
          </div>

          {/* Card 2: Subscribe Call-to-Action (Pixel-Matched to YouTube Subscribe Element) */}
          <div
            style={{
              width: isVertical ? "100%" : "440px",
              height: isVertical ? "auto" : "382px",
              background: "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(254, 242, 242, 0.94) 100%)",
              borderRadius: "32px",
              border: "4px solid #EF4444",
              boxShadow: "0 25px 65px rgba(0,0,0,0.5), 0 0 40px rgba(239, 68, 68, 0.3)",
              padding: "32px 28px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              textAlign: "center",
            }}
          >
            {/* Pulsing Avatar Frame */}
            <div
              style={{
                position: "relative",
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                padding: "6px",
                background: "linear-gradient(135deg, #EF4444, #F59E0B)",
                boxShadow: "0 10px 25px rgba(239, 68, 68, 0.4)",
                transform: `scale(${1 + pulse * 0.8})`,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  backgroundColor: "#0F172A",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "50px",
                }}
              >
                {book.channelAvatar ? (
                  <Img
                    src={staticFile(book.channelAvatar)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  "👑"
                )}
              </div>
            </div>

            {/* Channel Branding */}
            <div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 900,
                  color: "#0F172A",
                  letterSpacing: "-0.5px",
                }}
              >
                {channelHandle}
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#64748B",
                  marginTop: "2px",
                }}
              >
                {channelTagline}
              </div>
            </div>

            {/* Giant Subscribe Button */}
            <div
              style={{
                background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
                border: "2.5px solid #FFFFFF",
                borderRadius: "9999px",
                padding: "12px 36px",
                color: "#FFFFFF",
                fontSize: "20px",
                fontWeight: 900,
                letterSpacing: "1px",
                boxShadow: "0 8px 24px rgba(220, 38, 38, 0.5)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span>🔔</span>
              <span>SUBSCRIBE</span>
            </div>
          </div>
        </div>

        {/* Friendly Parting Message (Shown when no active spoken word timings) */}
        {(!words || words.length === 0) && (
          <div
            style={{
              color: "#FEF08A",
              fontSize: isVertical ? "18px" : "20px",
              fontWeight: 800,
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              letterSpacing: "0.5px",
            }}
          >
            {isEn
              ? "💖 Thank you for watching and supporting our storybooks! ✨"
              : "💖 Terima kasih sudah menonton dan mendukung dongeng kami! ✨"}
          </div>
        )}
      </div>

      {/* Layer 5: Spoken Audio Subtitles (When voiceover is present) */}
      {words && words.length > 0 && (
        <KineticSubtitles words={words} isVertical={isVertical} />
      )}
    </div>
  );
};
