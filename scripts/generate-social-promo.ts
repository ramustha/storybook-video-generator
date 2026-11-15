import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface StoryManifest {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  source?: {
    originalAuthor?: string;
    originalIllustrator?: string;
    publisher?: string;
    license?: string;
  };
  thumbnailConfig?: {
    id?: {
      headlineTop?: string;
      headlineBottom?: string;
      hook?: string;
      badge?: string;
      sticker?: string;
    };
    en?: {
      headlineTop?: string;
      headlineBottom?: string;
      hook?: string;
      badge?: string;
      sticker?: string;
    };
  };
  scenes?: Array<{
    type?: string;
    audio?: {
      text?: string;
      en?: {
        text?: string;
      };
    };
  }>;
  publications?: {
    youtube?: {
      id?: { landscape?: { url?: string; id?: string } };
      en?: { landscape?: { url?: string; id?: string } };
    };
    facebook?: {
      id?: {
        landscape?: { url?: string };
        vertical?: { url?: string };
      };
      en?: {
        landscape?: { url?: string };
        vertical?: { url?: string };
      };
    };
    instagram?: {
      id?: { url?: string };
      en?: { url?: string };
    };
  };
}

export function generateBilingualSocialKit(manifest: StoryManifest): string {
  const titleId = manifest.title;
  const titleEn = manifest.originalTitle || manifest.title;
  const author = manifest.source?.originalAuthor || (manifest as any).author || "Cerita Rakyat / Folklore";
  const illustrator = manifest.source?.originalIllustrator || (manifest as any).illustrator || "Illustrator";

  // Extract moral scene text if available
  const moralScene = manifest.scenes?.find((s) => s.type === "moral");
  const moralId = moralScene?.audio?.text || "Kisah hangat penuh pesan budi pekerti untuk si kecil.";
  const moralEn = moralScene?.audio?.en?.text || "A gentle, heartwarming tale with a positive lesson for children.";

  // Extract links
  const ytIdUrl = manifest.publications?.youtube?.id?.landscape?.url || "https://youtube.com/@Zayn.Storybook";
  const ytEnUrl = manifest.publications?.youtube?.en?.landscape?.url || "https://youtube.com/@Zayn.Storybook";
  const igIdUrl = manifest.publications?.instagram?.id?.url || "https://instagram.com/zayn.storybook";
  const igEnUrl = manifest.publications?.instagram?.en?.url || "https://instagram.com/zayn.storybook";
  const fbIdUrl = manifest.publications?.facebook?.id?.landscape?.url || "https://facebook.com/1473240609201601";

  const hookId = manifest.thumbnailConfig?.id?.hook || `${titleId}! Kisah seru penuh tawa dan pesan moral untuk si kecil!`;
  const hookEn = manifest.thumbnailConfig?.en?.hook || `${titleEn}! A delightful, funny storybook that kids will fall in love with!`;

  return `# 🎈 Bilingual Kid-Friendly Social Promotion Kit: ${titleId} / ${titleEn}

> **Tone of Voice**: Playful, Cheerful, Whimsical & Family-Friendly (Gaya Kakak Pendongeng Ceria).  
> **Core Strategy**: "Single Post, Dual Language" — energetic hooks, giggles, bedtime hugs, and comment sparks.

---

## 📸 1. INSTAGRAM (Feed Carousel & Reel Caption)

### Visual Asset Recommendation:
- **Slide 1**: Hero Cover with Playful Hook Badge (\`thumbnail-popular.png\` or 1:1 crop).
- **Slide 2**: Climactic / Funny Scene Still (e.g. Scene 4/5).
- **Slide 3**: Warm / Happy Ending Scene Still (e.g. Scene 7/8).
- **Slide 4**: Dedicated Moral Card (\`type: "moral"\` frame).
- **Slide 5**: CTA Slide: *"Tonton Dongeng Lengkapnya di YouTube @Zayn.Storybook! 🔔 Link di Bio!"*.

### Single-Post Bilingual Caption (Playful & Joyful):
\`\`\`text
HOREEE! YEEAY! 🎈🎉 Ada Cerita Seru Baru Nih! 📖✨ / NEW STORYBOOK IS HERE!
------------------------------------------------------------
🇮🇩 BAHASA INDONESIA:
"${hookId}" 🌙✨

Wah, ada petualangan apa ya di "${titleId}"? Si kecil pasti bakal tertawa gemas melihat ceritanya yang super seru dan penuh kejutan! Cocok banget ditonton santai sore bareng keluarga atau jadi dongeng pengantar tidur nyenyak! 🧸💤

💡 Pesan Manis Cerita:
"${moralId}"

💬 TEBAK-TEBAKAN & CERITA SERU:
Siapa si kecil di rumah yang karakternya mirip dengan tokoh di cerita ini? Atau ada yang punya pengalaman lucu serupa? Cerita di kolom komentar yuk, Ayah Bunda! 👇🥰

------------------------------------------------------------
🇺🇸 ENGLISH:
"${hookEn}" 🌙✨

Hop on board for a super fun adventure in "${titleEn}"! Full of giggles, delightful characters, and warm bedtime cuddles. Perfect for a cozy evening routine or boosting early English vocabulary in a natural, joyful way! 🎈🧸

💡 Sweet Moral of the Story:
"${moralEn}"

💬 FUN QUESTION FOR PARENTS:
Does your little one love funny characters or magical bedtime tales best? Let's chat in the comments below! 👇💖

------------------------------------------------------------
🍿 YUK NONTON BARENG:
📺 YouTube: Link in Bio (@zayn.storybook) untuk video layar lebar 16:9 yang jernih!
⭐ Ayah Bunda, jangan lupa SIMPAN (SAVE) postingan ini buat dongeng bobo nanti malam ya! 💾✨

#ZaynStorybook #DongengAnakLucu #CeritaAnakBergambar #DongengSebelumTidur #BukuCeritaAnak #KartunAnakIndonesia #BilingualKids #KidsBedtimeStories #ReadAloud #BedtimeStoriesForKids #FunnyStorybook #ChildrenBooks
\`\`\`

---

## 📘 2. FACEBOOK PAGE (Community Feed & Family Post)

### Visual Asset:
- Attach \`thumbnail-popular.png\` (1920x1080) directly or share the 16:9 Landscape Video upload.

### Bilingual Post Copy (Hangat & Menyenangkan):
\`\`\`text
🎉 HOREEE! KABAR GEMBIRA BUAT ADIK-ADIK DAN AYAH BUNDA! 🎈✨
Dongeng baru "${titleId}" (${titleEn}) sudah resmi tayang di Zayn Storybook! 🌙💤

🇮🇩 Keseruan Cerita Hari Ini:
${hookId}
Di dongeng kali ini, si kecil diajak belajar nilai kebaikan dengan cara yang super asyik, penuh tawa, dan tanpa bising. Musik marimbanya yang lembut siap menemani si kecil relaksasi hingga tertidur pulas!

💡 Pesan Kebaikan Cerita:
"${moralId}"

🇺🇸 English Edition for Dual-Language Fun:
Looking for a fun, calming bedtime story in English? "${titleEn}" is also live with sweet child voiceovers and soothing melodies!
"${moralEn}"

------------------------------------------------------------
🎬 YUK NONTON VIDEO LENGKAPNYA DI YOUTUBE:
▶️ Versi Bahasa Indonesia: ${ytIdUrl}
▶️ English Edition       : ${ytEnUrl}

💬 Obrolan Seru Keluarga:
Paling suka bagian mana nih saat mendongeng bareng si kecil? Yuk saling berbagi cerita di kolom komentar! 👇❤️

Jangan lupa klik LIKE & SHARE ke sesama Ayah Bunda ya! Selamat mendengarkan dongeng dan selamat tidur nyenyak adik-adik! 🌙🧸✨

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #DongengLucu #ParentingCeria #PendidikanKarakterAnak #BukuCeritaBergambar #DongengSebelumTidur
\`\`\`

---

## 🔴 3. YOUTUBE COMMUNITY TAB (Interactive Poll & Announcement)

### Post Format: Image Poll or Single Widescreen Card
\`\`\`text
🎉 CERITA SERU BARU SUDAH TAYANG! / NEW STORYBOOK IS LIVE! 🎈✨

Halo teman-teman kecil tersayang! 🥳 Video dongeng "${titleId}" sudah bisa kalian tonton bersama Ayah Bunda di YouTube Zayn Storybook! 📺💖

Kira-kira, adegan mana yang paling bikin kalian tertawa atau penasaran?
1. 🌟 Bagian awal yang penuh kejutan seru!
2. 🤣 Adegan lucu di tengah cerita yang bikin ngakak!
3. 💖 Saat semuanya berakhir dengan senyuman bahagia!
4. ✨ Semua adegannya asyik dan menggemaskan!

Pilih jawabanmu dan tulis di komentar ya! Jangan lupa klik SUBSCRIBE dan bunyikan loncengnya 🔔!
👉 Tonton Versi Indonesia : ${ytIdUrl}
👉 Watch English Edition : ${ytEnUrl}

Selamat menonton dan selamat bermimpi indah adik-adik! 🌙💤
\`\`\`

---

## 🎵 4. TIKTOK & SHORT-FORM TEASER (Snappy Hook <150 Chars)

\`\`\`text
Waaah seru banget! 😱 ${hookId.slice(0, 80)}... Tonton cerita lengkap "${titleId}" di YouTube Zayn Storybook yuk! Link di bio! 🎈✨ #DongengAnak #CeritaLucu #AnimasiAnak #BedtimeStory
\`\`\`

---

## 🧵 5. META THREADS (Conversational Announcement ≤ 500 Chars)

### Visual Asset:
- Attach \`thumbnail-portrait.png\` (1080x1350, 4:5 Aspect Ratio) or 9:16 Short Video Teaser.

### 🇮🇩 Indonesian Edition (≤ 500 Chars):
\`\`\`text
HOREEE! 🎈 Cerita baru "${titleId}" sudah tayang! 📖✨

"${hookId}"

💡 Pesan Cerita:
"${moralId.length > 130 ? moralId.slice(0, 127).trim() + "..." : moralId}"

🎬 Tonton selengkapnya di YouTube:
${ytIdUrl}

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #KidsBedtimeStories
\`\`\`

### 🇺🇸 English Edition (≤ 500 Chars):
\`\`\`text
YAY! 🎈 New storybook "${titleEn}" is now live! 📖✨

"${hookEn}"

💡 Moral of the story:
"${moralEn.length > 130 ? moralEn.slice(0, 127).trim() + "..." : moralEn}"

🎬 Watch full animated story on YouTube:
${ytEnUrl}

#ZaynStorybook #KidsBedtimeStories #ReadAloud #ChildrenBooks
\`\`\`


`;
}

async function main() {
  const args = process.argv.slice(2);
  const bookSlug = args.find((a) => !a.startsWith("--")) || "bulan-dan-topi-biru";

  const storyDir = path.resolve("./stories", bookSlug);
  const manifestPath = path.join(storyDir, "story.json");

  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest not found at: ${manifestPath}`);
    process.exit(1);
  }

  const raw = await fs.readFile(manifestPath, "utf-8");
  const manifest: StoryManifest = JSON.parse(raw);

  const promoKit = generateBilingualSocialKit(manifest);
  const outPath = path.join(storyDir, "exports/social-promotion-posts.md");

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, promoKit, "utf-8");

  console.log(`\n🎉 SUCCESS! Generated Bilingual Social Promotion Kit for: "${manifest.title}"`);
  console.log(`📁 Saved to: ${outPath}\n`);
}

if (require.main === module) {
  main().catch(console.error);
}
