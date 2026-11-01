import React from "react";
import { Composition } from "remotion";
import { StorybookVideoComposition } from "./components/StorybookVideoComposition";
import { StorybookThumbnailComposition } from "./components/ThumbnailComposition";

export function calculateTotalFrames(story: any, fps: number = 30): number {
  if (!story || !story.scenes) return 300;
  return story.scenes.reduce((acc: number, scene: any) => {
    const durSec = scene.durationSeconds || 5.0;
    return acc + Math.ceil(durSec * fps);
  }, 0);
}

export const RemotionRoot: React.FC = () => {
  const fps = 30;

  return (
    <>
      {/* 16:9 Landscape for Web & YouTube (1920x1080) */}
      <Composition
        id="StorybookVideoComposition-Landscape"
        component={StorybookVideoComposition as any}
        durationInFrames={300}
        fps={fps}
        width={1920}
        height={1080}
        calculateMetadata={({ props }: any) => ({
          durationInFrames: calculateTotalFrames(props.book, fps),
        })}
      />

      {/* 9:16 Vertical for Shorts & Reels (1080x1920) */}
      <Composition
        id="StorybookVideoComposition-Vertical"
        component={StorybookVideoComposition as any}
        durationInFrames={300}
        fps={fps}
        width={1080}
        height={1920}
        calculateMetadata={({ props }: any) => ({
          durationInFrames: calculateTotalFrames(props.book, fps),
        })}
      />

      {/* 16:9 YouTube Thumbnail Composition (Landscape 1920x1080) */}
      <Composition
        id="StorybookThumbnail"
        component={StorybookThumbnailComposition as any}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 9:16 Shorts & Reels Thumbnail Composition (Vertical 1080x1920) */}
      <Composition
        id="StorybookThumbnail-Vertical"
        component={StorybookThumbnailComposition as any}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
