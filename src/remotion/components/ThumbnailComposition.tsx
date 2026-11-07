import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import { ProceduralIllustration } from "./ProceduralIllustration";

export interface ThumbnailConfig {
  headlineTop?: string;
  headlineBottom?: string;
  headline?: string;
  hook?: string;
  hookEmoji?: string;
  badge?: string;
  sticker?: string;
  bedtimeTitle?: string;
  bedtimeHook?: string;
}

export interface ThumbnailProps {
  book: {
    title: string;
    originalTitle?: string;
    scenes?: any[];
    source?: {
      publisher?: string;
      originalAuthor?: string;
      originalIllustrator?: string;
      license?: string;
    };
    thumbnailConfig?: {
      heroImage?: string;
      backdropImage?: string;
      id?: ThumbnailConfig;
      en?: ThumbnailConfig;
    };
    thumbnail?: {
      id?: ThumbnailConfig;
      en?: ThumbnailConfig;
    };
  };
  lang: "id" | "en";
  variant: "popular" | "bedtime";
  orientation?: "landscape" | "vertical" | "portrait";
  heroImagePath?: string;
  backdropImagePath?: string;
  customHeadline?: string;
  customHook?: string;
}

function deriveEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("hujan") || lower.includes("rain")) return "🌧️😱";
  if (lower.includes("kucing") || lower.includes("cat")) return "🐱😱";
  if (lower.includes("anjing") || lower.includes("dog")) return "🐶😱";
  if (lower.includes("kancil") || lower.includes("mousedeer")) return "🦌😱";
  if (lower.includes("monyet") || lower.includes("monkey")) return "🐒😱";
  if (lower.includes("buaya") || lower.includes("crocodile")) return "🐊😱";
  return "⭐✨";
}

function splitHeadline(
  fullTitle: string,
  explicitTop?: string,
  explicitBottom?: string,
  emoji?: string
): [string, string] {
  if (explicitTop && explicitBottom) return [explicitTop, explicitBottom];
  const clean = fullTitle.trim().replace(/[!.]+$/, "");
  const words = clean.split(/\s+/);
  const suffix = emoji ? ` ${emoji}` : "!";

  if (words.length <= 1) {
    return [words[0] || "", suffix];
  }
  if (words.length === 2) {
    return [words[0], `${words[1]}${suffix}`];
  }
  if (words.length === 3) {
    return [`${words[0]} ${words[1]}`, `${words[2]}${suffix}`];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), `${words.slice(mid).join(" ")}${suffix}`];
}

