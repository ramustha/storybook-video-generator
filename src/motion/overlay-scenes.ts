/**
 * Unified Intro (Cover Attribution), Moral, and Outro (Subscribe CTA) Overlays
 *
 * Matches Zayn Storybook brand language from `CoverScene.tsx`, `MoralScene.tsx`,
 * and `OutroScene.tsx` inside the Alt 1 Kurzgesagt Cinema Focus layout, with
 * strict safe-area clearance above `#narrator-dock` in both 9:16 and 16:9.
 */

import { BookMetadataSpec, MoralSpec, OutroSpec } from "./edu-motion-spec";

function escapeHtml(s: string | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOverlayScenesCss(): string {
  return `
  .scene-overlay {
    position: absolute;
    left: 48px;
    right: 48px;
    top: 178px;
    bottom: 678px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    opacity: 0;
  }
  body.landscape .scene-overlay {
    left: 96px;
    right: 96px;
    top: 44px;
    bottom: 276px;
  }

  .overlay-backdrop-card {
    width: 100%;
    max-width: 920px;
    background: linear-gradient(160deg, rgba(10, 22, 52, 0.95), rgba(5, 13, 34, 0.97));
    backdrop-filter: blur(12px);
    border: 3.5px solid rgba(0, 245, 212, 0.55);
    border-radius: 36px;
    padding: 36px 38px;
    box-shadow: 0 28px 68px rgba(0, 0, 0, 0.72), 0 0 42px rgba(0, 245, 212, 0.16);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 20px;
  }
  body.landscape .overlay-backdrop-card {
    max-width: 1320px;
    flex-direction: row;
    text-align: left;
    padding: 34px 48px;
    gap: 44px;
  }
  body.landscape .overlay-backdrop-card.centered-col {
    flex-direction: column;
    text-align: center;
    max-width: 1040px;
    gap: 20px;
  }

  /* INTRO BOOK COVER 3D FRAME */
  .cover-frame {
    position: relative;
    width: 390px;
    max-height: 520px;
    aspect-ratio: 3 / 4;
    border-radius: 26px;
    padding: 10px;
    background: linear-gradient(135deg, #FFE600, #00F5D4, #38BDF8);
    box-shadow: 0 22px 46px rgba(0, 0, 0, 0.65);
    transform: perspective(900px) rotateY(-5deg) rotate(-1.5deg);
    flex-shrink: 0;
  }
  body.landscape .cover-frame {
    width: 360px;
    max-height: 490px;
  }
  .cover-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 18px;
    display: block;
    background: #0F172A;
  }

  .overlay-kicker {
    display: inline-block;
    padding: 9px 22px;
    border-radius: 999px;
    background: rgba(255, 230, 0, 0.16);
    border: 2px solid #FFE600;
    color: #FFE600;
    font-family: "JetBrains Mono", monospace;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .overlay-title {
    margin: 0;
    font-family: "Fredoka", sans-serif;
    font-size: 52px;
    line-height: 1.12;
    font-weight: 700;
    color: #FFFFFF;
    text-shadow: 0 5px 18px rgba(0, 0, 0, 0.65);
  }
  body.landscape .overlay-title {
    font-size: 54px;
  }
  .overlay-credits {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  body.landscape .overlay-credits {
    justify-content: flex-start;
  }
  .credit-pill {
    padding: 9px 18px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.10);
    border: 1.5px solid rgba(255, 255, 255, 0.24);
    color: #E2E8F0;
    font-family: "Plus Jakarta Sans", sans-serif;
    font-size: 22px;
    font-weight: 800;
  }
  .credit-pill.accent {
    background: rgba(0, 245, 212, 0.16);
    border-color: rgba(0, 245, 212, 0.55);
    color: #7DD3FC;
  }

  /* MORAL SCENE CARD */
  .moral-card {
    border-color: rgba(251, 191, 36, 0.72);
    box-shadow: 0 28px 68px rgba(0, 0, 0, 0.75), 0 0 48px rgba(251, 191, 36, 0.24);
  }
  .moral-pill {
    background: rgba(251, 191, 36, 0.20);
    border: 2.5px solid #FBBF24;
    color: #FDE047;
    font-size: 24px;
    padding: 10px 26px;
    border-radius: 999px;
    font-family: "Fredoka", sans-serif;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .moral-body {
    margin: 0;
    font-family: "Plus Jakarta Sans", sans-serif;
    font-size: 30px;
    line-height: 1.38;
    font-weight: 700;
    color: #FEF3C7;
    max-width: 780px;
  }

  /* OUTRO SUBSCRIBE CTA CARD */
  .outro-card {
    border-color: rgba(244, 63, 94, 0.72);
    box-shadow: 0 28px 68px rgba(0, 0, 0, 0.78), 0 0 48px rgba(244, 63, 94, 0.24);
  }
  .outro-channel {
    font-family: "JetBrains Mono", monospace;
    font-size: 26px;
    font-weight: 800;
    color: #00F5D4;
    background: rgba(0, 245, 212, 0.14);
    border: 2px solid #00F5D4;
    padding: 10px 26px;
    border-radius: 999px;
  }
  .subscribe-cta {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 18px 42px;
    border-radius: 999px;
    background: linear-gradient(135deg, #EF4444, #EC4899);
    border: 3.5px solid #FFFFFF;
    color: #FFFFFF;
    font-family: "Fredoka", sans-serif;
    font-size: 36px;
    font-weight: 700;
    letter-spacing: 1px;
    box-shadow: 0 14px 34px rgba(239, 68, 68, 0.55);
  }
  .next-story-box {
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 230, 0, 0.45);
    border-radius: 22px;
    padding: 16px 28px;
    color: #FDE047;
    font-family: "Plus Jakarta Sans", sans-serif;
    font-size: 24px;
    font-weight: 800;
  }`;
}

export function buildOverlayScenesHtml(options: {
  lang: "id" | "en";
  book: BookMetadataSpec;
  moral: MoralSpec;
  outro?: OutroSpec;
  coverDataUri?: string;
}): string {
  const { lang, book, moral, outro, coverDataUri } = options;
  const isEn = lang === "en";

  const displayTitle = isEn ? book.originalTitle : book.title;
  const themeLabel = book.theme || (isEn ? "Kids Edu-Motion" : "Edukasi Anak");
  const authorLabel = isEn ? `Author: ${book.author}` : `Penulis: ${book.author}`;
  const illustratorText = book.illustrator && book.illustrator !== "-" ? book.illustrator : null;
  const illustratorLabel = illustratorText
    ? isEn
      ? `Illustrator: ${illustratorText}`
      : `Ilustrator: ${illustratorText}`
    : null;
  const licenseLabel = book.license || (isEn ? "Kemendikdasmen RI Open License" : "Lisensi Terbuka Kemendikdasmen RI");

  const moralBadge = isEn ? "✨ MORAL OF THE STORY ✨" : "✨ PESAN MORAL CERITA ✨";
  const moralHeadline = isEn ? moral.headlineEn : moral.headlineId;
  const moralSpoken = isEn ? moral.spokenEn : moral.spokenId;

  const handle = outro?.channelHandle || "@zayn.storybook";
  const outroBadge = isEn ? "🌟 WATCH NEXT ADVENTURE 🌟" : "🌟 TONTON PETUALANGAN BERIKUTNYA 🌟";
  const ctaLabel = isEn ? outro?.ctaLabelEn || "SUBSCRIBE & LIKE 🔔" : outro?.ctaLabelId || "SUBSCRIBE & LIKE 🔔";
  const nextTitle = isEn ? outro?.nextTitleEn : outro?.nextTitleId;
  const nextPrefix = isEn ? "Next Up: " : "Episode Berikutnya: ";

  return `
  <!-- INTRO COVER & CREDITS OVERLAY (Matches CoverScene.tsx attribution) -->
  <section id="overlay-intro" class="scene-overlay">
    <div class="overlay-backdrop-card">
      ${
        coverDataUri
          ? `<div class="cover-frame"><img src="${coverDataUri}" alt="${escapeHtml(displayTitle)}" /></div>`
          : ""
      }
      <div style="display:flex;flex-direction:column;gap:16px;align-items:inherit;">
        <div><span class="overlay-kicker">📚 KEMENDIKDASMEN • ${escapeHtml(themeLabel)}</span></div>
        <h1 class="overlay-title">${escapeHtml(displayTitle)}</h1>
        <div class="overlay-credits">
          <span class="credit-pill">✍️ ${escapeHtml(authorLabel)}</span>
          ${illustratorLabel ? `<span class="credit-pill">🎨 ${escapeHtml(illustratorLabel)}</span>` : ""}
          <span class="credit-pill accent">📖 ${escapeHtml(licenseLabel)}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- MORAL TAKEAWAY OVERLAY (Matches MoralScene.tsx) -->
  <section id="overlay-moral" class="scene-overlay">
    <div class="overlay-backdrop-card centered-col moral-card">
      <div class="moral-pill">${escapeHtml(moralBadge)}</div>
      <h2 class="overlay-title" style="color:#FDE047;">${escapeHtml(moralHeadline)}</h2>
      <p class="moral-body">${escapeHtml(moralSpoken)}</p>
    </div>
  </section>

  <!-- OUTRO SUBSCRIBE CTA OVERLAY (Matches OutroScene.tsx) -->
  <section id="overlay-outro" class="scene-overlay">
    <div class="overlay-backdrop-card centered-col outro-card">
      <div class="moral-pill" style="background:rgba(244,63,94,0.18);border-color:#FB7185;color:#FECDD3;">${escapeHtml(outroBadge)}</div>
      <div class="outro-channel">${escapeHtml(handle)}</div>
      <div id="outro-sub-btn" class="subscribe-cta">▶ ${escapeHtml(ctaLabel)}</div>
      ${
        nextTitle
          ? `<div class="next-story-box">${escapeHtml(nextPrefix)}${escapeHtml(nextTitle)}</div>`
          : ""
      }
    </div>
  </section>`;
}
