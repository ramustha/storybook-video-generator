import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import { ProceduralIllustration } from "./ProceduralIllustration";
import { computeThumbnailHeroFrame } from "./artworkLayout";

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
    coverOrientation?: "portrait" | "landscape" | "square";
    coverAspectRatio?: number;
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
  heroWidth?: number;
  heroHeight?: number;
  heroAspectRatio?: number;
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

function scaleFontByLength(baseSize: number, text: string, softLimit: number, minSize: number): number {
  const len = text.trim().length;
  if (len <= softLimit) return baseSize;
  const ratio = softLimit / len;
  return Math.max(minSize, Math.round(baseSize * (0.45 + 0.55 * ratio)));
}

interface HeroCardProps {
  heroSrc: string | null;
  backdropSrc: string | null;
  heroWidth?: number;
  heroHeight?: number;
  heroAspectRatio?: number;
  layout: "landscape" | "portrait" | "vertical";
  borderColor: string;
  glowColor: string;
  rotationDeg: number;
  stickerText?: string;
  ribbonText?: string;
  book: ThumbnailProps["book"];
}

const ThumbnailHeroCard: React.FC<HeroCardProps> = ({
  heroSrc,
  backdropSrc,
  heroWidth,
  heroHeight,
  heroAspectRatio,
  layout,
  borderColor,
  glowColor,
  rotationDeg,
  ribbonText,
  book,
}) => {
  const frame = computeThumbnailHeroFrame({
    imageWidth: heroWidth,
    imageHeight: heroHeight,
    imageAspectRatio: heroAspectRatio,
    layout,
  });

  const blurLayerSrc = heroSrc || backdropSrc;
  // Pattern T1: Wide panoramic strips (like Bheema / Sringeri 3.5:1) span full edge-to-edge width cleanly
  // with vertical fade-into-canvas gradients instead of awkward thick borders & matte bars.
  const isPanoramicEdgeBleed = Boolean(heroSrc && frame.aspectRatio > 2.1 && layout !== "landscape");

  if (isPanoramicEdgeBleed && heroSrc) {
    const bleedH = Math.max(260, Math.min(layout === "vertical" ? 480 : 400, Math.round(1080 / Math.min(4.2, frame.aspectRatio))));
    return (
      <div
        style={{
          width: 1080,
          height: bleedH,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#070B14",
          flexShrink: 0,
        }}
      >
        {blurLayerSrc && (
          <Img
            src={blurLayerSrc}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scale(1.12)",
              filter: "blur(32px) brightness(0.45) saturate(1.2)",
            }}
          />
        )}
        <Img
          src={heroSrc}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, #070B14 0%, rgba(7,11,20,0) 16%, rgba(7,11,20,0) 84%, #070B14 100%)",
            pointerEvents: "none",
          }}
        />
        {ribbonText && (
          <div
            style={{
              position: "absolute",
              top: 22,
              right: 28,
              background: "linear-gradient(135deg, #F59E0B, #B45309)",
              color: "#FFF",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "0.06em",
              padding: "7px 16px",
              borderRadius: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              textTransform: "uppercase",
            }}
          >
            {ribbonText}
          </div>
        )}
      </div>
    );
  }

  const radius = layout === "landscape" ? 30 : layout === "vertical" ? 28 : 26;
  const borderWidth = layout === "landscape" ? 5 : 4;
  const effectiveRotation = layout === "landscape" ? rotationDeg * 0.6 : 0;

  return (
    <div
      style={{
        width: frame.width,
        height: frame.height,
        position: "relative",
        borderRadius: radius,
        overflow: "hidden",
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: `0 24px 64px rgba(0, 0, 0, 0.92), 0 0 48px ${glowColor}`,
        transform: `rotate(${effectiveRotation}deg)`,
        backgroundColor: "#070B14",
        flexShrink: 0,
      }}
    >
      {heroSrc ? (
        <>
          {frame.useContainBackdrop && blurLayerSrc && (
            <Img
              src={blurLayerSrc}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scale(1.16)",
                filter: "blur(30px) brightness(0.42) saturate(1.2)",
              }}
            />
          )}
          <Img
            src={heroSrc}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              objectFit: frame.useContainBackdrop ? "contain" : "cover",
            }}
          />
        </>
      ) : (
        <ProceduralIllustration
          scene={{ index: 0, type: "cover" }}
          book={book}
          isVertical={layout === "vertical"}
          isCover={true}
          showTitle={false}
        />
      )}

      {ribbonText && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "linear-gradient(135deg, #F59E0B, #B45309)",
            color: "#FFF",
            fontWeight: 800,
            fontSize: layout === "landscape" ? 18 : 16,
            letterSpacing: "0.06em",
            padding: "7px 16px",
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            textTransform: "uppercase",
          }}
        >
          {ribbonText}
        </div>
      )}
    </div>
  );
};

