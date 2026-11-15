import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import FormData from "form-data";
import { generateBilingualSocialKit } from "./generate-social-promo.js";

const CONFIG_PATH = path.resolve("./config/meta-config.json");

interface MetaConfig {
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  pageAccessToken: string;
}

export async function loadMetaConfig(): Promise<MetaConfig> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

export const INAUGURAL_LAUNCH_POST_TEXT = `🎉 HOREEE! SELAMAT DATANG DI RUMAH DONGENG ZAYN STORYBOOK! 🎈✨
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

/**
 * Posts a first comment under a Facebook Page post (used to drop clickable YouTube & Catalog links without throttling organic reach).
 */
export async function postFacebookComment(
  postId: string,
  message: string,
  pageAccessToken?: string
): Promise<string | null> {
  if (!postId || !message.trim()) return null;
  const token = pageAccessToken || (await loadMetaConfig()).pageAccessToken;
  const params = new URLSearchParams();
  params.append("message", message);
  params.append("access_token", token);

  const res = await fetch(`https://graph.facebook.com/v21.0/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = (await res.json()) as any;
  if (data.error) {
    console.warn(`⚠️ Facebook first-comment warning for ${postId}:`, JSON.stringify(data.error));
    return null;
  }
  console.log(`💬 Facebook first comment posted on ${postId}: ${data.id || "ok"}`);
  return data.id || null;
}

