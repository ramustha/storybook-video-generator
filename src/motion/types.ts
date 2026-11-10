/**
 * Zayn Edu-Motion Foundation System — Dynamic Stage Archetypes & Schema
 *
 * Dedicated exclusively to Zayn Educational Motion Videos (Fables, Kids Science,
 * How Things Work, Moral Explainers). Completely separated from the original-illustration
 * BUDI/StoryWeaver picture-book pipeline.
 */

export type EduMotionArchetypeId =
  | "diorama-cross-section" // 1. Isometric River/Terrain Cross-Section + X-Ray Brain/Body (e.g., Si Kancil & Buaya)
  | "vertical-tower"        // 2. Vertical Canopy/Mountain/Deep-Sea Elevation Tower (Camera tilts Top <-> Bottom)
  | "exploded-layers"       // 3. Exploded Layer View + Thermometer/Recipe Gauge (e.g., Culinary, Earth Layers, Anatomy)
  | "horizontal-track"      // 4. Horizontal Track / Physics & Mechanics Blueprint (Camera pans Left -> Right)
  | "magnifying-lens"       // 5. Detective Magnifying Glass / Micro-World Scanner (Lens sweeps across hidden details)
  | "acoustic-emotion";     // 6. Soundwave Sonar & Emotional Barometer Stage (Rhythm, Echoes, Empathy)

export interface ArchetypeThemePreset {
  id: EduMotionArchetypeId;
  name: string;
  description: string;
  palette: {
    bg: string;
    gridStroke: string;
    ink: string;
    accentPrimary: string;
    accentSecondary: string;
    pillBg: string;
    pillHighlight: string;
    cardBg: string;
  };
  gridPatternSvg: string;
  defaultDimensionLabel: {
    id: string;
    en: string;
  };
}