interface HookBannerProps {
  text: string;
  emoji: string;
  isBedtime: boolean;
  fontSize: number;
  maxWidth: number;
}

const ThumbnailHookBanner: React.FC<HookBannerProps> = ({
  text,
  emoji,
  isBedtime,
  fontSize,
  maxWidth,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      padding: isBedtime ? "14px 32px" : "15px 34px",
      borderRadius: 20,
      background: isBedtime
        ? "rgba(15, 23, 42, 0.94)"
        : "linear-gradient(135deg, #E11D48 0%, #9F1239 100%)",
      border: isBedtime
        ? "2.5px solid rgba(251, 191, 36, 0.8)"
        : "3px solid rgba(255, 255, 255, 0.9)",
      boxShadow: isBedtime
        ? "0 12px 28px rgba(0,0,0,0.72)"
        : "0 10px 0 #4C0519, 0 20px 38px rgba(225, 29, 72, 0.45)",
      maxWidth,
      boxSizing: "border-box",
    }}
  >
    <span style={{ fontSize: Math.round(fontSize * 1.08), flexShrink: 0 }}>{emoji}</span>
    <span
      style={{
        color: isBedtime ? "#FEF08A" : "#FFFFFF",
        fontSize,
        fontWeight: 900,
        lineHeight: 1.16,
        letterSpacing: isBedtime ? "0.01em" : "0.02em",
        textTransform: isBedtime ? "none" : "uppercase",
        textShadow: isBedtime ? "none" : "0 3px 8px rgba(0, 0, 0, 0.75)",
      }}
    >
      {text}
    </span>
  </div>
);

interface HeadlineProps {
  top: string;
  bottom: string;
  topSize: number;
  bottomSize: number;
  maxWidth: number;
  align?: "center" | "left";
}

const ThumbnailHeadline: React.FC<HeadlineProps> = ({
  top,
  bottom,
  topSize,
  bottomSize,
  maxWidth,
  align = "center",
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: align === "left" ? "flex-start" : "center",
      textAlign: align,
      maxWidth,
      gap: 2,
      filter: "drop-shadow(0 10px 22px rgba(0, 0, 0, 0.95))",
    }}
  >
    <div
      style={{
        fontSize: topSize,
        fontWeight: 900,
        lineHeight: 1.0,
        color: "#FFFFFF",
        WebkitTextStroke: "2px #070B14",
        textShadow: "0 4px 0 #070B14, 0 8px 18px rgba(0, 0, 0, 0.9)",
        letterSpacing: "-0.015em",
      }}
    >
      {top}
    </div>
    <div
      style={{
        fontSize: bottomSize,
        fontWeight: 900,
        lineHeight: 1.0,
        color: "#FDE047",
        WebkitTextStroke: "2.5px #070B14",
        textShadow: "0 5px 0 #78350F, 0 10px 22px rgba(0, 0, 0, 0.95)",
        letterSpacing: "-0.015em",
      }}
    >
      {bottom}
    </div>
  </div>
);

