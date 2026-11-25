import fs from "fs/promises";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { alignRawWordsToManuscript } from "../src/subtitles/sync-timings";

interface SceneTextConfig {
  sceneId: string;
  type: "cover" | "story" | "moral" | "outro";
  imagePath: string;
  idText: string;
  enText: string;
  idSpeaker: string;
  enSpeaker: string;
  speakerNameId: string;
  speakerNameEn: string;
  speakerColor: string;
  sfxPath?: string;
  sfxDelaySeconds?: number;
  cameraMotion?: "slow_zoom_in" | "pan_right" | "tilt_up";
  moralHeadlineId?: string;
  moralHeadlineEn?: string;
}

const SCENE_CONFIGS: SceneTextConfig[] = [
  {
    sceneId: "cover",
    type: "cover",
    imagePath: "assets/cover.png",
    idText: "Zayn Storybook mempersembahkan: Pisang Terlalu Banyak! Cerita jenaka karya Rohini Nilekani, diilustrasikan oleh Angie dan Upesh.",
    enText: "Zayn Storybook presents: Too Many Bananas! A fun story by Rohini Nilekani, illustrated by Angie and Upesh.",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#34D399",
    sfxPath: "assets/sfx/sfx_00_opener.m4a",
    sfxDelaySeconds: 0,
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "scene_01",
    type: "story",
    imagePath: "assets/scene_01.png",
    idText: "Pak Sringeri Srinivas sedang mengalami hari yang aneh. Panen pisang di kebunnya melimpah ruah, manis, dan wangi sekali! Tapi... tidak ada satu orang pun yang mau membelinya!",
    enText: "Sringeri Srinivas was having a very strange day. His farm was full of sweet, ripe bananas! But... nobody wanted to buy them!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#38BDF8",
    sfxPath: "assets/sfx/sfx_01_morning_walk.m4a",
    sfxDelaySeconds: 0.2,
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "scene_02",
    type: "story",
    imagePath: "assets/scene_02.png",
    idText: "Keluarganya menolak. 'Waduh Pak, pisangnya manis banget, tapi kami sudah kenyang makan pisang tiap hari!' kata istrinya sambil tersenyum.",
    enText: "Not his family. 'Oh, they are very sweet, but we have eaten bananas every day and we are completely full!' they said.",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Keluarga",
    speakerNameEn: "Family",
    speakerColor: "#EC4899",
    cameraMotion: "pan_right",
  },
  {
    sceneId: "scene_03",
    type: "story",
    imagePath: "assets/scene_03.png",
    idText: "Pak Srinivas berkeliling ke tetangga dan teman-temannya. 'Tidak mau lagi, Pak Srinivas! Pohon pisang kami di halaman juga lagi berbuah lebat!' kata mereka sambil tertawa.",
    enText: "He offered them to his neighbours and friends. 'No thank you, Sringeri! Our banana trees in the garden are bursting with fruit too!' they said with a laugh.",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Tetangga",
    speakerNameEn: "Neighbours",
    speakerColor: "#F97316",
    cameraMotion: "tilt_up",
  },
  {
    sceneId: "scene_04",
    type: "story",
    imagePath: "assets/scene_04.png",
    idText: "Pedagang pasar menggeleng: 'Di kota lagi banjir pisang!' Bahkan sapi-sapi peliharaannya melengos dan menolak memakannya! Aduh, gawat!",
    enText: "Market traders shook their heads. And not even his cows wanted them! They turned their heads away and swished their tails. Oh dear!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#38BDF8",
    sfxPath: "assets/sfx/sfx_02_dog.m4a",
    sfxDelaySeconds: 1.5,
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "scene_05",
    type: "story",
    imagePath: "assets/scene_05.png",
    idText: "Kasihan sekali Pak Srinivas! Apa yang harus ia lakukan dengan bertumpuk-tumpuk pisang manis ini? Kalau dibiarkan, semuanya bisa membusuk sia-sia!",
    enText: "Poor Sringeri Srinivas! What could he possibly do with so many bananas before they went bad?",
    idSpeaker: "id-ID-ArdiNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Pak Srinivas",
    speakerNameEn: "Sringeri",
    speakerColor: "#FDE047",
    cameraMotion: "pan_right",
  },
  {
    sceneId: "scene_06",
    type: "story",
    imagePath: "assets/scene_06.png",
    idText: "Aha! Pak Srinivas memutuskan pergi ke Pusat Pertanian di kota Doddooru untuk meminta saran. Pasti para ahli di sana punya ide cemerlang!",
    enText: "He decided to seek help from the Farmer's Centre in Doddooru. Surely someone there would have a brilliant idea!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#38BDF8",
    cameraMotion: "tilt_up",
  },
  {
    sceneId: "scene_07",
    type: "story",
    imagePath: "assets/scene_07.png",
    idText: "Beberapa hari kemudian, Pak Srinivas pulang sambil bersiul riang. Ia kembali berkebun dengan gembira, tapi anehnya... ia tidak lagi menawarkan pisang kepada siapa pun!",
    enText: "A few days later, he returned home beaming with joy. He went back to farming, but curiously, he stopped offering bananas to anyone!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#38BDF8",
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "scene_08",
    type: "story",
    imagePath: "assets/scene_08.png",
    idText: "Semua orang di desa jadi sangat penasaran! 'Ke mana perginya pisang-pisang lebat Pak Srinivas?' bisik para tetangga penuh tanda tanya.",
    enText: "Everyone in the village became very curious. 'Where on earth are all his bananas going?' they wondered in whispers.",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Tetangga",
    speakerNameEn: "Neighbours",
    speakerColor: "#F97316",
    cameraMotion: "pan_right",
  },
  {
    sceneId: "scene_09",
    type: "story",
    imagePath: "assets/scene_09.png",
    idText: "Suatu hari, tetangga Shivanna mengadakan upacara syukuran besar di desa. Sang pendeta berkata: 'Kita membutuhkan 108 buah pisang ranum!' Pak Shivanna panik dan berlari ke rumah Pak Srinivas: 'Tolong bantu aku! Aku butuh 108 pisang!'",
    enText: "One day, neighbour Shivanna held a big village ceremony. The priest needed 108 ripe bananas! Shivanna rushed to Sringeri: 'Please help me! I need 108 bananas!'",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Shivanna",
    speakerNameEn: "Shivanna",
    speakerColor: "#F97316",
    cameraMotion: "tilt_up",
  },
  {
    sceneId: "scene_10",
    type: "story",
    imagePath: "assets/scene_10.png",
    idText: "Pak Srinivas tersenyum: 'Tentu, mulailah upacaranya, aku pasti datang!' Di tengah upacara, Pak Srinivas tiba membawa keranjang besar berisi 27 bungkusan rapi dari daun pisang hijau segar.",
    enText: "Sringeri Srinivas smiled: 'Start your ceremony, I will surely come!' Just then, in came Sringeri carrying a big bag with 27 neat packets wrapped in fresh banana leaves.",
    idSpeaker: "id-ID-ArdiNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Pak Srinivas",
    speakerNameEn: "Sringeri",
    speakerColor: "#FDE047",
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "scene_11",
    type: "story",
    imagePath: "assets/scene_11.png",
    idText: "Tertulis di bungkusnya: 'Dodol Pisang Manis Istimewa Kebun Srinivas!' Tiap bungkus berisi sari 4 pisang matang, pas untuk 108 pisang! Seluruh warga tertawa gembira, bertepuk tangan, dan menikmati hidangan manis bersama-sama!",
    enText: "On each packet was written: 'High Quality Banana Halwa, S.S. Farms!' Each packet held the pulp of 4 bananas—totalling exactly 108 bananas! The whole village clapped, laughed, and enjoyed the delicious sweet treat together!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Narator",
    speakerNameEn: "Narrator",
    speakerColor: "#34D399",
    sfxPath: "assets/sfx/sfx_08_catch_cheer.m4a",
    sfxDelaySeconds: 3.0,
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "moral",
    type: "moral",
    imagePath: "assets/scene_12.png",
    idText: "Nah teman-teman, nilai moral dari cerita ini adalah: saat kita menghadapi kesulitan atau masalah, jangan pernah putus asa! Gunakan akal dan kreativitas kita untuk mencari solusi yang bermanfaat dan membahagiakan semua orang!",
    enText: "The moral of the story: when faced with a difficult challenge, never give up! With creative thinking and sharing, we can turn any problem into a sweet success that brings joy to everyone!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Pesan Moral",
    speakerNameEn: "Moral of Story",
    speakerColor: "#F59E0B",
    moralHeadlineId: "Kreativitas Mengubah Masalah Menjadi Berkah Manis!",
    moralHeadlineEn: "Creative Thinking Turns Problems into Sweet Success!",
    sfxPath: "assets/sfx/sfx_10_moral_harp.m4a",
    sfxDelaySeconds: 0,
    cameraMotion: "slow_zoom_in",
  },
  {
    sceneId: "outro",
    type: "outro",
    imagePath: "assets/cover.png",
    idText: "Wah, seru sekali ya ceritanya! Jangan lupa klik video di sebelah sini untuk menonton dongeng seru lainnya, dan klik tombol Subscribe agar kita bisa terus berpetualang bersama! Sampai jumpa di cerita berikutnya! Dadah!",
    enText: "Did you enjoy the story? Click the video on your screen to watch another fun adventure, and don't forget to hit Subscribe so we can keep reading together! See you in the next story! Bye-bye!",
    idSpeaker: "id-ID-GadisNeural",
    enSpeaker: "en-US-AnaNeural",
    speakerNameId: "Rekomendasi",
    speakerNameEn: "Next Story",
    speakerColor: "#38BDF8",
    sfxPath: "assets/sfx/sfx_11_outro_pop.m4a",
    sfxDelaySeconds: 0,
    cameraMotion: "slow_zoom_in",
  },
];

