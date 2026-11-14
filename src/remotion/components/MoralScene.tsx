import React, { useMemo } from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WordTiming } from "./KineticSubtitles";

interface MoralSceneProps {
  scene: any;
  book: any;
  isVertical: boolean;
  words: WordTiming[];
}

export const MoralScene: React.FC<MoralSceneProps> = ({ scene, book, isVertical, words }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;

  const isEn = book.language?.startsWith("en");

  // Spring entrance animations
  const cardEntrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const badgeEntrance = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 12, stiffness: 110 },
  });

  const floatY = Math.sin(frame / 20) * 6;
  const floatRotate = Math.sin(frame / 28) * 1.2;

  // Background ambient scale & slow camera breathing
  const bgScale = interpolate(frame, [0, 180], [1.12, 1.22], { extrapolateRight: "clamp" });

  // Source illustration for the hero vignette
  const heroImgSrc = scene.visual?.imagePath
    ? staticFile(scene.visual.imagePath)
    : null;

  // Moral title / headline from scene metadata or default
  const moralBadge = isEn ? "✨ MORAL OF THE STORY ✨" : "✨ PESAN MORAL CERITA ✨";
  const moralHeadline =
    scene.moralHeadline ||
    (isEn
      ? "Kindness & Joy Always Win!"
      : "Kebaikan & Senyuman Selalu Menang!");

  const closingNote = isEn
    ? "💖 Thank you for watching! See you in the next adventure! ✨"
    : "💖 Terima kasih sudah menonton! Sampai jumpa di dongeng seru berikutnya! ✨";

  // Active word detection for kinetic karaoke text highlight
  const activeWordIdx = words.findIndex((w) => currentTime >= w.start && currentTime <= w.end);

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B1120",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Fredoka', 'Quicksand', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Layer 1: Ambient Blurred Storybook Backdrop */}
      {heroImgSrc ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${bgScale})`,
            filter: "blur(44px) brightness(0.35) saturate(1.4)",
            zIndex: 1,
          }}
        >
          <Img src={heroImgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #1E1B4B 0%, #312E81 50%, #0F172A 100%)",
            zIndex: 1,
          }}
        />
      )}

      {/* Layer 2: Warm Playful Stardust & Vignette Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, rgba(254, 240, 138, 0.12) 0%, rgba(30, 27, 75, 0.6) 60%, rgba(15, 23, 42, 0.92) 100%)",
          zIndex: 2,
        }}
      />

      {/* Layer 3: Floating Animated Star & Sparkle Particles */}
      {[
        { x: isVertical ? 80 : 180, y: isVertical ? 160 : 120, size: 28, delay: 0, icon: "⭐" },
        { x: isVertical ? 980 : 1720, y: isVertical ? 220 : 160, size: 34, delay: 12, icon: "✨" },
        { x: isVertical ? 120 : 220, y: isVertical ? 1600 : 920, size: 30, delay: 24, icon: "🌟" },
        { x: isVertical ? 960 : 1680, y: isVertical ? 1640 : 900, size: 32, delay: 18, icon: "💖" },
        { x: isVertical ? 540 : 960, y: isVertical ? 120 : 80, size: 24, delay: 6, icon: "🌈" },
      ].map((star, idx) => {
        const starFloat = Math.sin((frame + star.delay * 4) / 16) * 10;
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
              zIndex: 3,
              opacity: 0.85,
              pointerEvents: "none",
              filter: "drop-shadow(0 0 12px rgba(254, 240, 138, 0.8))",
            }}
          >
            {star.icon}
          </div>
        );
      })}

      {/* Layer 4: Main Centerpiece Moral Container (Positioned inside Universal 9:16 Safe Zone) */}
      <div
        style={{
          zIndex: 10,
          transform: `scale(${cardEntrance}) translateY(${floatY}px) rotate(${floatRotate * 0.4}deg)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: isVertical ? "100%" : "1220px",
          width: isVertical ? "100%" : "1220px",
          padding: isVertical ? "0 104px 220px 104px" : "0 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Playful Top Pill Badge */}
        <div
          style={{
            transform: `scale(${badgeEntrance})`,
            background: "linear-gradient(135deg, #FEF08A 0%, #F59E0B 100%)",
            border: "3px solid #FFFFFF",
            borderRadius: "9999px",
            padding: isVertical ? "10px 28px" : "12px 36px",
            boxShadow: "0 10px 25px rgba(245, 158, 11, 0.45), 0 0 30px rgba(254, 240, 138, 0.5)",
            marginBottom: isVertical ? "-22px" : "-26px",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              fontSize: isVertical ? "20px" : "24px",
              fontWeight: 900,
              color: "#78350F",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              textShadow: "0 1px 2px rgba(255,255,255,0.8)",
            }}
          >
            {moralBadge}
          </span>
        </div>

        {/* Playful Frosted Kid Card */}
        <div
          style={{
            width: "100%",
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(254, 249, 195, 0.94) 100%)",
            borderRadius: isVertical ? "36px" : "44px",
            border: "4px solid rgba(255, 255, 255, 0.9)",
            boxShadow:
              "0 24px 70px rgba(0, 0, 0, 0.45), 0 0 50px rgba(245, 158, 11, 0.25), inset 0 2px 6px rgba(255,255,255,0.8)",
            padding: isVertical ? "44px 28px 32px" : "52px 48px 38px",
            display: "flex",
            flexDirection: isVertical ? "column" : "row",
            alignItems: "center",
            gap: isVertical ? "24px" : "40px",
            position: "relative",
          }}
        >
          {/* Hero Character Vignette with Golden Sticker Rim */}
          <div
            style={{
              flexShrink: 0,
              position: "relative",
            }}
          >
            <div
              style={{
                width: isVertical ? "160px" : "220px",
                height: isVertical ? "160px" : "220px",
                borderRadius: "50%",
                overflow: "hidden",
                border: "5px solid #F59E0B",
                boxShadow: "0 12px 30px rgba(245, 158, 11, 0.35), 0 4px 10px rgba(0,0,0,0.15)",
                background: "#FEF08A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {heroImgSrc ? (
                <Img
                  src={heroImgSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: isVertical ? "75px" : "95px" }}>⭐</span>
              )}
            </div>
            {/* Sparkle badge on corner of avatar */}
            <div
              style={{
                position: "absolute",
                bottom: "4px",
                right: "4px",
                background: "#F59E0B",
                borderRadius: "50%",
                width: isVertical ? "36px" : "44px",
                height: isVertical ? "36px" : "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #FFFFFF",
                boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
                fontSize: isVertical ? "20px" : "24px",
              }}
            >
              💡
            </div>
          </div>

          {/* Moral Content & Kinetic Spoken Narration */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: isVertical ? "center" : "flex-start",
              textAlign: isVertical ? "center" : "left",
            }}
          >
            {/* Big Headline Lesson */}
            <h2
              style={{
                fontSize: isVertical ? "34px" : "40px",
                fontWeight: 900,
                color: "#92400E",
                margin: "0 0 16px 0",
                lineHeight: 1.22,
                letterSpacing: "-0.5px",
                textShadow: "0 1px 2px rgba(254, 240, 138, 0.6)",
              }}
            >
              {moralHeadline}
            </h2>

            {/* Kinetic Spoken Narration (Read-Aloud Synchronized Box) */}
            <div
              style={{
                background: "rgba(254, 252, 232, 0.94)",
                borderRadius: "24px",
                border: "2.5px dashed #F59E0B",
                padding: isVertical ? "20px 24px" : "22px 30px",
                width: "100%",
                boxSizing: "border-box",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: isVertical ? "center" : "flex-start",
                gap: isVertical ? "8px 11px" : "10px 13px",
                boxShadow: "inset 0 2px 4px rgba(245, 158, 11, 0.08)",
                marginBottom: "18px",
              }}
            >
              {words && words.length > 0 ? (
                words.map((item, idx) => {
                  const isActive = currentTime >= item.start && currentTime <= item.end;
                  const isPast = currentTime > item.end;

                  let bounceY = 0;
                  let wordScale = 1.0;
                  if (isActive) {
                    const wordDuration = Math.max(0.08, item.end - item.start);
                    const progress = Math.min(1, Math.max(0, (currentTime - item.start) / wordDuration));
                    bounceY = -Math.sin(progress * Math.PI) * 6;
                    wordScale = 1.0 + Math.sin(progress * Math.PI) * 0.16;
                  }

                  const wordColor = isActive
                    ? "#B45309" // Rich warm amber when spoken
                    : isPast
                    ? "#0F172A" // Solid crisp slate when already spoken
                    : "#475569"; // Readable slate for upcoming words

                  return (
                    <span
                      key={`${item.word}-${idx}`}
                      style={{
                        fontSize: isVertical ? "32px" : "34px",
                        fontWeight: isActive ? 900 : isPast ? 800 : 700,
                        lineHeight: 1.34,
                        color: wordColor,
                        transform: `translateY(${bounceY}px) scale(${wordScale})`,
                        display: "inline-block",
                        transition: "transform 0.05s ease-out, color 0.1s ease",
                        textShadow: isActive ? "0 0 12px rgba(245, 158, 11, 0.45)" : "none",
                      }}
                    >
                      {item.word}
                    </span>
                  );
                })
              ) : (
                <p
                  style={{
                    fontSize: isVertical ? "30px" : "32px",
                    fontWeight: 800,
                    color: "#0F172A",
                    margin: 0,
                    lineHeight: 1.38,
                  }}
                >
                  {scene.audio?.text || "Selalu berbuat baik dan sayangi sesama!"}
                </p>
              )}
            </div>

            {/* Outro Call-To-Action Footer Pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#B45309",
                fontSize: isVertical ? "20px" : "22px",
                fontWeight: 800,
                letterSpacing: "0.2px",
              }}
            >
              <span>{closingNote}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
