/**
 * Declarative Universal Edu-Motion Specification Schema & Validator
 *
 * Enables AI agents (or human editors) to author ANY general children's educational
 * story, ANY host character rig, ANY stage backdrop/prefabs, and ANY GSAP motion
 * timeline in data (`stories/<slug>/motion-spec.json`) while the deterministic
 * compiler (`compile-edu-motion.ts`) handles TTS, sentence pauses, duration budget
 * enforcement, cover overlays, captions, and MP4 compilation.
 */

export type HostCharacterId = "zayn" | "luna" | "bimo";
export type HostPoseName = "wave" | "point" | "shock" | "eureka";
export type StorySectionKind = "cover" | "story" | "moral" | "outro";

export interface HostThemeOverride {
  hatColor?: string;
  hatBandColor?: string;
  shirtColor?: string;
  shirtCollarColor?: string;
  hairColor?: string;
  skinColor?: string;
  ringAccentColor?: string;
  badgeBg?: string;
}

export interface NarratorSpec {
  characterId: HostCharacterId;
  displayName?: { id: string; en: string };
  speakerRole?: "narrator" | "child_protagonist";
  theme?: HostThemeOverride;
}

export interface BookMetadataSpec {
  slug: string;
  budiBookId?: number;
  budiSlug?: string;
  title: string;
  originalTitle: string;
  author: string;
  illustrator?: string;
  publisher?: string;
  license?: string;
  readingLevel?: number;
  theme?: string;
  sourceUrl?: string;
  /** Official cover image URL from BUDI catalog (cover-only attribution policy). */
  coverUrl?: string;
}

export interface PacingConfig {
  /** Edge TTS speaking rate override (e.g. "+0%" gentle natural vs "-6%" slower for kids). */
  rateOverride?: string;
  /** Leading silence before Intro starts (seconds). */
  leadSilenceSec?: number;
  /** Child-friendly pause inserted between EVERY sentence inside a chapter (seconds). */
  sentencePauseSec?: number;
  /** Breathing pause between chapters/beats (seconds). */
  chapterPauseSec?: number;
  /** Extra breath after Intro before Chapter 1 starts (seconds). */
  introPauseSec?: number;
  /** Breathing pause after Moral before Outro starts (seconds). */
  outroPauseSec?: number;
  /** Hard platform duration ceiling (IG/FB Reels 90s cap => 88.0s safe target). */
  maxVerticalDurationSec?: number;
}

export interface CalloutSpec {
  kicker: string;
  title: string;
  ringText: string;
  ringPct: number;
  accent: string;
  pinX: number;
  pinY: number;
}

export interface CameraKeyframeSpec {
  dx?: number;
  dy?: number;
  ds?: number;
  durationSec?: number;
  ease?: string;
}

export interface MotionActionSpec {
  /** GSAP method: "to", "fromTo", or "set". */
  type: "to" | "fromTo" | "set";
  /** Target selector inside the stage SVG (e.g. "#papang-rig" or ["#a", "#b"]). */
  target: string | string[];
  /** From properties when type === "fromTo". */
  fromVars?: Record<string, string | number | boolean>;
  /** Target tween properties (opacity, x, y, scale, rotation, duration, ease, etc.). */
  vars: Record<string, string | number | boolean>;
  /** Start offset in seconds relative to this chapter's start (default: 0). */
  offsetSec?: number;
  /** Optional anchor relative to this chapter's END (negative = before chapter end, e.g. -0.35). */
  atEndOffsetSec?: number;
}

export type ProceduralLoopSpec =
  | {
      kind: "bob";
      target: string;
      baseX: number;
      baseY: number;
      ampX?: number;
      ampY?: number;
      freqX?: number;
      freqY?: number;
      phase?: number;
      /** Optional second-phase horizontal drift after a given chapter starts. */
      shiftAfterChapterId?: string;
      shiftAmpX?: number;
      shiftAmpY?: number;
    }
  | {
      kind: "rise-loop";
      target: string;
      baseX?: number;
      ampX?: number;
      freqX?: number;
      speedY: number;
      wrapY: number;
    }
  | {
      kind: "sway";
      target: string;
      anchorX: number;
      anchorY: number;
      ampDeg: number;
      freq: number;
      phase?: number;
    };

export type BuiltinActorPrefab =
  | "sea-cucumber"
  | "coral-colony"
  | "reef-fish"
  | "tempe-banana-leaf"
  | "dadih-bamboo"
  | "mandai-jar"
  | "pakasam-crock"
  | "microbe-buddy"
  | "sparkle-burst"
  | "heat-waves"
  | "warning-waves";

export interface StageActorSpec {
  id: string;
  /** Group root transform x inside canonical 1080px camera space (world ground ~y=622). */
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  /** Built-in vector prefab OR supply custom `svgContent` for unique story objects. */
  prefab?: BuiltinActorPrefab;
  prefabOptions?: Record<string, string | number | boolean>;
  /** Custom raw SVG markup injected cleanly for general stories without touching TS code. */
  svgContent?: string;
}

