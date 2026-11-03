import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export interface FatKingProps {
  pose?: "standing" | "sitting_throne" | "walking" | "running" | "shouting" | "hugging" | "fit_posing";
  isFit?: boolean;
  scale?: number;
  flip?: boolean;
}

export const FatKing: React.FC<FatKingProps> = ({
  pose = "standing",
  isFit = false,
  scale = 1.0,
  flip = false,
}) => {
  const frame = useCurrentFrame();

  // Natural breathing & bobbing animation
  const breath = Math.sin(frame * 0.08) * 4;
  const runCycle = Math.sin(frame * 0.35);
  const legCycle = Math.sin(frame * 0.35) * 28;

  // Running tilt & bounce
  const isRunning = pose === "running" || pose === "shouting";
  const bodyTilt = isRunning ? 14 : Math.sin(frame * 0.05) * 1.5;
  const bounceY = isRunning ? Math.abs(Math.sin(frame * 0.35)) * 18 : breath;

  // Crown bob
  const crownRotate = isRunning ? Math.sin(frame * 0.35) * 8 - 6 : Math.sin(frame * 0.06) * 2;

  // Arm swing for running
  const leftArmAngle = isRunning ? -runCycle * 40 : pose === "fit_posing" ? -60 : 10;
  const rightArmAngle = isRunning ? runCycle * 40 : pose === "fit_posing" ? 60 : -10;

  // Blinking animation: closed every ~90 frames for 4 frames
  const isBlinking = frame % 100 < 4 && pose !== "shouting";

  return (
    <div
      style={{
        width: isFit ? "340px" : "420px",
        height: "520px",
        position: "relative",
        transform: `scale(${scale}) scaleX(${flip ? -1 : 1}) translateY(${-bounceY}px) rotate(${bodyTilt}deg)`,
        transformOrigin: "bottom center",
        transition: "transform 0.05s linear",
      }}
    >
      <svg
        viewBox="0 0 400 500"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {/* Royal Cloak Velvet Gradient */}
          <linearGradient id="kingRobeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="60%" stopColor="#991B1B" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>

          {/* Royal Gold Gradient */}
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Skin Tone Gradient */}
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* 1. RUNNING LEGS */}
        {pose === "sitting_throne" ? (
          // Sitting legs
          <g>
            <rect x="140" y="380" width="45" height="70" rx="15" fill="#1E293B" />
            <rect x="215" y="380" width="45" height="70" rx="15" fill="#1E293B" />
            {/* Royal Golden Shoes */}
            <ellipse cx="160" cy="455" rx="30" ry="16" fill="url(#goldGrad)" stroke="#78350F" strokeWidth="3" />
            <ellipse cx="240" cy="455" rx="30" ry="16" fill="url(#goldGrad)" stroke="#78350F" strokeWidth="3" />
          </g>
        ) : (
          // Standing / Running Legs
          <g>
            {/* Left Leg */}
            <g transform={`rotate(${legCycle}, 160, 380)`}>
              <rect x="145" y="380" width="40" height="85" rx="18" fill="#1E293B" />
              {/* Left Shoe */}
              <ellipse cx="160" cy="465" rx="28" ry="16" fill="url(#goldGrad)" stroke="#78350F" strokeWidth="3" />
              <circle cx="170" cy="460" r="5" fill="#EF4444" />
            </g>
            {/* Right Leg */}
            <g transform={`rotate(${-legCycle}, 240, 380)`}>
              <rect x="215" y="380" width="40" height="85" rx="18" fill="#1E293B" />
              {/* Right Shoe */}
              <ellipse cx="240" cy="465" rx="28" ry="16" fill="url(#goldGrad)" stroke="#78350F" strokeWidth="3" />
              <circle cx="250" cy="460" r="5" fill="#EF4444" />
            </g>
          </g>
        )}

        {/* 2. ROYAL BODY / ROBE */}
        {isFit ? (
          // Fit Athletic King Tunic
          <g>
            {/* Athletic Chest & Tunic */}
            <path
              d="M130,220 C130,200 270,200 270,220 L285,390 C285,405 115,405 115,390 Z"
              fill="url(#kingRobeGrad)"
              stroke="#7F1D1D"
              strokeWidth="4"
            />
            {/* Golden Belt */}
            <rect x="120" y="310" width="160" height="28" rx="6" fill="#F59E0B" stroke="#78350F" strokeWidth="3" />
            <rect x="180" y="304" width="40" height="40" rx="8" fill="url(#goldGrad)" stroke="#B45309" strokeWidth="3" />
            <circle cx="200" cy="324" r="8" fill="#DC2626" />
          </g>
        ) : (
          // Voluminous Fat King Robe
          <g>
            {/* Royal Cape Behind */}
            <path
              d="M80,240 C50,330 60,420 90,440 C140,455 260,455 310,440 C340,420 350,330 320,240 Z"
              fill="#7F1D1D"
            />
            {/* Giant Round Belly */}
            <ellipse
              cx="200"
              cy="310"
              rx="135"
              ry="120"
              fill="url(#kingRobeGrad)"
              stroke="#7F1D1D"
              strokeWidth="5"
            />
            {/* White Ermine Fur Collar & Trim */}
            <path
              d="M120,210 C150,250 250,250 280,210 C295,300 270,390 200,410 C130,390 105,300 120,210 Z"
              fill="#F8FAFC"
              stroke="#CBD5E1"
              strokeWidth="3"
            />
            {/* Ermine Fur Black Spots */}
            <circle cx="150" cy="270" r="4" fill="#0F172A" />
            <circle cx="180" cy="300" r="4" fill="#0F172A" />
            <circle cx="220" cy="300" r="4" fill="#0F172A" />
            <circle cx="250" cy="270" r="4" fill="#0F172A" />
            <circle cx="200" cy="340" r="4" fill="#0F172A" />
            <circle cx="160" cy="370" r="4" fill="#0F172A" />
            <circle cx="240" cy="370" r="4" fill="#0F172A" />
          </g>
        )}

        {/* 3. ARMS */}
        {/* Left Arm */}
        <g transform={`rotate(${leftArmAngle}, 110, 220)`}>
          <path d="M120,220 Q70,250 65,300 Q95,320 120,260 Z" fill="url(#kingRobeGrad)" />
          {/* White Royal Glove */}
          <circle cx="65" cy="305" r="22" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
          <ellipse cx="60" cy="295" rx="8" ry="12" fill="#F8FAFC" />
        </g>
        {/* Right Arm */}
        <g transform={`rotate(${rightArmAngle}, 290, 220)`}>
          <path d="M280,220 Q330,250 335,300 Q305,320 280,260 Z" fill="url(#kingRobeGrad)" />
          {/* White Royal Glove */}
          <circle cx="335" cy="305" r="22" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
          <ellipse cx="340" cy="295" rx="8" ry="12" fill="#F8FAFC" />
        </g>

        {/* 4. KING'S HEAD & FACE */}
        <g transform={`translate(0, ${isRunning ? -4 : 0})`}>
          {/* Wavy Black Hair (Back) */}
          <ellipse cx="140" cy="155" rx="30" ry="35" fill="#1E293B" />
          <ellipse cx="260" cy="155" rx="30" ry="35" fill="#1E293B" />
          <ellipse cx="200" cy="170" rx="75" ry="35" fill="#1E293B" />

          {/* Round Chubby Face */}
          <circle cx="200" cy="145" r="65" fill="#FED7AA" stroke="#FDBA74" strokeWidth="3" />

          {/* Rosy Cheeks */}
          <circle cx="155" cy="165" r="14" fill="#F87171" opacity="0.45" />
          <circle cx="245" cy="165" r="14" fill="#F87171" opacity="0.45" />

          {/* Eyes */}
          {isBlinking ? (
            // Closed / Blinking Eyes
            <g>
              <path d="M160,135 Q172,145 184,135" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" fill="none" />
              <path d="M216,135 Q228,145 240,135" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" fill="none" />
            </g>
          ) : pose === "hugging" ? (
            // Happy Closed Crescent Eyes
            <g>
              <path d="M160,140 Q172,125 184,140" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" fill="none" />
              <path d="M216,140 Q228,125 240,140" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" fill="none" />
            </g>
          ) : (
            // Big Friendly Open Eyes
            <g>
              <circle cx="172" cy="135" r="11" fill="#FFFFFF" />
              <circle cx="174" cy="135" r="6" fill="#1E293B" />
              <circle cx="176" cy="133" r="2.5" fill="#FFFFFF" />

              <circle cx="228" cy="135" r="11" fill="#FFFFFF" />
              <circle cx="230" cy="135" r="6" fill="#1E293B" />
              <circle cx="232" cy="133" r="2.5" fill="#FFFFFF" />
            </g>
          )}

          {/* Cute Round Nose */}
          <ellipse cx="200" cy="150" rx="9" ry="7" fill="#FB923C" />

          {/* Luscious Curly Mustache */}
          <path
            d="M200,165 C185,150 150,155 145,175 C165,185 190,175 200,165 C210,175 235,185 255,175 C250,155 215,150 200,165 Z"
            fill="#1E293B"
          />

          {/* Mouth */}
          {pose === "shouting" ? (
            // Shouting "Tunggu!" wide open mouth
            <g>
              <ellipse cx="200" cy="188" rx="18" ry="14" fill="#7F1D1D" stroke="#1E293B" strokeWidth="3" />
              <ellipse cx="200" cy="194" rx="10" ry="6" fill="#F87171" />
            </g>
          ) : (
            // Warm Happy Smile
            <path
              d="M185,180 Q200,195 215,180"
              stroke="#1E293B"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          )}

          {/* Cute Round Ears */}
          <circle cx="134" cy="150" r="14" fill="#FED7AA" stroke="#FDBA74" strokeWidth="2" />
          <circle cx="266" cy="150" r="14" fill="#FED7AA" stroke="#FDBA74" strokeWidth="2" />
        </g>

        {/* 5. ORNATE ROYAL GOLDEN CROWN */}
        <g transform={`translate(200, 85) rotate(${crownRotate}) translate(-200, -85)`}>
          {/* Crown Base & Peaks */}
          <path
            d="M145,85 L155,30 L180,60 L200,15 L220,60 L245,30 L255,85 Z"
            fill="url(#goldGrad)"
            stroke="#78350F"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Jewels on Peaks */}
          <circle cx="155" cy="30" r="7" fill="#DC2626" stroke="#991B1B" strokeWidth="1.5" />
          <circle cx="200" cy="15" r="9" fill="#2563EB" stroke="#1D4ED8" strokeWidth="2" />
          <circle cx="245" cy="30" r="7" fill="#16A34A" stroke="#15803D" strokeWidth="1.5" />

          {/* Crown Gem Band */}
          <rect x="145" y="75" width="110" height="15" rx="4" fill="#B45309" />
          <circle cx="165" cy="82" r="4.5" fill="#DC2626" />
          <circle cx="185" cy="82" r="4.5" fill="#F8FAFC" />
          <circle cx="200" cy="82" r="5" fill="#2563EB" />
          <circle cx="215" cy="82" r="4.5" fill="#F8FAFC" />
          <circle cx="235" cy="82" r="4.5" fill="#16A34A" />
        </g>

        {/* 6. SWEAT DROPS (when running/shouting) */}
        {isRunning && (
          <g>
            <path
              d="M130,110 C120,95 140,85 130,70 C110,85 110,105 130,110 Z"
              fill="#38BDF8"
              opacity="0.85"
              transform={`translate(${Math.sin(frame * 0.5) * 6}, -5)`}
            />
            <path
              d="M270,110 C280,95 260,85 270,70 C290,85 290,105 270,110 Z"
              fill="#38BDF8"
              opacity="0.85"
              transform={`translate(${-Math.sin(frame * 0.5) * 6}, -5)`}
            />
          </g>
        )}
      </svg>
    </div>
  );
};