async function synthesizeTrack(
  text: string,
  voiceName: string,
  outMp3Path: string,
  outWordsPath: string,
  speakerName: string,
  speakerColor: string
): Promise<number> {
  const tts = new MsEdgeTTS();
  const isEn = voiceName.startsWith("en");
  const pitch = isEn ? "+25%" : voiceName.includes("Ardi") ? "+26%" : "+30%";
  const rate = isEn ? "+5%" : voiceName.includes("Ardi") ? "+8%" : "+6%";

  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
    sentenceBoundaryEnabled: true,
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-pisang-"));
  const { audioFilePath, metadataFilePath } = await tts.toFile(tempDir, text, {
    pitch,
    rate,
  });

  // Ensure target dirs
  await fs.mkdir(path.dirname(outMp3Path), { recursive: true });
  await fs.mkdir(path.dirname(outWordsPath), { recursive: true });

  await fs.copyFile(audioFilePath, outMp3Path);

  let durationSec = 6.0;

  const words: any[] = [];
  if (metadataFilePath && existsSync(metadataFilePath)) {
    try {
      const metadataRaw = await fs.readFile(metadataFilePath, "utf-8");
      const parsed = JSON.parse(metadataRaw);
      const metaItems: any[] = parsed.Metadata || [];

      const wordItems = metaItems.filter((m) => m.Type === "WordBoundary");
      const rawBoundary = wordItems.map((m) => {
        const offsetTicks = m.Data?.Offset || 0;
        const durTicks = m.Data?.Duration || 0;
        return {
          word: m.Data?.text?.Text || "",
          start: Math.round((offsetTicks / 10_000_000) * 1000) / 1000,
          end: Math.round(((offsetTicks + durTicks) / 10_000_000) * 1000) / 1000,
        };
      });
      const aligned = alignRawWordsToManuscript(rawBoundary, text);

      aligned.forEach((w) => {
        words.push({
          word: w.word,
          start: w.start,
          end: w.end,
          speaker: speakerName.toLowerCase(),
          speakerName,
          speakerColor,
        });
      });

      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        durationSec = Number((lastWord.end + 0.5).toFixed(2));
      }
    } catch (err) {
      console.warn("⚠️ Warning parsing word metadata:", err);
    }
  }

  await fs.writeFile(
    outWordsPath,
    JSON.stringify({ words }, null, 2),
    "utf-8"
  );

  // Clean up tempDir
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  return durationSec;
}

