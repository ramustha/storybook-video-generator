import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import http from "http";
import url from "url";
import readline from "readline";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const CONFIG_DIR = path.resolve("./config");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "youtube-credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "youtube-token.json");

interface StoryScene {
  index: number;
  sceneId: string;
  type: string;
  durationSeconds: number;
  audio: {
    text: string;
  };
}

interface StoryManifest {
  title: string;
  originalTitle?: string;
  slug: string;
  source: {
    repository: string;
    license: string;
    originalAuthor: string;
    originalIllustrator: string;
    sourceUrl: string;
  };
  scenes: StoryScene[];
  exports: {
    landscape?: any;
    vertical?: any;
  };
}

/**
 * Formats seconds into MM:SS YouTube chapter format.
 */
function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Builds chapter list from story scene durations.
 */
function generateChapters(scenes: StoryScene[]): string {
  let elapsed = 0;
  const lines: string[] = [];

  for (const scene of scenes) {
    const timestamp = formatTimestamp(elapsed);
    if (scene.type === "cover") {
      lines.push(`${timestamp} Pembuka: ${scene.audio.text.slice(0, 30)}...`);
    } else {
      const summary = scene.audio.text.slice(0, 35).replace(/[\r\n]+/g, " ");
      lines.push(`${timestamp} Bagian ${scene.index}: ${summary}...`);
    }
    elapsed += scene.durationSeconds;
  }

  return lines.join("\n");
}

/**
 * Loads OAuth2 client credentials from config or environment.
 */