export async function publishFacebookPhotoPost(options: {
  photoPath: string;
  caption: string;
  firstComment?: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  photoId?: string;
  postId?: string;
  permalink?: string;
  commentId?: string | null;
  dryRun?: boolean;
}> {
  const config = await loadMetaConfig();

  console.log("\n=======================================================");
  console.log("📢 FACEBOOK PAGE PHOTO POST PUBLISHER (API)");
  console.log("=======================================================");
  console.log(`📄 Facebook Page : ${config.facebookPageName || config.facebookPageId}`);
  console.log(`🖼️ Attached Photo: ${options.photoPath}`);
  console.log(`🧪 Dry Run       : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Caption Preview:\n", options.caption);
    if (options.firstComment) {
      console.log("\n[DRY RUN] First Comment Preview:\n", options.firstComment);
    }
    return { success: true, dryRun: true };
  }

  if (!existsSync(options.photoPath)) {
    throw new Error(`Photo asset not found: ${options.photoPath}`);
  }

  const form = new FormData();
  form.append("caption", options.caption);
  form.append("access_token", config.pageAccessToken);
  form.append("source", createReadStream(options.photoPath));

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
  let permalink = `https://www.facebook.com/${config.facebookPageId}/posts/${postId}`;

  try {
    const detailRes = await fetch(
      `https://graph.facebook.com/v21.0/${postId}?fields=permalink_url&access_token=${config.pageAccessToken}`
    );
    const detailData = (await detailRes.json()) as any;
    if (detailData.permalink_url) {
      permalink = detailData.permalink_url;
    }
  } catch {}

  console.log(`\n🎉 SUCCESS! PHOTO POST PUBLISHED TO FACEBOOK PAGE!`);
  console.log(`📸 Photo ID : ${photoId}`);
  console.log(`📌 Post ID  : ${postId}`);
  console.log(`🔗 Link     : ${permalink}\n`);

  const commentId = options.firstComment
    ? await postFacebookComment(postId, options.firstComment, config.pageAccessToken)
    : null;

  return { success: true, photoId, postId, permalink, commentId };
}

/**
 * Publishes a multi-photo album post to Facebook Page feed (e.g. for bilingual daily lineup).
 */
export async function publishFacebookMultiPhotoPost(options: {
  photoPaths: string[];
  caption: string;
  firstComment?: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  postId?: string;
  permalink?: string;
  photoIds?: string[];
  commentId?: string | null;
  dryRun?: boolean;
}> {
  const config = await loadMetaConfig();

  console.log("\n=======================================================");
  console.log("📢 FACEBOOK PAGE MULTI-PHOTO POST PUBLISHER (API)");
  console.log("=======================================================");
  console.log(`📄 Facebook Page : ${config.facebookPageName || config.facebookPageId}`);
  console.log(`🖼️ Attached Photos: ${options.photoPaths.length} photos`);
  console.log(`🧪 Dry Run       : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Caption Preview:\n", options.caption);
    console.log("[DRY RUN] Photos List:", options.photoPaths);
    if (options.firstComment) {
      console.log("\n[DRY RUN] First Comment Preview:\n", options.firstComment);
    }
    return { success: true, dryRun: true };
  }

  if (!options.photoPaths || options.photoPaths.length <= 1) {
    const singleRes = await publishFacebookPhotoPost({
      photoPath: options.photoPaths?.[0] || "",
      caption: options.caption,
      firstComment: options.firstComment,
      dryRun: options.dryRun,
    });
    return {
      success: singleRes.success,
      postId: singleRes.postId,
      permalink: singleRes.permalink,
      photoIds: singleRes.photoId ? [singleRes.photoId] : [],
      commentId: singleRes.commentId,
    };
  }

  // 1. Upload each photo as unpublished
  const photoIds: string[] = [];
  for (let i = 0; i < options.photoPaths.length; i++) {
    const pPath = options.photoPaths[i];
    if (!existsSync(pPath)) {
      throw new Error(`Photo asset not found: ${pPath}`);
    }

    console.log(`📸 Uploading unpublished photo ${i + 1}/${options.photoPaths.length}: ${path.basename(pPath)}...`);
    const form = new FormData();
    form.append("access_token", config.pageAccessToken);
    form.append("published", "false");
    form.append("source", createReadStream(pPath));

    const url = `https://graph.facebook.com/v21.0/${config.facebookPageId}/photos`;
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

    if (res.data.error || !res.data.id) {
      throw new Error(`Failed uploading unpublished photo ${i + 1}: ${JSON.stringify(res.data.error)}`);
    }
    console.log(`   ✔ Photo ${i + 1} uploaded: ID ${res.data.id}`);
    photoIds.push(res.data.id);
  }

  // 2. Publish multi-photo feed post
  console.log(`📦 Publishing Facebook multi-photo album post with ${photoIds.length} photos...`);
  const feedUrl = `https://graph.facebook.com/v21.0/${config.facebookPageId}/feed`;
  const params = new URLSearchParams();
  params.append("message", options.caption);
  params.append("access_token", config.pageAccessToken);
  photoIds.forEach((id, idx) => {
    params.append(`attached_media[${idx}]`, JSON.stringify({ media_fbid: id }));
  });

  const feedRes = await fetch(feedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const feedData = (await feedRes.json()) as any;
  if (feedData.error) {
    throw new Error(`Facebook multi-photo post failed: ${JSON.stringify(feedData.error)}`);
  }

  const postId = feedData.id;
  let permalink = `https://www.facebook.com/${postId}`;

  try {
    const detailRes = await fetch(
      `https://graph.facebook.com/v21.0/${postId}?fields=permalink_url&access_token=${config.pageAccessToken}`
    );
    const detailData = (await detailRes.json()) as any;
    if (detailData.permalink_url) {
      permalink = detailData.permalink_url;
    } else if (postId.includes("_")) {
      const parts = postId.split("_");
      permalink = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
    }
  } catch {
    if (postId.includes("_")) {
      const parts = postId.split("_");
      permalink = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
    }
  }

  console.log(`\n🎉 SUCCESS! FACEBOOK MULTI-PHOTO POST IS LIVE: ${permalink}\n`);
  const commentId = options.firstComment
    ? await postFacebookComment(postId, options.firstComment, config.pageAccessToken)
    : null;
  return { success: true, postId, permalink, photoIds, commentId };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const isDryRun = args.includes("--dry-run");
  const bookSlug = getArg("--book");
  const langArg = (getArg("--lang") || "id") as "id" | "en";

  let photoPath = path.resolve("./exports/compilations/thumbnail-compilation-bedtime-id.png");
  let captionText = INAUGURAL_LAUNCH_POST_TEXT;

  if (bookSlug) {
    const storyJsonPath = path.resolve(`./stories/${bookSlug}/story.json`);
    if (existsSync(storyJsonPath)) {
      const story = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
      const kit = generateBilingualSocialKit(story);
      const fbMatch = kit.match(/## 📘 2\. FACEBOOK PAGE[\s\S]*?```text\n([\s\S]*?)```/);
      if (fbMatch && fbMatch[1]) {
        captionText = fbMatch[1].trim();
      }

      // Check candidate photos - PRIORITIZE 4:5 PORTRAIT (1080x1350)
      const candidatePaths = [
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-portrait.png`),
        path.resolve(`./stories/${bookSlug}/exports/id/thumbnail-portrait.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-vertical.png`),
        path.resolve(`./stories/${bookSlug}/exports/${langArg}/thumbnail-popular.png`),
        path.resolve(`./stories/${bookSlug}/exports/id/thumbnail-popular.png`),
        path.resolve(`./stories/${bookSlug}/exports/thumbnail.png`),
        path.resolve(`./stories/${bookSlug}/assets/cover.png`),
      ];
      for (const p of candidatePaths) {
        if (existsSync(p)) {
          photoPath = p;
          break;
        }
      }
    }
  }

  await publishFacebookPhotoPost({
    photoPath,
    caption: captionText,
    dryRun: isDryRun,
  });
}

if (process.argv[1] && process.argv[1].endsWith("publish-launch-posts.ts")) {
  main().catch((err) => {
    console.error("❌ Facebook publishing failed:", err);
    process.exit(1);
  });
}
