import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { DAILY_CALENDAR_MONTH_1 } from "./content-calendar";
import { checkStoryBufferedVideos, pushStory } from "./manage-story-storage";

interface BufferOptions {
  daysAhead?: number;
  dryRun?: boolean;
  force?: boolean;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  const daysIdx = args.indexOf("--days");
  const daysAhead = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 3;

  console.log(`\n==================================================================`);
  console.log(`🛡️  ZAYN STORYBOOK: AUTOMATED PRE-RENDER BUFFER ENGINE`);
  console.log(`==================================================================`);
  console.log(`📅 Buffer Window : Next ${daysAhead} Days Ahead (H+1 to H+${daysAhead})`);
  console.log(`🧪 Mode          : ${dryRun ? "DRY RUN (Preview Only)" : "LIVE BATCH RENDER"}`);
  console.log(`⚡ Force Re-render: ${force ? "YES" : "NO (Skip existing R2 videos)"}`);
  console.log(`==================================================================\n`);

  const now = new Date();
  const candidateDates: string[] = [];

  for (let i = 1; i <= daysAhead; i++) {
    const futureDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const isoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(futureDate);
    candidateDates.push(isoDate);
  }

  console.log(`🎯 Target Broadcast Dates: ${candidateDates.join(", ")}\n`);

  const slotsToBuffer = DAILY_CALENDAR_MONTH_1.filter((s) => candidateDates.includes(s.date));

  if (slotsToBuffer.length === 0) {
    console.log(`⚠️ No scheduled stories found in DAILY_CALENDAR_MONTH_1 for dates ${candidateDates.join(", ")}.`);
    return;
  }

  console.log(`📋 Found ${slotsToBuffer.length} broadcast slots in the buffer window:\n`);

  for (const slot of slotsToBuffer) {
    console.log(`------------------------------------------------------------------`);
    console.log(`📖 Story     : ${slot.bookSlug} [${slot.lang.toUpperCase()}]`);
    console.log(`📅 Scheduled : ${slot.dayName}, ${slot.date} @ ${slot.timeSlot} (${slot.slotType})`);
    console.log(`🎨 Theme     : "${slot.theme}"`);

    // Check if videos already exist in R2 buffer
    const bufferStatus = await checkStoryBufferedVideos(slot.bookSlug);
    const hasRequiredVideos =
      slot.lang === "id"
        ? bufferStatus.idLandscape && bufferStatus.idVertical
        : bufferStatus.enLandscape && bufferStatus.enVertical;

    if (hasRequiredVideos && !force) {
      console.log(`   🟢 [BUFFER HIT] Both Landscape (16:9) & Vertical (9:16) already exist in Cloudflare R2!`);
      console.log(`   ⏩ Skipping render. This story is ready for instant broadcast on ${slot.date}.`);
      continue;
    }

    console.log(`   🟡 [BUFFER MISS] Video not yet buffered in R2 for [${slot.lang.toUpperCase()}].`);

    if (dryRun) {
      console.log(`   [DRY RUN] Would execute:`);
      console.log(`     1. npx tsx scripts/manage-story-storage.ts pull ${slot.bookSlug}`);
      console.log(`     2. npx tsx scripts/render-book.ts --book ${slot.bookSlug} --lang ${slot.lang} --format both`);
      console.log(`     3. npx tsx scripts/manage-story-storage.ts push ${slot.bookSlug} --include-videos`);
      continue;
    }

    try {
      // Step 1: Ensure assets are present
      console.log(`   ⬇️ Pulling story assets from Cloudflare R2...`);
      execSync(`npx tsx scripts/manage-story-storage.ts pull ${slot.bookSlug}`, { stdio: "inherit" });

      // Step 2: Render both orientations (16:9 Landscape & 9:16 Vertical)
      console.log(`   🎬 Rendering Remotion videos (16:9 & 9:16) for [${slot.lang.toUpperCase()}]...`);
      execSync(
        `npx tsx scripts/render-book.ts --book "${slot.bookSlug}" --lang "${slot.lang}" --format both --resolution 1080p`,
        { stdio: "inherit" }
      );

      // Step 3: Push rendered MP4s back to Cloudflare R2
      console.log(`   ☁️ Uploading rendered MP4 video buffer to Cloudflare R2...`);
      execSync(`npx tsx scripts/manage-story-storage.ts push ${slot.bookSlug} --include-videos`, { stdio: "inherit" });

      console.log(`   🎉 SUCCESS! Pre-render buffer complete for [${slot.bookSlug}] on ${slot.date}!`);
    } catch (err: any) {
      console.error(`   ❌ Error buffering [${slot.bookSlug}]:`, err.message);
    }
  }

  console.log(`\n==================================================================`);
  console.log(`✨ Buffer Pre-Render run completed for window: ${candidateDates[0]} to ${candidateDates[candidateDates.length - 1]}`);
  console.log(`==================================================================\n`);
}

if (process.argv[1]?.includes("buffer-prerender")) {
  main().catch((err) => {
    console.error("❌ Fatal error in buffer-prerender:", err);
    process.exit(1);
  });
}
