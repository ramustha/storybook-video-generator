/**
 * Swappable Narrator Character Rig Registry (50% Waist-Up Circular Badge Hosts)
 *
 * Every registered host renders into identical DOM anchor IDs (`#host-head-rig`,
 * `#host-eyes-open`, `#host-eyes-blink`, `#host-mouth-idle`, `#host-mouth-talk`,
 * `#host-mouth-shock`, `#host-pose-wave`, `#host-pose-point`, `#host-pose-shock`,
 * `#host-pose-eureka`) so any story can swap host character or color theme
 * declaratively without changing runtime controller code.
 */

import { HostCharacterId, HostThemeOverride } from "./edu-motion-spec";

interface HostPreset {
  badgeBg: string;
  ringAccentColor: string;
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  shirtCollarColor: string;
  hatColor: string;
  hatBandColor: string;
  hatStyle: "beret" | "star-buns" | "inventor-goggles";
}

const HOST_PRESETS: Record<HostCharacterId, HostPreset> = {
  zayn: {
    badgeBg: "#0E2A5C",
    ringAccentColor: "#00F5D4",
    skinColor: "#FFE5CE",
    hairColor: "#5C3A21",
    shirtColor: "#2EC4B6",
    shirtCollarColor: "#FFE600",
    hatColor: "#FACC15",
    hatBandColor: "#EAB308",
    hatStyle: "beret",
  },
  luna: {
    badgeBg: "#2E1065",
    ringAccentColor: "#F472B6",
    skinColor: "#FFE5D0",
    hairColor: "#3B1F4A",
    shirtColor: "#FB7185",
    shirtCollarColor: "#FDE047",
    hatColor: "#FDE047",
    hatBandColor: "#A855F7",
    hatStyle: "star-buns",
  },
  bimo: {
    badgeBg: "#064E3B",
    ringAccentColor: "#FFE600",
    skinColor: "#FBD5B5",
    hairColor: "#1E293B",
    shirtColor: "#10B981",
    shirtCollarColor: "#38BDF8",
    hatColor: "#38BDF8",
    hatBandColor: "#FACC15",
    hatStyle: "inventor-goggles",
  },
};

function drawCuteHand(opts: {
  x: number;
  y: number;
  skinColor: string;
  angleDeg?: number;
  pointFinger?: boolean;
  flipThumb?: boolean;
}): string {
  const { x, y, skinColor, angleDeg = 0, pointFinger = false, flipThumb = false } = opts;
  const sx = flipThumb ? -1 : 1;
  if (pointFinger) {
    return `<g transform="translate(${x},${y}) rotate(${angleDeg}) scale(${sx},1)">
      <ellipse cx="0" cy="4" rx="14" ry="13" fill="${skinColor}" stroke="#0F172A" stroke-width="4"/>
      <rect x="4" y="-22" width="11" height="26" rx="5.5" fill="${skinColor}" stroke="#0F172A" stroke-width="3.8"/>
      <path d="M-12,2 Q-20,-6 -10,-12 Q-3,-12 -4,-2" fill="${skinColor}" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round"/>
    </g>`;
  }
  return `<g transform="translate(${x},${y}) rotate(${angleDeg}) scale(${sx},1)">
    <ellipse cx="0" cy="4" rx="14" ry="15" fill="${skinColor}" stroke="#0F172A" stroke-width="4"/>
    <ellipse cx="14" cy="0" rx="6" ry="9" fill="${skinColor}" stroke="#0F172A" stroke-width="3.4"/>
  </g>`;
}

function drawSparkleEye(cx: number, cy: number, glanceX = 2): string {
  return `<g>
    <ellipse cx="${cx}" cy="${cy}" rx="15" ry="18.5" fill="#FFFFFF" stroke="#0F172A" stroke-width="4.2"/>
    <circle cx="${cx + glanceX}" cy="${cy + 1}" r="11" fill="#1E293B"/>
    <circle cx="${cx + glanceX + 1}" cy="${cy + 2}" r="6" fill="#0F172A"/>
    <circle cx="${cx + glanceX - 4}" cy="${cy - 5}" r="4.6" fill="#FFFFFF"/>
    <circle cx="${cx + glanceX + 4.5}" cy="${cy + 6}" r="2.3" fill="#FFFFFF"/>
  </g>`;
}

