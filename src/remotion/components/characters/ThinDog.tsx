import React from "react";
import { useCurrentFrame } from "remotion";

export interface ThinDogProps {
  pose?: "sitting" | "walking" | "running" | "jumping" | "sniffing" | "looking_up" | "hugging";
  scale?: number;
  flip?: boolean;
}

export const ThinDog: React.FC<ThinDogProps> = ({
  pose = "sitting",
  scale = 1.0,
  flip = false,
}) => {
  const frame = useCurrentFrame();

  const isRunning = pose === "running" || pose === "jumping";
  const runFreq = isRunning ? 0.45 : 0.15;

  // Tail wagging speed
  const tailWag = Math.sin(frame * 0.65) * 32;

  // Ear bounce with spring lag
  const earBounce = isRunning ? -25 + Math.sin(frame * 0.45) * 15 : Math.sin(frame * 0.1) * 8;

  // Running gallop cycle
  const legFront1 = isRunning ? Math.sin(frame * runFreq) * 45 : Math.sin(frame * 0.15) * 12;
  const legFront2 = isRunning ? -Math.sin(frame * runFreq) * 45 : -Math.sin(frame * 0.15) * 12;
  const legBack1 = isRunning ? -Math.sin(frame * runFreq) * 50 : -Math.sin(frame * 0.15) * 15;
  const legBack2 = isRunning ? Math.sin(frame * runFreq) * 50 : Math.sin(frame * 0.15) * 15;

  // Vertical body gallop
  const bounceY = isRunning ? Math.abs(Math.sin(frame * runFreq)) * 16 : Math.sin(frame * 0.08) * 3;
  const bodyAngle = isRunning ? -8 + Math.sin(frame * runFreq) * 6 : pose === "looking_up" ? -15 : 0;

  // Head tilt for curiosity
  const headAngle = pose === "looking_up" ? -35 : pose === "sniffing" ? 25 : Math.sin(frame * 0.05) * 3;

  return (
    <div
      style={{
        width: "320px",
        height: "360px",
        position: "relative",
        transform: `scale(${scale}) scaleX(${flip ? -1 : 1}) translateY(${-bounceY}px) rotate(${bodyAngle}deg)`,
        transformOrigin: "bottom center",
        transition: "transform 0.05s linear",
      }}
    >
      <svg
        viewBox="0 0 320 360"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {/* Fur Gradient */}
          <linearGradient id="furGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="60%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Ear Gradient */}
          <linearGradient id="earGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
        </defs>

        {/* 1. TAIL */}
        <g transform={`translate(70, 210) rotate(${tailWag}, 0, 0)`}>
          <path
            d="M0,0 Q-40,-30 -50,-80 Q-40,-85 -20,-30 Z"
            fill="url(#furGrad)"
            stroke="#92400E"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* White Tail Tip */}
          <circle cx="-47" cy="-75" r="9" fill="#FFFBEB" />
        </g>

        {/* 2. BACK LEGS */}
        {pose === "sitting" ? (
          // Sitting Back Leg Haunch
          <g>
            <ellipse cx="90" cy="285" rx="36" ry="30" fill="url(#furGrad)" stroke="#92400E" strokeWidth="3" />
            <ellipse cx="110" cy="325" rx="20" ry="12" fill="#FFFBEB" stroke="#92400E" strokeWidth="2.5" />
          </g>
        ) : (
          // Running / Walking Back Legs
          <g>
            {/* Back Leg 1 */}
            <g transform={`rotate(${legBack1}, 95, 230)`}>
              <rect x="85" y="225" width="16" height="85" rx="8" fill="url(#furGrad)" stroke="#92400E" strokeWidth="2.5" />
              <ellipse cx="95" cy="310" rx="14" ry="9" fill="#FFFBEB" stroke="#92400E" strokeWidth="2" />
            </g>
            {/* Back Leg 2 */}
            <g transform={`rotate(${legBack2}, 115, 230)`}>
              <rect x="105" y="225" width="16" height="85" rx="8" fill="#B45309" stroke="#78350F" strokeWidth="2.5" />
              <ellipse cx="115" cy="310" rx="14" ry="9" fill="#FEF3C7" stroke="#78350F" strokeWidth="2" />
            </g>
          </g>
        )}

        {/* 3. SLENDER DOG BODY */}
        <path
          d="M75,220 C70,175 160,165 210,185 C230,225 180,265 85,255 Z"
          fill="url(#furGrad)"
          stroke="#92400E"
          strokeWidth="3.5"
        />
        {/* Cream White Chest Patch */}
        <path
          d="M165,180 C190,195 215,225 195,250 C175,235 155,200 165,180 Z"
          fill="#FFFBEB"
          opacity="0.9"
        />

        {/* 4. FRONT LEGS */}
        {pose === "sitting" ? (
          // Sitting Front Legs
          <g>
            <rect x="180" y="210" width="16" height="110" rx="8" fill="url(#furGrad)" stroke="#92400E" strokeWidth="2.5" />
            <ellipse cx="190" cy="320" rx="15" ry="10" fill="#FFFBEB" stroke="#92400E" strokeWidth="2" />

            <rect x="205" y="210" width="16" height="110" rx="8" fill="url(#furGrad)" stroke="#92400E" strokeWidth="2.5" />
            <ellipse cx="215" cy="320" rx="15" ry="10" fill="#FFFBEB" stroke="#92400E" strokeWidth="2" />
          </g>
        ) : (
          // Running / Galloping Front Legs
          <g>
            {/* Front Leg 1 */}
            <g transform={`rotate(${legFront1}, 190, 210)`}>
              <rect x="182" y="210" width="16" height="95" rx="8" fill="url(#furGrad)" stroke="#92400E" strokeWidth="2.5" />
              <ellipse cx="190" cy="305" rx="14" ry="9" fill="#FFFBEB" stroke="#92400E" strokeWidth="2" />
            </g>
            {/* Front Leg 2 */}
            <g transform={`rotate(${legFront2}, 210, 210)`}>
              <rect x="202" y="210" width="16" height="95" rx="8" fill="#B45309" stroke="#78350F" strokeWidth="2.5" />
              <ellipse cx="210" cy="305" rx="14" ry="9" fill="#FEF3C7" stroke="#78350F" strokeWidth="2" />
            </g>
          </g>
        )}

        {/* 5. NECK & COLLAR */}
        <g>
          {/* Slender Neck */}
          <path d="M190,195 L215,125 L245,135 L225,205 Z" fill="url(#furGrad)" />
          {/* Red Royal Collar */}
          <polygon points="208,138 245,148 242,160 205,150" fill="#DC2626" stroke="#991B1B" strokeWidth="2" />
          {/* Golden Bell / Medallion Tag */}
          <circle cx="225" cy="162" r="8" fill="#FBBF24" stroke="#B45309" strokeWidth="2" />
          <circle cx="225" cy="162" r="3" fill="#DC2626" />
        </g>

        {/* 6. DOG HEAD & SNOUT */}
        <g transform={`translate(225, 125) rotate(${headAngle}) translate(-225, -125)`}>
          {/* Head Shape */}
          <ellipse cx="215" cy="115" rx="38" ry="32" fill="url(#furGrad)" stroke="#92400E" strokeWidth="3" />

          {/* Long Slender Snout */}
          <path
            d="M230,105 C265,108 285,120 288,130 C275,145 235,135 220,132 Z"
            fill="url(#furGrad)"
            stroke="#92400E"
            strokeWidth="3"
          />

          {/* Black Sniffer Nose */}
          <ellipse cx="286" cy="126" rx="9" ry="8" fill="#1E293B" />
          <ellipse cx="284" cy="124" rx="3" ry="2" fill="#FFFFFF" opacity="0.6" />

          {/* Happy Panting Tongue */}
          <path
            d="M260,136 Q272,165 264,170 Q254,165 252,136 Z"
            fill="#F87171"
            stroke="#DC2626"
            strokeWidth="2"
          />

          {/* Cute Big Cartoon Eye */}
          <circle cx="220" cy="105" r="9.5" fill="#FFFFFF" stroke="#92400E" strokeWidth="1.5" />
          <circle cx="222" cy="105" r="5.5" fill="#1E293B" />
          <circle cx="224" cy="103" r="2" fill="#FFFFFF" />

          {/* Eye Brow */}
          <path d="M212,94 Q222,90 230,95" stroke="#78350F" strokeWidth="2.5" fill="none" strokeLinecap="round" />

          {/* FLOPPY BOUNCING EAR */}
          <g transform={`translate(195, 95) rotate(${earBounce})`}>
            <path
              d="M0,0 C-15,35 -20,85 10,95 C25,85 15,35 5,0 Z"
              fill="url(#earGrad)"
              stroke="#451A03"
              strokeWidth="3"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};
