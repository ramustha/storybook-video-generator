/**
 * Reusable Vector Stage Backdrops & Actor Prefabs for Universal Edu-Motion
 *
 * Stories can pick a built-in backdrop preset & compose actors from parameterized
 * kawaii vector prefabs OR inject custom `svgContent` for unique objects —
 * zero TypeScript editing needed per new book.
 */

import { BackdropPresetId, BackdropSpec, StageActorSpec } from "./edu-motion-spec";

interface BackdropLayerMarkup {
  defsSvg: string;
  portraitSvg: string;
  landscapeSvg: string;
  spotSvg: string;
}

function getBackdropPresetMarkup(preset: BackdropPresetId | undefined, spotColor: string): BackdropLayerMarkup {
  if (preset === "nusantara-kitchen") {
    return {
      defsSvg: `<linearGradient id="warmRay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFE600" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="#A855F7" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="labSpot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${spotColor || "#FB7185"}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#140A2E" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="woodTable" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FDE68A"/>
          <stop offset="38%" stop-color="#F59E0B"/>
          <stop offset="82%" stop-color="#B45309"/>
          <stop offset="100%" stop-color="#78350F"/>
        </linearGradient>`,
      portraitSvg: `<polygon points="108,0 280,0 455,1380 150,1380" fill="url(#warmRay)"/>
        <polygon points="455,0 625,0 800,1380 518,1380" fill="url(#warmRay)"/>
        <polygon points="778,0 950,0 1036,1380 820,1380" fill="url(#warmRay)"/>
        <path d="M0,865 Q240,770 490,850 T940,805 T1080,860 L1080,1920 L0,1920 Z" fill="#1E103D" opacity="0.58"/>
        <path d="M0,950 Q540,926 1080,948 L1080,1920 L0,1920 Z" fill="url(#woodTable)" stroke="#92400E" stroke-width="5"/>
        <path d="M0,1545 Q540,1535 1080,1545 L1080,1920 L0,1920 Z" fill="#180D36" opacity="0.72"/>`,
      landscapeSvg: `<polygon points="192,0 480,0 806,780 268,780" fill="url(#warmRay)"/>
        <polygon points="806,0 1114,0 1420,780 920,780" fill="url(#warmRay)"/>
        <polygon points="1382,0 1690,0 1843,780 1460,780" fill="url(#warmRay)"/>
        <path d="M0,630 Q384,520 845,610 T1630,565 T1920,625 L1920,1080 L0,1080 Z" fill="#1E103D" opacity="0.58"/>
        <path d="M0,715 Q960,690 1920,715 L1920,1080 L0,1080 Z" fill="url(#woodTable)" stroke="#92400E" stroke-width="5"/>
        <path d="M0,855 Q960,842 1920,855 L1920,1080 L0,1080 Z" fill="#180D36" opacity="0.52"/>`,
      spotSvg: `<ellipse cx="495" cy="540" rx="450" ry="260" fill="url(#labSpot)"/>`,
    };
  }

  if (preset === "sunny-meadow" || preset === "science-studio") {
    const hillFill = preset === "sunny-meadow" ? "#10B981" : "#1E293B";
    const floorFill = preset === "sunny-meadow" ? "#059669" : "#334155";
    return {
      defsSvg: `<radialGradient id="studioSpot" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${spotColor || "#38BDF8"}" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
      </radialGradient>`,
      portraitSvg: `<path d="M0,880 Q320,780 640,860 T1080,835 L1080,1920 L0,1920 Z" fill="${hillFill}" opacity="0.72"/>
        <path d="M0,960 Q540,930 1080,960 L1080,1920 L0,1920 Z" fill="${floorFill}"/>`,
      landscapeSvg: `<path d="M0,645 Q480,550 960,625 T1920,610 L1920,1080 L0,1080 Z" fill="${hillFill}" opacity="0.72"/>
        <path d="M0,720 Q960,695 1920,720 L1920,1080 L0,1080 Z" fill="${floorFill}"/>`,
      spotSvg: `<ellipse cx="495" cy="540" rx="430" ry="260" fill="url(#studioSpot)"/>`,
    };
  }

  // Default: underwater-reef
  return {
    defsSvg: `<linearGradient id="sunRay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFE600" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#38BDF8" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="spotGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${spotColor || "#38BDF8"}" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#03045E" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sandSlope" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FDE68A"/>
        <stop offset="40%" stop-color="#FCD34D"/>
        <stop offset="78%" stop-color="#F59E0B"/>
        <stop offset="100%" stop-color="#B45309"/>
      </linearGradient>`,
    portraitSvg: `<g id="sunbeams-p">
        <polygon points="108,0 270,0 455,1380 150,1380" fill="url(#sunRay)"/>
        <polygon points="455,0 625,0 800,1380 518,1380" fill="url(#sunRay)"/>
        <polygon points="778,0 940,0 1036,1380 820,1380" fill="url(#sunRay)"/>
      </g>
      <path d="M0,840 Q240,750 475,830 T920,785 T1080,840 L1080,1920 L0,1920 Z" fill="#002855" opacity="0.65"/>
      <path d="M0,950 Q310,925 560,948 T1080,938 L1080,1920 L0,1920 Z" fill="url(#sandSlope)" stroke="#F59E0B" stroke-width="5"/>
      <path d="M0,1535 Q540,1525 1080,1535 L1080,1920 L0,1920 Z" fill="#011536" opacity="0.65"/>`,
    landscapeSvg: `<g id="sunbeams-l">
        <polygon points="192,0 460,0 806,780 268,780" fill="url(#sunRay)"/>
        <polygon points="806,0 1094,0 1420,780 920,780" fill="url(#sunRay)"/>
        <polygon points="1382,0 1650,0 1843,780 1460,780" fill="url(#sunRay)"/>
      </g>
      <path d="M0,610 Q384,500 845,595 T1630,550 T1920,605 L1920,1080 L0,1080 Z" fill="#002855" opacity="0.65"/>
      <path d="M0,710 Q480,682 960,710 T1920,695 L1920,1080 L0,1080 Z" fill="url(#sandSlope)" stroke="#F59E0B" stroke-width="5"/>
      <path d="M0,845 Q960,835 1920,845 L1920,1080 L0,1080 Z" fill="#011536" opacity="0.45"/>`,
    spotSvg: `<ellipse cx="495" cy="540" rx="430" ry="260" fill="url(#spotGlow)"/>`,
  };
}

