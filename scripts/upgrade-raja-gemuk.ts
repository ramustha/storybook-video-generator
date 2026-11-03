import fs from "fs/promises";
import path from "path";

async function main() {
  const file = path.resolve("stories/raja-gemuk-anjing-kurus/story.json");
  const raw = await fs.readFile(file, "utf-8");
  const data = JSON.parse(raw);

  data.audio = {
    bgMusicPath: "assets/audio/bgm_whimsical_story.m4a",
    bgMusicVolume: 0.14,
  };

  const sfxMap: Record<string, string> = {
    cover: "assets/sfx/sfx_00_opener.m4a",
    scene_01: "assets/sfx/sfx_01_throne.m4a",
    scene_02: "assets/sfx/sfx_02_dog.m4a",
    scene_03: "assets/sfx/sfx_03_walk.m4a",
    scene_04: "assets/sfx/sfx_04_bird.m4a",
    scene_05: "assets/sfx/sfx_05_dog_dash.m4a",
    scene_06: "assets/sfx/sfx_06_king_pant.m4a",
    scene_07: "assets/sfx/sfx_07_chase_loop.m4a",
    scene_08: "assets/sfx/sfx_08_catch_cheer.m4a",
    scene_09: "assets/sfx/sfx_09_mirror_sparkle.m4a",
  };

  for (const s of data.scenes) {
    if (sfxMap[s.sceneId]) {
      s.audio.sfxPath = sfxMap[s.sceneId];
      s.audio.sfxVolume = s.sceneId === "cover" ? 0.65 : 0.26;
      if (s.sceneId === "scene_05") {
        s.audio.sfxDelaySeconds = 0.2;
      }
    }
  }

  // Remove existing scene_10 or scene_11 if present
  data.scenes = data.scenes.filter(
    (s: any) => s.sceneId !== "scene_10" && s.sceneId !== "scene_11"
  );

  // Add Scene 10: Moral
  data.scenes.push({
    index: 10,
    sceneId: "scene_10",
    type: "moral",
    durationSeconds: 13.0,
    visual: {
      imagePath: "assets/scene_09.png",
      status: "ready",
    },
    protagonistAvatar: "assets/protagonist_avatar.png",
    moralBadge: "PESAN MORAL CERITA",
    moralBadgeEn: "MORAL OF THE STORY",
    moralHeadline: "Tubuh Bugar & Sehat Lewat Bergerak Ceria!",
    moralHeadlineEn: "Staying Active Brings Health & Boundless Joy!",
    moralTakeaway: [
      "Rajin bergerak dan aktif berolahraga membuat tubuh kita bugar, sehat, dan kuat!",
      "Bermain dan beraktivitas bersama sahabat membawa kebiasaan baik dan tawa bahagia!",
    ],
    moralTakeawayEn: [
      "Staying active and exercising every day makes our bodies fit, healthy, and strong!",
      "Playing and moving together with a loyal friend brings joyful habits and endless smiles!",
    ],
    audio: {
      text: "Pesan moral cerita ini: Rajin bergerak dan berolahraga membuat tubuh kita bugar, sehat, dan kuat! Bergerak setiap hari bersama sahabat itu sangat menyenangkan!",
      audioPath: "assets/id/scene_10.mp3",
      wordsPath: "assets/id/scene_10_words.json",
      en: {
        text: "The moral of the story: Staying active and exercising every day makes our bodies fit, healthy, and strong! Running and playing with a friend brings endless joy!",
        audioPath: "assets/en/scene_10.mp3",
        wordsPath: "assets/en/scene_10_words.json",
        durationSeconds: 11.5,
        status: "ready",
      },
      sfxPath: "assets/sfx/sfx_10_moral_harp.m4a",
      sfxVolume: 0.26,
      status: "ready",
    },
  });

  // Add Scene 11: Outro
  data.scenes.push({
    index: 11,
    sceneId: "scene_11",
    type: "outro",
    durationSeconds: 14.5,
    visual: {
      imagePath: "assets/cover.png",
      status: "ready",
    },
    recommendation: {
      title: "Dongeng Seru Berikutnya!",
      titleEn: "Next Exciting Adventure!",
      subtitle: "Klik untuk Menonton Cerita Lengkap",
      subtitleEn: "Click to Watch Full Story",
      badge: "REKOMENDASI",
      badgeEn: "UP NEXT",
    },
    channelHandle: "@ZaynAdyanRamadhan",
    audio: {
      text: "Wah, seru sekali ya ceritanya! Jangan lupa klik video di sebelah sini untuk menonton dongeng seru lainnya, dan klik tombol Subscribe agar kita bisa terus berpetualang bersama! Sampai jumpa di cerita berikutnya! Dadah!",
      audioPath: "assets/id/scene_11.mp3",
      wordsPath: "assets/id/scene_11_words.json",
      en: {
        text: "Did you enjoy the story? Click the video on your screen to watch another fun adventure, and don't forget to hit Subscribe so we can keep reading together! See you in the next story! Bye-bye!",
        audioPath: "assets/en/scene_11.mp3",
        wordsPath: "assets/en/scene_11_words.json",
        durationSeconds: 14.5,
        status: "ready",
      },
      sfxPath: "assets/sfx/sfx_11_outro_pop.m4a",
      sfxVolume: 0.65,
      status: "ready",
    },
  });

  await fs.writeFile(file, JSON.stringify(data, null, 2));
  console.log("✔ Raja Gemuk story.json successfully upgraded!");
}

main().catch(console.error);