export const EDU_MOTION_ARCHETYPES: Record<EduMotionArchetypeId, ArchetypeThemePreset> = {
  "diorama-cross-section": {
    id: "diorama-cross-section",
    name: "Isometric Diorama & X-Ray Cross-Section",
    description: "3D tilted terrain/riverbed cross-section with mechanical X-Ray cutaway and bridge/path physics.",
    palette: {
      bg: "#F4EFE6",
      gridStroke: "#D8CFC0",
      ink: "#1E242B",
      accentPrimary: "#E05A2B",
      accentSecondary: "#16A34A",
      pillBg: "#1E232A",
      pillHighlight: "#FACC15",
      cardBg: "#FFFDF9",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='68' viewBox='0 0 120 68'><path d='M60 0 L120 34 L60 68 L0 34 Z' fill='none' stroke='%23D8CFC0' stroke-width='1.5'/></svg>`,
    defaultDimensionLabel: {
      id: "ILUSTRASI SKEMA · DIORAMA PENAMPANG & BEDAH CERITA",
      en: "SCHEMATIC ILLUSTRATION · CROSS-SECTION DIORAMA",
    },
  },

  "vertical-tower": {
    id: "vertical-tower",
    name: "Vertical Canopy & Elevation Tower",
    description: "Tall multi-level vertical stage (0m ground to 30m canopy/sky) with vertical camera tilt and sonar rings.",
    palette: {
      bg: "#EEF5EC",
      gridStroke: "#C7DBC2",
      ink: "#16261C",
      accentPrimary: "#D97706",
      accentSecondary: "#15803D",
      pillBg: "#16261C",
      pillHighlight: "#FACC15",
      cardBg: "#FAOPT5",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><circle cx='40' cy='40' r='2.5' fill='%23B6CEB0'/><path d='M0 40 H80 M40 0 V80' stroke='%23D5E4D0' stroke-width='1' stroke-dasharray='4 4'/></svg>`,
    defaultDimensionLabel: {
      id: "SKALA ELEVASI VERTIKAL · KANOPI RIMBA NUSANTARA",
      en: "VERTICAL ELEVATION SCALE · RAINFOREST CANOPY",
    },
  },

  "exploded-layers": {
    id: "exploded-layers",
    name: "Exploded Layer & Thermal Blueprint",
    description: "Multi-layer object separation (exploded view) with temperature thermometer and step-by-step assembly.",
    palette: {
      bg: "#FDF6EC",
      gridStroke: "#E6D5BE",
      ink: "#271C15",
      accentPrimary: "#EA580C",
      accentSecondary: "#0284C7",
      pillBg: "#271C15",
      pillHighlight: "#FDE047",
      cardBg: "#FFFFFF",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><path d='M64 0 L0 0 0 64' fill='none' stroke='%23E6D5BE' stroke-width='1.5'/></svg>`,
    defaultDimensionLabel: {
      id: "PENAMPANG LAPISAN · BEDAH STRUKTUR & SUHU",
      en: "EXPLODED LAYER VIEW · STRUCTURE & THERMAL GAUGE",
    },
  },

  "horizontal-track": {
    id: "horizontal-track",
    name: "Horizontal Physics & Motion Track",
    description: "Wide panoramic track showing force arrows, friction, speedometers, and traditional mechanics.",
    palette: {
      bg: "#F2ECE1",
      gridStroke: "#D4C8B4",
      ink: "#1E293B",
      accentPrimary: "#DC2626",
      accentSecondary: "#2563EB",
      pillBg: "#0F172A",
      pillHighlight: "#FACC15",
      cardBg: "#FFFDF9",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='50' viewBox='0 0 100 50'><path d='M0 25 H100 M50 0 V50' stroke='%23D4C8B4' stroke-width='1.2'/></svg>`,
    defaultDimensionLabel: {
      id: "LINTASAN MEKANIKA · KECEPATAN & GAYA GERAK",
      en: "MECHANICS TRACK · VELOCITY & FORCE VECTORS",
    },
  },

  "magnifying-lens": {
    id: "magnifying-lens",
    name: "Magnifying Lens & Micro-Biology Scanner",
    description: "Interactive magnifying loupe scanning hidden nature details, camouflage, and micro-organisms.",
    palette: {
      bg: "#ECFDF5",
      gridStroke: "#A7F3D0",
      ink: "#064E3B",
      accentPrimary: "#059669",
      accentSecondary: "#D97706",
      pillBg: "#064E3B",
      pillHighlight: "#FDE047",
      cardBg: "#FFFFFF",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'><circle cx='36' cy='36' r='30' fill='none' stroke='%23C6F6D5' stroke-width='1'/></svg>`,
    defaultDimensionLabel: {
      id: "LENSA DETEKTIF ALAM · PEMINDAIAN MIKROSKOPIS",
      en: "NATURE DETECTIVE LENS · MICROSCOPIC SCAN",
    },
  },

  "acoustic-emotion": {
    id: "acoustic-emotion",
    name: "Acoustic Wave & Empathy Stage",
    description: "Concentric soundwaves, musical rhythm pulses, and character emotion/empathy meters.",
    palette: {
      bg: "#F5F3FF",
      gridStroke: "#DDD6FE",
      ink: "#1E1B4B",
      accentPrimary: "#7C3AED",
      accentSecondary: "#EC4899",
      pillBg: "#1E1B4B",
      pillHighlight: "#FACC15",
      cardBg: "#FFFFFF",
    },
    gridPatternSvg: `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 90 90'><circle cx='45' cy='45' r='18' fill='none' stroke='%23DDD6FE' stroke-width='1.2'/><circle cx='45' cy='45' r='36' fill='none' stroke='%23EDE9FE' stroke-width='1'/></svg>`,
    defaultDimensionLabel: {
      id: "GELOMBANG SUARA & IRAMA · EKSPLORASI EMOSI",
      en: "ACOUSTIC RESONANCE & EMOTION METER",
    },
  },
};

export interface EduMotionChapterInput {
  id: string;
  kicker: {
    id: string;
    en: string;
  };
  headlineHtml: {
    id: string;
    en: string;
  };
  narration: {
    id: string;
    en: string;
  };
}

export interface EduMotionChecklistItem {
  num: string;
  title: { id: string; en: string };
  desc: { id: string; en: string };
}

export interface EduMotionQuizCta {
  pillTop: { id: string; en: string };
  question: { id: string; en: string };
  options: Array<{
    id: string;
    en: string;
  }>;
}

export interface EduMotionEpisodeSpec {
  slug: string;
  title: {
    id: string;
    en: string;
  };
  author: string;
  theme: string;
  archetype: EduMotionArchetypeId;
  dimensionLabel?: {
    id: string;
    en: string;
  };
  chapters: EduMotionChapterInput[];
  checklist: [EduMotionChecklistItem, EduMotionChecklistItem, EduMotionChecklistItem];
  quizCta: EduMotionQuizCta;
  /**
   * Custom SVG markup inside `<g id="cam-rig">...</g>` and custom GSAP timeline choreography JS
   * that drives the interactive rig for this specific episode.
   */
  stageSvgMarkup: {
    id: string;
    en: string;
  };
  choreographyJs: string;
  hudOverlaysHtml?: {
    id: string;
    en: string;
  };
}
