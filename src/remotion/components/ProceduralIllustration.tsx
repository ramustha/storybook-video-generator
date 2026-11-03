import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FatKing } from "./characters/FatKing";
import { ThinDog } from "./characters/ThinDog";
import { AppleTreeProp, BirdProp, DustPuffs, PalaceMirror, RoyalThrone } from "./characters/SceneryElements";

interface ProceduralIllustrationProps {
  scene: any;
  book: any;
  isVertical: boolean;
  isCover?: boolean;
  showTitle?: boolean;
}

export const ProceduralIllustration: React.FC<ProceduralIllustrationProps> = ({
  scene,
  book,
  isVertical,
  isCover = false,
  showTitle = true,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const sceneIdx = typeof scene.index === "number" ? scene.index : 0;
  const isActualCover = isCover || scene.type === "cover" || sceneIdx === 0;

  // Global camera pan / breath
  const breath = Math.sin(frame * 0.04) * 8;
  const sunPulse = 1 + Math.sin(frame * 0.05) * 0.06;

  // Cloud drift
  const cloud1X = (frame * 1.5) % (width + 400) - 200;
  const cloud2X = (frame * 0.9 + width * 0.5) % (width + 400) - 200;

  // Character scale: Big & heroic (500-600px tall)
  const kingScale = isVertical ? 1.05 : 1.15;
  const dogScale = isVertical ? 0.95 : 1.05;

  // =========================================================================
  // SCENE 0: COVER SCENE (Grand Illustrated Storybook Cover)
  // =========================================================================
  if (isActualCover) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #38BDF8 0%, #BAE6FD 50%, #FEF08A 85%, #86EFAC 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Glowing Sun */}
        <div
          style={{
            position: "absolute",
            top: isVertical ? "160px" : "90px",
            right: isVertical ? "100px" : "220px",
            width: "160px",
            height: "160px",
            borderRadius: "50%",
            background: "radial-gradient(circle, #FDE047 0%, rgba(251, 191, 36, 0.4) 65%, transparent 100%)",
            boxShadow: "0 0 70px #F59E0B",
            transform: `scale(${sunPulse})`,
          }}
        />

        {/* Floating Clouds */}
        <svg style={{ position: "absolute", top: "120px", left: `${cloud1X}px`, width: "260px", opacity: 0.8 }} viewBox="0 0 24 24" fill="white">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>

        {/* Distant Castle Towers on Hilltop */}
        <svg
          style={{ position: "absolute", bottom: isVertical ? "380px" : "260px", left: "10%", width: "280px", opacity: 0.7 }}
          viewBox="0 0 200 150"
        >
          {/* Castle Base & Towers */}
          <rect x="50" y="50" width="100" height="100" fill="#CBD5E1" />
          <rect x="30" y="20" width="35" height="130" fill="#94A3B8" />
          <rect x="135" y="20" width="35" height="130" fill="#94A3B8" />
          <polygon points="30,20 47,0 65,20" fill="#DC2626" />
          <polygon points="135,20 152,0 170,20" fill="#DC2626" />
          <polygon points="85,50 100,25 115,50" fill="#F59E0B" />
        </svg>

        {/* Rolling Green Hills Backdrop */}
        <svg
          style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: isVertical ? "45%" : "40%", pointerEvents: "none" }}
          viewBox="0 0 1440 500"
          preserveAspectRatio="none"
        >
          <path d="M0,220 C360,140 720,290 1080,180 C1260,140 1380,180 1440,220 L1440,500 L0,500 Z" fill="#4ADE80" opacity="0.95" />
          <path d="M0,320 C320,240 640,380 960,280 C1200,210 1360,270 1440,310 L1440,500 L0,500 Z" fill="#16A34A" />
        </svg>

        {/* GRAND HERO CHARACTERS (KING & DOG CENTERPIECE) */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? (showTitle ? "160px" : "120px") : (showTitle ? "40px" : "70px"),
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: isVertical ? "10px" : "40px",
            zIndex: 20,
          }}
        >
          {/* Big Fat King */}
          <FatKing pose="standing" isFit={false} scale={kingScale} />
          {/* Happy Thin Dog Jumping Beside Him */}
          <ThinDog pose="sitting" scale={dogScale} />
        </div>

        {/* Grand Storybook Title Banner at Top */}
        {showTitle && (
          <div
            style={{
              position: "absolute",
              top: isVertical ? "110px" : "60px",
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: `translateY(${breath * 0.4}px)`,
            }}
          >
            {/* Eyebrow Ribbon */}
            <div
              style={{
                background: "#EF4444",
                border: "3px solid #FFFFFF",
                borderRadius: "9999px",
                padding: "8px 28px",
                color: "#FFFFFF",
                fontSize: isVertical ? "20px" : "22px",
                fontWeight: 800,
                boxShadow: "0 8px 24px rgba(239, 68, 68, 0.5)",
                letterSpacing: "1px",
                marginBottom: "12px",
              }}
            >
              📖 DONGENG ANIMASI CERITA ANAK
            </div>

            {/* Main Book Title */}
            <div
              style={{
                fontSize: isVertical ? "54px" : "72px",
                fontWeight: 900,
                fontFamily: "'Arial Black', 'Fredoka', 'Montserrat', sans-serif",
                color: "#FEF08A",
                WebkitTextStroke: isVertical ? "10px #78350F" : "12px #78350F",
                paintOrder: "stroke fill",
                textShadow: "0 12px 30px rgba(0,0,0,0.6)",
                textAlign: "center",
                lineHeight: 1.1,
                letterSpacing: "0.5px",
              }}
            >
              {book.title.toUpperCase()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // SCENE 1: ISTANA MEGAH & RAJA GEMUK DI SINGGASANA
  // =========================================================================
  if (sceneIdx === 1) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #3B0764 0%, #581C87 40%, #7E22CE 75%, #FDE047 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Palace Velvet Drapery Curtains (Left & Right) */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "220px", height: "100%", background: "linear-gradient(90deg, #7F1D1D 0%, #DC2626 70%, transparent 100%)", zIndex: 15 }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: "220px", height: "100%", background: "linear-gradient(-90deg, #7F1D1D 0%, #DC2626 70%, transparent 100%)", zIndex: 15 }} />

        {/* Checkered Palace Floor */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: isVertical ? "30%" : "35%",
            background: "linear-gradient(180deg, #991B1B 0%, #450A0A 100%)",
            borderTop: "6px solid #F59E0B",
          }}
        />

        {/* Centerpiece: Throne with King Sitting */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "140px" : "50px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          {/* Throne Behind */}
          <div style={{ position: "absolute", bottom: "10px", zIndex: 1 }}>
            <RoyalThrone scale={isVertical ? 1.2 : 1.35} />
          </div>
          {/* King Sitting on Throne */}
          <div style={{ position: "relative", zIndex: 2, marginBottom: "30px" }}>
            <FatKing pose="sitting_throne" isFit={false} scale={kingScale * 1.05} />
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 2: ANJING KURUS MEMASUKI ISTANA & JADI SAHABAT
  // =========================================================================
  if (sceneIdx === 2) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #1E1B4B 0%, #312E81 50%, #4C1D95 80%, #7C3AED 100%)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {/* Floor */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#431407", borderTop: "6px solid #D97706" }} />

        {/* King & Dog Happy Encounter */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "160px" : "60px",
            display: "flex",
            alignItems: "flex-end",
            gap: isVertical ? "30px" : "80px",
            zIndex: 20,
          }}
        >
          <FatKing pose="standing" isFit={false} scale={kingScale} />
          {/* Thin Dog Jumping with Joy */}
          <ThinDog pose="jumping" scale={dogScale * 1.15} flip={true} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 3: JALAN-JALAN DI TAMAN ISTANA
  // =========================================================================
  if (sceneIdx === 3) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #38BDF8 0%, #BAE6FD 60%, #FEF08A 90%, #86EFAC 100%)",
        }}
      >
        {/* Sun */}
        <div style={{ position: "absolute", top: "80px", right: "180px", width: "140px", height: "140px", borderRadius: "50%", background: "#FDE047", boxShadow: "0 0 60px #F59E0B" }} />

        {/* Green Meadow */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "40%", background: "#16A34A", borderTop: "8px solid #4ADE80" }} />

        {/* Strolling Together */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "160px" : "60px",
            left: "50%",
            transform: `translateX(-50%)`,
            display: "flex",
            alignItems: "flex-end",
            gap: isVertical ? "20px" : "60px",
            zIndex: 20,
          }}
        >
          <FatKing pose="walking" isFit={false} scale={kingScale} />
          <ThinDog pose="walking" scale={dogScale} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 4: BURUNG KECIL DI POHON APEL
  // =========================================================================
  if (sceneIdx === 4) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #38BDF8 0%, #E0F2FE 70%, #BBF7D0 100%)",
        }}
      >
        {/* Ground */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#15803D" }} />

        {/* Apple Tree on the Right */}
        <div style={{ position: "absolute", bottom: "40px", right: isVertical ? "-60px" : "80px", zIndex: 10 }}>
          <AppleTreeProp />
          {/* Bird perched on tree branch */}
          <div style={{ position: "absolute", top: "180px", left: "140px", zIndex: 12 }}>
            <BirdProp />
          </div>
        </div>

        {/* Dog Looking Up at the Bird & King Smiling */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "140px" : "50px",
            left: isVertical ? "50px" : "200px",
            display: "flex",
            alignItems: "flex-end",
            gap: "50px",
            zIndex: 20,
          }}
        >
          <FatKing pose="standing" isFit={false} scale={kingScale * 0.95} />
          <ThinDog pose="looking_up" scale={dogScale * 1.1} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 5: ANJING LARI MELESAT MENGEJAR BURUNG!
  // =========================================================================
  if (sceneIdx === 5) {
    const dogRunX = interpolate(frame, [0, 180], [-100, width + 100], { extrapolateRight: "wrap" });
    const birdFlightX = dogRunX + 350;

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #0284C7 0%, #38BDF8 50%, #FDE047 90%, #4ADE80 100%)",
        }}
      >
        {/* Speed Motion Lines in Sky */}
        <div style={{ position: "absolute", top: "25%", left: 0, width: "100%", height: "4px", background: "rgba(255,255,255,0.4)" }} />
        <div style={{ position: "absolute", top: "35%", left: 0, width: "100%", height: "6px", background: "rgba(255,255,255,0.5)" }} />

        {/* Fast Running Ground */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#16A34A" }} />

        {/* Flying Bird */}
        <div style={{ position: "absolute", top: "180px", left: `${birdFlightX}px`, zIndex: 15 }}>
          <BirdProp flying={true} />
        </div>

        {/* Dog Galloping at High Speed with Dust Puffs */}
        <div style={{ position: "absolute", bottom: isVertical ? "160px" : "60px", left: `${dogRunX}px`, zIndex: 20 }}>
          <ThinDog pose="running" scale={dogScale * 1.25} />
          <DustPuffs count={4} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 6: SANG RAJA KAGET & MULAI BERLARI ("TUNGGU AKU!")
  // =========================================================================
  if (sceneIdx === 6) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #F97316 0%, #FB923C 40%, #FDE047 80%, #16A34A 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Ground */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#15803D" }} />

        {/* Giant Shouting & Running King */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "160px" : "50px",
            zIndex: 20,
          }}
        >
          <FatKing pose="shouting" isFit={false} scale={kingScale * 1.25} />
          <DustPuffs count={4} />
        </div>

        {/* Big Comic Shouting Bubble */}
        <div
          style={{
            position: "absolute",
            top: isVertical ? "160px" : "120px",
            background: "#FFFFFF",
            border: "6px solid #DC2626",
            borderRadius: "36px",
            padding: "16px 36px",
            fontSize: isVertical ? "38px" : "48px",
            fontWeight: 900,
            color: "#DC2626",
            boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            transform: "rotate(-4deg)",
            zIndex: 30,
          }}
        >
          🗣️ "TUNGGU AKUUUU! 🏃‍♂️💨"
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 7: BERHARI-HARI NAIK TURUN BUKIT
  // =========================================================================
  if (sceneIdx === 7) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #0369A1 0%, #38BDF8 40%, #F59E0B 80%, #4ADE80 100%)",
        }}
      >
        {/* Multi-layered Rolling Hills */}
        <svg
          style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "55%", pointerEvents: "none" }}
          viewBox="0 0 1440 600"
          preserveAspectRatio="none"
        >
          <path d="M0,280 C360,160 720,380 1080,220 C1260,160 1380,220 1440,260 L1440,600 L0,600 Z" fill="#22C55E" opacity="0.9" />
          <path d="M0,380 C320,280 640,460 960,340 C1200,240 1360,320 1440,370 L1440,600 L0,600 Z" fill="#15803D" />
        </svg>

        {/* Thin Dog Running on Forward Hill */}
        <div style={{ position: "absolute", bottom: isVertical ? "260px" : "180px", right: isVertical ? "80px" : "280px", zIndex: 15 }}>
          <ThinDog pose="running" scale={dogScale * 1.15} />
          <DustPuffs count={3} />
        </div>

        {/* Fat King Panting & Running Behind */}
        <div style={{ position: "absolute", bottom: isVertical ? "130px" : "40px", left: isVertical ? "40px" : "220px", zIndex: 20 }}>
          <FatKing pose="running" isFit={false} scale={kingScale * 1.15} />
          <DustPuffs count={5} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 8: PELUKAN HANGAT DI SORE HARI
  // =========================================================================
  if (sceneIdx === 8) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #7C2D12 0%, #C2410C 30%, #EA580C 65%, #FDE047 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Soft Golden Sunset Meadow */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#431407" }} />

        {/* Floating Hearts */}
        <div style={{ position: "absolute", top: "25%", fontSize: "54px", animation: "bounce 2s infinite", zIndex: 25 }}>
          💖 ✨ 🐶 👑 ✨ 💖
        </div>

        {/* Warm Embrace (King Hugging Dog) */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "150px" : "50px",
            display: "flex",
            alignItems: "flex-end",
            gap: "20px",
            zIndex: 20,
          }}
        >
          <FatKing pose="hugging" isFit={false} scale={kingScale * 1.2} />
          <ThinDog pose="sitting" scale={dogScale * 1.05} flip={true} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 9: CERMIN AJAIB - TUBUH BUGAR & SEHAT!
  // =========================================================================
  if (sceneIdx === 9) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #0F172A 0%, #1E293B 40%, #334155 75%, #F59E0B 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Palace Floor */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: "35%", background: "#450A0A", borderTop: "6px solid #F59E0B" }} />

        {/* Centerpiece: Palace Mirror & FIT KING Posing Proudly! */}
        <div
          style={{
            position: "absolute",
            bottom: isVertical ? "150px" : "50px",
            display: "flex",
            alignItems: "flex-end",
            gap: isVertical ? "20px" : "60px",
            zIndex: 20,
          }}
        >
          {/* Palace Mirror */}
          <PalaceMirror />

          {/* FIT KING Posing Proudly with Muscles! */}
          <FatKing pose="fit_posing" isFit={true} scale={kingScale * 1.25} />

          {/* Happy Dog Cheering */}
          <ThinDog pose="jumping" scale={dogScale * 1.1} />
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCENE 10 & 11: CELEBRATION / MORAL / OUTRO
  // =========================================================================
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(180deg, #020617 0%, #0F172A 50%, #1E1B4B 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Both Characters Celebrating */}
      <div
        style={{
          position: "absolute",
          bottom: isVertical ? "150px" : "50px",
          display: "flex",
          alignItems: "flex-end",
          gap: isVertical ? "20px" : "50px",
          zIndex: 20,
        }}
      >
        <FatKing pose="standing" isFit={true} scale={kingScale * 1.1} />
        <ThinDog pose="sitting" scale={dogScale * 1.05} />
      </div>
    </div>
  );
};
