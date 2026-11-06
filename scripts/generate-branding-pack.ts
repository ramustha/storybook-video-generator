import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";

/**
 * Palette Definition - Authentic Storybook (Anti-AI Slop):
 * - Primary Background: Deep Twilight Midnight Navy (#141836 -> #0E1126)
 * - Moon: Luminous Buttery Gold (#FBBF24 -> #F59E0B) with warm amber shadow (#D97706)
 * - Moon's Cap: Robin Egg / Royal Cerulean Blue (#0284C7 -> #0369A1) with warm white trim & gold pompom
 * - Playful Cat: Warm Ginger Marmalade (#F97316 -> #EA580C) with ivory paws & coral pink nose (#FB7185)
 * - Open Book: Gilded Cover (#2E2657) with warm deckled parchment pages (#FFFDF7, #FEF3C7)
 * - Stardust & Magic: Crisp retro 4-point stars in Soft Gold (#FDE047) and Mint Sky (#38BDF8)
 * - Ribbon: Cheerful Warm Crimson (#E11D48)
 * - Typography: Bold rounded storybook serif with dimensional honey shadow
 */

export function generateEmblemSvg(isTransparent = false): string {
  const bgDef = isTransparent
    ? ""
    : `<circle cx="540" cy="540" r="520" fill="url(#twilightSky)" stroke="url(#goldRimGrad)" stroke-width="12" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <!-- Background Gradient (Deep Cozy Storybook Night) -->
    <radialGradient id="twilightSky" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#232959" />
      <stop offset="60%" stop-color="#151938" />
      <stop offset="100%" stop-color="#0B0D1F" />
    </radialGradient>

    <!-- Golden Rim Gradient -->
    <linearGradient id="goldRimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>

    <!-- Warm Moon Gold Gradient -->
    <linearGradient id="moonGrad" x1="15%" y1="0%" x2="85%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="40%" stop-color="#FBBF24" />
      <stop offset="100%" stop-color="#F59E0B" />
    </linearGradient>

    <!-- Cap Blue Gradient (From "Bulan dan Topi Biru") -->
    <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#075985" />
    </linearGradient>

    <!-- Cat Ginger Gradient (From "Gara-Gara Kucing!") -->
    <linearGradient id="catGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FB923C" />
      <stop offset="50%" stop-color="#F97316" />
      <stop offset="100%" stop-color="#EA580C" />
    </linearGradient>

    <!-- Storybook Cover Gradient -->
    <linearGradient id="bookCoverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B356B" />
      <stop offset="100%" stop-color="#1E193B" />
    </linearGradient>

    <!-- Parchment Page Gradient -->
    <linearGradient id="parchmentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#FEF3C7" />
    </linearGradient>

    <!-- Ribbon Gradient (Manu's Red Raincoat Accent) -->
    <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F43F5E" />
      <stop offset="50%" stop-color="#E11D48" />
      <stop offset="100%" stop-color="#BE123C" />
    </linearGradient>

    <!-- Soft Ambient Bloom Filter (Subtle, non-AI) -->
    <filter id="gentleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <!-- Drop Shadow for Dimensional Book & Characters -->
    <filter id="softDropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#060814" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- 1. Background Circle -->
  ${bgDef}

  <!-- 2. Decorative Starlight Ring (Circular Safe-Zone Guide) -->
  <circle cx="540" cy="540" r="460" fill="none" stroke="#FBBF24" stroke-width="2.5" stroke-dasharray="8 16" opacity="0.4" />

  <!-- 3. Ambient Stardust Glow behind Moon & Book -->
  <circle cx="540" cy="460" r="280" fill="#FBBF24" opacity="0.12" filter="url(#gentleGlow)" />
  <circle cx="540" cy="520" r="240" fill="#38BDF8" opacity="0.1" filter="url(#gentleGlow)" />

  <!-- 4. Floating Storybook Starbursts (Hand-drawn 4-point Stars) -->
  <!-- Top Left -->
  <polygon points="260,260 272,286 298,298 272,310 260,336 248,310 222,298 248,286" fill="#FDE047" opacity="0.9" />
  <circle cx="340" cy="220" r="7" fill="#FDE047" opacity="0.8" />
  <circle cx="210" cy="400" r="6" fill="#38BDF8" opacity="0.75" />

  <!-- Top Right -->
  <polygon points="810,250 822,274 846,286 822,298 810,322 798,298 774,286 798,274" fill="#FDE047" opacity="0.9" />
  <circle cx="730" cy="210" r="8" fill="#FDE047" opacity="0.85" />
  <circle cx="860" cy="380" r="6.5" fill="#F472B6" opacity="0.75" />

  <!-- Floating Sparkles around Book -->
  <polygon points="300,560 306,572 318,578 306,584 300,596 294,584 282,578 294,572" fill="#FDE047" opacity="0.7" />
  <polygon points="780,550 786,562 798,568 786,574 780,586 774,574 762,568 774,562" fill="#38BDF8" opacity="0.75" />

  <!-- 5. MAIN HERO: The Glowing Crescent Moon with Blue Cap -->
  <g id="MoonAndCap" filter="url(#softDropShadow)">
    <!-- Golden Crescent Moon -->
    <!-- Center of moon curved body -->
    <path d="M 520 200
             C 660 200, 750 310, 750 440
             C 750 560, 660 650, 530 660
             C 630 600, 680 500, 680 430
             C 680 340, 610 240, 520 200 Z"
          fill="url(#moonGrad)" />

    <!-- Sleeping / Peaceful Smiling Face on Moon -->
    <!-- Closed curved happy eye -->
    <path d="M 675 415 Q 692 430 705 415" fill="none" stroke="#92400E" stroke-width="5" stroke-linecap="round" />
    <!-- Happy gentle smile -->
    <path d="M 660 460 Q 675 478 692 464" fill="none" stroke="#92400E" stroke-width="4.5" stroke-linecap="round" />
    <!-- Rosy cheek blush -->
    <ellipse cx="695" cy="445" rx="14" ry="9" fill="#FB7185" opacity="0.5" />

    <!-- THE ICONIC BLUE CAP (from "Bulan dan Topi Biru") -->
    <g id="BlueCap" transform="translate(485, 125) rotate(-14)">
      <!-- Cap Main Dome -->
      <path d="M 30 110
               C 20 50, 80 15, 130 20
               C 170 25, 200 65, 195 110 Z"
            fill="url(#capGrad)" stroke="#0369A1" stroke-width="3" />

      <!-- Cap Brim / Folded Cuff -->
      <rect x="20" y="100" width="185" height="34" rx="17" fill="#F8FAFC" stroke="#0284C7" stroke-width="3" />
      <line x1="60" y1="102" x2="60" y2="132" stroke="#E2E8F0" stroke-width="2.5" />
      <line x1="110" y1="102" x2="110" y2="132" stroke="#E2E8F0" stroke-width="2.5" />
      <line x1="160" y1="102" x2="160" y2="132" stroke="#E2E8F0" stroke-width="2.5" />

      <!-- Fluffy Golden Pompom on Top -->
      <circle cx="132" cy="16" r="18" fill="#FDE047" stroke="#F59E0B" stroke-width="3" />
      <circle cx="130" cy="14" r="14" fill="#FEF08A" />
      <circle cx="127" cy="10" r="4" fill="#FFFFFF" />
    </g>
  </g>

  <!-- 6. THE PLAYFUL GINGER CAT (from "Gara-Gara Kucing!") Peeking from Left -->
  <g id="StorybookCat" transform="translate(250, 420)" filter="url(#softDropShadow)">
    <!-- Cat Ears -->
    <polygon points="50,60 70,10 95,50" fill="url(#catGrad)" stroke="#C2410C" stroke-width="3" />
    <polygon points="58,55 72,25 87,48" fill="#FED7AA" />

    <polygon points="125,50 150,10 170,60" fill="url(#catGrad)" stroke="#C2410C" stroke-width="3" />
    <polygon points="133,48 148,25 162,55" fill="#FED7AA" />

    <!-- Cat Head Round Silhouette -->
    <ellipse cx="110" cy="85" rx="60" ry="50" fill="url(#catGrad)" stroke="#C2410C" stroke-width="3" />

    <!-- Tabby Forehead Stripes -->
    <path d="M 110 45 L 110 65" stroke="#C2410C" stroke-width="4.5" stroke-linecap="round" />
    <path d="M 95 48 L 100 64" stroke="#C2410C" stroke-width="4" stroke-linecap="round" />
    <path d="M 125 48 L 120 64" stroke="#C2410C" stroke-width="4" stroke-linecap="round" />

    <!-- Big Curious Cheerful Eyes -->
    <ellipse cx="88" cy="82" rx="11" ry="14" fill="#FEF08A" stroke="#451A03" stroke-width="3" />
    <ellipse cx="89" cy="82" rx="6" ry="11" fill="#1C1917" />
    <circle cx="86" cy="76" r="3.5" fill="#FFFFFF" />

    <ellipse cx="132" cy="82" rx="11" ry="14" fill="#FEF08A" stroke="#451A03" stroke-width="3" />
    <ellipse cx="131" cy="82" rx="6" ry="11" fill="#1C1917" />
    <circle cx="128" cy="76" r="3.5" fill="#FFFFFF" />

    <!-- Cute Snout & Pink Nose -->
    <ellipse cx="110" cy="98" rx="16" ry="11" fill="#FFF7ED" />
    <polygon points="106,94 114,94 110,100" fill="#FB7185" />
    <path d="M 110 100 Q 104 106 98 102" fill="none" stroke="#7C2D12" stroke-width="3" stroke-linecap="round" />
    <path d="M 110 100 Q 116 106 122 102" fill="none" stroke="#7C2D12" stroke-width="3" stroke-linecap="round" />

    <!-- Whiskers -->
    <path d="M 72 96 L 42 92" stroke="#FFF7ED" stroke-width="3" stroke-linecap="round" />
    <path d="M 70 104 L 40 106" stroke="#FFF7ED" stroke-width="3" stroke-linecap="round" />
    <path d="M 148 96 L 178 92" stroke="#FFF7ED" stroke-width="3" stroke-linecap="round" />
    <path d="M 150 104 L 180 106" stroke="#FFF7ED" stroke-width="3" stroke-linecap="round" />

    <!-- White Paws Resting on Top of the Book -->
    <ellipse cx="90" cy="135" rx="14" ry="11" fill="#FFFFFF" stroke="#EA580C" stroke-width="2.5" />
    <ellipse cx="130" cy="135" rx="14" ry="11" fill="#FFFFFF" stroke="#EA580C" stroke-width="2.5" />
  </g>

  <!-- 7. THE OPEN MAGICAL STORYBOOK -->
  <g id="OpenStorybook" transform="translate(0, 40)" filter="url(#softDropShadow)">
    <!-- Book Shadow -->
    <ellipse cx="540" cy="670" rx="360" ry="40" fill="#060814" opacity="0.6" />

    <!-- Hardcover Book Base (Rich Royal Indigo with Gold Trim) -->
    <path d="M 200 595 Q 540 660 880 595 L 865 635 Q 540 700 215 635 Z"
          fill="url(#bookCoverGrad)" stroke="#F59E0B" stroke-width="4" />

    <!-- Stacked Parchment Pages (Left Wing) -->
    <path d="M 220 580 Q 520 625 530 540 L 530 565 Q 520 645 220 605 Z" fill="#E2E8F0" />
    <path d="M 225 570 Q 520 615 530 530 L 530 555 Q 520 635 225 595 Z" fill="#F1F5F9" />
    <path d="M 230 558 Q 520 600 530 520 L 530 545 Q 520 625 230 582 Z"
          fill="url(#parchmentGrad)" stroke="#CBD5E1" stroke-width="2" />

    <!-- Stacked Parchment Pages (Right Wing) -->
    <path d="M 860 580 Q 560 625 550 540 L 550 565 Q 560 645 860 605 Z" fill="#E2E8F0" />
    <path d="M 855 570 Q 560 615 550 530 L 550 555 Q 560 635 855 595 Z" fill="#F1F5F9" />
    <path d="M 850 558 Q 560 600 550 520 L 550 545 Q 560 625 850 582 Z"
          fill="url(#parchmentGrad)" stroke="#CBD5E1" stroke-width="2" />

    <!-- Golden Spine Centerpiece -->
    <path d="M 530 520 Q 540 515 550 520 L 550 670 Q 540 675 530 670 Z" fill="url(#goldRimGrad)" />

    <!-- Page Text Illustration Hints (Gentle Gold Flourishes) -->
    <path d="M 280 575 Q 360 585 450 570" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" opacity="0.45" />
    <path d="M 300 592 Q 370 600 440 588" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round" opacity="0.35" />
    <path d="M 630 570 Q 720 585 800 575" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" opacity="0.45" />
    <path d="M 640 588 Q 710 600 780 592" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round" opacity="0.35" />

    <!-- Crimson Bookmark Ribbon hanging gracefully from center -->
    <path d="M 535 660 Q 545 740 580 770 L 605 755 L 590 730 Q 555 700 545 660 Z"
          fill="url(#ribbonGrad)" stroke="#9F1239" stroke-width="2.5" />
  </g>

  <!-- 8. BRAND RIBBON & TYPOGRAPHY -->
  <g id="BrandBanner" transform="translate(0, 10)" filter="url(#softDropShadow)">
    <!-- Banner Shadow -->
    <path d="M 200 780 L 880 780 L 840 890 L 240 890 Z" fill="#060814" opacity="0.5" />

    <!-- Banner Outer Gold Border -->
    <path d="M 190 760
             Q 540 730 890 760
             L 860 880
             Q 540 850 220 880 Z"
          fill="url(#goldRimGrad)" />

    <!-- Banner Inner Deep Navy Plate -->
    <path d="M 200 768
             Q 540 740 880 768
             L 852 870
             Q 540 842 228 870 Z"
          fill="#161938" stroke="#2B3163" stroke-width="2" />

    <!-- Typography: "ZAYN" (Handcrafted Chunky Serif Display) -->
    <!-- Drop Shadow for 3D Warmth -->
    <text x="540" y="828"
          font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
          font-size="64"
          font-weight="900"
          fill="#92400E"
          text-anchor="middle"
          letter-spacing="8">
      ZAYN
    </text>
    <!-- Crisp White/Cream Face -->
    <text x="540" y="824"
          font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
          font-size="64"
          font-weight="900"
          fill="#FFFDF7"
          text-anchor="middle"
          letter-spacing="8">
      ZAYN
    </text>

    <!-- Subtitle: "STORYBOOK" in Golden Spaced Sans -->
    <text x="540" y="855"
          font-family="'Montserrat', 'Century Gothic', sans-serif"
          font-size="18"
          font-weight="800"
          fill="#FDE047"
          text-anchor="middle"
          letter-spacing="11">
      STORYBOOK
    </text>
  </g>

  <!-- 9. Educational Channel Subtitle Tag -->
  <text x="540" y="945"
        font-family="'Nunito', 'Montserrat', sans-serif"
        font-size="19"
        font-weight="700"
        fill="#CBD5E1"
        text-anchor="middle"
        letter-spacing="3"
        opacity="0.9">
    ANIMATED CHILDREN'S BOOKS
  </text>
</svg>`;
}

