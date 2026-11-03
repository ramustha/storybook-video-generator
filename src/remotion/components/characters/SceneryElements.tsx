import React from "react";
import { useCurrentFrame } from "remotion";

export const RoyalThrone: React.FC<{ scale?: number }> = ({ scale = 1.0 }) => {
  return (
    <div
      style={{
        width: "360px",
        height: "460px",
        position: "relative",
        transform: `scale(${scale})`,
        transformOrigin: "bottom center",
      }}
    >
      <svg viewBox="0 0 360 460" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="throneGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="velvetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>
        </defs>

        {/* Throne Back Outer Gold Frame */}
        <path
          d="M60,160 C60,40 180,10 180,10 C180,10 300,40 300,160 L290,360 L70,360 Z"
          fill="url(#throneGold)"
          stroke="#78350F"
          strokeWidth="6"
        />

        {/* Gold Finials */}
        <circle cx="60" cy="140" r="14" fill="url(#throneGold)" stroke="#78350F" strokeWidth="3" />
        <circle cx="300" cy="140" r="14" fill="url(#throneGold)" stroke="#78350F" strokeWidth="3" />
        <circle cx="180" cy="10" r="18" fill="url(#throneGold)" stroke="#78350F" strokeWidth="4" />
        <circle cx="180" cy="10" r="8" fill="#DC2626" />

        {/* Crimson Velvet Padded Back */}
        <path
          d="M85,165 C85,65 180,45 180,45 C180,45 275,65 275,165 L265,340 L95,340 Z"
          fill="url(#velvetGrad)"
          stroke="#991B1B"
          strokeWidth="3"
        />
        {/* Tufted Cushion Buttons */}
        <circle cx="140" cy="130" r="5" fill="#7F1D1D" />
        <circle cx="220" cy="130" r="5" fill="#7F1D1D" />
        <circle cx="180" cy="170" r="5" fill="#7F1D1D" />
        <circle cx="140" cy="220" r="5" fill="#7F1D1D" />
        <circle cx="220" cy="220" r="5" fill="#7F1D1D" />
        <circle cx="180" cy="260" r="5" fill="#7F1D1D" />

        {/* Throne Velvet Seat Cushion */}
        <rect x="50" y="340" width="260" height="50" rx="14" fill="url(#velvetGrad)" stroke="#78350F" strokeWidth="4" />

        {/* Left Armrest */}
        <rect x="35" y="270" width="40" height="90" rx="12" fill="url(#throneGold)" stroke="#78350F" strokeWidth="4" />
        <ellipse cx="55" cy="270" rx="22" ry="12" fill="#FDE047" stroke="#78350F" strokeWidth="3" />

        {/* Right Armrest */}
        <rect x="285" y="270" width="40" height="90" rx="12" fill="url(#throneGold)" stroke="#78350F" strokeWidth="4" />
        <ellipse cx="305" cy="270" rx="22" ry="12" fill="#FDE047" stroke="#78350F" strokeWidth="3" />

        {/* Sturdy Throne Base Legs */}
        <rect x="60" y="390" width="35" height="55" rx="8" fill="url(#throneGold)" stroke="#78350F" strokeWidth="3" />
        <rect x="265" y="390" width="35" height="55" rx="8" fill="url(#throneGold)" stroke="#78350F" strokeWidth="3" />
      </svg>
    </div>
  );
};

export const BirdProp: React.FC<{ flying?: boolean }> = ({ flying = false }) => {
  const frame = useCurrentFrame();
  const wingFlap = Math.sin(frame * 0.45) * 35;
  const bobY = Math.sin(frame * 0.15) * 6;

  return (
    <div
      style={{
        width: "90px",
        height: "80px",
        position: "relative",
        transform: `translateY(${bobY}px)`,
      }}
    >
      <svg viewBox="0 0 90 80" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        {/* Bird Body */}
        <ellipse cx="45" cy="45" rx="24" ry="18" fill="#38BDF8" stroke="#0284C7" strokeWidth="2" />
        {/* Yellow Chest */}
        <ellipse cx="52" cy="48" rx="14" ry="12" fill="#FEF08A" />

        {/* Head */}
        <circle cx="62" cy="32" r="14" fill="#38BDF8" stroke="#0284C7" strokeWidth="2" />
        {/* Eye */}
        <circle cx="66" cy="29" r="3.5" fill="#FFFFFF" />
        <circle cx="67" cy="29" r="1.8" fill="#0F172A" />
        {/* Orange Beak */}
        <polygon points="76,32 88,35 76,38" fill="#F97316" stroke="#C2410C" strokeWidth="1.5" />

        {/* Animated Flapping Wing */}
        <g transform={`translate(40, 42) rotate(${wingFlap})`}>
          <path d="M0,0 Q-25,-30 -35,-15 Q-20,10 0,0" fill="#0284C7" />
        </g>

        {/* Tail */}
        <polygon points="21,46 5,42 12,52" fill="#0284C7" />
      </svg>
    </div>
  );
};

