/**
 * Universal Voice Actor Casting & Synthesis Registry for Zayn Storybook
 * 
 * Provides standardized, reusable multi-speaker voice casting across Indonesian (id-ID)
 * and English (en-US) editions, featuring dedicated neural models, pitch/rate prosody tuning,
 * signature glow colors, and subtitle badges.
 */

export type VoiceActorRole =
  | "narrator"          // Formal storyteller / opening / moral takeaway
  | "child_protagonist" // Main child character (Aku / Budi / Timun Mas / Little Hero)
  | "child_girl"        // Young girl character (Little sister, friends)
  | "child_boy"         // Young boy character (Chintu, friends)
  | "mother"            // Maternal, caring, gentle adult female
  | "father"            // Reassuring, warm adult male
  | "elder"             // Wise grandparent / village elder
  | "magical_entity"    // Moon, stars, fairies, enchanted figures
  | "animal_funny"      // Clever mousedeer, witty cat, playful animals
  | "villager";         // Neighbours, crowd, merchants

export interface ActorVoiceSpec {
  voiceName: string;
  pitch: string;
  rate: string;
  /** Optional FFmpeg vocal-tract formant scale (>1 sounds younger/child-like). */
  formantScale?: number;
}

export interface VoiceActorProfile {
  role: VoiceActorRole;
  defaultName: {
    id: string;
    en: string;
  };
  icon: string;
  signatureColor: string;
  voice: {
    id: ActorVoiceSpec;
    en: ActorVoiceSpec;
  };
}

export const VOICE_ACTOR_REGISTRY: Record<VoiceActorRole, VoiceActorProfile> = {
  narrator: {
    role: "narrator",
    defaultName: {
      id: "Narator",
      en: "Narrator",
    },
    icon: "📖",
    signatureColor: "#34D399", // Emerald Mint
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "+10%",
        rate: "+8%",
        formantScale: 1.17,
      },
      en: {
        voiceName: "en-US-AnaNeural",
        pitch: "+15%", // Lively, cheerful cartoon child narrator host
        rate: "+8%",
      },
    },
  },

  child_protagonist: {
    role: "child_protagonist",
    defaultName: {
      id: "Aku",
      en: "Me",
    },
    icon: "👧",
    signatureColor: "#FACC15", // Radiant Golden Yellow
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "+10%",
        rate: "+4%",
        formantScale: 1.19,
      },
      en: {
        voiceName: "en-US-AnaNeural",
        pitch: "+28%", // Sweet, cute English young child storytelling
        rate: "+4%",
      },
    },
  },

  child_boy: {
    role: "child_boy",
    defaultName: {
      id: "Chintu",
      en: "Boy",
    },
    icon: "👦",
    signatureColor: "#FBBF24", // Amber Yellow
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "+4%",
        rate: "+4%",
        formantScale: 1.15,
      },
      en: {
        voiceName: "en-US-AnaNeural",
        pitch: "-2Hz",
        rate: "+3%",
      },
    },
  },

  child_girl: {
    role: "child_girl",
    defaultName: {
      id: "Gadis Kecil",
      en: "Little Girl",
    },
    icon: "👧",
    signatureColor: "#F472B6", // Rose Pink
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "+12%",
        rate: "+5%",
        formantScale: 1.18,
      },
      en: {
        voiceName: "en-US-AnaNeural",
        pitch: "+4Hz",
        rate: "+4%",
      },
    },
  },

  mother: {
    role: "mother",
    defaultName: {
      id: "Ibu",
      en: "Mother",
    },
    icon: "👩",
    signatureColor: "#38BDF8", // Brilliant Sky Blue
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "-6Hz", // Maternal warmth & lower mature pitch
        rate: "-8%",  // Gentle soothing cadence
      },
      en: {
        voiceName: "en-US-JennyNeural", // Warm adult female
        pitch: "-2Hz",
        rate: "-4%",
      },
    },
  },

  father: {
    role: "father",
    defaultName: {
      id: "Papa",
      en: "Father",
    },
    icon: "👨",
    signatureColor: "#FB923C", // Coral Orange
    voice: {
      id: {
        voiceName: "id-ID-ArdiNeural",
        pitch: "-2Hz",
        rate: "-2%",
      },
      en: {
        voiceName: "en-US-BrianNeural",
        pitch: "default",
        rate: "-2%",
      },
    },
  },

  elder: {
    role: "elder",
    defaultName: {
      id: "Kakek",
      en: "Grandpa",
    },
    icon: "👴",
    signatureColor: "#A3E635", // Lime Green
    voice: {
      id: {
        voiceName: "id-ID-ArdiNeural",
        pitch: "-8Hz",
        rate: "-10%",
      },
      en: {
        voiceName: "en-US-RogerNeural",
        pitch: "-4Hz",
        rate: "-8%",
      },
    },
  },

  magical_entity: {
    role: "magical_entity",
    defaultName: {
      id: "Sang Bulan",
      en: "The Moon",
    },
    icon: "🌙",
    signatureColor: "#FEF08A", // Luminous Moon Gold
    voice: {
      id: {
        voiceName: "id-ID-ArdiNeural",
        pitch: "-5Hz",
        rate: "-8%", // Deep, echoing, serene bedtime cadence
      },
      en: {
        voiceName: "en-US-BrianNeural",
        pitch: "-4Hz",
        rate: "-6%",
      },
    },
  },

  animal_funny: {
    role: "animal_funny",
    defaultName: {
      id: "Kancil",
      en: "Clever Animal",
    },
    icon: "🐾",
    signatureColor: "#C084FC", // Playful Lavender
    voice: {
      id: {
        voiceName: "id-ID-GadisNeural",
        pitch: "+16Hz",
        rate: "+10%", // High-speed bouncy wits
      },
      en: {
        voiceName: "en-US-AnaNeural",
        pitch: "+6Hz",
        rate: "+8%",
      },
    },
  },

  villager: {
    role: "villager",
    defaultName: {
      id: "Warga Desa",
      en: "Villager",
    },
    icon: "🏘️",
    signatureColor: "#94A3B8", // Slate
    voice: {
      id: {
        voiceName: "id-ID-ArdiNeural",
        pitch: "+2Hz",
        rate: "+4%",
      },
      en: {
        voiceName: "en-US-ChristopherNeural",
        pitch: "default",
        rate: "+2%",
      },
    },
  },
};

/**
 * Resolves a VoiceActorProfile by role key or returns narrator fallback.
 */
export function getVoiceActor(roleOrKey?: string): VoiceActorProfile {
  if (!roleOrKey) return VOICE_ACTOR_REGISTRY.narrator;
  const normalized = roleOrKey.toLowerCase().trim() as VoiceActorRole;
  return VOICE_ACTOR_REGISTRY[normalized] || VOICE_ACTOR_REGISTRY.narrator;
}

/**
 * Formats SSML for a specific character voice and language with pitch/rate prosody.
 */
export function buildCharacterSsml(
  text: string,
  role: VoiceActorRole,
  lang: "id" | "en"
): { voiceName: string; pitch: string; rate: string; ssml: string } {
  const actor = getVoiceActor(role);
  const voiceCfg = actor.voice[lang];
  const langCode = lang === "id" ? "id-ID" : "en-US";

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langCode}">
  <voice name="${voiceCfg.voiceName}">
    <prosody pitch="${voiceCfg.pitch}" rate="${voiceCfg.rate}">
      ${text}
    </prosody>
  </voice>
</speak>`;

  return {
    voiceName: voiceCfg.voiceName,
    pitch: voiceCfg.pitch,
    rate: voiceCfg.rate,
    ssml,
  };
}
