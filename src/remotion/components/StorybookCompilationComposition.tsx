import React from "react";
import { Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { CoverScene } from "./CoverScene";
import { MoralScene } from "./MoralScene";
import { OutroScene } from "./OutroScene";
import { StoryScene } from "./StoryScene";
import { ChapterBumper } from "./ChapterBumper";
import { WordTiming } from "./KineticSubtitles";

export interface CompilationItem {
  bookSlug: string;
  book: any;
  wordsMap: Record<string, WordTiming[]>;
}

export interface StorybookCompilationCompositionProps {
  title?: string;
  theme?: string;
  lang?: "id" | "en";
  orientation?: "landscape" | "vertical";
  bumperDurationFrames?: number;
  items: CompilationItem[];
}

export function calculateCompilationTotalFrames(
  items: CompilationItem[],
  fps: number = 30,
  bumperDurationFrames: number = 120
): number {
  if (!items || items.length === 0) return 300;

  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const scenes = (item.book?.scenes || []).filter((s: any) => isLast || s.type !== "outro");

    const storyFrames = scenes.reduce((acc: number, scene: any) => {
      const durSec = scene.durationSeconds || 5.0;
      return acc + Math.ceil(durSec * fps);
    }, 0);

    total += storyFrames;

    // Add bumper frames between stories
    if (!isLast) {
      total += bumperDurationFrames;
    }
  }

  return total;
}

