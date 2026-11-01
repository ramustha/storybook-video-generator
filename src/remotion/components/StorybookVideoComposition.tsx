import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { CoverScene } from "./CoverScene";
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

  let currentOffset = 0;

  return (
    <>
      {book.scenes.map((scene: any) => {
        const durSec = scene.durationSeconds || 5.0;
        const durFrames = Math.ceil(durSec * fps);
        const fromFrame = currentOffset;
        currentOffset += durFrames;

        const words = wordsMap[scene.sceneId] || [];
        const audioSrc = scene.audio?.audioPath ? staticFile(scene.audio.audioPath) : null;

        return (
          <Sequence key={scene.sceneId} from={fromFrame} durationInFrames={durFrames}>
            {scene.type === "cover" ? (
              <CoverScene scene={scene} book={book} isVertical={isVertical} />
            ) : (
              <StoryScene scene={scene} book={book} isVertical={isVertical} words={words} />
            )}

            {/* Voiceover Speech Audio */}
            {audioSrc && <Audio src={audioSrc} volume={1.0} />}
          </Sequence>
        );
      })}
    </>
  );
};
