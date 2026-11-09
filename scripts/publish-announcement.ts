import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { publishFacebookPhotoPost } from "./publish-launch-posts";
import { publishInstagramFeedPhoto } from "./publish-instagram-post";
import { publishThreadsPhotoPost } from "./publish-threads";
import {
  getTelegramConfig,
  sendTelegramMessage,
  notifyTelegramFailure,
  formatWibTimestamp,
} from "./notify-telegram";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";

export interface AnnouncementOptions {
  bookSlug?: string;
  lang?: "id" | "en";
  slot?: "morning" | "evening" | "auto" | "all";
  dryRun?: boolean;
  force?: boolean;
}

export interface PlatformPublishResult {
  id?: string;
  postId?: string;
  url?: string;
  publishedAt?: string;
  sentAt?: string;
  status?: string;
}

export interface AnnouncementRecord {
  scheduledSlot: string;
  announcedAt: string;
  facebook?: PlatformPublishResult;
  instagram?: PlatformPublishResult;
  threads?: PlatformPublishResult;
  telegram?: PlatformPublishResult;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Returns current hour (0-23) in Western Indonesia Time (Asia/Jakarta).
 */
export function getJakartaHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

/**
 * Extracts moral lesson with fallback across schema versions.
 */
function extractMoral(story: any, lang: "id" | "en"): string {
  if (lang === "id") {
    if (story.moral?.headlineId) return story.moral.headlineId;
    const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.text) {
      const cleaned = moralScene.audio.text.replace(/^Pesan moral cerita ini:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") ? cleaned : `${cleaned}!`;
    }
    return "Belajar kebaikan budi pekerti, kejujuran, dan kehangatan keluarga.";
  } else {
    if (story.moral?.headlineEn) return story.moral.headlineEn;
    const moralScene = story.scenes?.find((s: any) => s.type === "moral" || s.sceneId === "moral");
    if (moralScene?.audio?.en?.text) {
      const cleaned = moralScene.audio.en.text.replace(/^The moral of the story:\s*/i, "").split(".")[0].trim();
      return cleaned.endsWith("!") ? cleaned : `${cleaned}!`;
    }
    return "Learning kindness, empathy, and family warmth together.";
  }
}

/**
 * Generates engaging, cheerful teaser copy for 1-hour-in-advance announcement feeds.
 * Guarantees 100% single-language consistency matching the language of the attached image.
 */
export interface TailoredTeaserCopies {
  captionSocial: string; // Generic fallback
  captionInstagram: string;
  captionFacebook: string;
  captionThreads: string;
  captionTelegramHtml: string;
}

/**
 * Generates engaging, platform-tailored teaser copy for pre-broadcast announcement feeds.
 * Follows best practices:
 * - Instagram: Emotive parenting hook, save prompt, engagement question, focused hashtags.
 * - Facebook: Warm community tone, benefits of mindful bedtime screen-time, family discussion.
 * - Threads: Conversational micro-storytelling, bite-sized curiosity hook, zero hashtag spam.
 * - Telegram: Clean HTML formatting, bullet highlights, actionable reminder prompt.
 * Guarantees 100% single-language consistency matching the target language.
 */
export function generateTeaserCopy(
  story: any,
  lang: "id" | "en",
  slotTime: string
): TailoredTeaserCopies {
  const isId = lang === "id";
  const rawTitle = isId ? story.title : (story.originalTitle || story.title);
  const cleanTitle = rawTitle.replace(/[!]+$/, "").trim();

  // Extract thumbnail typography details corresponding directly to the cover image
  const thumbConf = isId ? story.thumbnailConfig?.id : story.thumbnailConfig?.en;
  const headlineTop = thumbConf?.headlineTop;
  const headlineBottom = thumbConf?.headlineBottom;
  const hook = thumbConf?.hook || (isId ? "Petualangan seru dan penuh tawa untuk si kecil!" : "A joyful, heartwarming tale children will adore!");
  const badge = thumbConf?.badge;
  const sticker = thumbConf?.sticker;
  const moral = extractMoral(story, lang);

  // 1. INSTAGRAM FEED CAPTION (Optimized for Saves & Meaningful Comments)
  const captionInstagram = isId
    ? `⏰ SEBENTAR LAGI TAYANG! (1 JAM LAGI) 🌟✨
${badge ? `🏷️ ${badge}\n` : ""}📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 🌙💤

Halo Ayah Bunda dan adik-adik tersayang! 🥰👋
Tepat pukul ${slotTime} nanti, cerita animasi buku bergambar terbaru kita "${cleanTitle}" akan tayang perdana di kanal YouTube @zayn.storybook!

🎨 Sorotan Cerita Malam Ini:
👉 ${hook}
${sticker ? `✨ Catatan Seru: ${sticker}\n` : ""}
💡 Nilai Kebaikan untuk Si Kecil:
${moral}

📌 TIPS BEDTIME ROUTINE:
Jadikan dongeng 15 menit ini sebagai momen transisi tenang sebelum si kecil terlelap. Redupkan lampu, siapkan selimut hangat, dan nikmati petualangan bersama.

🔔 Nyalakan lonceng pengingat di YouTube @zayn.storybook sekarang agar tidak terlewat saat tayang perdana!
👉 Tautan tontonan resmi akan langsung aktif di bio profil @zayn.storybook tepat pukul ${slotTime}.

💬 Siapa yang sudah siap menemani si kecil mendongeng malam ini? Tulis di kolom komentar ya! 👇❤️

#ZaynStorybook #DongengSebelumTidur #ParentingIndonesia #CeritaAnakBergambar #BukuAnakBermutu #DongengAnak #MembacaSejakDini #BedtimeRoutine #FamilyStorytime`
    : `⏰ PREMIERING IN 1 HOUR! 🌟✨
${badge ? `🏷️ ${badge}\n` : ""}📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle} 📖🎈

Hello wonderful parents and curious little ones! 🥰👋
In just 1 hour (at ${slotTime}), our brand-new animated read-aloud storybook "${cleanTitle}" is premiering on YouTube @zayn.storybook!

🎨 Tonight's Story Highlight:
👉 ${hook}
${sticker ? `✨ Fun Highlight: ${sticker}\n` : ""}
💡 Life Lesson for Young Minds:
${moral}

📌 BEDTIME ROUTINE TIP:
Use this calming 15-minute story as a peaceful wind-down ritual before sleep. Dim the room lights, snuggle under a warm blanket, and share the journey together.

🔔 Tap the notification bell on YouTube @zayn.storybook right now so you don't miss the premiere!
👉 The official watch link goes live in our bio @zayn.storybook at ${slotTime}.

💬 Ready for tonight's storytime adventure? Let us know in the comments below! 👇❤️

#ZaynStorybook #KidsStories #ReadAloud #BedtimeStories #AnimatedStorybook #ChildrenBooks #KidsAnimation #FamilyStorytime #MindfulParenting`;

  // 2. FACEBOOK PAGE CAPTION (Optimized for Parents Community & Family Discussion)
  const captionFacebook = isId
    ? `⏰ PENGINGAT TAYANG: 1 JAM LAGI! (Pukul ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Ayah Bunda, rutinitas mendongeng 15 menit sebelum tidur terbukti mempererat ikatan batin keluarga dan menenangkan pikiran anak setelah seharian aktif bermain. 🌙💤

Malam ini di kanal YouTube Zayn Storybook, kita akan menyaksikan petualangan baru:
"${cleanTitle}"

✨ Sekilas Kisah:
${hook}

💡 Pesan Karakter:
${moral}

Mari ciptakan kenangan masa kecil yang hangat dan bermakna. Kumpulkan keluarga, siapkan suasana kamar yang nyaman, dan nikmati dongeng animasi penuh warna bersama kami.

🔔 Kunjungi kanal YouTube kami @Zayn.Storybook dan nyalakan lonceng pengingat premiere.
Tautan tontonan resmi akan dibagikan di halaman ini tepat pukul ${slotTime}!

Ayah Bunda biasanya mendongeng jam berapa bersama si kecil? Yuk berbagi cerita di kolom komentar! 👇❤️`
    : `⏰ PREMIERE REMINDER: 1 HOUR TO GO! (At ${slotTime}) 🌟✨
📖 ${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}

Dear parents, a 15-minute bedtime story ritual is one of the most effective ways to nurture emotional connection and help children unwind peacefully after an active day. 🌙💤

Tonight on Zayn Storybook YouTube, we are premiering a wonderful new animated journey:
"${cleanTitle}"

✨ Story Glimpse:
${hook}

💡 Moral Lesson:
${moral}

Let's create warm, cherished childhood memories together. Gather the family, get cozy, and enjoy this beautifully illustrated adventure.

🔔 Visit our YouTube channel @Zayn.Storybook and set your premiere reminder!
The official watch link will be shared right here at ${slotTime}!

What is your favorite bedtime routine with your little ones? Share with our parent community below! 👇❤️`;

  // 3. META THREADS CAPTION (Optimized for Conversational Micro-Storytelling)
  const captionThreads = isId
    ? `Pernahkah si kecil merasa takut atau ragu mencoba hal baru? 🐒🌳

Tepat 1 jam lagi (pukul ${slotTime}), cerita animasi bergambar terbaru kita "${cleanTitle}" akan tayang perdana di YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Nyalakan pengingat di YouTube @zayn.storybook yuk, siapkan selimut hangat untuk dongeng pengantar tidur nanti malam! 🌙💤`
    : `Has your child ever felt hesitant or scared of trying something new? 🐒🌳

In just 1 hour (at ${slotTime}), our new animated read-aloud storybook "${cleanTitle}" premieres on YouTube @zayn.storybook!

👉 ${hook}
💡 ${moral}

Set your premiere reminder on YouTube @zayn.storybook and snuggle up for bedtime storytime tonight! 🌙💤`;

  // 4. TELEGRAM HTML CAPTION (Clean, Actionable Formatting with Direct Prompts)
  const captionTelegramHtml = isId
    ? `⏰ <b>PENGUMUMAN: 1 JAM LAGI TAYANG PERDANA!</b> 🌟✨
${badge ? `🏷️ <i>${badge}</i>\n` : ""}📖 <b>${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}</b> 🌙💤

Halo Ayah, Bunda, & adik-adik tersayang! 🥰
Tepat pukul <b>${slotTime}</b>, video dongeng animasi terbaru "<b>${cleanTitle}</b>" akan tayang perdana di YouTube!

🎨 <b>Sorotan Cerita Malam Ini:</b>
👉 ${hook}
${sticker ? `✨ <i>${sticker}</i>\n` : ""}
💡 <b>Pesan Kebaikan untuk Si Kecil:</b>
${moral}

🔔 <i>Nyalakan pengingat di kanal YouTube @Zayn.Storybook dan siapkan waktu santai bersama si kecil! Tautan tontonan resmi akan langsung kami bagikan di sini tepat pukul ${slotTime}.</i>`
    : `⏰ <b>ANNOUNCEMENT: PREMIERING IN 1 HOUR!</b> 🌟✨
${badge ? `🏷️ <i>${badge}</i>\n` : ""}📖 <b>${headlineTop ? `${headlineTop} — ${headlineBottom || ""}` : cleanTitle}</b> 📖🎈

Hello parents and curious little ones! 🥰
In just 1 hour (at <b>${slotTime}</b>), our new animated storybook "<b>${cleanTitle}</b>" is premiering on YouTube!

🎨 <b>Tonight's Story Highlight:</b>
👉 ${hook}
${sticker ? `✨ <i>${sticker}</i>\n` : ""}
💡 <b>Life Lesson:</b>
${moral}

🔔 <i>Turn on your reminder on YouTube @Zayn.Storybook! The official watch link will be shared here right at ${slotTime}.</i>`;

  return {
    captionSocial: captionInstagram,
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionTelegramHtml,
  };
}

/**
 * Executes a child CLI command synchronously.
 */
async function runChild(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

/**
 * Finds the optimal 4:5 portrait or popular cover photo for feed distribution.
 * Strictly guarantees language isolation: only selects images matching target language typography.
 */
function resolveBestPhoto(storyDir: string, lang: "id" | "en"): string {
  const candidates = [
    path.join(storyDir, "exports", lang, "thumbnail-portrait.png"),
    path.join(storyDir, "exports", lang, "thumbnail-popular.png"),
    path.join(storyDir, "exports", lang, "thumbnail.png"),
    path.join(storyDir, "exports", lang, "thumbnail-vertical.png"),
    path.join(storyDir, "exports", lang, "thumbnail-bedtime.png"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback to neutral book cover only if language exports are missing
  const neutralCover = path.join(storyDir, "assets", "cover.png");
  if (existsSync(neutralCover)) return neutralCover;

  throw new Error(`No image asset found for announcement in language [${lang.toUpperCase()}] at ${storyDir}`);
}

/**
 * Main routine: Publishes deduplicated announcement feeds across Facebook, Instagram, Threads, and Telegram.
 */
export async function publishAnnouncement(options: AnnouncementOptions = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  targetBook?: string;
  lang?: string;
}> {
  const todayDate = getJakartaDateString();
  const currentHour = getJakartaHour();

  console.log("\n==================================================================");
  console.log("📢 PRE-BROADCAST ANNOUNCEMENT FEED DISPATCHER (1 HOUR PRIOR)");
  console.log("==================================================================");
  console.log(`📅 Date (WIB)     : ${todayDate}`);
  console.log(`⏰ Current Hour   : ${currentHour}:00 WIB`);
  console.log(`🧪 Dry Run Mode   : ${options.dryRun ? "YES (Preview Only)" : "NO (Live Post)"}`);
  console.log(`⚡ Force Re-post  : ${options.force ? "YES" : "NO (Strict Deduplication Active)"}`);

  // 1. Determine Target Book & Slot
  let targetBook = options.bookSlug;
  let targetLang = options.lang;
  let slotTime = "19:00 WIB";
  let slotLabel = "Prime Bedtime Story";

  if (!targetBook) {
    const isEvening = options.slot === "evening" || (options.slot !== "morning" && currentHour >= 12);
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
    const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const dayName = dayNames[nowJakarta.getDay()];

    const todaySlots = DAILY_CALENDAR_MONTH_1.filter((s) => {
      if (s.date && s.date === todayDate) return true;
      if (!s.date && s.dayName === dayName) return true;
      return false;
    });

    const matchingSlot = todaySlots.find((s) => {
      const isMorningSlot =
        s.timeSlot.includes("07:") ||
        s.timeSlot.includes("08:") ||
        s.slotType.toLowerCase().includes("morning");
      return isEvening ? !isMorningSlot : isMorningSlot;
    }) || todaySlots[0];

    if (!matchingSlot) {
      console.log(`🌴 Hari ini (${todayDate}) tidak ada jadwal tayang aktif. Lewati pengumuman.`);
      return { success: true, skipped: true };
    }

    targetBook = matchingSlot.bookSlug;
    targetLang = targetLang || matchingSlot.lang;
    slotTime = matchingSlot.timeSlot;
    slotLabel = matchingSlot.slotType;
  }

  const lang = targetLang || "id";
  console.log(`📖 Target Story   : ${targetBook} [${lang.toUpperCase()}]`);
  console.log(`🎯 Upcoming Slot  : ${slotTime} (${slotLabel})`);
  console.log("==================================================================\n");

  // 2. Ensure Story Exists Locally (pull from R2 if missing)
  const storyDir = path.resolve("./stories", targetBook);
  const storyJsonPath = path.join(storyDir, "story.json");
  if (!existsSync(storyJsonPath)) {
    console.log(`📥 Story assets not found locally for [${targetBook}]. Pulling from Cloudflare R2...`);
    await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", targetBook]);
  }

  if (!existsSync(storyJsonPath)) {
    throw new Error(`story.json not found for book '${targetBook}' at ${storyJsonPath}`);
  }

  const story = JSON.parse(await fs.readFile(storyJsonPath, "utf-8"));
  if (!story.publications) story.publications = {};
  if (!story.publications.announcements) story.publications.announcements = {};
  if (!story.publications.announcements[todayDate]) story.publications.announcements[todayDate] = {};

  const existingAnn: AnnouncementRecord = story.publications.announcements[todayDate][lang] || {
    scheduledSlot: slotTime,
    announcedAt: new Date().toISOString(),
  };

  // 3. Strict Deduplication Gate
  const hasFb = Boolean(existingAnn.facebook?.id);
  const hasIg = Boolean(existingAnn.instagram?.id);
  const hasThreads = Boolean(existingAnn.threads?.id);
  const hasTelegram = Boolean(existingAnn.telegram?.status === "sent");

  console.log("🔍 ANNOUNCEMENT DEDUPLICATION STATUS:");
  console.log(`   - Facebook Page Feed : ${hasFb ? `✔ LIVE (${existingAnn.facebook?.id})` : "⏳ PENDING"}`);
  console.log(`   - Instagram Feed     : ${hasIg ? `✔ LIVE (${existingAnn.instagram?.id})` : "⏳ PENDING"}`);
  console.log(`   - Meta Threads       : ${hasThreads ? `✔ LIVE (${existingAnn.threads?.id})` : "⏳ PENDING"}`);
  console.log(`   - Telegram Teaser    : ${hasTelegram ? `✔ SENT (${existingAnn.telegram?.sentAt})` : "⏳ PENDING"}`);

  const isAllPublished = hasFb && hasIg && hasThreads && hasTelegram;
  if (isAllPublished && !options.force) {
    console.log(`\n🛡️ [ZERO DUPLICATE GATE] Announcement for "${story.title}" [${lang.toUpperCase()}] on ${todayDate} has ALREADY been published across ALL platforms!`);
    console.log(`   ⏩ Skipping announcement feed to guarantee ZERO duplicate posts.`);
    console.log(`   💡 Tip: Pass --force to replace or re-post anyway.\n`);
    return { success: true, skipped: true, targetBook, lang };
  }

  // 4. Resolve Image & Copy
  const photoPath = resolveBestPhoto(storyDir, lang);
  console.log(`\n🖼️ Visual Asset Selected: ${path.basename(photoPath)} (${photoPath})`);

  const {
    captionInstagram,
    captionFacebook,
    captionThreads,
    captionTelegramHtml,
  } = generateTeaserCopy(story, lang, slotTime);

  const errors: string[] = [];

  // 5. Granular Publishing to Pending Platforms
  // 5A. Facebook Page Feed Photo (Tailored for Parenting Community)
  if (!hasFb || options.force) {
    try {
      console.log(`\n📘 [1/4] Publishing Announcement to Facebook Page...`);
      const fbRes = await publishFacebookPhotoPost({
        photoPath,
        caption: captionFacebook,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && fbRes.success) {
        existingAnn.facebook = {
          id: fbRes.photoId || fbRes.postId,
          postId: fbRes.postId,
          url: fbRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Facebook announcement live: ${fbRes.permalink}`);
      }
    } catch (fbErr: any) {
      console.error(`⚠️ Facebook announcement warning:`, fbErr.message);
      errors.push(`[Facebook] ${fbErr.message}`);
    }
  } else {
    console.log(`\n⏩ [1/4] Skipping Facebook Page: Already published today (${existingAnn.facebook?.id}).`);
  }

  // 5B. Instagram Feed Photo (Tailored for Saves & Engagement)
  if (!hasIg || options.force) {
    try {
      console.log(`\n📸 [2/4] Publishing Announcement to Instagram Feed...`);
      const igRes = await publishInstagramFeedPhoto({
        imagePath: photoPath,
        caption: captionInstagram,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && igRes.success) {
        existingAnn.instagram = {
          id: igRes.mediaId,
          url: igRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Instagram announcement live: ${igRes.permalink}`);
      }
    } catch (igErr: any) {
      console.error(`⚠️ Instagram announcement warning:`, igErr.message);
      errors.push(`[Instagram] ${igErr.message}`);
    }
  } else {
    console.log(`\n⏩ [2/4] Skipping Instagram Feed: Already published today (${existingAnn.instagram?.id}).`);
  }

  // 5C. Meta Threads Image Post (Tailored for Conversational Micro-Storytelling)
  if (!hasThreads || options.force) {
    try {
      console.log(`\n🧵 [3/4] Publishing Announcement to Meta Threads...`);
      const thRes = await publishThreadsPhotoPost({
        imagePath: photoPath,
        text: captionThreads,
        dryRun: options.dryRun,
      });

      if (!options.dryRun && thRes.success) {
        existingAnn.threads = {
          id: thRes.postId,
          url: thRes.permalink,
          publishedAt: new Date().toISOString(),
          status: "published",
        };
        console.log(`✔ Threads announcement live: ${thRes.permalink}`);
      }
    } catch (thErr: any) {
      console.error(`⚠️ Threads announcement warning:`, thErr.message);
      errors.push(`[Threads] ${thErr.message}`);
    }
  } else {
    console.log(`\n⏩ [3/4] Skipping Meta Threads: Already published today (${existingAnn.threads?.id}).`);
  }

  // 5D. Telegram Teaser Broadcast
  if (!hasTelegram || options.force) {
    try {
      console.log(`\n✈️ [4/4] Dispatching Teaser Announcement to Telegram...`);
      const tgConfig = getTelegramConfig();
      if (tgConfig) {
        let photoUrl: string | undefined = undefined;
        const r2ConfigPath = path.resolve("./config/r2-config.json");
        if (existsSync(r2ConfigPath)) {
          try {
            const r2 = JSON.parse(readFileSync(r2ConfigPath, "utf-8"));
            if (r2.publicDomain) {
              photoUrl = `${r2.publicDomain.replace(/\/$/, "")}/stories/${targetBook}/assets/cover.png`;
            }
          } catch {}
        }

        if (options.dryRun) {
          console.log("\n[DRY RUN] Telegram Announcement HTML:\n", captionTelegramHtml);
          console.log(`Photo CDN URL: ${photoUrl || "(No photo URL)"}`);
        } else {
          const sent = await sendTelegramMessage(tgConfig, captionTelegramHtml, photoUrl);
          if (sent) {
            existingAnn.telegram = {
              status: "sent",
              sentAt: new Date().toISOString(),
            };
            console.log(`✔ Telegram teaser broadcast sent!`);
          } else {
            errors.push(`[Telegram] Delivery failed`);
          }
        }
      } else {
        console.log(`ℹ️ Telegram skipped: Credentials not configured.`);
      }
    } catch (tgErr: any) {
      console.error(`⚠️ Telegram announcement warning:`, tgErr.message);
      errors.push(`[Telegram] ${tgErr.message}`);
    }
  } else {
    console.log(`\n⏩ [4/4] Skipping Telegram: Already sent teaser today (${existingAnn.telegram?.sentAt}).`);
  }

  // 6. Save Manifest & Push Back to Cloudflare R2
  if (!options.dryRun) {
    story.publications.announcements[todayDate][lang] = existingAnn;
    await fs.writeFile(storyJsonPath, JSON.stringify(story, null, 2), "utf-8");
    console.log(`\n✔ story.json updated with announcement publication record.`);

    try {
      console.log(`☁️ Syncing updated manifest to Cloudflare R2...`);
      await runChild("npx", ["tsx", "scripts/manage-story-storage.ts", "push", targetBook, "--manifest-only"]);
      console.log(`✔ Cloudflare R2 manifest synchronized.`);
    } catch (pushErr: any) {
      console.warn(`⚠️ Warning syncing manifest to Cloudflare R2:`, pushErr.message);
    }
  }

  // 7. Alert Telegram if errors occurred
  if (errors.length > 0 && !options.dryRun) {
    try {
      await notifyTelegramFailure({
        bookSlug: targetBook,
        lang,
        slot: `${slotTime} (${slotLabel})`,
        platform: "Pre-Broadcast Announcement Feed",
        error: errors.join("\n"),
      });
    } catch {}
  }

  console.log("\n🎉 ANNOUNCEMENT FEED DISPATCH COMPLETE!\n");
  return { success: errors.length === 0, targetBook, lang };
}

// ── CLI Runner ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const bookSlug = getArg("--book");
  const langArg = getArg("--lang") as "id" | "en" | undefined;
  const slotArg = getArg("--slot") as "morning" | "evening" | "auto" | undefined;

  await publishAnnouncement({
    bookSlug,
    lang: langArg,
    slot: slotArg,
    dryRun,
    force,
  });
}

if (process.argv[1]?.includes("publish-announcement")) {
  main().catch((err) => {
    console.error("❌ Fatal error in Announcement Publisher:", err);
    process.exit(1);
  });
}