export function generateIconOnlySvg(): string {
  // Ultra-clean compact version for Favicon (32-512px) and Video Watermark (150px)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="iconBg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#252C5E" />
      <stop offset="100%" stop-color="#0E1126" />
    </radialGradient>
    <linearGradient id="iconMoon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="60%" stop-color="#FBBF24" />
      <stop offset="100%" stop-color="#F59E0B" />
    </linearGradient>
    <linearGradient id="iconCap" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
    <linearGradient id="iconCat" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FB923C" />
      <stop offset="100%" stop-color="#EA580C" />
    </linearGradient>
    <linearGradient id="iconPage" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#FEF3C7" />
    </linearGradient>
  </defs>

  <!-- Background Circle with Gold Border -->
  <circle cx="256" cy="256" r="248" fill="url(#iconBg)" stroke="#F59E0B" stroke-width="12" />

  <!-- Moon Body -->
  <path d="M 230 70
           C 335 70, 400 150, 400 250
           C 400 345, 335 410, 240 420
           C 310 375, 345 305, 345 250
           C 345 180, 295 105, 230 70 Z"
        fill="url(#iconMoon)" />

  <!-- Sleepy Smile & Eye -->
  <path d="M 340 235 Q 352 248 365 235" fill="none" stroke="#92400E" stroke-width="4.5" stroke-linecap="round" />
  <ellipse cx="355" cy="258" rx="10" ry="6" fill="#FB7185" opacity="0.6" />

  <!-- Blue Cap -->
  <g transform="translate(205, 10) rotate(-14)">
    <path d="M 20 85 C 10 35, 60 8, 105 12 C 140 16, 160 50, 155 85 Z" fill="url(#iconCap)" stroke="#0369A1" stroke-width="3" />
    <rect x="12" y="76" width="150" height="26" rx="13" fill="#F8FAFC" stroke="#0284C7" stroke-width="2.5" />
    <circle cx="106" cy="10" r="14" fill="#FDE047" stroke="#F59E0B" stroke-width="2.5" />
  </g>

  <!-- Peeking Cat -->
  <g transform="translate(100, 230)">
    <polygon points="25,35 40,5 55,30" fill="url(#iconCat)" stroke="#C2410C" stroke-width="2.5" />
    <polygon points="75,30 90,5 105,35" fill="url(#iconCat)" stroke="#C2410C" stroke-width="2.5" />
    <ellipse cx="65" cy="55" rx="42" ry="34" fill="url(#iconCat)" stroke="#C2410C" stroke-width="2.5" />
    <!-- Eyes -->
    <ellipse cx="50" cy="52" rx="7" ry="10" fill="#FEF08A" stroke="#1E193B" stroke-width="2" />
    <circle cx="50" cy="52" r="4.5" fill="#18181B" />
    <ellipse cx="80" cy="52" rx="7" ry="10" fill="#FEF08A" stroke="#1E193B" stroke-width="2" />
    <circle cx="80" cy="52" r="4.5" fill="#18181B" />
    <!-- Nose -->
    <polygon points="63,62 67,62 65,66" fill="#FB7185" />
    <ellipse cx="50" cy="90" rx="11" ry="8" fill="#FFFFFF" stroke="#EA580C" stroke-width="2" />
    <ellipse cx="80" cy="90" rx="11" ry="8" fill="#FFFFFF" stroke="#EA580C" stroke-width="2" />
  </g>

  <!-- Open Book Base -->
  <g transform="translate(0, 30)">
    <path d="M 70 380 Q 256 425 442 380 L 430 405 Q 256 450 82 405 Z" fill="#2E2657" stroke="#F59E0B" stroke-width="3" />
    <path d="M 85 365 Q 250 395 256 340 L 256 360 Q 250 415 85 385 Z" fill="url(#iconPage)" stroke="#CBD5E1" stroke-width="1.5" />
    <path d="M 427 365 Q 262 395 256 340 L 256 360 Q 262 415 427 385 Z" fill="url(#iconPage)" stroke="#CBD5E1" stroke-width="1.5" />
    <path d="M 252 340 L 260 340 L 260 435 L 252 435 Z" fill="#F59E0B" />
  </g>

  <!-- Little Golden Sparkles -->
  <polygon points="90,140 96,152 108,158 96,164 90,176 84,164 72,158 84,152" fill="#FDE047" />
  <polygon points="410,140 416,152 428,158 416,164 410,176 404,164 392,158 404,152" fill="#FDE047" />
</svg>`;
}

export function generateYouTubeBannerSvg(): string {
  // Resolution: 2560 x 1440
  // Safe Zone (Desktop & Mobile): 1546 x 423 (Centered at X: 507 to 2053, Y: 508 to 932)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2560 1440" width="2560" height="1440">
  <defs>
    <!-- Panoramic Night Sky Gradient -->
    <linearGradient id="bannerSky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E1229" />
      <stop offset="35%" stop-color="#1B214A" />
      <stop offset="70%" stop-color="#161A3D" />
      <stop offset="100%" stop-color="#0A0C1C" />
    </linearGradient>

    <!-- Ambient Nebular Glows -->
    <radialGradient id="nebulaGold" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="nebulaBlue" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#38BDF8" stop-opacity="0" />
    </radialGradient>

    <!-- Golden Text Gradient -->
    <linearGradient id="titleGold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFDF7" />
      <stop offset="40%" stop-color="#FEF08A" />
      <stop offset="100%" stop-color="#FBBF24" />
    </linearGradient>

    <!-- Filter Shadows -->
    <filter id="bannerShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#04060E" flood-opacity="0.75" />
    </filter>
  </defs>

  <!-- 1. Full Panoramic Background -->
  <rect width="2560" height="1440" fill="url(#bannerSky)" />

  <!-- 2. Ambient Fairytale Glows -->
  <circle cx="1280" cy="720" r="650" fill="url(#nebulaGold)" />
  <circle cx="850" cy="700" r="500" fill="url(#nebulaBlue)" />
  <circle cx="1700" cy="740" r="500" fill="url(#nebulaBlue)" />

  <!-- 3. Whimsical Star Constellation Backdrop -->
  <!-- Constellation Left -->
  <circle cx="280" cy="350" r="5" fill="#FDE047" opacity="0.8" />
  <circle cx="420" cy="280" r="7" fill="#FDE047" opacity="0.9" />
  <circle cx="560" cy="380" r="4.5" fill="#38BDF8" opacity="0.75" />
  <path d="M 280 350 L 420 280 L 560 380" stroke="#FDE047" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.3" fill="none" />

  <!-- Constellation Right -->
  <circle cx="2050" cy="320" r="7" fill="#FDE047" opacity="0.85" />
  <circle cx="2200" cy="240" r="5.5" fill="#F472B6" opacity="0.75" />
  <circle cx="2320" cy="360" r="6.5" fill="#38BDF8" opacity="0.8" />
  <path d="M 2050 320 L 2200 240 L 2320 360" stroke="#FDE047" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.3" fill="none" />

  <!-- Random Ambient Twinkle Stars -->
  <polygon points="380,680 386,694 400,700 386,706 380,720 374,706 360,700 374,694" fill="#FDE047" opacity="0.75" />
  <polygon points="620,850 624,860 634,864 624,868 620,878 616,868 606,864 616,860" fill="#38BDF8" opacity="0.6" />
  <polygon points="2180,650 2186,664 2200,670 2186,676 2180,690 2174,676 2160,670 2174,664" fill="#FDE047" opacity="0.75" />
  <polygon points="1960,860 1964,870 1974,874 1964,878 1960,888 1956,878 1946,874 1956,870" fill="#F472B6" opacity="0.6" />

  <!-- 4. LEFT WING (STORYBOOK ELEMENTS): Manu's Red Raincoat & Sringeri's Bananas -->
  <g id="LeftStorybookCluster" transform="translate(480, 520)" filter="url(#bannerShadow)">
    <!-- Little Raincloud with Stardust -->
    <ellipse cx="140" cy="90" rx="65" ry="32" fill="#334155" opacity="0.6" />
    <ellipse cx="180" cy="75" rx="50" ry="38" fill="#475569" opacity="0.7" />
    <circle cx="110" cy="170" r="4" fill="#38BDF8" />
    <circle cx="150" cy="190" r="4" fill="#38BDF8" />
    <circle cx="190" cy="165" r="4" fill="#38BDF8" />

    <!-- Manu's Cheerful Red Raincoat (Jas Hujan Merah) -->
    <path d="M 125 105 L 175 105 L 205 180 L 175 185 L 165 145 L 165 240 L 135 240 L 135 145 L 125 185 L 95 180 Z"
          fill="#E11D48" stroke="#9F1239" stroke-width="3" rx="5" />
    <!-- Yellow buttons -->
    <circle cx="150" cy="140" r="4.5" fill="#FDE047" />
    <circle cx="150" cy="170" r="4.5" fill="#FDE047" />
    <circle cx="150" cy="200" r="4.5" fill="#FDE047" />

    <!-- Floating Sweet Bananas (Pisang Terlalu Banyak!) -->
    <path d="M 60 220 Q 80 200 110 215 Q 85 240 60 220 Z" fill="#FBBF24" stroke="#D97706" stroke-width="2.5" />
    <path d="M 50 240 Q 75 220 105 235 Q 78 260 50 240 Z" fill="#FBBF24" stroke="#D97706" stroke-width="2.5" />
  </g>

  <!-- 5. RIGHT WING (STORYBOOK CHARACTERS): Fat King & Thin Dog Walkers -->
  <g id="RightStorybookCluster" transform="translate(1860, 520)" filter="url(#bannerShadow)">
    <!-- Jolly King Silhouette / Hat with Crown -->
    <circle cx="120" cy="100" r="32" fill="#F59E0B" />
    <!-- Royal Crown -->
    <polygon points="98,72 108,50 120,65 132,50 142,72" fill="#FDE047" stroke="#B45309" stroke-width="2" />
    <!-- King Robe -->
    <path d="M 75 130 Q 120 120 165 130 L 175 240 L 65 240 Z" fill="#7C3AED" stroke="#5B21B6" stroke-width="3" />
    <!-- Ermine Fur Collar -->
    <rect x="75" y="125" width="90" height="24" rx="12" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" />

    <!-- Thin Dog Silhouette running happily -->
    <g transform="translate(160, 160)">
      <ellipse cx="60" cy="40" rx="35" ry="16" fill="#F97316" stroke="#C2410C" stroke-width="2.5" />
      <circle cx="95" cy="25" r="16" fill="#F97316" stroke="#C2410C" stroke-width="2.5" />
      <!-- Floppy Ear -->
      <path d="M 90 20 Q 82 40 86 48" stroke="#9A3412" stroke-width="5" stroke-linecap="round" />
      <!-- Legs -->
      <line x1="40" y1="52" x2="35" y2="80" stroke="#C2410C" stroke-width="4" stroke-linecap="round" />
      <line x1="75" y1="52" x2="80" y2="80" stroke="#C2410C" stroke-width="4" stroke-linecap="round" />
      <!-- Wagging Tail -->
      <path d="M 28 35 Q 12 25 18 10" stroke="#C2410C" stroke-width="4" stroke-linecap="round" fill="none" />
    </g>
  </g>

  <!-- 6. CENTER SAFE-ZONE HERO BRANDING (X: 800 to 1760, Y: 520 to 920) -->
  <g id="CenterBrandHero" filter="url(#bannerShadow)">
    <!-- Left: Scaled Emblem Badge (Diameter 360px) -->
    <g transform="translate(780, 520)">
      <!-- Outer Glow -->
      <circle cx="180" cy="180" r="185" fill="#F59E0B" opacity="0.25" />
      <circle cx="180" cy="180" r="175" fill="#181D45" stroke="#F59E0B" stroke-width="7" />

      <!-- Moon with Blue Cap inside Banner -->
      <path d="M 175 55 C 245 55, 290 110, 290 180 C 290 245, 245 290, 180 295 C 230 265, 250 215, 250 180 C 250 135, 215 80, 175 55 Z"
            fill="url(#titleGold)" />
      <!-- Sleepy Eye -->
      <path d="M 250 168 Q 258 178 266 168" fill="none" stroke="#92400E" stroke-width="3" stroke-linecap="round" />
      <!-- Rosy Cheek -->
      <ellipse cx="260" cy="184" rx="8" ry="5" fill="#FB7185" opacity="0.6" />

      <!-- Cap -->
      <g transform="translate(155, 12) rotate(-14)">
        <path d="M 15 60 C 8 25, 42 6, 75 8 C 100 12, 115 36, 110 60 Z" fill="#0284C7" stroke="#0369A1" stroke-width="2" />
        <rect x="8" y="54" width="106" height="18" rx="9" fill="#FFFFFF" />
        <circle cx="75" cy="8" r="10" fill="#FDE047" />
      </g>

      <!-- Peeking Orange Cat -->
      <g transform="translate(75, 160)">
        <polygon points="20,25 32,4 42,22" fill="#F97316" stroke="#C2410C" stroke-width="2" />
        <polygon points="56,22 66,4 78,25" fill="#F97316" stroke="#C2410C" stroke-width="2" />
        <ellipse cx="49" cy="42" rx="30" ry="24" fill="#F97316" stroke="#C2410C" stroke-width="2" />
        <circle cx="38" cy="40" r="4" fill="#18181B" />
        <circle cx="60" cy="40" r="4" fill="#18181B" />
        <polygon points="47,48 51,48 49,52" fill="#FB7185" />
        <ellipse cx="38" cy="68" rx="8" ry="6" fill="#FFFFFF" stroke="#C2410C" stroke-width="1.5" />
        <ellipse cx="60" cy="68" rx="8" ry="6" fill="#FFFFFF" stroke="#C2410C" stroke-width="1.5" />
      </g>

      <!-- Open Book under Moon -->
      <g transform="translate(10, 30)">
        <path d="M 50 255 Q 170 285 290 255 L 285 272 Q 170 302 55 272 Z" fill="#2E2657" stroke="#F59E0B" stroke-width="2" />
        <path d="M 60 245 Q 165 265 170 230 L 170 245 Q 165 280 60 260 Z" fill="#FFFDF7" stroke="#CBD5E1" stroke-width="1" />
        <path d="M 280 245 Q 175 265 170 230 L 170 245 Q 175 280 280 260 Z" fill="#FFFDF7" stroke="#CBD5E1" stroke-width="1" />
      </g>
    </g>

    <!-- Right: Big Bold Typography & Editorial Tagline -->
    <g transform="translate(1190, 560)">
      <!-- Channel Main Title: ZAYN STORYBOOK -->
      <text x="0" y="80"
            font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
            font-size="82"
            font-weight="900"
            fill="#B45309"
            letter-spacing="4">
        ZAYN STORYBOOK
      </text>
      <text x="0" y="74"
            font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
            font-size="82"
            font-weight="900"
            fill="url(#titleGold)"
            letter-spacing="4">
        ZAYN STORYBOOK
      </text>

      <!-- Tagline: Bilingual & Heartwarming -->
      <text x="5" y="132"
            font-family="'Nunito', 'Montserrat', sans-serif"
            font-size="28"
            font-weight="800"
            fill="#FFFFFF"
            letter-spacing="1">
        Buku Cerita &amp; Dongeng Animasi Anak Bergambar 🌙✨
      </text>

      <text x="5" y="172"
            font-family="'Nunito', 'Montserrat', sans-serif"
            font-size="22"
            font-weight="600"
            fill="#93C5FD"
            letter-spacing="0.5">
        Bilingual Picture Books (Bahasa Indonesia &amp; English) • Peaceful Bedtime Tales
      </text>

      <!-- Broadcast Schedule & Value Pill Badges -->
      <g transform="translate(0, 205)">
        <!-- Badge 1: Daily Broadcast Schedule -->
        <rect x="0" y="0" width="280" height="42" rx="21" fill="#F59E0B" />
        <text x="140" y="27"
              font-family="'Nunito', sans-serif"
              font-size="16"
              font-weight="800"
              fill="#1E1B4B"
              text-anchor="middle"
              letter-spacing="0.5">
          ⏰ TAYANG TIAP HARI 19.00 WIB
        </text>

        <!-- Badge 2: Family Safe & Moral Focus -->
        <rect x="295" y="0" width="220" height="42" rx="21" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
        <text x="405" y="27"
              font-family="'Nunito', sans-serif"
              font-size="16"
              font-weight="800"
              fill="#E0F2FE"
              text-anchor="middle"
              letter-spacing="0.5">
          🌈 100% AMAN &amp; EDUKATIF
        </text>

        <!-- Badge 3: Creative Commons Attribution -->
        <rect x="530" y="0" width="160" height="42" rx="21" fill="#1E293B" stroke="#94A3B8" stroke-width="1.5" />
        <text x="610" y="27"
              font-family="'Nunito', sans-serif"
              font-size="15"
              font-weight="700"
              fill="#CBD5E1"
              text-anchor="middle">
          📖 CC BY 4.0
        </text>
      </g>
    </g>
  </g>
</svg>`;
}