export const StorybookThumbnailComposition: React.FC<ThumbnailProps> = ({
  book,
  lang = "id",
  variant = "popular",
  orientation,
  heroImagePath,
  backdropImagePath,
  heroWidth,
  heroHeight,
  heroAspectRatio,
  customHeadline,
  customHook,
}) => {
  const videoConfig = useVideoConfig();
  const width = videoConfig?.width || 1920;
  const height = videoConfig?.height || 1080;
  const isPortrait = orientation === "portrait" || (height === 1350 && width === 1080);
  const isVertical = orientation === "vertical" || (height > width && !isPortrait);
  const isEn = lang === "en";
  const isBedtime = variant === "bedtime";

  // Dynamic book metadata
  const rawTitle = isEn ? (book.originalTitle || book.title) : book.title;
  const config: ThumbnailConfig =
    book.thumbnailConfig?.[lang] || (book as any).thumbnail?.[lang] || {};

  const hasHero = Boolean(heroImagePath);
  const hasBg = Boolean(backdropImagePath);

  const bgSrc = hasBg ? staticFile(backdropImagePath!) : null;
  const heroSrc = hasHero ? staticFile(heroImagePath!) : null;
  const effectiveHeroRatio =
    heroAspectRatio ||
    (heroWidth && heroHeight ? heroWidth / heroHeight : undefined) ||
    book.coverAspectRatio;

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
    (isEn ? "Kids Storybook" : "Cerita Anak!");

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
  // PORTRAIT 4:5 THUMBNAIL (IG FEED, CAROUSEL & FB ANNOUNCEMENT)
  // Core badge + hero art + title + CTA fit safely inside center 1:1 grid crop (Y: 135..1215)
  // ==========================================
  if (isPortrait) {
    const portTopSize = scaleFontByLength(60, isBedtime ? bedtimeTitle : headlineTop, 16, 42);
    const portBottomSize = scaleFontByLength(74, isBedtime ? bedtimeTitle : headlineBottom, 16, 48);
    const portHookText = isBedtime ? bedtimeHook : hookText;
    const portHookSize = scaleFontByLength(isBedtime ? 30 : 34, portHookText, 26, 25);

    return (
      <div
        style={{
          width: 1080,
          height: 1350,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#060913",
          fontFamily: isBedtime
            ? "'Segoe UI', 'SF Pro Display', -apple-system, sans-serif"
            : "'Arial Black', 'Impact', 'Montserrat', -apple-system, sans-serif",
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
            filter: isBedtime
              ? "brightness(0.32) saturate(1.4) blur(42px)"
              : "brightness(0.36) saturate(1.55) blur(40px)",
            zIndex: 1,
          }}
        >
          {bgSrc || heroSrc ? (
            <Img src={(bgSrc || heroSrc)!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            background: isBedtime
              ? "radial-gradient(circle at 50% 42%, rgba(99, 102, 241, 0.24) 0%, rgba(2, 6, 23, 0.92) 100%)"
              : "radial-gradient(circle at 50% 45%, rgba(15, 23, 42, 0.14) 0%, rgba(2, 6, 23, 0.92) 100%)",
            zIndex: 2,
          }}
        />

        {/* Top Edge Channel Strip (outside 1:1 crop zone so feed gets branding without crowding grid core) */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: 120,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 14,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 22px",
              borderRadius: 999,
              backgroundColor: "rgba(15, 23, 42, 0.85)",
              border: "1.5px solid rgba(253, 224, 71, 0.45)",
              color: "#FDE047",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "0.06em",
            }}
          >
            <span>{isBedtime ? "🌙 ZAYN STORYBOOK BEDTIME" : "⭐ ZAYN STORYBOOK"}</span>
            {licenseShort && <span style={{ color: "rgba(255,255,255,0.65)" }}>• {licenseShort}</span>}
          </div>
        </div>

        {/* CENTER 1:1 IG-GRID SAFE ZONE (Y: 135..1215 = 1080px tall) */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: 1080,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 0",
            boxSizing: "border-box",
          }}
        >
          {/* Single Sleek Category Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 26px",
              borderRadius: 999,
              background: isBedtime
                ? "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(67, 56, 202, 0.9))"
                : "rgba(15, 23, 42, 0.92)",
              border: "2.5px solid rgba(253, 224, 71, 0.85)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.65)",
            }}
          >
            <span style={{ fontSize: 22 }}>{isBedtime ? "🌙" : "🔥"}</span>
            <span
              style={{
                color: "#FDE047",
                fontSize: 21,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {isBedtime ? (isEn ? "Bedtime Read-Aloud" : "Dongeng Sebelum Tidur") : badgeText}
            </span>
          </div>

          {/* Aspect-Aligned / Edge-Bleed Hero Artwork */}
          <ThumbnailHeroCard
            heroSrc={heroSrc}
            backdropSrc={bgSrc}
            heroWidth={heroWidth}
            heroHeight={heroHeight}
            heroAspectRatio={effectiveHeroRatio}
            layout="portrait"
            borderColor={isBedtime ? "rgba(251, 191, 36, 0.92)" : "#FDE047"}
            glowColor={isBedtime ? "rgba(251, 191, 36, 0.35)" : "rgba(253, 224, 71, 0.35)"}
            rotationDeg={0}
            ribbonText={isBedtime ? (isEn ? "Picture Book" : "Buku Bergambar") : undefined}
            book={book}
          />

          {/* Auto-Scaled Headline + Oversized High-Contrast CTA Hook */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
              width: "100%",
              padding: "0 44px",
              boxSizing: "border-box",
            }}
          >
            {isBedtime ? (
              <div
                style={{
                  fontSize: scaleFontByLength(66, bedtimeTitle, 20, 44),
                  fontWeight: 900,
                  lineHeight: 1.06,
                  maxWidth: 940,
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FEF08A 55%, #F59E0B 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.9))",
                }}
              >
                {bedtimeTitle}
              </div>
            ) : (
              <ThumbnailHeadline
                top={headlineTop}
                bottom={headlineBottom}
                topSize={portTopSize}
                bottomSize={portBottomSize}
                maxWidth={960}
              />
            )}

            <ThumbnailHookBanner
              text={portHookText}
              emoji={isBedtime ? "✨" : hookEmoji}
              isBedtime={isBedtime}
              fontSize={portHookSize}
              maxWidth={940}
            />
          </div>
        </div>

        {/* Bottom Edge Footer CTA */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: 150,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 18,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: 18,
              fontWeight: 800,
              color: "rgba(255, 255, 255, 0.85)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <span>▶️ {isEn ? "Watch Full Story on YouTube" : "Tonton di YouTube & Facebook"}</span>
            <span>•</span>
            <span style={{ color: "#FDE047" }}>@zayn.storybook</span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VERTICAL 9:16 THUMBNAIL (SHORTS / REELS)
  // Core stack fits safely inside BOTH Shorts/Reels UI & Instagram 3:4 Profile Grid (Y: 255..1625)
  // ==========================================
  if (isVertical) {
    const vertTopSize = scaleFontByLength(72, headlineTop, 14, 46);
    const vertBottomSize = scaleFontByLength(86, headlineBottom, 13, 48);
    const vertHookSize = scaleFontByLength(38, hookText, 24, 27);

    return (
      <div
        style={{
          width: 1080,
          height: 1920,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#070B14",
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
            filter: "brightness(0.32) saturate(1.45) blur(48px)",
            zIndex: 1,
          }}
        >
          {bgSrc || heroSrc ? (
            <Img src={(bgSrc || heroSrc)!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
              "radial-gradient(circle at center, rgba(15, 23, 42, 0.16) 0%, rgba(2, 6, 23, 0.92) 100%)",
            zIndex: 2,
          }}
        />

        {/* Content Container: Safe for Shorts UI AND Instagram 3:4 Grid Tile (Y: 255..1625) */}
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
            padding: "255px 0 295px 0",
            boxSizing: "border-box",
          }}
        >
          {/* Single Sleek Top Category Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 30px",
              borderRadius: 999,
              backgroundColor: "rgba(15, 23, 42, 0.92)",
              border: "3px solid rgba(253, 224, 71, 0.88)",
              boxShadow: "0 10px 28px rgba(0, 0, 0, 0.65)",
            }}
          >
            <span style={{ fontSize: 26 }}>🔥</span>
            <span
              style={{
                color: "#FDE047",
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {badgeText}
            </span>
          </div>

          {/* Aspect-Aligned / Edge-Bleed Hero Artwork */}
          <ThumbnailHeroCard
            heroSrc={heroSrc}
            backdropSrc={bgSrc}
            heroWidth={heroWidth}
            heroHeight={heroHeight}
            heroAspectRatio={effectiveHeroRatio}
            layout="vertical"
            borderColor="#FDE047"
            glowColor="rgba(253, 224, 71, 0.4)"
            rotationDeg={0}
            book={book}
          />

          {/* Lower Section: Crisp Headline + Oversized High-Contrast Hook Banner */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
              textAlign: "center",
              width: "100%",
              padding: "0 44px",
              boxSizing: "border-box",
            }}
          >
            <ThumbnailHeadline
              top={headlineTop}
              bottom={headlineBottom}
              topSize={vertTopSize}
              bottomSize={vertBottomSize}
              maxWidth={960}
            />

            <ThumbnailHookBanner
              text={hookText}
              emoji={hookEmoji}
              isBedtime={false}
              fontSize={vertHookSize}
              maxWidth={950}
            />

            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.72)",
                backdropFilter: "blur(8px)",
                padding: "8px 22px",
                borderRadius: 14,
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
                fontSize: scaleFontByLength(82, bedtimeTitle, 20, 56),
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

          {/* Right: Gilded Storybook Floating Centerpiece (Aspect-Aligned) */}
          <div
            style={{
              width: "48%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ThumbnailHeroCard
              heroSrc={heroSrc}
              backdropSrc={bgSrc}
              heroWidth={heroWidth}
              heroHeight={heroHeight}
              heroAspectRatio={effectiveHeroRatio}
              layout="landscape"
              borderColor="rgba(251, 191, 36, 0.95)"
              glowColor="rgba(251, 191, 36, 0.45)"
              rotationDeg={1.6}
              ribbonText={isEn ? "Picture Book" : "Buku Bergambar"}
              book={book}
            />
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
          {/* Single Sleek Top Genre Tag */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 26px",
              borderRadius: 999,
              backgroundColor: "rgba(15, 23, 42, 0.92)",
              border: "2.5px solid rgba(253, 224, 71, 0.85)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.65)",
            }}
          >
            <span style={{ fontSize: 24 }}>🔥</span>
            <span
              style={{
                color: "#FDE047",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {badgeText}
            </span>
          </div>

          <ThumbnailHeadline
            top={headlineTop}
            bottom={headlineBottom}
            topSize={scaleFontByLength(88, headlineTop, 15, 58)}
            bottomSize={scaleFontByLength(110, headlineBottom, 15, 66)}
            maxWidth={920}
            align="left"
          />

          <div style={{ marginTop: 6 }}>
            <ThumbnailHookBanner
              text={hookText}
              emoji={hookEmoji}
              isBedtime={false}
              fontSize={scaleFontByLength(38, hookText, 24, 28)}
              maxWidth={900}
            />
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

        {/* Right Side: Aspect-Aligned Comic Character Hero Frame */}
        <div
          style={{
            width: "50%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
          }}
        >
          <ThumbnailHeroCard
            heroSrc={heroSrc}
            backdropSrc={bgSrc}
            heroWidth={heroWidth}
            heroHeight={heroHeight}
            heroAspectRatio={effectiveHeroRatio}
            layout="landscape"
            borderColor="#FDE047"
            glowColor="rgba(253, 224, 71, 0.45)"
            rotationDeg={1.8}
            book={book}
          />
        </div>
      </div>
    </div>
  );
};