function drawHeadgear(p: HostPreset): string {
  if (p.hatStyle === "star-buns") {
    return `<g>
      <circle cx="-64" cy="-126" r="24" fill="${p.hairColor}" stroke="#0F172A" stroke-width="4.5"/>
      <circle cx="64" cy="-126" r="24" fill="${p.hairColor}" stroke="#0F172A" stroke-width="4.5"/>
      <path d="M-76,-84 C-80,-130 -44,-154 0,-154 C44,-154 80,-130 76,-84 C58,-110 38,-102 18,-116 C2,-98 -18,-100 -34,-116 C-52,-102 -64,-104 -76,-84 Z"
            fill="${p.hairColor}" stroke="#0F172A" stroke-width="4.6" stroke-linejoin="round"/>
      <polygon points="48,-132 53,-120 66,-119 56,-110 59,-98 48,-104 37,-98 40,-110 30,-119 43,-120"
               fill="${p.hatColor}" stroke="#0F172A" stroke-width="3.2"/>
    </g>`;
  }

  if (p.hatStyle === "inventor-goggles") {
    return `<g>
      <path d="M-76,-80 C-82,-130 -42,-156 0,-156 C42,-156 82,-130 76,-80 C62,-104 42,-112 22,-118 C8,-136 -8,-136 -22,-118 C-42,-112 -62,-104 -76,-80 Z"
            fill="${p.hairColor}" stroke="#0F172A" stroke-width="4.6" stroke-linejoin="round"/>
      <g transform="translate(0,-122)">
        <rect x="-64" y="-6" width="128" height="14" rx="7" fill="${p.hatBandColor}" stroke="#0F172A" stroke-width="3.5"/>
        <circle cx="-26" cy="0" r="20" fill="${p.hatColor}" stroke="#0F172A" stroke-width="4.2"/>
        <circle cx="26" cy="0" r="20" fill="${p.hatColor}" stroke="#0F172A" stroke-width="4.2"/>
        <circle cx="-26" cy="0" r="11" fill="#BAE6FD"/>
        <circle cx="26" cy="0" r="11" fill="#BAE6FD"/>
      </g>
    </g>`;
  }

  // Default Zayn Design 2: Cocoa Hair Bangs + Jaunty Captain Beret
  return `<g>
    <path d="M-76,-82 C-82,-128 -44,-154 0,-154 C44,-154 82,-128 76,-82 C62,-108 42,-104 22,-116 C6,-98 -16,-98 -32,-116 C-50,-102 -64,-104 -76,-82 Z"
          fill="${p.hairColor}" stroke="#0F172A" stroke-width="4.6" stroke-linejoin="round"/>
    <g transform="translate(0, -138) rotate(-6)">
      <ellipse cx="0" cy="-8" rx="76" ry="30" fill="${p.hatColor}" stroke="#0F172A" stroke-width="4.8"/>
      <path d="M-64,6 Q0,18 64,6 L58,-4 Q0,6 -58,-4 Z" fill="${p.hatBandColor}" stroke="#0F172A" stroke-width="4"/>
      <circle cx="0" cy="-38" r="7" fill="#FF6B6B" stroke="#0F172A" stroke-width="3.5"/>
      <circle cx="-36" cy="-8" r="9" fill="#0F172A"/>
      <path d="M-36,-13 L-36,-3 M-40,-8 L-32,-8" stroke="#FFE600" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  </g>`;
}