export function generateFacebookCoverSvg(): string {
  // Resolution: 1640 x 924
  // Safe Zone (Desktop & Mobile): Centered at 820 x 462
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1640 924" width="1640" height="924">
  <defs>
    <linearGradient id="fbSky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141836" />
      <stop offset="50%" stop-color="#212854" />
      <stop offset="100%" stop-color="#0E1126" />
    </linearGradient>
    <linearGradient id="fbGold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFDF7" />
      <stop offset="50%" stop-color="#FEF08A" />
      <stop offset="100%" stop-color="#FBBF24" />
    </linearGradient>
    <filter id="fbShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#04060E" flood-opacity="0.7" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1640" height="924" fill="url(#fbSky)" />

  <!-- Stars -->
  <polygon points="180,180 186,194 200,200 186,206 180,220 174,206 160,200 174,194" fill="#FDE047" opacity="0.8" />
  <circle cx="320" cy="140" r="5" fill="#FDE047" opacity="0.8" />
  <polygon points="1460,180 1466,194 1480,200 1466,206 1460,220 1454,206 1440,200 1454,194" fill="#FDE047" opacity="0.8" />
  <circle cx="1320" cy="140" r="6" fill="#38BDF8" opacity="0.85" />

  <!-- Content Centered for Desktop & Mobile -->
  <g transform="translate(260, 240)" filter="url(#fbShadow)">
    <!-- Mini Emblem Left -->
    <g transform="translate(0, 0)">
      <circle cx="160" cy="160" r="150" fill="#181D45" stroke="#F59E0B" stroke-width="6" />

      <!-- Moon with Cap -->
      <path d="M 155 45 C 220 45, 260 95, 260 160 C 260 220, 220 260, 160 265 C 205 235, 225 190, 225 160 C 225 120, 190 70, 155 45 Z" fill="url(#fbGold)" />
      <path d="M 225 150 Q 232 158 240 150" fill="none" stroke="#92400E" stroke-width="3" stroke-linecap="round" />
      <ellipse cx="235" cy="164" rx="7" ry="4" fill="#FB7185" opacity="0.6" />

      <!-- Blue Cap -->
      <g transform="translate(138, 5) rotate(-14)">
        <path d="M 12 50 C 6 20, 36 5, 65 6 C 88 10, 100 30, 96 50 Z" fill="#0284C7" />
        <rect x="6" y="45" width="94" height="16" rx="8" fill="#FFFFFF" />
        <circle cx="65" cy="6" r="8" fill="#FDE047" />
      </g>

      <!-- Peeking Cat -->
      <g transform="translate(70, 140)">
        <polygon points="15,22 25,4 35,20" fill="#F97316" stroke="#C2410C" stroke-width="1.5" />
        <polygon points="50,20 60,4 70,22" fill="#F97316" stroke="#C2410C" stroke-width="1.5" />
        <ellipse cx="43" cy="38" rx="26" ry="20" fill="#F97316" stroke="#C2410C" stroke-width="1.5" />
        <circle cx="33" cy="36" r="3.5" fill="#18181B" />
        <circle cx="53" cy="36" r="3.5" fill="#18181B" />
        <polygon points="41,43 45,43 43,47" fill="#FB7185" />
        <ellipse cx="33" cy="60" rx="7" ry="5" fill="#FFFFFF" />
        <ellipse cx="53" cy="60" rx="7" ry="5" fill="#FFFFFF" />
      </g>

      <!-- Open Book -->
      <g transform="translate(15, 25)">
        <path d="M 40 225 Q 145 250 250 225 L 245 240 Q 145 265 45 240 Z" fill="#2E2657" stroke="#F59E0B" stroke-width="2" />
        <path d="M 50 215 Q 140 235 145 205 L 145 218 Q 140 248 50 228 Z" fill="#FFFDF7" />
        <path d="M 240 215 Q 150 235 145 205 L 145 218 Q 150 248 240 228 Z" fill="#FFFDF7" />
      </g>
    </g>

    <!-- Right: Text & Information -->
    <g transform="translate(360, 45)">
      <text x="0" y="65"
            font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
            font-size="64"
            font-weight="900"
            fill="url(#fbGold)"
            letter-spacing="3">
        ZAYN STORYBOOK
      </text>

      <text x="5" y="115"
            font-family="'Nunito', sans-serif"
            font-size="24"
            font-weight="800"
            fill="#FFFFFF">
        Halaman Resmi Dongeng &amp; Cerita Bergambar Edukatif Anak 🌙✨
      </text>

      <text x="5" y="152"
            font-family="'Nunito', sans-serif"
            font-size="19"
            font-weight="600"
            fill="#93C5FD">
        Koleksi Cerita Penuh Pesan Moral, Menemani Si Kecil Tidur Nyenyak &amp; Ceria
      </text>

      <!-- Schedule Pill -->
      <g transform="translate(0, 185)">
        <rect x="0" y="0" width="260" height="38" rx="19" fill="#F59E0B" />
        <text x="130" y="24"
              font-family="'Nunito', sans-serif"
              font-size="15"
              font-weight="800"
              fill="#1E1B4B"
              text-anchor="middle">
          🌙 Tayang Tiap Hari 19.00 WIB
        </text>

        <rect x="275" y="0" width="220" height="38" rx="19" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
        <text x="385" y="24"
              font-family="'Nunito', sans-serif"
              font-size="15"
              font-weight="800"
              fill="#E0F2FE"
              text-anchor="middle">
          🌈 Cerita Aman &amp; Edukatif
        </text>
      </g>
    </g>
  </g>
</svg>`;
}

export function generateInstagramStoryHighlightSvg(): string {
  // Resolution: 1080 x 1920 (Instagram Story & Highlight Cover)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="igStorySky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E244D" />
      <stop offset="50%" stop-color="#141836" />
      <stop offset="100%" stop-color="#0B0D1F" />
    </linearGradient>
    <radialGradient id="highlightGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1080" height="1920" fill="url(#igStorySky)" />

  <!-- Stars around top and bottom -->
  <polygon points="220,340 228,356 244,364 228,372 220,388 212,372 196,364 212,356" fill="#FDE047" opacity="0.8" />
  <circle cx="340" cy="280" r="7" fill="#FDE047" opacity="0.85" />
  <polygon points="860,320 868,336 884,344 868,352 860,368 852,352 836,344 852,336" fill="#FDE047" opacity="0.8" />
  <circle cx="780" cy="260" r="8" fill="#38BDF8" opacity="0.85" />

  <polygon points="200,1580 206,1594 220,1600 206,1606 200,1620 194,1606 180,1600 194,1594" fill="#FDE047" opacity="0.75" />
  <polygon points="880,1560 886,1574 900,1580 886,1586 880,1600 874,1586 860,1580 874,1574" fill="#38BDF8" opacity="0.75" />

  <!-- Center Highlight Badge (Centered exactly at Y: 960) -->
  <circle cx="540" cy="960" r="380" fill="url(#highlightGlow)" />
  <circle cx="540" cy="960" r="320" fill="#181D45" stroke="#F59E0B" stroke-width="10" />

  <!-- Embedded Icon Centered -->
  <g transform="translate(340, 760)">
    <!-- Moon Body -->
    <path d="M 180 50 C 265 50, 320 115, 320 195 C 320 270, 265 320, 190 328 C 245 292, 275 238, 275 195 C 275 140, 235 78, 180 50 Z" fill="#FBBF24" />
    <path d="M 270 182 Q 280 192 290 182" fill="none" stroke="#92400E" stroke-width="3.5" stroke-linecap="round" />
    <ellipse cx="282" cy="200" rx="9" ry="5" fill="#FB7185" opacity="0.6" />

    <!-- Cap -->
    <g transform="translate(160, 5) rotate(-14)">
      <path d="M 16 68 C 8 28, 48 6, 84 9 C 112 12, 128 40, 124 68 Z" fill="#0284C7" stroke="#0369A1" stroke-width="2.5" />
      <rect x="10" y="60" width="120" height="20" rx="10" fill="#FFFFFF" />
      <circle cx="85" cy="8" r="11" fill="#FDE047" />
    </g>

    <!-- Cat -->
    <g transform="translate(75, 180)">
      <polygon points="20,28 32,4 44,24" fill="#F97316" stroke="#C2410C" stroke-width="2" />
      <polygon points="62,24 74,4 86,28" fill="#F97316" stroke="#C2410C" stroke-width="2" />
      <ellipse cx="53" cy="48" rx="34" ry="26" fill="#F97316" stroke="#C2410C" stroke-width="2" />
      <circle cx="41" cy="45" r="4.5" fill="#18181B" />
      <circle cx="65" cy="45" r="4.5" fill="#18181B" />
      <polygon points="51,53 55,53 53,57" fill="#FB7185" />
      <ellipse cx="41" cy="74" rx="9" ry="6" fill="#FFFFFF" />
      <ellipse cx="65" cy="74" rx="9" ry="6" fill="#FFFFFF" />
    </g>

    <!-- Book -->
    <g transform="translate(20, 20)">
      <path d="M 40 285 Q 180 320 320 285 L 310 305 Q 180 340 50 305 Z" fill="#2E2657" stroke="#F59E0B" stroke-width="2.5" />
      <path d="M 50 275 Q 170 295 175 255 L 175 270 Q 170 310 50 290 Z" fill="#FFFDF7" stroke="#CBD5E1" stroke-width="1.5" />
      <path d="M 310 275 Q 190 295 185 255 L 185 270 Q 190 310 310 290 Z" fill="#FFFDF7" stroke="#CBD5E1" stroke-width="1.5" />
    </g>
  </g>

  <!-- Title Bottom -->
  <text x="540" y="1370"
        font-family="'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif"
        font-size="52"
        font-weight="900"
        fill="#FDE047"
        text-anchor="middle"
        letter-spacing="5">
    ZAYN STORYBOOK
  </text>
  <text x="540" y="1420"
        font-family="'Nunito', sans-serif"
        font-size="24"
        font-weight="700"
        fill="#E2E8F0"
        text-anchor="middle"
        letter-spacing="3">
    CERITA &amp; DONGENG ANAK
  </text>
</svg>`;
}

async function renderSvgToPng(
  browser: puppeteer.Browser,
  svgContent: string,
  outputPath: string,
  width: number,
  height: number,
  transparent = false
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${transparent ? "transparent" : "#141836"};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.screenshot({
    path: outputPath,
    type: "png",
    omitBackground: transparent,
  });
  await page.close();
}

async function main() {
  console.log("\n==================================================================");
  console.log("🎨 ZAYN STORYBOOK BRANDING SUITE GENERATOR");
  console.log("==================================================================");
  console.log("✨ Anti-AI Slop • Organic Storybook Palette • Multi-Platform Matrix");
  console.log("==================================================================\n");

  const brandingDirs = [
    path.resolve("./stories/branding"),
    path.resolve("./exports/branding"),
    path.resolve("./docs/branding"),
  ];

  for (const d of brandingDirs) {
    if (!existsSync(d)) {
      await fs.mkdir(d, { recursive: true });
    }
  }

  const primaryDir = brandingDirs[0];

  // 1. Generate Master SVGs
  console.log("📐 Generating Master Vector SVGs...");
  const emblemSvg = generateEmblemSvg(false);
  const emblemTransparentSvg = generateEmblemSvg(true);
  const iconSvg = generateIconOnlySvg();
  const bannerYoutubeSvg = generateYouTubeBannerSvg();
  const coverFacebookSvg = generateFacebookCoverSvg();
  const igStoryHighlightSvg = generateInstagramStoryHighlightSvg();

  await fs.writeFile(path.join(primaryDir, "zayn-storybook-emblem.svg"), emblemSvg);
  await fs.writeFile(path.join(primaryDir, "zayn-storybook-emblem-transparent.svg"), emblemTransparentSvg);
  await fs.writeFile(path.join(primaryDir, "zayn-storybook-icon.svg"), iconSvg);
  await fs.writeFile(path.join(primaryDir, "zayn-storybook-banner-youtube.svg"), bannerYoutubeSvg);
  await fs.writeFile(path.join(primaryDir, "zayn-storybook-cover-facebook.svg"), coverFacebookSvg);
  await fs.writeFile(path.join(primaryDir, "zayn-storybook-story-highlight.svg"), igStoryHighlightSvg);
  console.log("   ✔ All Master SVGs generated successfully!");

  // 2. Launch Puppeteer Headless Browser for Pixel-Perfect Multi-Platform PNGs
  console.log("\n🚀 Launching headless Chromium to render all platform image sizes...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const renderSpecs = [
    // Avatars & Profile Pictures (1:1 Square & Circular Safe-Zone)
    { name: "pfp-master-1080x1080.png", svg: emblemSvg, w: 1080, h: 1080, transparent: false, label: "Master High-Res Avatar (1080x1080)" },
    { name: "pfp-transparent-1080x1080.png", svg: emblemTransparentSvg, w: 1080, h: 1080, transparent: true, label: "Master Transparent Emblem (1080x1080)" },
    { name: "pfp-youtube-800x800.png", svg: emblemSvg, w: 800, h: 800, transparent: false, label: "YouTube Channel Profile Picture (800x800)" },
    { name: "pfp-instagram-1080x1080.png", svg: emblemSvg, w: 1080, h: 1080, transparent: false, label: "Instagram Profile Picture (1080x1080 Retina)" },
    { name: "pfp-facebook-800x800.png", svg: emblemSvg, w: 800, h: 800, transparent: false, label: "Facebook Page Profile Picture (800x800)" },
    { name: "pfp-tiktok-800x800.png", svg: emblemSvg, w: 800, h: 800, transparent: false, label: "TikTok Profile Avatar (800x800)" },

    // Banners & Covers
    { name: "banner-youtube-2560x1440.png", svg: bannerYoutubeSvg, w: 2560, h: 1440, transparent: false, label: "YouTube Channel Banner (2560x1440 Safe-Zone)" },
    { name: "cover-facebook-1640x924.png", svg: coverFacebookSvg, w: 1640, h: 924, transparent: false, label: "Facebook Page Cover Photo (1640x924)" },
    { name: "story-highlight-instagram-1080x1920.png", svg: igStoryHighlightSvg, w: 1080, h: 1920, transparent: false, label: "Instagram Story & Highlight Cover (1080x1920)" },

    // Small UI & Icons
    { name: "watermark-youtube-150x150.png", svg: iconSvg, w: 150, h: 150, transparent: true, label: "YouTube Video Watermark Stamp (150x150 Transparent)" },
    { name: "favicon-512x512.png", svg: iconSvg, w: 512, h: 512, transparent: false, label: "PWA Web App Icon (512x512)" },
    { name: "favicon-192x192.png", svg: iconSvg, w: 192, h: 192, transparent: false, label: "Android Chrome Icon (192x192)" },
    { name: "favicon-64x64.png", svg: iconSvg, w: 64, h: 64, transparent: false, label: "Retina Favicon (64x64)" },
    { name: "favicon-32x32.png", svg: iconSvg, w: 32, h: 32, transparent: false, label: "Classic Browser Tab Favicon (32x32)" },
  ];

  for (let i = 0; i < renderSpecs.length; i++) {
    const s = renderSpecs[i];
    const outPath = path.join(primaryDir, s.name);
    process.stdout.write(`   [${i + 1}/${renderSpecs.length}] Rendering ${s.name} (${s.w}x${s.h})... `);
    await renderSvgToPng(browser, s.svg, outPath, s.w, s.h, s.transparent);
    console.log("✔");
  }

  await browser.close();
  console.log("   ✔ All PNG assets rendered with crisp anti-aliasing!");

  // 3. Mirror all assets to exports/branding and docs/branding
  console.log("\n📦 Mirroring assets to exports/branding and docs/branding...");
  const files = await fs.readdir(primaryDir);
  for (const file of files) {
    if (file.endsWith(".png") || file.endsWith(".svg")) {
      const srcPath = path.join(primaryDir, file);
      const content = await fs.readFile(srcPath);
      for (const targetDir of brandingDirs.slice(1)) {
        await fs.writeFile(path.join(targetDir, file), content);
      }
    }
  }
  console.log("   ✔ Assets synchronized to all branding directories!");

  console.log("\n==================================================================");
  console.log("🎉 COMPLETE BRANDING PACK SUCCESSFULLY GENERATED!");
  console.log("==================================================================");
  console.log(`📁 Primary Location: ${primaryDir}`);
  console.log(`📦 Distribution    : exports/branding/`);
  console.log(`🌐 Web / Portal    : docs/branding/`);
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
