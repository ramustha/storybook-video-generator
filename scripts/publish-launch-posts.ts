import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import FormData from "form-data";

const CONFIG_PATH = path.resolve("./config/meta-config.json");

interface MetaConfig {
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  pageAccessToken: string;
}

async function loadMetaConfig(): Promise<MetaConfig> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

const LAUNCH_POST_TEXT = `🎉 HOREEE! SELAMAT DATANG DI RUMAH DONGENG ZAYN STORYBOOK! 🎈✨
Tempat Petualangan Ceria & Pengantar Tidur Nyenyak Buat Si Kecil! 🌙💤

Halo Ayah, Bunda, dan adik-adik tersayang di seluruh Indonesia dan dunia! 🥰👋
Kabar gembira nih! Mulai hari ini, Zayn Storybook resmi mengudara untuk menemani waktu santai sore dan waktu tidur si kecil dengan dongeng animasi buku bergambar yang super seru, penuh tawa, dan sarat pesan kebaikan budi pekerti.

Di sini, kita percaya tontonan anak itu harus:
💖 Bikin hati senang dan penuh tawa (tanpa suara kaget yang bising!)
💖 Menumbuhkan rasa sayang keluarga, kejujuran, dan empati
💖 Melatih pendengaran dwibahasa (Bahasa Indonesia & Inggris) sejak dini
💖 Menemani si kecil tertidur pulas dengan musik marimba yang menenangkan!

------------------------------------------------------------
🍿 YUK TONTON 6 CERITA PERDANA KAMI DI YOUTUBE (16:9 HD):

1. 🐱 Gara-Gara Kucing! (It's All the Cat's Fault!)
   Kucing oranye usil yang bikin alasan PR jadi kacau balau tapi bikin ngakak!
   ▶️ Versi ID: https://youtu.be/Ladb_oJ-1-U
   ▶️ Versi EN: https://youtu.be/6sLTErwRXsk

2. 🦁 Hari Cukur Rambut Sringeri Srinivas! (Annual Haircut Day!)
   Rambut gondrong Pak Srinivas mendadak botak gara-gara kaget harimau!
   ▶️ Versi ID: https://youtu.be/W_s0hTXPYfw
   ▶️ Versi EN: https://youtu.be/U1Bi31IWBzI

3. 🌧️ Jas Hujan Merah (The Red Raincoat)
   Kisah Manu yang menggemaskan saat setia menunggu awan hujan datang!
   ▶️ Versi ID: https://youtu.be/XJ8QuH2pXSY
   ▶️ Versi EN: https://youtu.be/CkSoydfX-tc

4. 🍌 Pisang Terlalu Banyak! (Too Many Bananas!)
   Pohon pisang Pak Srinivas berbuah melimpah ruah, dibagikan ke satu desa!
   ▶️ Versi ID: https://youtu.be/8d1N51G2Py8
   ▶️ Versi EN: https://youtu.be/Kb3pN9MtxVg

5. 👑 Raja Gemuk, Anjing Kurus! (Fat King, Thin Dog!)
   Petualangan lari pagi kejar-kejaran anjing yang bikin raja jadi bugar!
   ▶️ Versi ID: https://youtu.be/qfpALMgjPhU
   ▶️ Versi EN: https://youtu.be/DJctEROJ7wo

6. 🌙 Bulan dan Topi Biru (The Moon and the Cap)
   Topi terbang ke langit malam, eh ternyata bulan pengen ikut bergaya!
   ▶️ Versi ID: https://youtu.be/2wIHNkjegd0
   ▶️ Versi EN: https://youtu.be/jyQ4sbXJZAs

------------------------------------------------------------
🌙 MARATON 14 MENIT PENGANTAR TIDUR NYENYAK (NON-STOP):
Pengen tontonan santai tanpa perlu gonta-ganti video? Tonton kompilasi maraton 6 cerita sekaligus:
▶️ Versi Indonesia : https://youtu.be/_-umN46Ocx4
▶️ English Edition : https://youtu.be/HbjJuqguQ3A

💬 OBROLAN KELUARGA:
Cerita mana nih yang kira-kira bakal jadi dongeng favorit si kecil sebelum bobo malam ini? Yuk bagikan ceritanya di kolom komentar! 👇❤️

Jangan lupa klik LIKE, SHARE ke grup keluarga atau sesama orang tua, dan IKUTI halaman Zayn Storybook ya! Selamat mendengarkan dongeng dan selamat tidur nyenyak adik-adik! 🌙🧸✨

#ZaynStorybook #DongengAnak #CeritaAnakBergambar #DongengLucu #ParentingCeria #PendidikanKarakterAnak #BukuCeritaBergambar #DongengSebelumTidur`;

async function main() {
  console.log("\n=======================================================");
  console.log("📢 PUBLISHING INAUGURAL GRAND LAUNCH POST TO FACEBOOK PAGE");
  console.log("=======================================================\n");

  const config = await loadMetaConfig();
  const photoPath = path.resolve("./exports/compilations/thumbnail-compilation-bedtime-id.png");

  if (!existsSync(photoPath)) {
    throw new Error(`Photo asset not found: ${photoPath}`);
  }

  console.log(`📄 Facebook Page : ${config.facebookPageName || config.facebookPageId}`);
  console.log(`🖼️ Attached Photo: ${photoPath}`);

  const form = new FormData();
  form.append("caption", LAUNCH_POST_TEXT);
  form.append("access_token", config.pageAccessToken);
  form.append("source", createReadStream(photoPath));

  const url = `https://graph.facebook.com/v21.0/${config.facebookPageId}/photos`;

  console.log(`🚀 Sending multipart photo post to Meta Graph API...`);
  const res = await new Promise<{ status: number; data: any }>((resolve, reject) => {
    form.submit(url, (err, response) => {
      if (err) return reject(err);
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode || 200, data: JSON.parse(body) });
        } catch (pErr) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
  });

  if (res.data.error) {
    throw new Error(`Facebook photo post failed: ${JSON.stringify(res.data.error)}`);
  }

  const photoId = res.data.id;
  const postId = res.data.post_id || photoId;
  const permalink = `https://www.facebook.com/${config.facebookPageId}/posts/${postId}`;

  console.log(`\n🎉 SUCCESS! GRAND LAUNCH POST PUBLISHED TO FACEBOOK PAGE!`);
  console.log(`📸 Photo ID : ${photoId}`);
  console.log(`📌 Post ID  : ${postId}`);
  console.log(`🔗 Link     : ${permalink}\n`);
}

main().catch(console.error);