/** Builds the 50% waist-up circular buddy host SVG badge with standardized runtime DOM hooks. */
export function buildHostCircularBadgeSvg(options: {
  uid: string;
  characterId: HostCharacterId;
  theme?: HostThemeOverride;
}): string {
  const base = HOST_PRESETS[options.characterId] || HOST_PRESETS.zayn;
  const p: HostPreset = {
    ...base,
    ...options.theme,
  };
  const { uid } = options;

  return `<svg viewBox="0 0 300 300" style="width:100%;height:100%;overflow:visible;">
    <defs>
      <clipPath id="hostClip-${uid}">
        <circle cx="150" cy="150" r="140"/>
      </clipPath>
      <radialGradient id="hostBlush-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FB7185" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#FB7185" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <circle cx="150" cy="150" r="144" fill="${p.badgeBg}" stroke="${p.ringAccentColor}" stroke-width="7"/>
    <g clip-path="url(#hostClip-${uid})">
      <circle cx="150" cy="150" r="142" fill="rgba(255, 255, 255, 0.05)"/>
      <g id="host-body-rig" transform="translate(150, 250)">
        <!-- Compact Waist-Up Explorer Shirt & Scarf/Collar -->
        <path d="M-66,52 L-56,-34 Q0,-56 56,-34 L66,52 Z" fill="${p.shirtColor}" stroke="#0F172A" stroke-width="5" stroke-linejoin="round"/>
        <path d="M-24,-40 Q0,-12 24,-40 Z" fill="${p.shirtCollarColor}" stroke="#0F172A" stroke-width="3.5"/>
        <path d="M-5,-36 L-9,4 M5,-36 L9,4" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round"/>

        <!-- POSE 1: WAVE -->
        <g id="host-pose-wave">
          <path d="M-48,-24 Q-64,6 -52,30" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M-48,-24 Q-64,6 -52,30" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: -50, y: 34, skinColor: p.skinColor, angleDeg: -10 })}
          <path d="M50,-24 Q94,-38 92,-88" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M50,-24 Q94,-38 92,-88" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: 93, y: -96, skinColor: p.skinColor, angleDeg: 14, flipThumb: true })}
        </g>

        <!-- POSE 2: POINT UP AT STAGE -->
        <g id="host-pose-point" opacity="0">
          <path d="M-48,-24 Q-64,8 -50,30" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M-48,-24 Q-64,8 -50,30" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: -48, y: 34, skinColor: p.skinColor, angleDeg: -10 })}
          <path d="M50,-24 Q92,-56 96,-118" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M50,-24 Q92,-56 96,-118" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: 96, y: -124, skinColor: p.skinColor, angleDeg: 8, pointFinger: true })}
        </g>

        <!-- POSE 3: SHOCK / WORRY -->
        <g id="host-pose-shock" opacity="0">
          <path d="M-48,-22 Q-82,-42 -78,-84" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M-48,-22 Q-82,-42 -78,-84" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: -78, y: -88, skinColor: p.skinColor, angleDeg: -18 })}
          <path d="M48,-22 Q82,-42 78,-84" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M48,-22 Q82,-42 78,-84" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: 78, y: -88, skinColor: p.skinColor, angleDeg: 18, flipThumb: true })}
        </g>

        <!-- POSE 4: EUREKA / AHA HERO -->
        <g id="host-pose-eureka" opacity="0">
          <path d="M-48,-24 Q-82,-54 -84,-100" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M-48,-24 Q-82,-54 -84,-100" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: -84, y: -108, skinColor: p.skinColor, angleDeg: -12 })}
          <path d="M48,-24 Q82,-54 84,-100" fill="none" stroke="${p.shirtColor}" stroke-width="24" stroke-linecap="round"/>
          <path d="M48,-24 Q82,-54 84,-100" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          ${drawCuteHand({ x: 84, y: -108, skinColor: p.skinColor, angleDeg: 12, flipThumb: true })}
        </g>

        <!-- Head Group (Subtle Breathing & Blink) -->
        <g id="host-head-rig" transform="translate(0, 0)">
          <rect x="-13" y="-56" width="26" height="22" rx="10" fill="${p.skinColor}" stroke="#0F172A" stroke-width="4"/>
          <circle cx="-70" cy="-70" r="14" fill="${p.skinColor}" stroke="#0F172A" stroke-width="4"/>
          <circle cx="70" cy="-70" r="14" fill="${p.skinColor}" stroke="#0F172A" stroke-width="4"/>

          <!-- Chubby-Cheek Chibi Face -->
          <path d="M-72,-78 C-74,-128 -44,-154 0,-154 C44,-154 74,-128 72,-78 C75,-34 46,-10 0,-10 C-46,-10 -75,-34 -72,-78 Z"
                fill="${p.skinColor}" stroke="#0F172A" stroke-width="4.8"/>
          <ellipse cx="-44" cy="-48" rx="18" ry="12" fill="url(#hostBlush-${uid})"/>
          <ellipse cx="44" cy="-48" rx="18" ry="12" fill="url(#hostBlush-${uid})"/>
          <path d="M-48,-46 L-44,-52 M-40,-46 L-36,-52" stroke="#F43F5E" stroke-width="2.6" stroke-linecap="round" opacity="0.72"/>
          <path d="M36,-46 L40,-52 M44,-46 L48,-52" stroke="#F43F5E" stroke-width="2.6" stroke-linecap="round" opacity="0.72"/>
          <path d="M-3,-55 Q0,-51 3,-55" fill="none" stroke="#C27D57" stroke-width="3.5" stroke-linecap="round"/>

          <!-- Eyes + Blink -->
          <g id="host-eyes-open">
            ${drawSparkleEye(-28, -72, 2)}
            ${drawSparkleEye(28, -72, -2)}
          </g>
          <g id="host-eyes-blink" opacity="0">
            <path d="M-44,-72 Q-28,-58 -12,-72" fill="none" stroke="#0F172A" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M12,-72 Q28,-58 44,-72" fill="none" stroke="#0F172A" stroke-width="5.5" stroke-linecap="round"/>
          </g>
          <path d="M-42,-102 Q-28,-110 -14,-103" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M14,-103 Q28,-110 42,-102" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>

          <!-- Mouths: Idle / D-Smile Lip-Sync / Shock O -->
          <path id="host-mouth-idle" d="M-16,-40 Q0,-26 16,-40" fill="none" stroke="#0F172A" stroke-width="5" stroke-linecap="round"/>
          <g id="host-mouth-talk" opacity="0" transform="translate(0, -37)">
            <path d="M-15,-2 L15,-2 C15,12 -15,12 -15,-2 Z" fill="#991B1B" stroke="#0F172A" stroke-width="3.8" stroke-linejoin="round"/>
            <ellipse cx="0" cy="4.5" rx="8.5" ry="3.5" fill="#FB7185"/>
          </g>
          <g id="host-mouth-shock" opacity="0">
            <ellipse cx="0" cy="-31" rx="10" ry="13" fill="#991B1B" stroke="#0F172A" stroke-width="4"/>
            <ellipse cx="0" cy="-24" rx="6" ry="4" fill="#FB7185"/>
          </g>

          ${drawHeadgear(p)}
        </g>
      </g>
    </g>
    <circle cx="150" cy="150" r="140" fill="none" stroke="${p.ringAccentColor}" stroke-width="7"/>
  </svg>`;
}
