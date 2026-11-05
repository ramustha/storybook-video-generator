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
  const author = manifest.source?.originalAuthor || "Cerita Rakyat / Folklore";
  const illustrator = manifest.source?.originalIllustrator || "Illustrator";

  // Extract moral scene text if available
  const moralScene = manifest.scenes?.find((s) => s.type === "moral");
  const moralId = moralScene?.audio?.text || "Kisah hangat penuh pesan budi pekerti untuk si kecil.";
  const moralEn = moralScene?.audio?.en?.text || "A gentle, heartwarming tale with a positive lesson for children.";

  // Extract links
  const ytIdUrl = manifest.publications?.youtube?.id?.landscape?.url || "https://youtube.com/@ZaynStorybook";
  const ytEnUrl = manifest.publications?.youtube?.en?.landscape?.url || "https://youtube.com/@ZaynStorybook";
  const igIdUrl = manifest.publications?.instagram?.id?.url || "https://instagram.com/zayn.storybook";
  const igEnUrl = manifest.publications?.instagram?.en?.url || "https://instagram.com/zayn.storybook";
  const fbIdUrl = manifest.publications?.facebook?.id?.landscape?.url || "https://facebook.com/1473240609201601";

  const hookId = manifest.thumbnailConfig?.id?.hook || `${titleId}! Kisah seru penuh tawa dan pesan moral untuk si kecil!`;
  const hookEn = manifest.thumbnailConfig?.en?.hook || `${titleEn}! A delightful, funny storybook that kids will fall in love with!`;

  return `# 🚀 Bilingual Multi-Platform Social Promotion Kit: ${titleId} / ${titleEn}

> **Target Audience**: Parents, educators, bilingual families, diaspora, and early-childhood reading enthusiasts.  
> **Core Strategy**: "Single Post, Dual Language" — capturing Indonesian & international English discovery in every post to maximize watch time, comments, and saves.

---

## 📸 1. INSTAGRAM (Feed Carousel & Reel Caption)

### Visual Asset Recommendation:
- **Slide 1**: Hero Cover with Hook Sticker (\`thumbnail-popular.png\` or 1:1 square crop).
- **Slide 2**: Climactic / Funny Scene Still (e.g. Scene 4/5).
- **Slide 3**: Emotional / Solution Scene Still (e.g. Scene 7/8).
- **Slide 4**: Dedicated Moral Card (\`type: "moral"\` frame).
- **Slide 5**: CTA Slide: *"Tonton Dongeng Lengkapnya di YouTube @ZaynStorybook! 🔔 Link di Bio!"*.

### Single-Post Bilingual Caption (Copy-Paste Ready):
\`\`\`text
✨ DONGENG CERITA ANAK BARU! 📖 / NEW ANIMATED STORYBOOK! ✨
------------------------------------------------------------
🇮🇩 BAHASA INDONESIA:
"${hookId}" 🌙✨

Wah, ada cerita seru apa ya di "${titleId}"? Si kecil diajak berpetualang dalam kisah yang penuh tawa, imajinasi, dan kehangatan keluarga. Cocok banget ditonton bersama sebelum tidur atau saat santai di rumah!

💡 Pesan Moral:
"${moralId}"

💬 PERTANYAAN UNTUK BUNDA & AYAH:
Siapa si kecil yang punya pengalaman mirip dengan cerita ini? Atau apa dongeng favorit si kecil sebelum tidur? Cerita di kolom komentar ya! 👇🥰

------------------------------------------------------------
🇺🇸 ENGLISH:
"${hookEn}" 🌙✨

Join the adventure in "${titleEn}"! A heartwarming, delightful tale packed with giggles, imagination, and positive lessons. Perfect for calm bedtime screen-time or early English learning!

💡 Moral of the Story:
"${moralEn}"

💬 QUESTION FOR PARENTS & EDUCATORS:
Does your child also love bedtime stories with a funny twist? What's your family's favorite evening routine? Share with us below! 👇✨

------------------------------------------------------------
🎬 WATCH THE FULL WIDESCREEN VIDEO:
📺 YouTube: Link in Bio (@zayn.storybook)
⭐ Don't forget to SAVE this post for tonight's bedtime story! 💾✨

#DongengAnak #CeritaAnak #CeritaBergambar #DongengSebelumTidur #BukuAnak #PendidikanAnakUsiaDini #BilingualKids #KidsBedtimeStory #PictureBookReading #ReadAloud #BedtimeStoriesForKids #ZaynStorybook
\`\`\`

---

## 📘 2. FACEBOOK PAGE (Community Feed & Discussion Post)

### Visual Asset:
- Attach \`thumbnail-popular.png\` (1920x1080) directly or share the 16:9 Landscape Video upload.

### Bilingual Post Copy (Copy-Paste Ready):
\`\`\`text
📖 DONGENG BARU HARI INI: "${titleId}" / "${titleEn}" 🌙✨

Halo Ayah, Bunda, dan Sobat Pendidik! ✨
Koleksi dongeng animasi anak bergambar terbaru dari Zayn Storybook sudah resmi tayang!

🇮🇩 Rangkuman Cerita:
${hookId}
Kisah ini mengajarkan anak-anak tentang empati, keceriaan, dan rasa syukur melalui visual animasi yang ramah anak, suara anak alami yang menyenangkan, serta musik lembut pengantar tidur.

💡 Pesan Budi Pekerti:
"${moralId}"

🇺🇸 English Edition Available:
Looking for a calming, joyful read-aloud in English? "${titleEn}" is also live with native child voiceover, helping children develop dual-language listening skills naturally!
"${moralEn}"

------------------------------------------------------------
🎬 TONTON VIDEO LENGKAPNYA:
▶️ Versi Bahasa Indonesia: ${ytIdUrl}
▶️ English Edition       : ${ytEnUrl}

💬 Diskusi Hari Ini:
Bagaimana cara Ayah & Bunda menanamkan pesan moral kepada si kecil tanpa terkesan menggurui? Tulis tips terbaik Anda di kolom komentar agar bisa saling menginspirasi sesama orang tua! 👇❤️

#ParentingIndonesia #DongengAnakSholeh #CeritaAnakBergambar #BilingualStorybook #ZaynStorybook #PendidikanKarakter
\`\`\`

---

## 🔴 3. YOUTUBE COMMUNITY TAB (Interactive Poll & Announcement)

### Post Format: Image Poll or Single Widescreen Card
\`\`\`text
🎉 CERITA BARU SUDAH TAYANG! / NEW STORYBOOK IS LIVE! 📖✨

Halo sahabat Zayn Storybook! Video dongeng "${titleId}" (The Moon and the Cap) sudah bisa kalian tonton di channel kami! 🥳

Kira-kira, adegan mana yang paling bikin kalian penasaran atau tertawa?
1. 🧢 Saat topi tertiup angin kencang
2. 🌙 Waktu bulan tiba-tiba memakai topi
3. 💖 Saat senyuman kembali merekah bersama keluarga
4. ✨ Semua adegannya lucu dan bikin gemas!

Tulis alasanmu di komentar ya! Jangan lupa tonton video lengkapnya di sini:
👉 Versi Indonesia : ${ytIdUrl}
👉 English Edition : ${ytEnUrl}

Selamat menonton dan selamat tidur nyenyak! 🌙💤
\`\`\`

---

## 🎵 4. TIKTOK & SHORT-FORM TEASER (Snappy Hook <150 Chars)

\`\`\`text
Topi kesayangan hilang tertiup angin... kok malah dipakai bulan?! 🌙🧢 Tonton cerita lengkap "${titleId}" di YouTube Zayn Storybook! Link di bio! #DongengAnak #CeritaLucu #AnimasiAnak #BedtimeStory
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