export const AppleTreeProp: React.FC = () => {
  const frame = useCurrentFrame();
  const sway = Math.sin(frame * 0.04) * 1.5;

  return (
    <div
      style={{
        width: "480px",
        height: "560px",
        position: "relative",
        transform: `rotate(${sway}deg)`,
        transformOrigin: "bottom center",
      }}
    >
      <svg viewBox="0 0 480 560" style={{ width: "100%", height: "100%" }}>
        {/* Tree Trunk */}
        <path
          d="M210,560 Q205,380 180,310 Q240,240 240,160 Q270,250 310,310 Q285,380 280,560 Z"
          fill="#78350F"
          stroke="#451A03"
          strokeWidth="4"
        />

        {/* Lush Tree Foliage Layers */}
        <circle cx="160" cy="220" r="90" fill="#15803D" opacity="0.9" />
        <circle cx="320" cy="220" r="90" fill="#15803D" opacity="0.9" />
        <circle cx="240" cy="140" r="110" fill="#16A34A" />
        <circle cx="190" cy="240" r="85" fill="#22C55E" />
        <circle cx="290" cy="240" r="85" fill="#22C55E" />

        {/* Juicy Red Apples */}
        <circle cx="180" cy="150" r="12" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
        <circle cx="290" cy="160" r="12" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
        <circle cx="230" cy="220" r="12" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
        <circle cx="150" cy="230" r="12" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
        <circle cx="330" cy="220" r="12" fill="#DC2626" stroke="#7F1D1D" strokeWidth="2" />
      </svg>
    </div>
  );
};

export const PalaceMirror: React.FC = () => {
  return (
    <div style={{ width: "320px", height: "540px", position: "relative" }}>
      <svg viewBox="0 0 320 540" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="mirrorGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="glassReflection" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E0F2FE" />
            <stop offset="50%" stopColor="#BAE6FD" />
            <stop offset="100%" stopColor="#7DD3FC" />
          </linearGradient>
        </defs>

        {/* Stand Base */}
        <path d="M40,510 L280,510 L260,535 L60,535 Z" fill="url(#mirrorGold)" stroke="#78350F" strokeWidth="3" />

        {/* Ornate Gold Outer Arch Frame */}
        <path
          d="M40,510 L40,160 C40,40 280,40 280,160 L280,510 Z"
          fill="url(#mirrorGold)"
          stroke="#78350F"
          strokeWidth="6"
        />

        {/* Glass Mirror Pane */}
        <path
          d="M60,490 L60,160 C60,65 260,65 260,160 L260,490 Z"
          fill="url(#glassReflection)"
          stroke="#38BDF8"
          strokeWidth="3"
        />

        {/* Glossy Diagonal Reflection Streaks */}
        <polygon points="80,120 140,75 190,470 130,470" fill="#FFFFFF" opacity="0.3" />
        <polygon points="170,80 200,65 240,380 210,380" fill="#FFFFFF" opacity="0.25" />

        {/* Crown Crest on top of mirror */}
        <polygon points="140,40 160,15 180,40" fill="#DC2626" stroke="#B45309" strokeWidth="2" />
        <circle cx="160" cy="15" r="5" fill="#FDE047" />
      </svg>
    </div>
  );
};

export const DustPuffs: React.FC<{ count?: number }> = ({ count = 3 }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ position: "absolute", bottom: "30px", left: "-60px", display: "flex", gap: "15px" }}>
      {Array.from({ length: count }).map((_, i) => {
        const offset = (frame * 1.5 + i * 20) % 60;
        const scale = 0.5 + (offset / 60) * 0.8;
        const opacity = 0.8 - offset / 70;
        return (
          <div
            key={i}
            style={{
              width: "36px",
              height: "26px",
              borderRadius: "50%",
              backgroundColor: "rgba(254, 243, 199, 0.75)",
              transform: `translate(-${offset * 2}px, -${offset * 0.5}px) scale(${scale})`,
              opacity,
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </div>
  );
};