export type BackdropPresetId = "underwater-reef" | "nusantara-kitchen" | "sunny-meadow" | "science-studio";

export interface BackdropSpec {
  /** Reusable backdrop theme preset, OR custom SVG layers for novel worlds. */
  preset?: BackdropPresetId;
  portraitBg: string;
  landscapeBg: string;
  ambientSpotColor?: string;
  defsSvg?: string;
  portraitBackdropSvg?: string;
  landscapeBackdropSvg?: string;
  stageFloorSvg?: string;
}

export interface StoryChapterSpec {
  id: string;
  section: StorySectionKind;
  pose: HostPoseName;
  poseSwitchTo?: HostPoseName;
  poseSwitchDelay?: number;
  /** Relative SFX path in templates/sfx or story assets (e.g. "sfx_00_opener.m4a"). */
  sfx?: string;
  sfxVolume?: number;
  camera?: CameraKeyframeSpec;
  callout?: { id: CalloutSpec; en: CalloutSpec };
  actions?: MotionActionSpec[];
  text: { id: string; en: string };
}

export interface MoralSpec {
  headlineId: string;
  spokenId: string;
  headlineEn: string;
  spokenEn: string;
}

export interface OutroSpec {
  channelHandle?: string;
  nextTitleId?: string;
  nextTitleEn?: string;
  ctaLabelId?: string;
  ctaLabelEn?: string;
}

export interface StoryMotionSpec {
  schemaVersion: 1;
  book: BookMetadataSpec;
  narrator: NarratorSpec;
  pacing?: PacingConfig;
  backdrop: BackdropSpec;
  actors: StageActorSpec[];
  proceduralLoops?: ProceduralLoopSpec[];
  chapters: StoryChapterSpec[];
  moral: MoralSpec;
  outro?: OutroSpec;
}

const VALID_POSES = new Set<HostPoseName>(["wave", "point", "shock", "eureka"]);
const VALID_SECTIONS = new Set<StorySectionKind>(["cover", "story", "moral", "outro"]);
const VALID_CHARACTERS = new Set<HostCharacterId>(["zayn", "luna", "bimo"]);

/** Validates a parsed `motion-spec.json` and throws clear contextual errors on gaps. */
export function validateStoryMotionSpec(raw: unknown): StoryMotionSpec {
  if (!raw || typeof raw !== "object") {
    throw new Error("StoryMotionSpec must be a non-null object");
  }
  const spec = raw as StoryMotionSpec;
  if (!spec.book?.slug || !spec.book?.title || !spec.book?.author) {
    throw new Error("StoryMotionSpec.book requires slug, title, and author");
  }
  if (!spec.narrator || !VALID_CHARACTERS.has(spec.narrator.characterId)) {
    throw new Error(`StoryMotionSpec.narrator.characterId must be one of: zayn, luna, bimo`);
  }
  if (!spec.backdrop?.portraitBg || !spec.backdrop?.landscapeBg) {
    throw new Error("StoryMotionSpec.backdrop requires portraitBg and landscapeBg");
  }
  if (!Array.isArray(spec.chapters) || spec.chapters.length < 3) {
    throw new Error("StoryMotionSpec.chapters must include at least cover, story, and moral/outro chapters");
  }

  let hasCover = false;
  let storyCount = 0;
  let hasMoral = false;
  let hasOutro = false;
  const seenIds = new Set<string>();

  for (const ch of spec.chapters) {
    if (!ch.id || seenIds.has(ch.id)) {
      throw new Error(`Duplicate or missing chapter id: ${ch.id}`);
    }
    seenIds.add(ch.id);
    if (!VALID_SECTIONS.has(ch.section)) {
      throw new Error(`Invalid chapter.section "${ch.section}" in chapter "${ch.id}"`);
    }
    if (!VALID_POSES.has(ch.pose)) {
      throw new Error(`Invalid chapter.pose "${ch.pose}" in chapter "${ch.id}"`);
    }
    if (!ch.text?.id?.trim() || !ch.text?.en?.trim()) {
      throw new Error(`Chapter "${ch.id}" must include non-empty bilingual text.id and text.en`);
    }
    if (ch.section === "cover") hasCover = true;
    if (ch.section === "story") storyCount++;
    if (ch.section === "moral") hasMoral = true;
    if (ch.section === "outro") hasOutro = true;
  }

  if (!hasCover || storyCount === 0 || !hasMoral || !hasOutro) {
    throw new Error(
      `StoryMotionSpec requires complete structure (cover=${hasCover}, story=${storyCount}, moral=${hasMoral}, outro=${hasOutro})`
    );
  }
  if (!spec.moral?.headlineId || !spec.moral?.headlineEn) {
    throw new Error("StoryMotionSpec.moral requires headlineId and headlineEn");
  }

  return spec;
}