async function main() {
  console.log("\n==================================================================");
  console.log("🎙️ SYNTHESIZING BILINGUAL AUDIO & METADATA: PISANG TERLALU BANYAK!");
  console.log("==================================================================\n");

  const storyDir = path.resolve("./stories/pisang-terlalu-banyak");
  await fs.mkdir(path.join(storyDir, "assets/id"), { recursive: true });
  await fs.mkdir(path.join(storyDir, "assets/en"), { recursive: true });

  const scenesOutput: any[] = [];

  for (let i = 0; i < SCENE_CONFIGS.length; i++) {
    const sc = SCENE_CONFIGS[i];
    console.log(`[${i + 1}/${SCENE_CONFIGS.length}] Processing Scene: ${sc.sceneId} (${sc.type})...`);

    // 1. Indonesian Audio
    const idMp3Rel = `assets/id/${sc.sceneId}.mp3`;
    const idWordsRel = `assets/id/${sc.sceneId}_words.json`;
    const idDurationSec = await synthesizeTrack(
      sc.idText,
      sc.idSpeaker,
      path.join(storyDir, idMp3Rel),
      path.join(storyDir, idWordsRel),
      sc.speakerNameId,
      sc.speakerColor
    );
    console.log(`   ✔ ID Audio: ${idDurationSec.toFixed(2)}s (${sc.idSpeaker})`);

    // 2. English Audio
    const enMp3Rel = `assets/en/${sc.sceneId}.mp3`;
    const enWordsRel = `assets/en/${sc.sceneId}_words.json`;
    const enDurationSec = await synthesizeTrack(
      sc.enText,
      sc.enSpeaker,
      path.join(storyDir, enMp3Rel),
      path.join(storyDir, enWordsRel),
      sc.speakerNameEn,
      sc.speakerColor
    );
    console.log(`   ✔ EN Audio: ${enDurationSec.toFixed(2)}s (${sc.enSpeaker})`);

    // Padded duration (audio duration + 0.6s breath gap)
    const baseDuration = Math.max(idDurationSec + 0.6, 5.0);

    const sceneEntry: any = {
      index: i,
      sceneId: sc.sceneId,
      type: sc.type,
      durationSeconds: Number(baseDuration.toFixed(2)),
      visual: {
        imagePath: sc.imagePath,
        status: "ready",
      },
      camera: {
        motion: sc.cameraMotion || "slow_zoom_in",
        scaleStart: 1.08,
        scaleEnd: 1.18,
      },
      audio: {
        text: sc.idText,
        audioPath: idMp3Rel,
        wordsPath: idWordsRel,
        durationSeconds: Number(idDurationSec.toFixed(2)),
        sfxPath: sc.sfxPath,
        sfxDelaySeconds: sc.sfxDelaySeconds || 0,
        en: {
          text: sc.enText,
          audioPath: enMp3Rel,
          wordsPath: enWordsRel,
          durationSeconds: Number((enDurationSec + 0.6).toFixed(2)),
        },
      },
    };

    if (sc.moralHeadlineId) {
      sceneEntry.moralHeadline = sc.moralHeadlineId;
      sceneEntry.moralHeadlineEn = sc.moralHeadlineEn;
    }

    scenesOutput.push(sceneEntry);
  }

  // Construct complete story.json
  const storyJson = {
    version: "1.0.0",
    id: "pisang-terlalu-banyak",
    slug: "pisang-terlalu-banyak",
    title: "Pisang Terlalu Banyak!",
    originalTitle: "Too Many Bananas!",
    language: "id-ID",
    coverOrientation: "landscape",
    coverAspectRatio: 1.214,
    source: {
      repository: "Pratham Books (StoryWeaver / Internet Archive)",
      license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
      originalAuthor: "Rohini Nilekani (Noni)",
      originalIllustrator: "Angie & Upesh (The Other Design Studio)",
      sourceUrl: "https://archive.org/details/TooManyBananas-English-Pratham",
    },
    stylePreset: {
      artMedium: "Authentic Whimsical Cartoon Illustration with Warm Tropical Gouache",
      artistInfluences: "Angie & Upesh, The Other Design Studio",
      renderingConstraints: "authentic 16:9 plates from open-license source, inpaint typography and page numbers",
    },
    audio: {
      bgMusicPath: "assets/audio/bgm_whimsical_story.m4a",
      bgMusicVolume: 0.14,
    },
    thumbnailConfig: {
      heroImage: "assets/scene_11.png",
      backdropImage: "assets/scene_01.png",
      id: {
        headlineTop: "PISANG TERLALU BANYAK!",
        headlineBottom: "DODOL PISANG EMAS! 🍌✨",
        hook: "PANEN PISANG BANJIR DESA, SAPI AJA GAMAU?!",
        hookEmoji: "🍌🤣",
        badge: "DONGENG CERITA ANAK SERU",
        sticker: "Rahasia 108 Pisang! 🍯",
        bedtimeTitle: "Pisang Terlalu Banyak!",
        bedtimeHook: "Kisah Jenaka Mengubah Masalah Menjadi Manis & Bahagia",
      },
      en: {
        headlineTop: "TOO MANY BANANAS!",
        headlineBottom: "GOLDEN BANANA HALWA! 🍌✨",
        hook: "TOO MANY BANANAS EVEN COWS SAID NO?!",
        hookEmoji: "🍌🤣",
        badge: "HILARIOUS KIDS ANIMATED STORY",
        sticker: "Secret of 108 Bananas! 🍯",
        bedtimeTitle: "Too Many Bananas!",
        bedtimeHook: "A Hilarious Bedtime Tale of Turning Trouble Into Sweet Joy",
      },
    },
    characterBible: {
      protagonists: [
        {
          id: "sringeri",
          name: "Sringeri Srinivas",
          role: "Gentle Village Farmer",
          voice: {
            id: "id-ID-ArdiNeural",
            en: "en-US-AnaNeural",
            color: "#FDE047",
            badge: "👨 Sringeri",
          },
        },
      ],
    },
    worldBible: {
      village: "Sringeri Village & Doddooru Town",
      palette: {
        bananaGold: "#FDE047",
        ripeAmber: "#F59E0B",
        tropicalGreen: "#15803D",
        terracotta: "#D97706",
        skyBlue: "#38BDF8",
      },
    },
    scenes: scenesOutput,
  };

  const storyJsonPath = path.join(storyDir, "story.json");
  await fs.writeFile(storyJsonPath, JSON.stringify(storyJson, null, 2) + "\n", "utf-8");

  console.log(`\n🎉 Selesai! story.json berhasil digenerate di: ${storyJsonPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