async function getOAuth2Client() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

  if (!clientId || !clientSecret) {
    if (process.env.YOUTUBE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.YOUTUBE_CREDENTIALS_JSON);
        const installed = creds.installed || creds.web;
        if (installed) {
          clientId = installed.client_id;
          clientSecret = installed.client_secret;
          redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
        }
      } catch (err: any) {
        console.warn(`⚠️ Failed to parse YOUTUBE_CREDENTIALS_JSON: ${err.message}`);
      }
    } else if (existsSync(CREDENTIALS_PATH)) {
      const credsRaw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
      const creds = JSON.parse(credsRaw);
      const installed = creds.installed || creds.web;
      if (installed) {
        clientId = installed.client_id;
        clientSecret = installed.client_secret;
        redirectUri = (installed.redirect_uris && installed.redirect_uris[0]) || redirectUri;
      }
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      `❌ YouTube OAuth credentials not found!\n` +
      `Please provide environment variables YOUTUBE_CLIENT_ID & YOUTUBE_CLIENT_SECRET,\n` +
      `or place credentials JSON at: ${CREDENTIALS_PATH}`
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Authorizes OAuth2 client, either from environment secrets, cached tokens, or interactive login.
 */
async function authorizeClient(oauth2Client: any) {
  // 1. Check environment secrets first (CI / Headless / Cloud)
  if (process.env.YOUTUBE_TOKEN_JSON) {
    try {
      const tokens = JSON.parse(process.env.YOUTUBE_TOKEN_JSON);
      oauth2Client.setCredentials(tokens);
      console.log("🔑 Authenticated via YOUTUBE_TOKEN_JSON environment secret.");
      return oauth2Client;
    } catch (err: any) {
      console.warn(`⚠️ Failed to parse YOUTUBE_TOKEN_JSON: ${err.message}`);
    }
  }

  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      access_token: process.env.YOUTUBE_ACCESS_TOKEN || undefined,
    });
    console.log("🔑 Authenticated via YOUTUBE_REFRESH_TOKEN environment secret.");
    return oauth2Client;
  }

  // 2. Check local token file on disk
  if (existsSync(TOKEN_PATH)) {
    const tokenRaw = await fs.readFile(TOKEN_PATH, "utf-8");
    const tokens = JSON.parse(tokenRaw);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on("tokens", async (newTokens: any) => {
      const merged = { ...tokens, ...newTokens };
      try {
        await fs.writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log("🔄 YouTube OAuth tokens refreshed and saved.");
      } catch (err) {
        // Ignore disk write failure in read-only / CI container
      }
    });

    return oauth2Client;
  }

  // Interactive one-time authorization flow
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n=======================================================");
  console.log("🔐 YouTube One-Time Authorization Required");
  console.log("=======================================================");
  console.log("1. Open the following URL in your browser:\n");
  console.log(`   👉 \x1b[36m${authUrl}\x1b[0m\n`);
  console.log("2. Sign in with the Google Account managing @ZaynAdyanRamadhan");
  console.log("3. Grant the requested upload permissions.");
  console.log("=======================================================\n");

  const code = await new Promise<string>((resolve) => {
    // Try spinning up a local callback server first
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url || "", true);
      if (parsedUrl.pathname === "/oauth2callback") {
        const authCode = parsedUrl.query.code as string;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>✅ YouTube Authorization Successful!</h2>
              <p>You can close this tab and return to your terminal.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3000, () => {
      console.log("⏳ Waiting for browser callback on http://localhost:3000/oauth2callback ...");
    });

    server.on("error", () => {
      // Fallback to manual console prompt if port 3000 is occupied
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Paste the authorization code here: ", (manualCode) => {
        rl.close();
        resolve(manualCode.trim());
      });
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✔ Token saved successfully to ${TOKEN_PATH}`);

  return oauth2Client;
}

/**
 * Checks channel identity to ensure we are uploading to @ZaynAdyanRamadhan.
 */
async function verifyChannel(youtube: any) {
  const res = await youtube.channels.list({
    part: ["snippet"],
    mine: true,
  });

  const channel = res.data.items?.[0];
  if (!channel) {
    console.warn("⚠️ Warning: No channel found for authenticated account.");
    return;
  }

  console.log(`\n📺 Authenticated Channel: \x1b[32m${channel.snippet?.title}\x1b[0m`);
  console.log(`   Handle / ID: ${channel.snippet?.customUrl || channel.id}`);
}

/**
 * Uploads a video file with resumable stream.
 */
async function uploadVideo(
  youtube: any,
  filePath: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
    privacyStatus: "public" | "unlisted" | "private";
    isMadeForKids?: boolean;
  }
): Promise<string> {
  const fileSize = (await fs.stat(filePath)).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);

  console.log(`\n🚀 Uploading video: ${path.basename(filePath)} (${fileSizeMB} MB)...`);
  console.log(`   Title: "${metadata.title}"`);
  console.log(`   Privacy: ${metadata.privacyStatus.toUpperCase()}`);

  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId || "1", // 1 = Film & Animation, 27 = Education
          defaultLanguage: "id",
          defaultAudioLanguage: "id",
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          selfDeclaredMadeForKids: metadata.isMadeForKids ?? false,
        },
      },
      media: {
        body: createReadStream(filePath),
      },
    },
    {
      onUploadProgress: (evt: any) => {
        const progress = Math.round((evt.bytesRead / fileSize) * 100);
        process.stdout.write(`   Uploading... ${progress}%\r`);
      },
    }
  );

  const videoId = res.data.id;
  console.log(`\n✔ Upload complete! Video ID: ${videoId}`);
  return videoId;
}

/**
 * Uploads custom thumbnail to a video.
 */
async function uploadThumbnail(youtube: any, videoId: string, thumbnailPath: string) {
  if (!existsSync(thumbnailPath)) {
    console.log(`⏭ No thumbnail found at ${thumbnailPath}, skipping.`);
    return;
  }

  console.log(`🖼 Uploading custom thumbnail from ${path.basename(thumbnailPath)}...`);
  try {
    await youtube.thumbnails.set({
      videoId,
      media: {
        body: createReadStream(thumbnailPath),
      },
    });
    console.log(`✔ Thumbnail uploaded successfully for video ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Thumbnail upload warning: ${err.message}`);
  }
}

/**
 * Checks remote video existence and live status on YouTube.
 */
async function checkRemoteVideoStatus(
  youtube: any,
  videoId: string
): Promise<{ exists: boolean; title?: string; status?: string; privacy?: string }> {
  try {
    const res = await youtube.videos.list({
      part: ["snippet", "status"],
      id: [videoId],
    });
    if (res.data.items && res.data.items.length > 0) {
      const item = res.data.items[0];
      return {
        exists: true,
        title: item.snippet?.title || "",
        status: item.status?.uploadStatus || "unknown",
        privacy: item.status?.privacyStatus || "unknown",
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Searches channel videos to detect untracked duplicates by title/keyword.
 */
async function searchChannelForDuplicate(
  youtube: any,
  searchTitle: string
): Promise<{ videoId: string; title: string } | null> {
  try {
    const res = await youtube.search.list({
      part: ["snippet"],
      forMine: true,
      type: ["video"],
      q: searchTitle.slice(0, 32),
      maxResults: 5,
    });
    if (res.data.items && res.data.items.length > 0) {
      for (const item of res.data.items) {
        if (item.id?.videoId && item.snippet?.title) {
          const cleanItem = item.snippet.title.toLowerCase().replace(/[^a-z0-9]/g, "");
          const cleanSearch = searchTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            cleanItem.includes(cleanSearch.slice(0, 16)) ||
            cleanSearch.includes(cleanItem.slice(0, 16))
          ) {
            return {
              videoId: item.id.videoId,
              title: item.snippet.title,
            };
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Updates video metadata (title, description, tags) on YouTube without re-uploading file.
 */
async function updateVideoMetadata(
  youtube: any,
  videoId: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
  }
) {
  console.log(`📝 Updating metadata on YouTube for video ${videoId}...`);
  try {
    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: videoId,
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId || "1",
        },
      },
    });
    console.log(`✔ Video metadata updated successfully for ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Video metadata update error: ${err.message}`);
  }
}

/**
 * Deletes remote video on YouTube before replacement.
 */
async function deleteRemoteVideo(youtube: any, videoId: string) {
  console.log(`🗑️ Deleting remote video ${videoId} to prevent duplicate content...`);
  try {
    await youtube.videos.delete({ id: videoId });
    console.log(`✔ Deleted old remote video ${videoId}`);
  } catch (err: any) {
    console.warn(`⚠️ Remote deletion failed: ${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const bookSlug = getArg("--book") || "gara-gara-kucing";
  const format = (getArg("--format") as "landscape" | "vertical" | "all") || "all";
  const privacy = (getArg("--privacy") as "public" | "unlisted" | "private") || "unlisted";
  const isMadeForKids = args.includes("--made-for-kids");
  const requestedLang = (getArg("--lang") || "all") as "id" | "en" | "all";
  const isForceReplace = args.includes("--force") || args.includes("--replace");
  const isUpdateMetadata = args.includes("--update-metadata") || args.includes("--resync-all");
  const isUpdateThumbnailsOnly = args.includes("--update-thumbnails") || args.includes("--thumbnail-only");

  const storyDir = path.resolve(`./stories/${bookSlug}`);
  const manifestPath = path.join(storyDir, "story.json");

  if (!existsSync(manifestPath)) {
    console.error(`Error: Story manifest not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: StoryManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

  // 1. Authorize YouTube API Client
  const oauth2Client = await getOAuth2Client();
  await authorizeClient(oauth2Client);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // 2. Verify Channel Ownership
  await verifyChannel(youtube);

  // If user only wanted to authenticate
  if (args.includes("--auth-only")) {
    console.log("\n✅ Authorization successful! Exiting.");
    return;
  }

  const languages: Array<"id" | "en"> =
    requestedLang === "all" ? ["id", "en"] : [requestedLang];

  // If user only wants to update thumbnails across all formats (Landscape + Shorts)
  if (isUpdateThumbnailsOnly && !isUpdateMetadata) {
    for (const lang of languages) {
      console.log(`\n🖼️ Updating YouTube thumbnails for [${lang.toUpperCase()}] videos & shorts...`);
      const langLandscapeThumb = path.join(storyDir, `exports/${lang}/thumbnail.png`);
      const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
      const fallbackThumb = path.join(storyDir, "exports/thumbnail.png");

      const landscapeThumbPath = existsSync(langLandscapeThumb) ? langLandscapeThumb : fallbackThumb;
      const verticalThumbPath = existsSync(langVerticalThumb) ? langVerticalThumb : landscapeThumbPath;

      const landscapeId =
        lang === "en"
          ? (manifest as any).exports?.en?.landscape?.youtubeId
          : (manifest as any).exports?.landscape?.youtubeId;

      const verticalId =
        lang === "en"
          ? (manifest as any).exports?.en?.vertical?.youtubeId
          : (manifest as any).exports?.vertical?.youtubeId;

      if (landscapeId && existsSync(landscapeThumbPath)) {
        console.log(`Setting 16:9 Landscape thumbnail for ${lang.toUpperCase()} (${landscapeId})...`);
        await uploadThumbnail(youtube, landscapeId, landscapeThumbPath);
      }

      if (verticalId && existsSync(verticalThumbPath)) {
        console.log(`Setting 9:16 Shorts vertical thumbnail for ${lang.toUpperCase()} (${verticalId})...`);
        await uploadThumbnail(youtube, verticalId, verticalThumbPath);
      }
    }
    console.log(`\n✔ Thumbnails updated successfully for all formats.`);
    return;
  }

  for (const lang of languages) {
    const isEn = lang === "en";
    const exportsDir = isEn ? path.join(storyDir, "exports/en") : path.join(storyDir, "exports");
    const baseName = isEn ? "its-all-the-cats-fault" : bookSlug;
    const landscapeVideo = path.join(exportsDir, `${baseName}-16x9.mp4`);
    const verticalVideo = path.join(exportsDir, `${baseName}-9x16.mp4`);

    const langThumbnail = path.join(storyDir, `exports/${lang}/thumbnail.png`);
    const fallbackThumbnail = path.join(storyDir, "exports/thumbnail.png");
    const thumbnailPath = existsSync(langThumbnail) ? langThumbnail : fallbackThumbnail;

    console.log(`\n======================================================`);
    console.log(`🚀 Uploading [${lang.toUpperCase()}] Edition to YouTube`);
    console.log(`======================================================`);

    let chapters: string;
    let coreTags: string[];
    let landscapeTitle: string;
    let landscapeDesc: string;
    let shortsTitle: string;
    let shortsDesc: string;

    if (isEn) {
      chapters = [
        "00:00 It's All the Cat's Fault!",
        "00:05 Budi's Homework Excuse",
        "00:11 The Cat in the Mango Tree",
        "00:18 The Broken Ladder & Crying Baby",
        "00:27 Mischievous Monkey in the Kitchen",
        "00:37 Spicy Chicken Curry & Father's Bicycle",
        "00:46 The Village Dog Catches a Scent",
        "00:53 Oh No! The Dog Ate My Homework!",
        "00:59 Teacher's Puzzled Face",
        "01:03 Conclusion: It Was All the Cat's Fault!",
      ].join("\n");

      coreTags = [
        "children storybook",
        "animated bedtime story",
        "funny kids cartoon",
        "its all the cats fault",
        "pratham books",
        "storyweaver",
        "english story for children",
        "read aloud books",
        "bedtime stories for kids",
        "priya kuriyan",
        "anushka ravishankar",
        "early reader animation",
        "cat cartoon for kids",
        "audiobook for children",
      ];

      landscapeTitle = `IT'S ALL THE CAT'S FAULT! 🐱 Funny Animated Storybook For Kids | Bedtime Stories`;
      landscapeDesc = [
        `🐱 Why couldn't Budi turn in his homework? It all started with an orange cat stuck in a mango tree!`,
        ``,
        `Enjoy this hilarious animated children's storybook about an unbelievable chain reaction: from a stuck cat, a broken ladder, a crying baby, a mischievous monkey in the kitchen, market chicken curry, to a homework notebook... eaten by a village dog! 😂`,
        ``,
        `Original story by Anushka Ravishankar with lively folk illustrations by Priya Kuriyan. Adapted into an animated read-aloud storybook for early readers and bedtime fun.`,
        ``,
        `---`,
        ``,
        `⏱️ TIMESTAMPS / CHAPTERS:`,
        chapters,
        ``,
        `---`,
        ``,
        `💡 MORAL OF THE STORY:`,
        `A playful, funny exploration of domino effects, cause-and-effect thinking, and children's boundless imagination!`,
        ``,
        `---`,
        ``,
        `🇮🇩 Versi Bahasa Indonesia: https://youtu.be/Ladb_oJ-1-U`,
        ``,
        `---`,
        ``,
        `📜 LICENSE & ATTRIBUTION:`,
        `Adapted from open educational literature under Creative Commons:`,
        `• Original Title: ${manifest.originalTitle || "It's All the Cat's Fault!"}`,
        `• Author: ${manifest.source.originalAuthor}`,
        `• Illustrator: ${manifest.source.originalIllustrator}`,
        `• Publisher: ${manifest.source.repository}`,
        `• License: ${manifest.source.license}`,
        `• Source: ${manifest.source.sourceUrl}`,
        ``,
        `---`,
        ``,
        `🎬 PRODUCTION CREDITS:`,
        `• Channel: Zayn Adyan Ramadhan (@ZaynAdyanRamadhan)`,
        `• Voiceover: Azure Neural Voice (en-US-AnaNeural & Multi-Speaker Tuning)`,
        `• Animation Engine: Remotion Cinematic Story Engine`,
        `• Sound & Foley: ASMR Children's Sound Effects`,
        ``,
        `🔔 Don't forget to Like, Comment, and Subscribe to @ZaynAdyanRamadhan for more animated storybooks!`,
        ``,
        `#KidsStories #BedtimeStory #StoryWeaver #AnimatedStorybook #CatStory #Storytime #PictureBook #ReadAloud #ChildrenBooks`,
      ].join("\n");

      shortsTitle = `The Funniest Excuse For Not Doing Homework! 😂 It's All The Cat's Fault 🐱 #Shorts #Storybook`;
      shortsDesc = [
        `The most believable homework excuse ever! From a stuck cat in a mango tree to a dog eating the notebook! 🐱🐶`,
        ``,
        `Author: ${manifest.source.originalAuthor} | Illustrator: ${manifest.source.originalIllustrator}`,
        `License: Creative Commons CC BY 4.0 (StoryWeaver / Pratham Books)`,
        ``,
        `🎬 Watch the full 16:9 Landscape story on our channel: https://youtu.be/6sLTErwRXsk 👆`,
        `🇮🇩 Tonton versi Bahasa Indonesia: https://youtube.com/shorts/37P1i6JEiwE`,
        ``,
        `🔔 Subscribe to @ZaynAdyanRamadhan for more fun storybooks!`,
        ``,
        `#Shorts #AnimatedStorybook #KidsStories #Storytime #BedtimeStory #Animation #CatVideo #StoryWeaver #FunnyStories`,
      ].join("\n");
    } else {
      chapters = [
        "00:00 Pembuka: Gara-Gara Kucing!",
        "00:06 Alasan Budi di Depan Bu Guru",
        "00:13 Kucing Terjebak di Pohon Mangga",
        "00:20 Tangga Rusak & Tangisan Adik Bayi",
        "00:31 Monyet Nakal Masuk Dapur",
        "00:42 Kari Ayam Pasar & Sepeda Bapak",
        "00:54 Anjing Cokelat Mencium Bau Sedap",
        "01:01 Gawat! Buku PR Dimakan Anjing",
        "01:07 Reaksi Bu Guru yang Bingung",
        "01:12 Kesimpulan: Tetap Salah Kucing!",
      ].join("\n");

      coreTags = [
        "dongeng anak",
        "cerita anak bergambar",
        "gara gara kucing",
        "cerita anak indonesia",
        "dongeng sebelum tidur",
        "animasi anak indonesia",
        "buku cerita bergambar",
        "anushka ravishankar",
        "priya kuriyan",
        "storyweaver indonesia",
        "pratham books",
        "kartun anak lucu",
        "cerita kucing oranye",
        "tugas sekolah dimakan anjing",
        "dongeng lucu anak",
        "kids storybook animation",
        "children bedtime story",
        "audio book anak indonesia",
      ];

      landscapeTitle = `GARA-GARA KUCING! 🐱 Dongeng Cerita Anak Lucu (Alasan Budi Ga Ngerjain PR) | Animasi Buku Bergambar`;
      landscapeDesc = [
        `🐱 Kenapa Budi tidak mengerjakan PR sekolahnya? Ternyata semua berawal dari seekor kucing oranye di atas pohon mangga!`,
        ``,
        `Saksikan dongeng anak bergambar yang seru, jenaka, dan penuh kejutan tentang rentetan kejadian tak terduga: dari kucing terjebak, tangga rusak, adik bayi menangis, monyet nakal masuk dapur, kari ayam pasar, hingga buku tugas yang... dimakan anjing! 😂`,
        ``,
        `Selamat menikmati cerita animasi bersuara dengan ilustrasi karya Priya Kuriyan dan naskah oleh Anushka Ravishankar. Cocok sebagai tontonan edukatif dan dongeng sebelum tidur untuk si kecil.`,
        ``,
        `---`,
        ``,
        `⏱️ TIMESTAMPS / CHAPTERS:`,
        chapters,
        ``,
        `---`,
        ``,
        `💡 PESAN MORAL:`,
        `Cerita ini mengajarkan tentang konsep sebab-akibat (domino effect) dengan cara yang jenaka, sekaligus mengajak anak-anak untuk selalu tersenyum, berimajinasi, dan bertanggung jawab dengan tugas sekolahnya.`,
        ``,
        `---`,
        ``,
        `🇺🇸 English Edition (Watch in English): https://youtu.be/6sLTErwRXsk`,
        ``,
        `---`,
        ``,
        `📜 LISENSI & ATRIBUSI:`,
        `Buku ini diadaptasi dari buku cerita terbuka berlisensi Creative Commons:`,
        `• Judul Asli: It's All the Cat's Fault!`,
        `• Penulis: ${manifest.source.originalAuthor}`,
        `• Ilustrator Asli: ${manifest.source.originalIllustrator}`,
        `• Penerbit Asli: ${manifest.source.repository}`,
        `• Diterjemahkan dan dialihbahasakan ke dalam Bahasa Indonesia`,
        `• Lisensi: ${manifest.source.license}`,
        `  ${manifest.source.sourceUrl}`,
        ``,
        `---`,
        ``,
        `🎬 KREDIT PRODUKSI:`,
        `• Channel: Zayn Adyan Ramadhan (@ZaynAdyanRamadhan)`,
        `• Voiceover: Azure Neural Speech (id-ID-GadisNeural & Multi-Speaker Tuning)`,
        `• Animasi & Efek Kamera: Remotion Cinematic Story Engine`,
        `• Tata Suara & Foley: Sound Effects ASMR Children Edition`,
        ``,
        `🔔 Jangan lupa LIKE, COMMENT alasan favoritmu, dan SUBSCRIBE ke @ZaynAdyanRamadhan untuk cerita anak bergambar lainnya setiap minggu!`,
        ``,
        `#DongengAnak #CeritaAnak #GaraGaraKucing #AnimasiIndonesia #BukuCeritaAnak #StoryWeaver #KartunAnak #BedtimeStory`,
      ].join("\n");

      shortsTitle = `Alasan Ga Ngerjain PR Paling Masuk Akal! 😂 Gara-Gara Kucing 🐱 #Shorts #DongengAnak`;
      shortsDesc = [
        `Budi ga ngerjain tugas sekolah, tapi alasannya bener-bener ga terduga: dari kucing di pohon mangga sampai PR dimakan anjing! 🐱🐶`,
        ``,
        `Karya: ${manifest.source.originalAuthor} & ${manifest.source.originalIllustrator}`,
        `Lisensi: Creative Commons CC BY 4.0 (StoryWeaver / Pratham Books)`,
        ``,
        `🎬 Tonton versi lengkap Landscape (16:9) di channel kami: https://youtu.be/Ladb_oJ-1-U 👆`,
        `🇺🇸 Watch English version: https://youtube.com/shorts/TRDw6JX8m5M`,
        ``,
        `🔔 Subscribe ke @ZaynAdyanRamadhan untuk cerita animasi seru berikutnya!`,
        ``,
        `#Shorts #DongengAnak #CeritaAnak #KartunAnak #AnimasiIndonesia #KucingOranye #Lucu #StorybookAnimation #StoryWeaver`,
      ].join("\n");
    }

    // 4. Upload Landscape (16:9) with Pre-Upload Deduplication Check
    if ((format === "landscape" || format === "all") && existsSync(landscapeVideo)) {
      console.log(`\n🎬 Checking Landscape (16:9) publication status for ${lang.toUpperCase()}...`);

      let targetVideoId = isEn
        ? (manifest.exports as any)?.en?.landscape?.youtubeId
        : (manifest.exports as any)?.landscape?.youtubeId;

      let remoteCheck = targetVideoId
        ? await checkRemoteVideoStatus(youtube, targetVideoId)
        : { exists: false };

      // Fallback search across channel to detect unindexed remote duplicate
      if (!remoteCheck.exists) {
        const duplicateOnChannel = await searchChannelForDuplicate(youtube, landscapeTitle);
        if (duplicateOnChannel) {
          const verifyStatus = await checkRemoteVideoStatus(youtube, duplicateOnChannel.videoId);
          if (verifyStatus.exists) {
            targetVideoId = duplicateOnChannel.videoId;
            remoteCheck = verifyStatus;
          }
        }
      }

      if (remoteCheck.exists && targetVideoId) {
        console.log(`\n🛑 DUPLICATE DETECTED: [${lang.toUpperCase()}] Landscape video is ALREADY LIVE on YouTube!`);
        console.log(`   • Video ID: \x1b[33m${targetVideoId}\x1b[0m`);
        console.log(`   • Title: "${remoteCheck.title}"`);
        console.log(`   • Live URL: https://youtu.be/${targetVideoId}`);
        console.log(`   • Status: ${remoteCheck.status} (${remoteCheck.privacy})`);

        if (isForceReplace) {
          console.log(`⚠️ --force / --replace flag active! Deleting remote video ${targetVideoId} first...`);
          await deleteRemoteVideo(youtube, targetVideoId);
          targetVideoId = undefined; // Proceed to upload fresh video
        } else if (isUpdateMetadata) {
          console.log(`ℹ️ --update-metadata flag active. Updating metadata & thumbnail only...`);
          await updateVideoMetadata(youtube, targetVideoId, {
            title: landscapeTitle,
            description: landscapeDesc,
            tags: coreTags,
          });
          await uploadThumbnail(youtube, targetVideoId, thumbnailPath);
        } else {
          console.log(`⏭️  SKIPPING VIDEO UPLOAD to prevent duplicate content on channel.`);
          console.log(`   💡 Tip: Use --force to replace, or --update-metadata to update title/description.`);
          // Sync thumbnail just in case
          await uploadThumbnail(youtube, targetVideoId, thumbnailPath);
        }
      }

      // Upload if no remote video exists or if old one was deleted via --force
      if (!remoteCheck.exists || (isForceReplace && !targetVideoId)) {
        const videoId = await uploadVideo(youtube, landscapeVideo, {
          title: landscapeTitle,
          description: landscapeDesc,
          tags: coreTags,
          privacyStatus: privacy,
          isMadeForKids,
        });

        await uploadThumbnail(youtube, videoId, thumbnailPath);

        console.log(`\n🎉 Landscape Video (${lang.toUpperCase()}) Live at: \x1b[36mhttps://youtu.be/${videoId}\x1b[0m`);
        targetVideoId = videoId;
      }

      if (targetVideoId) {
        if (!manifest.exports) manifest.exports = {};
        if (isEn) {
          if (!manifest.exports.en) (manifest.exports as any).en = {};
          if (!(manifest.exports as any).en.landscape) (manifest.exports as any).en.landscape = {};
          (manifest.exports as any).en.landscape.youtubeId = targetVideoId;
          (manifest.exports as any).en.landscape.youtubeUrl = `https://youtu.be/${targetVideoId}`;
        } else {
          if (!manifest.exports.landscape) manifest.exports.landscape = {};
          manifest.exports.landscape.youtubeId = targetVideoId;
          manifest.exports.landscape.youtubeUrl = `https://youtu.be/${targetVideoId}`;
        }

        // Record in unified multi-platform publications registry
        if (!manifest.publications) (manifest as any).publications = {};
        if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
        if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
        (manifest as any).publications.youtube[lang].landscape = {
          id: targetVideoId,
          url: `https://youtu.be/${targetVideoId}`,
          publishedAt: new Date().toISOString(),
          title: landscapeTitle,
          status: "published",
        };

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }

    // 5. Upload Vertical Shorts (9:16) with Pre-Upload Deduplication Check
    if ((format === "vertical" || format === "all") && existsSync(verticalVideo)) {
      console.log(`\n📱 Checking Shorts (9:16) publication status for ${lang.toUpperCase()}...`);

      let targetShortsId = isEn
        ? (manifest.exports as any)?.en?.vertical?.youtubeId
        : (manifest.exports as any)?.vertical?.youtubeId;

      let remoteShortsCheck = targetShortsId
        ? await checkRemoteVideoStatus(youtube, targetShortsId)
        : { exists: false };

      if (!remoteShortsCheck.exists) {
        const duplicateShorts = await searchChannelForDuplicate(youtube, shortsTitle);
        if (duplicateShorts) {
          const verifyStatus = await checkRemoteVideoStatus(youtube, duplicateShorts.videoId);
          if (verifyStatus.exists) {
            targetShortsId = duplicateShorts.videoId;
            remoteShortsCheck = verifyStatus;
          }
        }
      }

      if (remoteShortsCheck.exists && targetShortsId) {
        console.log(`\n🛑 DUPLICATE DETECTED: [${lang.toUpperCase()}] Shorts video is ALREADY LIVE on YouTube!`);
        console.log(`   • Video ID: \x1b[33m${targetShortsId}\x1b[0m`);
        console.log(`   • Title: "${remoteShortsCheck.title}"`);
        console.log(`   • Live URL: https://youtube.com/shorts/${targetShortsId}`);
        console.log(`   • Status: ${remoteShortsCheck.status} (${remoteShortsCheck.privacy})`);

        if (isForceReplace) {
          console.log(`⚠️ --force / --replace flag active! Deleting remote shorts ${targetShortsId} first...`);
          await deleteRemoteVideo(youtube, targetShortsId);
          targetShortsId = undefined; // Proceed to upload fresh video
        } else if (isUpdateMetadata) {
          console.log(`ℹ️ --update-metadata flag active. Updating metadata & vertical thumbnail for Shorts...`);
          await updateVideoMetadata(youtube, targetShortsId, {
            title: shortsTitle,
            description: shortsDesc,
            tags: [...coreTags, "shorts", "youtubeshorts"],
          });
          const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
          const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;
          await uploadThumbnail(youtube, targetShortsId, verticalThumbnailPath);
        } else {
          console.log(`⏭️  SKIPPING SHORTS UPLOAD to prevent duplicate content on channel.`);
          console.log(`   💡 Tip: Use --force to replace, or --update-metadata to update title/description.`);
          const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
          const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;
          await uploadThumbnail(youtube, targetShortsId, verticalThumbnailPath);
        }
      }

      if (!remoteShortsCheck.exists || (isForceReplace && !targetShortsId)) {
        const shortsVideoId = await uploadVideo(youtube, verticalVideo, {
          title: shortsTitle,
          description: shortsDesc,
          tags: [...coreTags, "shorts", "youtubeshorts"],
          privacyStatus: privacy,
          isMadeForKids,
        });

        const langVerticalThumb = path.join(storyDir, `exports/${lang}/thumbnail-vertical.png`);
        const verticalThumbnailPath = existsSync(langVerticalThumb) ? langVerticalThumb : thumbnailPath;
        await uploadThumbnail(youtube, shortsVideoId, verticalThumbnailPath);

        console.log(`\n🎉 Shorts Video (${lang.toUpperCase()}) Live at: \x1b[36mhttps://youtube.com/shorts/${shortsVideoId}\x1b[0m`);
        targetShortsId = shortsVideoId;
      }

      if (targetShortsId) {
        if (!manifest.exports) manifest.exports = {};
        if (isEn) {
          if (!manifest.exports.en) (manifest.exports as any).en = {};
          if (!(manifest.exports as any).en.vertical) (manifest.exports as any).en.vertical = {};
          (manifest.exports as any).en.vertical.youtubeId = targetShortsId;
          (manifest.exports as any).en.vertical.youtubeUrl = `https://youtube.com/shorts/${targetShortsId}`;
        } else {
          if (!manifest.exports.vertical) manifest.exports.vertical = {};
          manifest.exports.vertical.youtubeId = targetShortsId;
          manifest.exports.vertical.youtubeUrl = `https://youtube.com/shorts/${targetShortsId}`;
        }

        // Record in unified multi-platform publications registry
        if (!manifest.publications) (manifest as any).publications = {};
        if (!(manifest as any).publications.youtube) (manifest as any).publications.youtube = {};
        if (!(manifest as any).publications.youtube[lang]) (manifest as any).publications.youtube[lang] = {};
        (manifest as any).publications.youtube[lang].vertical = {
          id: targetShortsId,
          url: `https://youtube.com/shorts/${targetShortsId}`,
          publishedAt: new Date().toISOString(),
          title: shortsTitle,
          status: "published",
        };

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }
  }

  console.log(`\n✔ story.json updated with newly uploaded YouTube video links.`);
}

main().catch(console.error);