function drawKawaiiEyesAndSmile(opts: {
  idPrefix: string;
  eyeSpacing: number;
  smileY: number;
  withFrown?: boolean;
}): string {
  const { idPrefix, eyeSpacing, smileY, withFrown = true } = opts;
  return `<g>
    <circle cx="-${eyeSpacing}" cy="0" r="10" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.2"/>
    <circle cx="-${eyeSpacing - 2}" cy="-1" r="4.8" fill="#0F172A"/>
    <circle cx="${eyeSpacing}" cy="0" r="10" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.2"/>
    <circle cx="${eyeSpacing - 2}" cy="-1" r="4.8" fill="#0F172A"/>
    <path id="${idPrefix}-smile" d="M-11,${smileY} Q0,${smileY + 11} 11,${smileY}" fill="none" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>
    ${
      withFrown
        ? `<path id="${idPrefix}-frown" d="M-11,${smileY + 8} Q0,${smileY - 2} 11,${smileY + 8}" fill="none" stroke="#0F172A" stroke-width="4" stroke-linecap="round" opacity="0"/>`
        : ""
    }
  </g>`;
}

function renderBuiltinPrefab(actor: StageActorSpec): string {
  const opt = actor.prefabOptions || {};
  switch (actor.prefab) {
    case "sea-cucumber": {
      const bodyColor = String(opt.bodyColor || "#F77F00");
      const bellyColor = String(opt.bellyColor || "#FBBF24");
      return `<ellipse cx="0" cy="22" rx="92" ry="18" fill="rgba(180, 83, 9, 0.35)"/>
        <g fill="#D97706" stroke="#0F172A" stroke-width="3">
          <rect x="-65" y="6" width="12" height="18" rx="6"/><rect x="-38" y="8" width="12" height="18" rx="6"/>
          <rect x="-10" y="9" width="12" height="18" rx="6"/><rect x="18" y="8" width="12" height="18" rx="6"/>
          <rect x="45" y="6" width="12" height="18" rx="6"/>
        </g>
        <rect x="-86" y="-48" width="172" height="66" rx="33" fill="${bodyColor}" stroke="#0F172A" stroke-width="5"/>
        <path d="M-76,-6 Q0,14 76,-6 L68,14 Q0,22 -68,14 Z" fill="${bellyColor}" opacity="0.78"/>
        <circle cx="-55" cy="-34" r="7" fill="#FDE047" stroke="#0F172A" stroke-width="2.5"/>
        <circle cx="-22" cy="-42" r="8" fill="#FDE047" stroke="#0F172A" stroke-width="2.5"/>
        <circle cx="12" cy="-40" r="7" fill="#FDE047" stroke="#0F172A" stroke-width="2.5"/>
        <circle cx="38" cy="-22" r="11" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.5"/>
        <circle cx="42" cy="-22" r="5" fill="#0F172A"/>
        <circle cx="64" cy="-22" r="11" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.5"/>
        <circle cx="68" cy="-22" r="5" fill="#0F172A"/>
        <ellipse cx="80" cy="-6" rx="10" ry="12" fill="#7C2D12" stroke="#0F172A" stroke-width="3.5"/>`;
    }

    case "coral-colony": {
      const id = actor.id;
      return `<path class="coral-branch" d="M-70,15 C-110,-45 -135,-110 -105,-160 C-88,-185 -56,-170 -62,-130 C-70,-90 -35,-75 -28,-135 C-22,-185 18,-185 18,-130 C18,-75 45,-65 55,-125 C65,-175 110,-165 102,-115 C92,-65 65,-25 75,15 Z"
            fill="#FF6B6B" stroke="#0F172A" stroke-width="5" stroke-linejoin="round"/>
        <g transform="translate(-95, -5)">
          <rect x="-22" y="-70" width="24" height="75" rx="12" fill="#2EC4B6" stroke="#0F172A" stroke-width="4"/>
          <rect x="6" y="-95" width="24" height="100" rx="12" fill="#38BDF8" stroke="#0F172A" stroke-width="4"/>
          <ellipse cx="-10" cy="-68" rx="9" ry="5" fill="#0F172A"/><ellipse cx="18" cy="-93" rx="9" ry="5" fill="#0F172A"/>
        </g>
        <path class="coral-accent" d="M72,5 Q128,-50 135,-120 Q92,-132 72,-82 Q65,-38 50,5 Z" fill="#FBBF24" stroke="#0F172A" stroke-width="4.5"/>
        <g id="new-coral-buds" opacity="0">
          <circle cx="-68" cy="-168" r="14" fill="#2EC4B6" stroke="#0F172A" stroke-width="3.5"/>
          <circle cx="0" cy="-182" r="16" fill="#FFE600" stroke="#0F172A" stroke-width="3.5"/>
          <circle cx="88" cy="-160" r="15" fill="#FF6B6B" stroke="#0F172A" stroke-width="3.5"/>
        </g>
        <g transform="translate(-8, -58)">
          <circle cx="-22" cy="0" r="11" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.5"/><circle cx="-24" cy="-1" r="5.5" fill="#0F172A"/>
          <circle cx="22" cy="0" r="11" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.5"/><circle cx="20" cy="-1" r="5.5" fill="#0F172A"/>
          <path id="${id}-smile" d="M-13,18 Q0,30 13,18" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          <path id="${id}-frown" d="M-13,26 Q0,14 13,26" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round" opacity="0"/>
        </g>`;
    }

    case "reef-fish": {
      const bodyColor = String(opt.bodyColor || "#FF9F1C");
      return `<polygon points="26,0 44,-13 44,13" fill="${bodyColor}" stroke="#0F172A" stroke-width="3.2"/>
        <ellipse cx="0" cy="0" rx="25" ry="15" fill="${bodyColor}" stroke="#0F172A" stroke-width="3.5"/>
        <circle cx="-11" cy="-3" r="3.2" fill="#0F172A"/>`;
    }

    case "tempe-banana-leaf":
      return `<ellipse cx="0" cy="14" rx="82" ry="15" fill="rgba(69,26,3,0.38)"/>
        <path d="M-82,4 Q0,24 82,4 L74,-20 Q0,-6 -74,-20 Z" fill="#16A34A" stroke="#0F172A" stroke-width="4.5" stroke-linejoin="round"/>
        <rect x="-60" y="-82" width="120" height="80" rx="20" fill="#FDE047" stroke="#0F172A" stroke-width="4.8"/>
        <g fill="#D97706" opacity="0.62">
          <ellipse cx="-38" cy="-64" rx="8" ry="5"/><ellipse cx="-14" cy="-68" rx="8" ry="5"/>
          <ellipse cx="20" cy="-64" rx="8" ry="5"/><ellipse cx="40" cy="-56" rx="7" ry="5"/>
        </g>
        <g id="${actor.id}-mycelium" opacity="0">
          <rect x="-56" y="-78" width="112" height="72" rx="16" fill="rgba(255,255,255,0.52)" stroke="#00F5D4" stroke-width="3.5" stroke-dasharray="8 6"/>
          <path d="M-46,-64 Q-16,-40 12,-64 Q32,-48 46,-62" fill="none" stroke="#FFFFFF" stroke-width="4.2" stroke-linecap="round"/>
        </g>
        <g transform="translate(0, -39)">${drawKawaiiEyesAndSmile({ idPrefix: actor.id, eyeSpacing: 20, smileY: 15 })}</g>`;

    case "dadih-bamboo":
      return `<ellipse cx="0" cy="14" rx="68" ry="14" fill="rgba(69,26,3,0.38)"/>
        <rect x="-48" y="-140" width="96" height="144" rx="16" fill="#10B981" stroke="#0F172A" stroke-width="4.8"/>
        <path d="M-48,-76 Q0,-64 48,-76" fill="none" stroke="#065F46" stroke-width="4.5"/>
        <ellipse cx="0" cy="-138" rx="46" ry="14" fill="#FFFBEB" stroke="#0F172A" stroke-width="4.2"/>
        <rect x="-50" y="-118" width="100" height="13" rx="6" fill="#F59E0B" stroke="#0F172A" stroke-width="3.5"/>
        <g transform="translate(0, -38)">${drawKawaiiEyesAndSmile({ idPrefix: actor.id, eyeSpacing: 18, smileY: 15 })}</g>`;

    case "mandai-jar":
      return `<ellipse cx="0" cy="14" rx="68" ry="14" fill="rgba(69,26,3,0.38)"/>
        <rect x="-50" y="-124" width="100" height="128" rx="24" fill="rgba(56, 189, 248, 0.24)" stroke="#BAE6FD" stroke-width="4.2"/>
        <rect x="-42" y="-88" width="84" height="82" rx="16" fill="rgba(245, 158, 11, 0.88)" stroke="#0F172A" stroke-width="3.5"/>
        <path d="M-30,-68 L-14,-24 M-6,-74 L10,-20 M20,-70 L30,-26" stroke="#FDE047" stroke-width="8" stroke-linecap="round" opacity="0.72"/>
        <g id="jar-fizz"><circle cx="-20" cy="-94" r="5" fill="#FFFFFF"/><circle cx="16" cy="-102" r="5.5" fill="#00F5D4"/></g>
        <rect x="-38" y="-146" width="76" height="22" rx="9" fill="#FF6B6B" stroke="#0F172A" stroke-width="4.2"/>
        <g transform="translate(0, -45)">${drawKawaiiEyesAndSmile({ idPrefix: actor.id, eyeSpacing: 18, smileY: 14, withFrown: false })}</g>`;

    case "pakasam-crock":
      return `<ellipse cx="0" cy="14" rx="70" ry="14" fill="rgba(69,26,3,0.38)"/>
        <!-- Clay Nusantara Crock Vessel for Fermented Freshwater Fish & Samu Rice -->
        <path d="M-50,-112 C-66,-68 -66,-20 -46,6 L46,6 C66,-20 66,-68 50,-112 Z" fill="#C2410C" stroke="#0F172A" stroke-width="4.8" stroke-linejoin="round"/>
        <rect x="-42" y="-128" width="84" height="20" rx="9" fill="#EA580C" stroke="#0F172A" stroke-width="4.2"/>
        <!-- Peeking Cute Silver Fish Tail + Roasted Samu Rice Grains -->
        <ellipse cx="-14" cy="-136" rx="18" ry="10" fill="#7DD3FC" stroke="#0F172A" stroke-width="3.2"/>
        <polygon points="4,-136 16,-146 16,-126" fill="#38BDF8" stroke="#0F172A" stroke-width="2.8"/>
        <circle cx="-23" cy="-138" r="2.6" fill="#0F172A"/>
        <circle cx="18" cy="-130" r="4.5" fill="#FDE047"/><circle cx="28" cy="-132" r="4" fill="#FDE047"/>
        <g transform="translate(0, -52)">${drawKawaiiEyesAndSmile({ idPrefix: actor.id, eyeSpacing: 18, smileY: 14, withFrown: false })}</g>`;

    case "microbe-buddy": {
      const fill = String(opt.fill || "#00F5D4");
      return `<rect x="-24" y="-18" width="48" height="36" rx="18" fill="${fill}" stroke="#0F172A" stroke-width="3.5"/>
        <circle cx="-7" cy="-2" r="4.5" fill="#0F172A"/><circle cx="7" cy="-2" r="4.5" fill="#0F172A"/>
        <path d="M-5,7 Q0,12 5,7" fill="none" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/>`;
    }

    case "heat-waves":
      return `<path d="M-90,-20 Q-70,5 -90,30 Q-110,55 -90,75" fill="none" stroke="#EF4444" stroke-width="6" stroke-linecap="round"/>
        <path d="M0,-35 Q20,-10 0,15 Q-20,40 0,60" fill="none" stroke="#F97316" stroke-width="6" stroke-linecap="round"/>
        <path d="M90,-20 Q110,5 90,30 Q70,55 90,75" fill="none" stroke="#EF4444" stroke-width="6" stroke-linecap="round"/>`;

    case "sparkle-burst": {
      const color = String(opt.color || "#FFE600");
      return `<polygon points="0,-24 6,-9 22,-7 10,3 13,19 0,11 -13,19 -10,3 -22,-7 -6,-9" fill="${color}" stroke="#0F172A" stroke-width="2.5"/>`;
    }

    default:
      return "";
  }
}

