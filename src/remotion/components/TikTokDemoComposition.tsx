import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const TikTokDemoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // 1. Mouse cursor trajectory keyframes
  // Frame 0-60: enter from top-right towards Login button
  // Frame 60-80: hover over Login button
  // Frame 80: click Login
  // Frame 90-160: move to Authorize button in modal
  // Frame 180: click Authorize
  // Frame 220-270: move to caption box
  // Frame 350-400: move to Publish button
  // Frame 400: click Publish
  // Frame 420-550: move aside to observe progress
  let cursorX = 1400;
  let cursorY = 150;
  let cursorClick = 0; // 0 to 1 ripple intensity

  if (frame < 60) {
    cursorX = interpolate(frame, [0, 60], [1500, 1320], { extrapolateRight: "clamp" });
    cursorY = interpolate(frame, [0, 60], [120, 315], { extrapolateRight: "clamp" });
  } else if (frame < 80) {
    cursorX = 1320;
    cursorY = 315;
  } else if (frame >= 80 && frame < 95) {
    cursorX = 1320;
    cursorY = 315;
    cursorClick = interpolate(frame, [80, 85, 95], [0, 1, 0], { extrapolateRight: "clamp" });
  } else if (frame >= 95 && frame < 170) {
    cursorX = interpolate(frame, [95, 170], [1320, 1070], { extrapolateRight: "clamp" });
    cursorY = interpolate(frame, [95, 170], [315, 695], { extrapolateRight: "clamp" });
  } else if (frame >= 170 && frame < 195) {
    cursorX = 1070;
    cursorY = 695;
    cursorClick = interpolate(frame, [175, 180, 195], [0, 1, 0], { extrapolateRight: "clamp" });
  } else if (frame >= 195 && frame < 260) {
    cursorX = interpolate(frame, [195, 260], [1070, 1300], { extrapolateRight: "clamp" });
    cursorY = interpolate(frame, [195, 260], [695, 480], { extrapolateRight: "clamp" });
  } else if (frame >= 260 && frame < 360) {
    cursorX = 1300;
    cursorY = 480;
  } else if (frame >= 360 && frame < 400) {
    cursorX = interpolate(frame, [360, 400], [1300, 1340], { extrapolateRight: "clamp" });
    cursorY = interpolate(frame, [360, 400], [480, 770], { extrapolateRight: "clamp" });
  } else if (frame >= 400 && frame < 420) {
    cursorX = 1340;
    cursorY = 770;
    cursorClick = interpolate(frame, [400, 405, 420], [0, 1, 0], { extrapolateRight: "clamp" });
  } else {
    cursorX = interpolate(frame, [420, 500], [1340, 1580], { extrapolateRight: "clamp" });
    cursorY = interpolate(frame, [420, 500], [770, 700], { extrapolateRight: "clamp" });
  }

  // 2. Application states
  const isModalOpen = frame >= 85 && frame < 205;
  const isConnected = frame >= 200;
  const isPublishing = frame >= 405 && frame < 580;
  const isPublished = frame >= 580;

  // Caption typing animation (frames 260 to 360)
  const fullCaption = "Kucing Oren Nyangkut di Pohon! 🐱 Cerita seru Zayn menyelamatkan si Oren. #ceritaanak #dongeng #edukasianak";
  const typedLength = Math.floor(
    interpolate(frame, [260, 350], [0, fullCaption.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const currentCaption = fullCaption.slice(0, typedLength);

  // Upload Progress calculation (frames 405 to 580)
  const uploadPct = Math.floor(
    interpolate(frame, [405, 570], [0, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  let uploadStatusText = "Calling TikTok Content Posting API (/v2/post/publish/video/init/)...";
  if (uploadPct > 25 && uploadPct <= 65) {
    uploadStatusText = "Streaming video binary chunk to TikTok CDN (PULL_FROM_URL)...";
  } else if (uploadPct > 65 && uploadPct < 100) {
    uploadStatusText = "TikTok servers transcoding and verifying permissions...";
  } else if (uploadPct >= 100) {
    uploadStatusText = "Publish confirmed! Fetching live TikTok post ID...";
  }

  // Top HUD Callout info based on current phase
  let hudBadge = {
    tag: "PRODUCT 1: LOGIN KIT",
    scope: "user.info.basic",
    title: "Channel Owner Authentication",
    color: "#3B82F6",
  };
  if (frame >= 200 && frame < 405) {
    hudBadge = {
      tag: "PRODUCT 2: CONTENT POSTING API",
      scope: "video.publish",
      title: "Preparing 9:16 Video Asset & Metadata",
      color: "#EC4899",
    };
  } else if (frame >= 405 && frame < 580) {
    hudBadge = {
      tag: "API EXECUTION: DIRECT POST",
      scope: "video.publish",
      title: "Calling POST /v2/post/publish/video/init/",
      color: "#FE2C55",
    };
  } else if (frame >= 580) {
    hudBadge = {
      tag: "VERIFICATION COMPLETE",
      scope: "user.info.basic • video.publish",
      title: "Video Successfully Published to Feed",
      color: "#10B981",
    };
  }

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#0B0F19",
        backgroundImage: "radial-gradient(circle at 50% 20%, #1e1b4b 0%, #030712 100%)",
        position: "relative",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Subtle Background Glows */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          left: "20%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(254,44,85,0.12) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "20%",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,244,238,0.1) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Main Browser Window Frame */}
      <div
        style={{
          width: 1720,
          height: 960,
          backgroundColor: "#0F172A",
          borderRadius: 20,
          boxShadow: "0 25px 70px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* macOS Browser Title Bar & Tabs */}
        <div
          style={{
            height: 52,
            backgroundColor: "#0A0E1A",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 16,
            zIndex: 10,
          }}
        >
          {/* Traffic Lights */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 13, height: 13, borderRadius: "50%", backgroundColor: "#FF5F56" }} />
            <div style={{ width: 13, height: 13, borderRadius: "50%", backgroundColor: "#FFBD2E" }} />
            <div style={{ width: 13, height: 13, borderRadius: "50%", backgroundColor: "#27C93F" }} />
          </div>

          {/* Navigation Arrows & Reload */}
          <div style={{ display: "flex", gap: 12, color: "#64748B", fontSize: 13, marginLeft: 8 }}>
            <span>←</span>
            <span>→</span>
            <span>↻</span>
          </div>

          {/* URL Address Bar */}
          <div
            style={{
              flex: 1,
              maxWidth: 720,
              height: 34,
              backgroundColor: "#1E293B",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              gap: 8,
              fontSize: 13,
            }}
          >
            <span style={{ color: "#10B981", fontSize: 12 }}>🔒</span>
            <span style={{ color: "#94A3B8" }}>https://</span>
            <span style={{ color: "#F8FAFC", fontWeight: 700 }}>ramustha.github.io</span>
            <span style={{ color: "#38BDF8" }}>/publisher/</span>
            <span
              style={{
                marginLeft: "auto",
                backgroundColor: "rgba(16,185,129,0.15)",
                color: "#10B981",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid rgba(16,185,129,0.3)",
              }}
            >
              Verified Domain
            </span>
          </div>

          {/* Window Control Right Icons */}
          <div style={{ display: "flex", gap: 14, color: "#64748B", fontSize: 14, marginLeft: "auto" }}>
            <span>⭐</span>
            <span>⋯</span>
          </div>
        </div>

        {/* Browser Page Header / Navbar */}
        <div
          style={{
            height: 64,
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, #F59E0B 0%, #F43F5E 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                boxShadow: "0 4px 12px rgba(244,63,94,0.3)",
              }}
            >
              📖
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF" }}>Zayn Storybook Studio</span>
                <span
                  style={{
                    fontSize: 11,
                    backgroundColor: "rgba(99,102,241,0.2)",
                    color: "#818CF8",
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(99,102,241,0.3)",
                    fontWeight: 600,
                  }}
                >
                  TikTok Publisher v1.2
                </span>
              </div>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>Automated Educational Story Distribution Pipeline</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: "#94A3B8",
                backgroundColor: "#0B0F19",
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10B981" }} />
              <span>Target: ramustha.github.io</span>
            </div>

            {isConnected && (
              <div
                style={{
                  fontSize: 12,
                  color: "#F8FAFC",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #FE2C55, #6366F1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  Z
                </div>
                <span style={{ fontWeight: 600 }}>@zayn.storybook</span>
              </div>
            )}
          </div>
        </div>

        {/* Page Body Grid */}
        <div style={{ flex: 1, padding: "28px 32px", display: "grid", gridTemplateColumns: "480px 1fr", gap: 28 }}>
          
          {/* Left Column: Vertical Storybook Video Card */}
          <div
            style={{
              backgroundColor: "#0B0F19",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#F8FAFC", fontWeight: 700, fontSize: 14 }}>
                <span style={{ color: "#F43F5E" }}>🎬</span>
                <span>Rendered Episode Asset</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  backgroundColor: "rgba(16,185,129,0.15)",
                  color: "#10B981",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                1080x1920 • 9:16
              </span>
            </div>

            {/* Video Mock Screen */}
            <div
              style={{
                flex: 1,
                borderRadius: 12,
                backgroundColor: "#030712",
                border: "1px solid rgba(255,255,255,0.08)",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: 20,
                background: "linear-gradient(180deg, rgba(245,158,11,0.2) 0%, #030712 90%)",
              }}
            >
              {/* Illustration Art in Video */}
              <div
                style={{
                  position: "absolute",
                  top: "22%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 24,
                    backgroundColor: "rgba(245,158,11,0.2)",
                    border: "2px solid rgba(245,158,11,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 64,
                    boxShadow: "0 10px 30px rgba(245,158,11,0.3)",
                    margin: "0 auto 14px",
                  }}
                >
                  🐱
                </div>
                <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 18 }}>Gara-gara Kucing</div>
                <div style={{ color: "#FDE68A", fontSize: 12, marginTop: 4 }}>Kucing Oren Nyangkut di Pohon</div>
              </div>

              {/* Play Overlay */}
              <div
                style={{
                  position: "absolute",
                  top: "45%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  backgroundColor: "rgba(254,44,85,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontSize: 22,
                  boxShadow: "0 8px 24px rgba(254,44,85,0.4)",
                }}
              >
                ▶
              </div>

              {/* TikTok UI Elements on Video */}
              <div style={{ zIndex: 2 }}>
                <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 13 }}>@zayn.storybook</div>
                <div style={{ color: "#E2E8F0", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                  Kucing Oren Nyangkut di Pohon! 🐱 Cerita seru Zayn menyelamatkan kucing oren...
                </div>
                <div style={{ color: "#FE2C55", fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                  #ceritaanak #dongeng #edukasianak
                </div>
              </div>

              {/* TikTok Right Action Column Mock */}
              <div
                style={{
                  position: "absolute",
                  bottom: 24,
                  right: 14,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  color: "#FFFFFF",
                  fontSize: 18,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>❤️</div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700 }}>12.4K</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💬</div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700 }}>348</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>↗️</div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700 }}>1.2K</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B" }}>
              <span>Audio: Dual TTS + Dynamic Ducking</span>
              <span>Format: MP4 (H.264)</span>
            </div>
          </div>

          {/* Right Column: Integration Workflow */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            
            {/* Step 1: Login Kit Authorization Card */}
            <div
              style={{
                backgroundColor: "#0B0F19",
                borderRadius: 16,
                border: isConnected ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.08)",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: "#000000",
                      border: "1px solid rgba(255,255,255,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      color: "#FFFFFF",
                    }}
                  >
                    🎵
                  </div>
                  <div>
                    <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>
                      1. TikTok Login Kit Authentication
                    </div>
                    <div style={{ color: "#94A3B8", fontSize: 11 }}>
                      Requests scope: <code style={{ color: "#38BDF8", fontWeight: 700 }}>user.info.basic</code>
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    backgroundColor: isConnected ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                    color: isConnected ? "#10B981" : "#F59E0B",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontWeight: 700,
                    border: isConnected ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  {isConnected ? "✓ Authorized & Connected" : "Action Required"}
                </span>
              </div>

              {!isConnected ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>
                    Authenticate with TikTok OAuth 2.0 PKCE to verify creator account identity.
                  </span>
                  <div
                    style={{
                      backgroundColor: "#000000",
                      color: "#FFFFFF",
                      padding: "10px 22px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.25)",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                    }}
                  >
                    <span style={{ color: "#FE2C55" }}>🎵</span>
                    <span>Log in with TikTok</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: "rgba(15,23,42,0.8)",
                    borderRadius: 12,
                    padding: "12px 18px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #FE2C55, #6366F1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        border: "2px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      Z
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>Zayn Storybook</span>
                        <span style={{ color: "#10B981", fontSize: 13 }}>✓</span>
                      </div>
                      <span style={{ color: "#94A3B8", fontSize: 12 }}>@zayn.storybook (Verified Creator)</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        backgroundColor: "rgba(56,189,248,0.15)",
                        color: "#38BDF8",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        border: "1px solid rgba(56,189,248,0.3)",
                      }}
                    >
                      user.info.basic
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        backgroundColor: "rgba(244,63,94,0.15)",
                        color: "#F43F5E",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        border: "1px solid rgba(244,63,94,0.3)",
                      }}
                    >
                      video.publish
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Content Posting API Form */}
            <div
              style={{
                flex: 1,
                backgroundColor: "#0B0F19",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "22px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: "rgba(254,44,85,0.2)",
                      border: "1px solid rgba(254,44,85,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      color: "#FE2C55",
                    }}
                  >
                    🚀
                  </div>
                  <div>
                    <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>
                      2. TikTok Content Posting API
                    </div>
                    <div style={{ color: "#94A3B8", fontSize: 11 }}>
                      Requires scope: <code style={{ color: "#FE2C55", fontWeight: 700 }}>video.publish</code>
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#64748B", fontFamily: "monospace" }}>API v2 Direct Post</span>
              </div>

              {/* Caption Input Field */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginBottom: 6 }}>
                  Post Title & Educational Captions
                </label>
                <div
                  style={{
                    backgroundColor: "#030712",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "10px 14px",
                    minHeight: 52,
                    fontSize: 12,
                    color: "#F8FAFC",
                    lineHeight: 1.5,
                  }}
                >
                  {currentCaption}
                  {frame >= 260 && frame < 360 && (
                    <span style={{ color: "#FE2C55", fontWeight: 800 }}>|</span>
                  )}
                </div>
              </div>

              {/* Options Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>
                    Privacy Level
                  </label>
                  <div
                    style={{
                      backgroundColor: "#030712",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.1)",
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#10B981",
                      fontWeight: 700,
                    }}
                  >
                    PUBLIC_TO_EVERYONE
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>
                    Allowed Interactions
                  </label>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#CBD5E1", paddingTop: 8 }}>
                    <span>☑ Comments</span>
                    <span>☑ Duet</span>
                    <span>☑ Stitch</span>
                  </div>
                </div>
              </div>

              {/* Upload Progress Bar (Active during upload) */}
              {isPublishing && (
                <div
                  style={{
                    backgroundColor: "rgba(15,23,42,0.9)",
                    borderRadius: 12,
                    padding: "14px 18px",
                    border: "1px solid rgba(254,44,85,0.3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{uploadStatusText}</span>
                    <span style={{ color: "#FE2C55", fontWeight: 800, fontFamily: "monospace" }}>{uploadPct}%</span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      backgroundColor: "#030712",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${uploadPct}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #FE2C55, #6366F1)",
                        borderRadius: 999,
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: "#64748B", fontFamily: "monospace" }}>
                    Endpoint: POST https://open.tiktokapis.com/v2/post/publish/video/init/
                  </span>
                </div>
              )}

              {/* Published Confirmation Banner */}
              {isPublished && (
                <div
                  style={{
                    backgroundColor: "rgba(16,185,129,0.12)",
                    borderRadius: 12,
                    padding: "16px 20px",
                    border: "1px solid rgba(16,185,129,0.4)",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: "#10B981",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    ✓
                  </div>
                  <div>
                    <div style={{ color: "#10B981", fontWeight: 800, fontSize: 14 }}>
                      Video Published Successfully to TikTok!
                    </div>
                    <div style={{ color: "#CBD5E1", fontSize: 12, marginTop: 2 }}>
                      Post status is Active on <strong>@zayn.storybook</strong> feed. Publish ID:{" "}
                      <code style={{ color: "#34D399", fontFamily: "monospace" }}>v_pub_73891048291</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Publish Action Button */}
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <div
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: 12,
                    background: isConnected
                      ? "linear-gradient(90deg, #FE2C55 0%, #6366F1 100%)"
                      : "linear-gradient(90deg, #475569 0%, #334155 100%)",
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: 14,
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    boxShadow: isConnected ? "0 8px 24px rgba(254,44,85,0.3)" : "none",
                  }}
                >
                  <span>🚀</span>
                  <span>Publish to TikTok (video.publish)</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Browser Page Footer */}
        <div
          style={{
            height: 38,
            backgroundColor: "#0A0E1A",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 32px",
            fontSize: 11,
            color: "#64748B",
          }}
        >
          <span>© 2026 Zayn Storybook Publisher • Production Build</span>
          <div style={{ display: "flex", gap: 16 }}>
            <span>Privacy Policy: https://ramustha.github.io/privacy-policy.html</span>
            <span>Terms: https://ramustha.github.io/terms-of-service.html</span>
          </div>
        </div>

        {/* TikTok OAuth 2.0 Consent Dialog Modal */}
        {isModalOpen && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: 480,
                backgroundColor: "#0F172A",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 25px 60px rgba(0,0,0,0.9)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  height: 52,
                  backgroundColor: "#000000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 22px",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#FFFFFF", fontWeight: 800 }}>
                  <span style={{ color: "#FE2C55", fontSize: 16 }}>🎵</span>
                  <span style={{ fontSize: 14 }}>TikTok for Developers</span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    backgroundColor: "rgba(255,255,255,0.15)",
                    color: "#E2E8F0",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                  }}
                >
                  OAuth 2.0 PKCE
                </span>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "26px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: "linear-gradient(135deg, #F59E0B, #F43F5E)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 26,
                      margin: "0 auto 10px",
                      boxShadow: "0 6px 18px rgba(244,63,94,0.3)",
                    }}
                  >
                    📖
                  </div>
                  <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 16 }}>Zayn Storybook Publisher</div>
                  <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>
                    requests access to your TikTok account (<strong>@zayn.storybook</strong>)
                  </div>
                </div>

                {/* Scopes Box */}
                <div
                  style={{
                    backgroundColor: "#030712",
                    borderRadius: 12,
                    padding: "16px 18px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>
                    Permissions Requested:
                  </div>

                  {/* Scope 1 */}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        backgroundColor: "#10B981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 800,
                        marginTop: 2,
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <div style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 700 }}>
                        Access your public profile info (avatar, display name)
                      </div>
                      <div style={{ color: "#38BDF8", fontSize: 11, fontFamily: "monospace" }}>
                        Scope: user.info.basic
                      </div>
                    </div>
                  </div>

                  {/* Scope 2 */}
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        backgroundColor: "#10B981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 800,
                        marginTop: 2,
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <div style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 700 }}>
                        Publish video episodes directly to your feed
                      </div>
                      <div style={{ color: "#FE2C55", fontSize: 11, fontFamily: "monospace" }}>
                        Scope: video.publish
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 1.4 }}>
                  By clicking <strong>Authorize</strong>, you grant permission to Zayn Storybook Publisher in accordance with its Privacy Policy.
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  height: 60,
                  backgroundColor: "#0A0E1A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 12,
                  padding: "0 24px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 600, padding: "8px 14px" }}>Cancel</div>
                <div
                  style={{
                    backgroundColor: "#FE2C55",
                    color: "#FFFFFF",
                    padding: "9px 22px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: "0 4px 14px rgba(254,44,85,0.4)",
                  }}
                >
                  ✓ Authorize
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Floating HUD Callout Banner in Top Right */}
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 48,
          backgroundColor: "rgba(15,23,42,0.95)",
          borderRadius: 14,
          border: `2px solid ${hudBadge.color}`,
          padding: "14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          boxShadow: `0 10px 30px rgba(0,0,0,0.8), 0 0 20px ${hudBadge.color}33`,
          zIndex: 60,
          minWidth: 320,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: hudBadge.color,
              letterSpacing: 1,
              fontFamily: "monospace",
            }}
          >
            {hudBadge.tag}
          </span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: hudBadge.color }} />
        </div>
        <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>{hudBadge.title}</div>
        <div style={{ color: "#94A3B8", fontSize: 11, fontFamily: "monospace" }}>
          Active Scope: <strong style={{ color: "#F8FAFC" }}>{hudBadge.scope}</strong>
        </div>
      </div>

      {/* Animated Mouse Pointer */}
      <div
        style={{
          position: "absolute",
          top: cursorY,
          left: cursorX,
          zIndex: 100,
          pointerEvents: "none",
          transform: `scale(${cursorClick > 0 ? 0.85 : 1})`,
          transition: "transform 0.05s ease-out",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 3L11.5 21L14.5 13.5L22 10.5L4 3Z"
            fill="#FFFFFF"
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>

        {/* Click Ripple Effect */}
        {cursorClick > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 32 * cursorClick,
              height: 32 * cursorClick,
              borderRadius: "50%",
              border: "3px solid #FE2C55",
              transform: "translate(-30%, -30%)",
              opacity: 1 - cursorClick,
            }}
          />
        )}
      </div>
    </div>
  );
};
