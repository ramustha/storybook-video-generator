import fs from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderStill } from "@remotion/renderer";

async function main() {
  const brandingDir = path.resolve("./stories/branding");
  const svg1Path = path.join(brandingDir, "logo-concept-1-emblem.svg");
  const svg2Path = path.join(brandingDir, "logo-concept-2-mascot.svg");

  const svg1Content = await fs.readFile(svg1Path, "utf-8");
  const svg2Content = await fs.readFile(svg2Path, "utf-8");

  // Create a temporary HTML file for rendering with headless Chrome
  const tempHtmlPath = path.join(brandingDir, "temp-logo.html");

  // We can write a tiny Remotion entry point to render crisp 1080x1080 stills
  const entryPoint = path.join(brandingDir, "LogoRoot.tsx");
  await fs.writeFile(
    entryPoint,
    `
import React from 'react';
import { Composition, registerRoot } from 'remotion';

const Logo1: React.FC = () => (
  <div style={{ width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}
       dangerouslySetInnerHTML={{ __html: \`${svg1Content.replace(/width="800"/, 'width="1080"').replace(/height="800"/, 'height="1080"')}\` }}
  />
);

const Logo2: React.FC = () => (
  <div style={{ width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}
       dangerouslySetInnerHTML={{ __html: \`${svg2Content.replace(/width="800"/, 'width="1080"').replace(/height="800"/, 'height="1080"')}\` }}
  />
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="LogoEmblem" component={Logo1} durationInFrames={1} fps={30} width={1080} height={1080} />
    <Composition id="LogoMascot" component={Logo2} durationInFrames={1} fps={30} width={1080} height={1080} />
  </>
);

registerRoot(RemotionRoot);
`
  );

  console.log("Bundling logo compositions with Remotion...");
  const serveUrl = await bundle({ entryPoint });

  console.log("Rendering 1080x1080 PNG for Concept 1 (Emblem)...");
  await renderStill({
    composition: {
      id: "LogoEmblem",
      width: 1080,
      height: 1080,
      fps: 30,
      durationInFrames: 1,
      defaultProps: {},
    } as any,
    serveUrl,
    output: path.join(brandingDir, "logo-concept-1-emblem.png"),
  });
  console.log("✔ Concept 1 rendered to logo-concept-1-emblem.png");

  console.log("Rendering 1080x1080 PNG for Concept 2 (Mascot)...");
  await renderStill({
    composition: {
      id: "LogoMascot",
      width: 1080,
      height: 1080,
      fps: 30,
      durationInFrames: 1,
      defaultProps: {},
    } as any,
    serveUrl,
    output: path.join(brandingDir, "logo-concept-2-mascot.png"),
  });
  console.log("✔ Concept 2 rendered to logo-concept-2-mascot.png");

  // Render 120x120px versions for Google OAuth Consent Screen
  console.log("Rendering 120x120 PNG for Google OAuth Consent Screen (Emblem)...");
  await renderStill({
    composition: {
      id: "LogoEmblem",
      width: 120,
      height: 120,
      fps: 30,
      durationInFrames: 1,
      defaultProps: {},
    } as any,
    serveUrl,
    output: path.join(brandingDir, "oauth-consent-logo-120x120.png"),
  });
  console.log("✔ 120x120 Emblem rendered to oauth-consent-logo-120x120.png");

  console.log("Rendering 120x120 PNG for Google OAuth Consent Screen (Mascot)...");
  await renderStill({
    composition: {
      id: "LogoMascot",
      width: 120,
      height: 120,
      fps: 30,
      durationInFrames: 1,
      defaultProps: {},
    } as any,
    serveUrl,
    output: path.join(brandingDir, "oauth-consent-mascot-120x120.png"),
  });
  console.log("✔ 120x120 Mascot rendered to oauth-consent-mascot-120x120.png");

  // Clean up temporary files
  await fs.rm(entryPoint, { force: true });
}

main().catch(console.error);