export const StorybookCompilationComposition: React.FC<StorybookCompilationCompositionProps> = ({
  title = "Kompilasi Dongeng Anak",
  theme = "bedtime",
  lang = "id",
  orientation = "landscape",
  bumperDurationFrames = 120, // 4.0s @ 30fps
  items = [],
}) => {
  const { fps } = useVideoConfig();
  const isVertical = orientation === "vertical";

  if (!items || items.length === 0) return null;

  // Build the complete timeline of stories and interstitial bumpers
  let currentFrame = 0;

  const timelineBlocks: Array<
    | {
        type: "story";
        itemIndex: number;
        item: CompilationItem;
        startFrame: number;
        durationFrames: number;
        scenes: any[];
      }
    | {
        type: "bumper";
        fromIndex: number;
        toIndex: number;
        startFrame: number;
        durationFrames: number;
        nextStoryTitle: string;
        nextStoryCover?: string;
      }
  > = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const isLast = idx === items.length - 1;

    // Filter scenes: only the last story in compilation keeps its final subscribe outro
    const scenes = (item.book?.scenes || []).filter((s: any) => isLast || s.type !== "outro");

    const storyDurationFrames = scenes.reduce((acc: number, scene: any) => {
      const durSec = scene.durationSeconds || 5.0;
      return acc + Math.ceil(durSec * fps);
    }, 0);

    timelineBlocks.push({
      type: "story",
      itemIndex: idx,
      item,
      startFrame: currentFrame,
      durationFrames: storyDurationFrames,
      scenes,
    });

    currentFrame += storyDurationFrames;

    // Add interstitial chapter bumper before the next story
    if (!isLast) {
      const nextItem = items[idx + 1];
      const nextTitle =
        lang === "en"
          ? (nextItem.book.originalTitle || nextItem.book.title)
          : nextItem.book.title;

      timelineBlocks.push({
        type: "bumper",
        fromIndex: idx,
        toIndex: idx + 1,
        startFrame: currentFrame,
        durationFrames: bumperDurationFrames,
        nextStoryTitle: nextTitle,
        nextStoryCover: nextItem.book.coverImage || nextItem.book.scenes?.[0]?.visual?.imagePath,
      });

      currentFrame += bumperDurationFrames;
    }
  }

  return (
    <>
      {timelineBlocks.map((block, bIdx) => {
        if (block.type === "bumper") {
          return (
            <Sequence
              key={`bumper-${block.fromIndex}-${block.toIndex}`}
              from={block.startFrame}
              durationInFrames={block.durationFrames}
            >
              <ChapterBumper
                nextStoryTitle={block.nextStoryTitle}
                nextStoryCover={block.nextStoryCover}
                chapterIndex={block.toIndex + 1}
                totalChapters={items.length}
                lang={lang}
                isVertical={isVertical}
              />
            </Sequence>
          );
        }

        // Story Block
        const { item, scenes, durationFrames, startFrame } = block;
        const book = item.book;
        const wordsMap = item.wordsMap || {};

        // Audio setup for this story
        const bgMusicPath = book.audio?.bgMusicPath || book.bgMusicPath;
        const bgMusicSrc = bgMusicPath ? staticFile(bgMusicPath) : null;
        const fullBgmVolume = book.audio?.bgMusicVolume ?? 0.14;
        const storyBgmVolume = fullBgmVolume * 0.6;

        let runningSceneFrame = 0;
        let coverEndFrame = 0;
        let outroStartFrame = 0;

        const sceneTimeline = scenes.map((scene: any) => {
          const durSec = scene.durationSeconds || 5.0;
          const durFrames = Math.ceil(durSec * fps);
          const sStart = runningSceneFrame;
          const sEnd = runningSceneFrame + durFrames;

          if (scene.type === "cover") coverEndFrame = sEnd;
          if (scene.type === "outro" && outroStartFrame === 0) outroStartFrame = sStart;

          runningSceneFrame = sEnd;
          return { scene, start: sStart, durFrames };
        });

        if (outroStartFrame === 0) outroStartFrame = durationFrames;

        const getBgmVolume = (localFrame: number): number => {
          const fadeFrames = 20;
          if (localFrame < coverEndFrame - fadeFrames) return fullBgmVolume;
          if (localFrame < coverEndFrame) {
            return Number(
              interpolate(
                localFrame,
                [coverEndFrame - fadeFrames, coverEndFrame],
                [fullBgmVolume, storyBgmVolume],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            );
          }
          if (localFrame < outroStartFrame - fadeFrames) return storyBgmVolume;
          if (localFrame < outroStartFrame) {
            return Number(
              interpolate(
                localFrame,
                [outroStartFrame - fadeFrames, outroStartFrame],
                [storyBgmVolume, fullBgmVolume],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            );
          }
          const endFadeStart = Math.max(outroStartFrame, durationFrames - 25);
          if (localFrame < endFadeStart) return fullBgmVolume;
          return Number(
            interpolate(
              localFrame,
              [endFadeStart, durationFrames],
              [fullBgmVolume, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
          );
        };

        return (
          <Sequence
            key={`story-${block.itemIndex}-${item.bookSlug}`}
            from={startFrame}
            durationInFrames={durationFrames}
          >
            {/* Story BGM with Dynamic Ducking */}
            {bgMusicSrc && (
              <Audio src={bgMusicSrc} volume={getBgmVolume} loop />
            )}

            {/* Story Scenes */}
            {sceneTimeline.map(({ scene, start, durFrames }: any) => {
              const words = wordsMap[scene.sceneId] || [];
              const audioSrc = scene.audio?.audioPath ? staticFile(scene.audio.audioPath) : null;
              const sfxSrc = scene.audio?.sfxPath ? staticFile(scene.audio.sfxPath) : null;
              const sfxDelayFrames = Math.round((scene.audio?.sfxDelaySeconds || 0) * fps);

              const isIntroOrOutro = scene.type === "cover" || scene.type === "outro";
              const rawSfxVolume = scene.audio?.sfxVolume ?? 0.65;
              const effectiveSfxVolume = isIntroOrOutro
                ? rawSfxVolume
                : (rawSfxVolume <= 0.35 ? rawSfxVolume : rawSfxVolume * 0.4);

              return (
                <Sequence key={scene.sceneId} from={start} durationInFrames={durFrames}>
                  {scene.type === "cover" ? (
                    <CoverScene scene={scene} book={book} isVertical={isVertical} />
                  ) : scene.type === "moral" ? (
                    <MoralScene scene={scene} book={book} isVertical={isVertical} words={words} />
                  ) : scene.type === "outro" ? (
                    <OutroScene scene={scene} book={book} isVertical={isVertical} words={words} />
                  ) : (
                    <StoryScene scene={scene} book={book} isVertical={isVertical} words={words} />
                  )}

                  {audioSrc && <Audio src={audioSrc} volume={1.0} />}

                  {sfxSrc && (
                    <Sequence from={sfxDelayFrames}>
                      <Audio src={sfxSrc} volume={effectiveSfxVolume} />
                    </Sequence>
                  )}
                </Sequence>
              );
            })}
          </Sequence>
        );
      })}
    </>
  );
};
