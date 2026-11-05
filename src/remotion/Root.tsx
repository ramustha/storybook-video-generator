import React from "react";
import { Composition } from "remotion";
import { StorybookVideoComposition } from "./components/StorybookVideoComposition";
import { StorybookThumbnailComposition } from "./components/ThumbnailComposition";
import { CompilationThumbnailComposition } from "./components/CompilationThumbnailComposition";
import { TikTokDemoComposition } from "./components/TikTokDemoComposition";
import {
  StorybookCompilationComposition,
  calculateCompilationTotalFrames,
} from "./components/StorybookCompilationComposition";

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

      {/* 16:9 YouTube Compilation Marathon Thumbnail Composition (Landscape 1920x1080) */}
      <Composition
        id="StorybookCompilationThumbnail"
        component={CompilationThumbnailComposition as any}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* TikTok Developer Review Demo Video (Landscape 1920x1080 @ 30fps, 750 frames = 25s) */}
      <Composition
        id="TikTokPublisherDemo"
        component={TikTokDemoComposition as any}
        durationInFrames={750}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 16:9 Landscape Compilation / Marathon (1920x1080) */}
      <Composition
        id="StorybookCompilation-Landscape"
        component={StorybookCompilationComposition as any}
        durationInFrames={900}
        fps={fps}
        width={1920}
        height={1080}
        calculateMetadata={({ props }: any) => ({
          durationInFrames: calculateCompilationTotalFrames(
            props.items,
            fps,
            props.bumperDurationFrames || 120
          ),
        })}
      />

      {/* 9:16 Vertical Compilation / Marathon (1080x1920) */}
      <Composition
        id="StorybookCompilation-Vertical"
        component={StorybookCompilationComposition as any}
        durationInFrames={900}
        fps={fps}
        width={1080}
        height={1920}
        calculateMetadata={({ props }: any) => ({
          durationInFrames: calculateCompilationTotalFrames(
            props.items,
            fps,
            props.bumperDurationFrames || 120
          ),
        })}
      />
    </>
  );
};
