import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type WeatherType = "rain" | "snow" | "lightning" | "fireflies" | "leaves" | "none";

interface AtmosphereOverlayProps {
  weather?: WeatherType;
  intensity?: "light" | "medium" | "heavy";
  isVertical?: boolean;
}

// Pseudo-random generator with fixed seed for frame-by-frame determinism
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export const AtmosphereOverlay: React.FC<AtmosphereOverlayProps> = ({
  weather = "none",
  intensity = "medium",
  isVertical = false,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  if (weather === "none" || !weather) return null;

  // Particle counts based on intensity
  const countMultiplier = intensity === "light" ? 0.6 : intensity === "heavy" ? 1.5 : 1.0;

  // ==========================================
  // 1. RAIN EFFECT (HUJAN DERAS / RINTIK)
  // ==========================================
  if (weather === "rain") {
    const dropCount = Math.round(70 * countMultiplier);
    const drops = Array.from({ length: dropCount }).map((_, idx) => {
      const seed = idx + 1;
      const initialX = seededRandom(seed * 11) * width;
      const speed = 28 + seededRandom(seed * 13) * 16;
      const length = 40 + seededRandom(seed * 17) * 35;
      const opacity = 0.35 + seededRandom(seed * 19) * 0.45;
      const thickness = 1.5 + seededRandom(seed * 23) * 1.5;

      // Wrap around canvas seamlessly
      const totalY = (frame * speed + seededRandom(seed * 7) * height) % (height + 200) - 100;
      const driftX = totalY * 0.22; // 15-degree wind slant

      return {
        x: (initialX + driftX) % width,
        y: totalY,
        length,
        opacity,
        thickness,
      };
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 35,
          overflow: "hidden",
        }}
      >
        {/* Soft rain atmospheric blue haze */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.15) 0%, rgba(15, 23, 42, 0.25) 100%)",
          }}
        />
        {drops.map((drop, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${drop.x}px`,
              top: `${drop.y}px`,
              width: `${drop.thickness}px`,
              height: `${drop.length}px`,
              backgroundColor: "rgba(224, 242, 254, 0.85)",
              transform: "rotate(-14deg)",
              opacity: drop.opacity,
              filter: "blur(0.5px)",
              borderRadius: "2px",
              boxShadow: "0 0 4px rgba(255, 255, 255, 0.5)",
            }}
          />
        ))}
      </div>
    );
  }

  // ==========================================
  // 2. LIGHTNING EFFECT (PETIR & KILAT)
  // ==========================================
  if (weather === "lightning") {
    // Flash triggers periodically at frames: 25-28, 75-79, 140-144, 210-214
    const cycle = frame % 90;
    let flashOpacity = 0;
    let boltVisible = false;

    if (cycle >= 20 && cycle <= 24) {
      flashOpacity = cycle % 2 === 0 ? 0.75 : 0.4;
      boltVisible = cycle === 21 || cycle === 22;
    } else if (cycle >= 26 && cycle <= 27) {
      flashOpacity = 0.35;
    }

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 35,
          overflow: "hidden",
        }}
      >
        {/* Flash Screen Glow */}
        {flashOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: `rgba(240, 249, 255, ${flashOpacity})`,
              mixBlendMode: "screen",
              transition: "opacity 0.05s ease-out",
            }}
          />
        )}

        {/* Vector Lightning Bolt Fork */}
        {boltVisible && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
              position: "absolute",
              inset: 0,
              filter: "drop-shadow(0 0 18px rgba(186, 230, 253, 0.95)) drop-shadow(0 0 35px rgba(56, 189, 248, 0.8))",
            }}
          >
            <path
              d={
                isVertical
                  ? `M 540 0 L 510 320 L 580 400 L 460 750 L 530 840 L 420 1200`
                  : `M 1200 0 L 1140 220 L 1220 280 L 1080 540 L 1160 600 L 1020 900`
              }
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Secondary Branch */}
            <path
              d={
                isVertical
                  ? `M 510 320 L 410 460 L 370 580`
                  : `M 1140 220 L 980 340 L 920 460`
              }
              fill="none"
              stroke="#BAE6FD"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
    );
  }

  // ==========================================
  // 3. SNOW EFFECT (SALJU BERGUGURAN LEMBUT)
  // ==========================================
  if (weather === "snow") {
    const flakeCount = Math.round(50 * countMultiplier);
    const flakes = Array.from({ length: flakeCount }).map((_, idx) => {
      const seed = idx + 1;
      const initialX = seededRandom(seed * 31) * width;
      const speed = 2.5 + seededRandom(seed * 37) * 3.5;
      const size = 6 + seededRandom(seed * 41) * 12;
      const opacity = 0.5 + seededRandom(seed * 43) * 0.45;
      const swayFreq = 18 + seededRandom(seed * 47) * 15;
      const swayAmp = 20 + seededRandom(seed * 53) * 30;

      const totalY = (frame * speed + seededRandom(seed * 19) * height) % (height + 60) - 30;
      const swayX = Math.sin((frame + seed * 10) / swayFreq) * swayAmp;

      return {
        x: (initialX + swayX) % width,
        y: totalY,
        size,
        opacity,
      };
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 35,
          overflow: "hidden",
        }}
      >
        {/* Soft cool winter ambient tint */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at center, rgba(186, 230, 253, 0.08) 0%, rgba(15, 23, 42, 0.15) 100%)",
          }}
        />
        {flakes.map((flake, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${flake.x}px`,
              top: `${flake.y}px`,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              opacity: flake.opacity,
              filter: flake.size > 12 ? "blur(1.5px)" : "blur(0.5px)",
              boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)",
            }}
          />
        ))}
      </div>
    );
  }

  // ==========================================
  // 4. FIREFLIES / MAGIC DUST (KUNANG-KUNANG / DEBU AJAIB)
  // ==========================================
  if (weather === "fireflies") {
    const fireflyCount = Math.round(25 * countMultiplier);
    const fireflies = Array.from({ length: fireflyCount }).map((_, idx) => {
      const seed = idx + 1;
      const baseX = seededRandom(seed * 61) * width;
      const baseY = seededRandom(seed * 67) * height;
      const size = 8 + seededRandom(seed * 71) * 10;
      const pulseSpeed = 14 + seededRandom(seed * 73) * 10;

      // Gentle floating orbital drift
      const floatX = baseX + Math.sin((frame + seed * 12) / 25) * 45;
      const floatY = baseY + Math.cos((frame + seed * 15) / 28) * 35;
      const pulseOpacity = (Math.sin((frame + seed * 8) / pulseSpeed) + 1) / 2 * 0.75 + 0.2;

      return {
        x: floatX,
        y: floatY,
        size,
        opacity: pulseOpacity,
      };
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 35,
          overflow: "hidden",
        }}
      >
        {fireflies.map((ff, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${ff.x}px`,
              top: `${ff.y}px`,
              width: `${ff.size}px`,
              height: `${ff.size}px`,
              borderRadius: "50%",
              backgroundColor: "#FDE047",
              opacity: ff.opacity,
              boxShadow: "0 0 16px #FACC15, 0 0 30px rgba(250, 204, 21, 0.6)",
              filter: "blur(0.5px)",
            }}
          />
        ))}
      </div>
    );
  }

  // ==========================================
  // 5. AUTUMN FALLING LEAVES (DEDAUNAN GUGUR)
  // ==========================================
  if (weather === "leaves") {
    const leafCount = Math.round(20 * countMultiplier);
    const leaves = Array.from({ length: leafCount }).map((_, idx) => {
      const seed = idx + 1;
      const initialX = seededRandom(seed * 83) * width;
      const speed = 3.5 + seededRandom(seed * 89) * 3.5;
      const size = 18 + seededRandom(seed * 97) * 14;
      const color = idx % 2 === 0 ? "#F97316" : idx % 3 === 0 ? "#EAB308" : "#EF4444";

      const totalY = (frame * speed + seededRandom(seed * 29) * height) % (height + 100) - 50;
      const tumbleX = Math.sin((frame + seed * 8) / 20) * 50 + (frame * 1.5) % width;
      const rotateDeg = (frame * 4 + seed * 30) % 360;

      return {
        x: (initialX + tumbleX) % width,
        y: totalY,
        size,
        color,
        rotateDeg,
      };
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 35,
          overflow: "hidden",
        }}
      >
        {leaves.map((leaf, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${leaf.x}px`,
              top: `${leaf.y}px`,
              width: `${leaf.size}px`,
              height: `${leaf.size * 0.7}px`,
              backgroundColor: leaf.color,
              borderRadius: "80% 0 80% 0",
              transform: `rotate(${leaf.rotateDeg}deg)`,
              opacity: 0.85,
              boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
            }}
          />
        ))}
      </div>
    );
  }

  return null;
};
