import React from "react";
import { Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { CoverScene } from "./CoverScene";
import { MoralScene } from "./MoralScene";
import { OutroScene } from "./OutroScene";
import { StoryScene } from "./StoryScene";
import { WordTiming } from "./KineticSubtitles";

interface StorybookVideoCompositionProps {
  book: any;
  orientation?: "landscape" | "vertical";
  wordsMap?: Record<string, WordTiming[]>;
}

export const StorybookVideoComposition: React.FC<StorybookVideoCompositionProps> = ({
  book,
  orientation = "landscape",
  wordsMap = {},
}) => {
  const { fps } = useVideoConfig();
  const isVertical = orientation === "vertical";

  if (!book || !book.scenes) return null;

  // Pre-calculate timeline frame boundaries for smooth dynamic audio ducking
  let runningFrame = 0;
  let coverEndFrame = 0;
  let outroStartFrame = 0;

  const sceneTimeline = book.scenes.map((scene: any) => {
    const durSec = scene.durationSeconds || 5.0;
    const durFrames = Math.ceil(durSec * fps);
    const start = runningFrame;
    const end = runningFrame + durFrames;

    if (scene.type === "cover") {
      coverEndFrame = end;
    }
    if (scene.type === "outro" && outroStartFrame === 0) {
      outroStartFrame = start;
    }

    runningFrame = end;
    return {
      scene,
      start,
      end,
      durFrames,
    };
  });

  const totalFrames = runningFrame;
  if (outroStartFrame === 0) {
    outroStartFrame = totalFrames;
  }

  // Continuous Background Music (BGM)
  const bgMusicPath = book.audio?.bgMusicPath || book.bgMusicPath;
  const bgMusicSrc = bgMusicPath ? staticFile(bgMusicPath) : null;
  const fullBgmVolume = book.audio?.bgMusicVolume ?? 0.14;
  // Reduce BGM by 40% (x0.6) during story scenes to keep voiceover perfectly prominent and comfortable
  const storyBgmVolume = fullBgmVolume * 0.6;

  // Continuous Ambient Track
  const ambientPath = book.audio?.ambientPath || book.ambientPath;
  const ambientSrc = ambientPath ? staticFile(ambientPath) : null;
  const ambientVolume = book.audio?.ambientVolume ?? 0.06;

  // Smooth dynamic volume curve for BGM:
  // - Full volume during Intro (cover) and Outro
  // - 40% quieter during Story scenes with smooth crossfade
  // - Gentle fade-out at the very end
  const getBgmVolume = (frame: number): number => {
    const fadeFrames = 20;

    // 1. Cover / Intro Scene
    if (frame < coverEndFrame - fadeFrames) {
      return fullBgmVolume;
    }
    if (frame < coverEndFrame) {
      return Number(
        interpolate(
          frame,
          [coverEndFrame - fadeFrames, coverEndFrame],
          [fullBgmVolume, storyBgmVolume],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      );
    }

    // 2. Main Story Body
    if (frame < outroStartFrame - fadeFrames) {
      return storyBgmVolume;
    }

    // 3. Transition into Outro
    if (frame < outroStartFrame) {
      return Number(
        interpolate(
          frame,
          [outroStartFrame - fadeFrames, outroStartFrame],
          [storyBgmVolume, fullBgmVolume],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      );
    }

    // 4. Outro Scene (with gentle fade out at video end)
    const endFadeStart = Math.max(outroStartFrame, totalFrames - 30);
    if (frame < endFadeStart) {
      return fullBgmVolume;
    }
    return Number(
      interpolate(
        frame,
        [endFadeStart, totalFrames],
        [fullBgmVolume, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    );
  };

  return (
    <>
      {/* Layer 0: Continuous Background Music Loop (With Intelligent Ducking) */}
      {bgMusicSrc && (
        <Audio
          src={bgMusicSrc}
          volume={getBgmVolume}
          loop
        />
      )}

      {/* Layer 1: Continuous Nature / Ambient Background Loop */}
      {ambientSrc && (
        <Audio
          src={ambientSrc}
          volume={ambientVolume}
          loop
        />
      )}

      {sceneTimeline.map(({ scene, start, durFrames }: any) => {
        const words = wordsMap[scene.sceneId] || [];
        const audioSrc = scene.audio?.audioPath ? staticFile(scene.audio.audioPath) : null;
        const sfxSrc = scene.audio?.sfxPath ? staticFile(scene.audio.sfxPath) : null;
        const sfxDelayFrames = Math.round((scene.audio?.sfxDelaySeconds || 0) * fps);

        // SFX Volume Calibration:
        // - Full volume for Intro & Outro (0.65)
        // - Reduced by 60% (x0.4 = ~0.26) for story scenes so it accents without disturbing voiceover
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

            {/* Voiceover Speech Audio */}
            {audioSrc && <Audio src={audioSrc} volume={1.0} />}

            {/* Foley / Action Sound Effects Audio (With Optional Delay Timing & Scene Ducking) */}
            {sfxSrc && (
              <Sequence from={sfxDelayFrames}>
                <Audio src={sfxSrc} volume={effectiveSfxVolume} />
              </Sequence>
            )}
          </Sequence>
        );
      })}
    </>
  );
};