export const StorybookThumbnailComposition: React.FC<ThumbnailProps> = ({
  book,
  lang = "id",
  variant = "popular",
  orientation,
  heroImagePath,
  backdropImagePath,
  customHeadline,
  customHook,
}) => {
  const videoConfig = useVideoConfig();
  const width = videoConfig?.width || 1920;
  const height = videoConfig?.height || 1080;
  const isPortrait = orientation === "portrait" || (height === 1350 && width === 1080);
  const isVertical = orientation === "vertical" || (height > width && !isPortrait);
  const isEn = lang === "en";

  // Dynamic book metadata
  const rawTitle = isEn ? (book.originalTitle || book.title) : book.title;
  const config: ThumbnailConfig =
    book.thumbnailConfig?.[lang] || (book as any).thumbnail?.[lang] || {};

  const hasHero = Boolean(heroImagePath);
  const hasBg = Boolean(backdropImagePath);

  const bgSrc = hasBg ? staticFile(backdropImagePath!) : null;
  const heroSrc = hasHero ? staticFile(heroImagePath!) : null;

  const authorName = book.source?.originalAuthor || (isEn ? "Author" : "Penulis");
  const illustratorName = book.source?.originalIllustrator || (isEn ? "Illustrator" : "Ilustrator");

  const hookEmoji = config.hookEmoji || deriveEmoji(rawTitle);
  const [headlineTop, headlineBottom] = splitHeadline(
    customHeadline || config.headline || rawTitle.toUpperCase(),
    config.headlineTop,
    config.headlineBottom,
    config.hookEmoji ? undefined : hookEmoji.slice(0, 2)
  );

  const hookText =
    customHook ||
    config.hook ||
    (isEn ? `The Story of ${rawTitle}?!` : `Kisah Seru ${rawTitle}?!`);

  const stickerText =
    config.sticker ||
    (isEn ? "Must Watch! ✨" : "Wajib Nonton! ✨");

  const badgeText =
    config.badge ||
    (isEn ? "Hilarious Kids Storybook" : "Cerita Anak Bergambar!");

  const bedtimeTitle =
    customHeadline ||
    config.bedtimeTitle ||
    config.headline ||
    rawTitle;

  const bedtimeHook =
    customHook ||
    config.bedtimeHook ||
    (isEn ? "A Heartwarming Bedtime Tale for Kids" : "Dongeng Pengantar Tidur Penuh Makna");

  const publisher = book.source?.publisher || (isEn ? "Storybook Collection" : "Buku Cerita Bergambar");
  const licenseShort = book.source?.license?.includes("CC BY 4.0") ? "CC BY 4.0" : "";
  const attributionPill = `⭐ ${publisher}${licenseShort ? ` • ${licenseShort}` : ""}`.trim();

  // ==========================================
  // PORTRAIT 4:5 THUMBNAIL (INSTAGRAM FEED & FACEBOOK ANNOUNCEMENT)
  // ==========================================
  if (isPortrait) {
    return (
      <div
        style={{
          width: 1080,
          height: 1350,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0B0F1A",
          fontFamily: "'Arial Black', 'Impact', 'Montserrat', -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Ambient Blurred Background Plate */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "scale(1.15)",
            filter: "brightness(0.35) saturate(1.6) blur(40px)",
            zIndex: 1,
          }}
        >
          {bgSrc ? (
            <Img src={bgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #0F172A 100%)",
              }}
            />
          )}
        </div>

        {/* Dramatic Radial Gradient & Vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(15, 23, 42, 0.1) 0%, rgba(2, 6, 23, 0.88) 100%)",
            zIndex: 2,
          }}
        />

        {/* Content Container (4:5 with 1:1 Profile Grid Safe Zone) */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: 1350,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "46px 36px 54px 36px",
            boxSizing: "border-box",
          }}
        >
          {/* Top Pill / Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 28px",
                borderRadius: 18,
                backgroundColor: "#EF4444",
                border: "3px solid #FFFFFF",
                boxShadow: "0 8px 24px rgba(239, 68, 68, 0.7)",
                transform: "rotate(-1.5deg)",
              }}
            >
              <span style={{ fontSize: 24 }}>🔥</span>
              <span
                style={{
                  color: "#FFFFFF",
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {badgeText}
              </span>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 20px",
                borderRadius: 14,
                backgroundColor: "rgba(15, 23, 42, 0.85)",
                border: "2px solid rgba(255, 255, 255, 0.3)",
                color: "#FDE047",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
            >
              ⭐ ZAYN STORYBOOK
            </div>
          </div>

          {/* Centerpiece Hero Artwork with Clean Sticker Border */}
          <div
            style={{
              width: 1000,
              height: 680,
              position: "relative",
              borderRadius: 36,
              overflow: "hidden",
              border: "10px solid #FFFFFF",
              boxShadow:
                "0 25px 60px rgba(0, 0, 0, 0.9), 0 0 50px rgba(253, 224, 71, 0.35)",
              transform: "rotate(1deg)",
              backgroundColor: "#1E293B",
            }}
          >
            {heroSrc ? (
              <Img
                src={heroSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <ProceduralIllustration
                scene={{ index: 0, type: "cover" }}
                book={book}
                isVertical={false}
                isCover={true}
                showTitle={false}
              />
            )}

            {/* Inner Vignette */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />

            {/* Comic Floating Reaction Sticker on Artwork */}
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: 20,
                backgroundColor: "#FACC15",
                color: "#000",
                fontWeight: 900,
                fontSize: 26,
                padding: "10px 24px",
                borderRadius: 18,
                border: "4px solid #000",
                boxShadow: "0 6px 0 #000",
                transform: "rotate(-4deg)",
              }}
            >
              {stickerText}
            </div>
          </div>

          {/* Lower Section: Title, Curiosity Hook & Channel Attribution */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
              width: "100%",
            }}
          >
            {/* Title with 3D Drop Shadow */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transform: "rotate(-1.5deg)",
                filter: "drop-shadow(0 12px 24px rgba(0, 0, 0, 0.95))",
              }}
            >
              <div
                style={{
                  fontSize: 70,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  color: "#FFFFFF",
                  WebkitTextStroke: "5px #000000",
                  letterSpacing: "-0.01em",
                }}
              >
                {headlineTop}
              </div>
              <div
                style={{
                  fontSize: 86,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  color: "#FDE047",
                  WebkitTextStroke: "6px #000000",
                  letterSpacing: "-0.01em",
                  textShadow: "0 8px 0 #B45309",
                }}
              >
                {headlineBottom}
              </div>
            </div>

            {/* Secondary Curiosity Gap Hook Sticker */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 28px",
                borderRadius: 18,
                backgroundColor: "#38BDF8",
                border: "4px solid #000000",
                boxShadow: "0 8px 0 #0284C7, 0 16px 30px rgba(0,0,0,0.6)",
                transform: "rotate(1deg)",
              }}
            >
              <span style={{ fontSize: 28 }}>{hookEmoji}</span>
              <span
                style={{
                  color: "#000000",
                  fontSize: 26,
                  fontWeight: 900,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                }}
              >
                {hookText}
              </span>
            </div>

            {/* Platform Banner */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 18,
                fontWeight: 800,
                color: "rgba(255, 255, 255, 0.85)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 2,
              }}
            >
              <span>▶️ Tonton di YouTube & Facebook</span>
              <span>•</span>
              <span style={{ color: "#FDE047" }}>@zayn.storybook</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VERTICAL 9:16 THUMBNAIL (SHORTS / REELS)
  // ==========================================
  if (isVertical) {
    return (
      <div
        style={{
          width: 1080,
          height: 1920,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0B0F1A",
          fontFamily: "'Arial Black', 'Impact', 'Montserrat', -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Ambient Blurred Background Plate */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "scale(1.15)",
            filter: "brightness(0.4) saturate(1.5) blur(48px)",
            zIndex: 1,
          }}
        >
          {bgSrc ? (
            <Img src={bgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #0F172A 100%)",
              }}
            />
          )}
        </div>

        {/* Dramatic Radial Gradient & Vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(15, 23, 42, 0.2) 0%, rgba(2, 6, 23, 0.9) 100%)",
            zIndex: 2,
          }}
        />

        {/* Content Container (Vertical Stack with Safe Zones for Shorts UI) */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "110px 36px 190px 36px",
            boxSizing: "border-box",
          }}
        >
          {/* Top Pill / Badge (Above Action) */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 32px",
              borderRadius: 20,
              backgroundColor: "#EF4444",
              border: "4px solid #FFFFFF",
              boxShadow: "0 10px 30px rgba(239, 68, 68, 0.7)",
              transform: "rotate(-2deg)",
            }}
          >
            <span style={{ fontSize: 32 }}>🔥</span>
            <span
              style={{
                color: "#FFFFFF",
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {badgeText}
            </span>
          </div>

          {/* Centerpiece Hero Artwork with Clean Sticker Border (Maximized Size & Zero Dead Space) */}
          <div
            style={{
              width: 1000,
              height: 980,
              position: "relative",
              borderRadius: 48,
              overflow: "hidden",
              border: "14px solid #FFFFFF",
              boxShadow:
                "0 40px 100px rgba(0, 0, 0, 0.95), 0 0 70px rgba(253, 224, 71, 0.45)",
              transform: "rotate(2deg)",
              backgroundColor: "#1E293B",
            }}
          >
            {heroSrc ? (
              <Img
                src={heroSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <ProceduralIllustration
                scene={{ index: 0, type: "cover" }}
                book={book}
                isVertical={false}
                isCover={true}
                showTitle={false}
              />
            )}

            {/* Inner Vignette */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: "inset 0 0 50px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />

            {/* Comic Floating Reaction Sticker on Artwork */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 24,
                backgroundColor: "#FACC15",
                color: "#000",
                fontWeight: 900,
                fontSize: 30,
                padding: "12px 30px",
                borderRadius: 22,
                border: "4px solid #000",
                boxShadow: "0 8px 0 #000",
                transform: "rotate(-5deg)",
              }}
            >
              {stickerText}
            </div>
          </div>

          {/* Lower Section: Massive Title & Curiosity Hook */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              textAlign: "center",
            }}
          >
            {/* Title with 3D Drop Shadow */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transform: "rotate(-2deg)",
                filter: "drop-shadow(0 16px 32px rgba(0, 0, 0, 0.95))",
              }}
            >
              <div
                style={{
                  fontSize: 90,
                  fontWeight: 900,
                  lineHeight: 0.92,
                  color: "#FFFFFF",
                  WebkitTextStroke: "6px #000000",
                  letterSpacing: "-0.01em",
                }}
              >
                {headlineTop}
              </div>
              <div
                style={{
                  fontSize: 114,
                  fontWeight: 900,
                  lineHeight: 0.92,
                  color: "#FDE047",
                  WebkitTextStroke: "7px #000000",
                  letterSpacing: "-0.01em",
                  textShadow: "0 10px 0 #B45309",
                }}
              >
                {headlineBottom}
              </div>
            </div>

            {/* Secondary Curiosity Gap Hook Sticker */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 16,
                padding: "18px 36px",
                borderRadius: 24,
                backgroundColor: "#38BDF8",
                border: "5px solid #000000",
                boxShadow: "0 12px 0 #0284C7, 0 20px 40px rgba(0,0,0,0.7)",
                transform: "rotate(1.5deg)",
              }}
            >
              <span style={{ fontSize: 38 }}>{hookEmoji}</span>
              <span
                style={{
                  color: "#000000",
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                }}
              >
                {hookText}
              </span>
            </div>

            {/* Sub-Pill Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 8,
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(8px)",
                  padding: "10px 22px",
                  borderRadius: 14,
                  border: "2px solid rgba(255, 255, 255, 0.25)",
                  color: "#FCD34D",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {attributionPill}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LANDSCAPE 16:9 BEDTIME VARIANT
  // ==========================================
  if (variant === "bedtime") {
    return (
      <div
        style={{
          width: 1920,
          height: 1080,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#060913",
          fontFamily: "'Segoe UI', 'SF Pro Display', -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Ambient Darkened Background with Magical Glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "scale(1.1)",
            filter: "blur(32px) brightness(0.35) saturate(1.4)",
            zIndex: 1,
          }}
        >
          {bgSrc ? (
            <Img src={bgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #0F172A 100%)",
              }}
            />
          )}
        </div>

        {/* Deep Midnight Blue Gradient & Starfield Lighting */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 75% 35%, rgba(99, 102, 241, 0.25) 0%, rgba(15, 23, 42, 0.7) 60%, rgba(2, 6, 23, 0.95) 100%)",
            zIndex: 2,
          }}
        />

        {/* Decorative Golden Ambient Rim */}
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: "2px solid rgba(251, 191, 36, 0.25)",
            borderRadius: 24,
            pointerEvents: "none",
            zIndex: 3,
          }}
        />

        {/* Content Container (2-Column Balanced Layout - Edge-to-Edge Fill) */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 54px",
            boxSizing: "border-box",
            justifyContent: "space-between",
          }}
        >
          {/* Left: Elegant Storybook Typography */}
          <div
            style={{
              width: "52%",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 18,
            }}
          >
            {/* Bedtime / Read-Aloud Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 24px",
                borderRadius: 999,
                background: "linear-gradient(135deg, rgba(30, 27, 75, 0.9), rgba(67, 56, 202, 0.8))",
                border: "2px solid rgba(251, 191, 36, 0.8)",
                boxShadow: "0 0 25px rgba(251, 191, 36, 0.35)",
              }}
            >
              <span style={{ fontSize: 26 }}>🌙</span>
              <span
                style={{
                  color: "#FDE047",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {isEn ? "Bedtime Read-Aloud" : "Dongeng Sebelum Tidur"}
              </span>
            </div>

            {/* Main Storybook Title */}
            <h1
              style={{
                margin: 0,
                fontSize: 84,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                background: "linear-gradient(180deg, #FFFFFF 0%, #FEF08A 50%, #F59E0B 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.85))",
                maxWidth: 900,
              }}
            >
              {bedtimeTitle}
            </h1>

            {/* Sub-hook / Emotional Selling Point */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 26px",
                background: "rgba(15, 23, 42, 0.75)",
                backdropFilter: "blur(12px)",
                borderRadius: 16,
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <span style={{ fontSize: 24 }}>✨</span>
              <span
                style={{
                  color: "#E2E8F0",
                  fontSize: 26,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                }}
              >
                {bedtimeHook}
              </span>
            </div>

            {/* Credits Tag */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 10,
                color: "#94A3B8",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <span>{isEn ? "Written by:" : "Karya:"} {authorName}</span>
              <span>•</span>
              <span>{isEn ? "Illustrated by:" : "Ilustrasi:"} {illustratorName}</span>
            </div>
          </div>

          {/* Right: Gilded Storybook Floating Centerpiece (Maximized Scale) */}
          <div
            style={{
              width: "48%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 860,
                height: 680,
                position: "relative",
                borderRadius: 40,
                overflow: "hidden",
                boxShadow:
                  "0 40px 105px rgba(0, 0, 0, 0.95), 0 0 75px rgba(251, 191, 36, 0.5)",
                border: "8px solid rgba(251, 191, 36, 0.95)",
                transform: "rotate(2deg)",
                backgroundColor: "#0B0F19",
              }}
            >
              {heroSrc ? (
                <Img
                  src={heroSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <ProceduralIllustration
                  scene={{ index: 0, type: "cover" }}
                  book={book}
                  isVertical={false}
                  isCover={true}
                  showTitle={false}
                />
              )}

              {/* Gold Ribbon Seal on Picture Corner */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  background: "linear-gradient(135deg, #F59E0B, #B45309)",
                  color: "#FFF",
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: "0.06em",
                  padding: "8px 18px",
                  borderRadius: 10,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  textTransform: "uppercase",
                }}
              >
                {isEn ? "Picture Book" : "Buku Bergambar"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // POPULAR COMIC ACTION HOOK (HIGH CTR FORMAT)
  // ==========================================
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B0F1A",
        fontFamily: "'Arial Black', 'Impact', 'Montserrat', -apple-system, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* High Saturation Action Background Plate */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: "scale(1.08)",
          filter: "brightness(0.55) saturate(1.5) contrast(1.1)",
          zIndex: 1,
        }}
      >
        {bgSrc ? (
          <Img src={bgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #0F172A 100%)",
            }}
          />
        )}
      </div>

      {/* Dramatic Action Radial Lighting & Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(11, 15, 26, 0.95) 0%, rgba(11, 15, 26, 0.8) 50%, rgba(11, 15, 26, 0.25) 100%)",
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 80% 50%, rgba(251, 191, 36, 0.25) 0%, transparent 60%)",
          zIndex: 3,
        }}
      />

      {/* Comic Action Sunburst / Radial Accents */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, transparent 70%)",
          zIndex: 4,
          filter: "blur(50px)",
        }}
      />

      {/* Main Container (Edge-to-Edge Composition & Zero Dead Space) */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 48px",
          boxSizing: "border-box",
          justifyContent: "space-between",
        }}
      >
        {/* Left Side: Massive High-Energy Headline & Hook */}
        <div
          style={{
            width: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          {/* Top Pill / Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 26px",
              borderRadius: 16,
              backgroundColor: "#EF4444",
              border: "3px solid #FFFFFF",
              boxShadow: "0 8px 24px rgba(239, 68, 68, 0.7)",
              transform: "rotate(-1.5deg)",
            }}
          >
            <span style={{ fontSize: 26 }}>🔥</span>
            <span
              style={{
                color: "#FFFFFF",
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {badgeText}
            </span>
          </div>

          {/* Massive Comic Headline with 3D Drop Shadow & Dark Stroke */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              transform: "rotate(-2deg)",
              filter: "drop-shadow(0 16px 32px rgba(0, 0, 0, 0.95))",
            }}
          >
            <div
              style={{
                fontSize: 90,
                fontWeight: 900,
                lineHeight: 0.92,
                color: "#FFFFFF",
                WebkitTextStroke: "6px #000000",
                letterSpacing: "-0.01em",
              }}
            >
              {headlineTop}
            </div>
            <div
              style={{
                fontSize: 116,
                fontWeight: 900,
                lineHeight: 0.92,
                color: "#FDE047",
                WebkitTextStroke: "7px #000000",
                letterSpacing: "-0.01em",
                textShadow: "0 10px 0 #B45309",
              }}
            >
              {headlineBottom}
            </div>
          </div>

          {/* Secondary Curiosity Gap Hook Sticker */}
          <div
            style={{
              marginTop: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 32px",
              borderRadius: 22,
              backgroundColor: "#38BDF8",
              border: "4px solid #000000",
              boxShadow: "0 10px 0 #0284C7, 0 18px 36px rgba(0,0,0,0.7)",
              transform: "rotate(1.5deg)",
            }}
          >
            <span style={{ fontSize: 36 }}>{hookEmoji}</span>
            <span
              style={{
                color: "#000000",
                fontSize: 36,
                fontWeight: 900,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
              }}
            >
              {hookText}
            </span>
          </div>

          {/* Bottom Trust/Quality Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 10,
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(8px)",
                padding: "8px 20px",
                borderRadius: 12,
                border: "1.5px solid rgba(255, 255, 255, 0.25)",
                color: "#F1F5F9",
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              {isEn ? "🎬 Full Story Animation" : "🎬 Full Animasi Cerita"}
            </div>
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(8px)",
                padding: "8px 20px",
                borderRadius: 12,
                border: "1.5px solid rgba(255, 255, 255, 0.25)",
                color: "#FCD34D",
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              {attributionPill}
            </div>
          </div>
        </div>

        {/* Right Side: Comic Character Hero Frame with Sticker Cutout Border (Fills Right Half) */}
        <div
          style={{
            width: "50%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* Visual Sticker Badge */}
          <div
            style={{
              width: 860,
              height: 720,
              position: "relative",
              borderRadius: 48,
              overflow: "hidden",
              border: "14px solid #FFFFFF",
              boxShadow:
                "0 40px 105px rgba(0, 0, 0, 0.95), 0 0 80px rgba(253, 224, 71, 0.5)",
              transform: "rotate(2.2deg)",
              backgroundColor: "#1E293B",
            }}
          >
            {heroSrc ? (
              <Img
                src={heroSrc}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <ProceduralIllustration
                scene={{ index: 0, type: "cover" }}
                book={book}
                isVertical={true}
                isCover={true}
                showTitle={false}
              />
            )}

            {/* Inner Dramatic Vignette */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: "inset 0 0 45px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />

            {/* Comic Floating Reaction Sticker */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 24,
                backgroundColor: "#FACC15",
                color: "#000",
                fontWeight: 900,
                fontSize: 28,
                padding: "12px 28px",
                borderRadius: 18,
                border: "4px solid #000",
                boxShadow: "0 8px 0 #000",
                transform: "rotate(-5deg)",
              }}
            >
              {stickerText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