/** Renders backdrop layers + camera-rig world actors into HTML SVG string. */
export function buildStageWorldSvg(options: {
  backdrop: BackdropSpec;
  actors: StageActorSpec[];
  calloutSvg: string;
}): string {
  const { backdrop, actors, calloutSvg } = options;
  const presetLayers = getBackdropPresetMarkup(backdrop.preset, backdrop.ambientSpotColor || "#38BDF8");

  const actorsMarkup = actors
    .map((actor) => {
      const x = actor.x ?? 0;
      const y = actor.y ?? 0;
      const scale = actor.scale ?? 1;
      const opacityAttr = actor.opacity !== undefined ? ` opacity="${actor.opacity}"` : "";
      const transformAttr = x !== 0 || y !== 0 || scale !== 1
        ? ` transform="translate(${x}, ${y})${scale !== 1 ? ` scale(${scale})` : ""}"`
        : "";
      const inner = actor.svgContent ?? renderBuiltinPrefab(actor);
      return `<g id="${actor.id}"${transformAttr}${opacityAttr}>${inner}</g>`;
    })
    .join("\n      ");

  return `<svg id="stage-svg" viewBox="0 0 1080 1920">
    <defs>
      ${presetLayers.defsSvg}
      ${backdrop.defsSvg || ""}
    </defs>

    <g id="backdrop-portrait">
      ${backdrop.portraitBackdropSvg ?? presetLayers.portraitSvg}
    </g>

    <g id="backdrop-landscape" display="none">
      ${backdrop.landscapeBackdropSvg ?? presetLayers.landscapeSvg}
    </g>

    <g id="cam-rig">
      ${presetLayers.spotSvg}
      ${actorsMarkup}
      ${calloutSvg}
    </g>
  </svg>`;
}
