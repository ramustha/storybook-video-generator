import fs from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const CONFIG_PATH = path.resolve("./config/meta-config.json");

interface MetaConfig {
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  pageAccessToken: string;
}

async function uploadThumbnailToFacebook(
  videoId: string,
  thumbnailPath: string,
  pageAccessToken: string
): Promise<void> {
  const uploadUrl = `https://graph.facebook.com/v21.0/${videoId}/thumbnails`;
  return new Promise<void>((resolve, reject) => {
    const curlArgs = [
      "-s",
      "-S",
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      uploadUrl,
      "-F",
      `access_token=${pageAccessToken}`,
      "-F",
      "is_preferred=true",
      "-F",
      `source=@${thumbnailPath}`,
    ];

    const proc = spawn("curl", curlArgs);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      const lines = stdout.trim().split("\n");
      const httpCode = lines.pop()?.trim();
      if (httpCode === "200") {
        resolve();
      } else {
        reject(new Error(`Failed with HTTP ${httpCode}: ${lines.join("\n")}`));
      }
    });
  });
}

async function main() {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config: MetaConfig = JSON.parse(raw);

  console.log("\n=======================================================");
  console.log("📘 RESYNC ALL FACEBOOK THUMBNAILS (POST-PUBLISH API)");
  console.log("=======================================================");
  console.log(`📄 Page Target: ${config.facebookPageName || config.facebookPageId}`);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${config.facebookPageId}/videos?fields=id,title,description,thumbnails{id,is_preferred,height,width}&access_token=${config.pageAccessToken}&limit=100`
  );
  const data = await res.json();
  const videos = data.data || [];

  console.log(`🎬 Found ${videos.length} videos on Facebook Page.\n`);

  let updatedCount = 0;

  for (const v of videos) {
    const title = v.title || "";
    const desc = v.description || "";
    const pref = v.thumbnails?.data?.find((t: any) => t.is_preferred);
    const isVertical = pref ? pref.height > pref.width : false;

    let slug = "";
    let lang = "id";

    if (title.startsWith("Bedtime Stories Marathon") || (title === "" && desc.startsWith("Bedtime Stories Marathon"))) {
      slug = "compilation";
      lang = "en";
    } else if (title.startsWith("Kumpulan Dongeng") || (title === "" && desc.startsWith("Kumpulan Dongeng"))) {
      slug = "compilation";
      lang = "id";
    } else if (title.includes("Moon and the Cap") || desc.includes("The Moon and the Cap")) {
      slug = "bulan-dan-topi-biru";
      lang = "en";
    } else if (title.includes("Bulan dan Topi Biru") || desc.includes("Bulan dan Topi Biru")) {
      slug = "bulan-dan-topi-biru";
      lang = "id";
    } else if (title.includes("Annual Haircut") || desc.includes("Annual Haircut")) {
      slug = "hari-cukur-rambut";
      lang = "en";
    } else if (title.includes("Hari Cukur Rambut") || desc.includes("Hari Cukur Rambut")) {
      slug = "hari-cukur-rambut";
      lang = "id";
    } else if (title.includes("Red Raincoat") || desc.includes("The Red Raincoat")) {
      slug = "jas-hujan-merah";
      lang = "en";
    } else if (title.includes("Jas Hujan Merah") || desc.includes("Jas Hujan Merah")) {
      slug = "jas-hujan-merah";
      lang = "id";
    } else if (title.includes("Too Many Bananas") || desc.includes("Too Many Bananas")) {
      slug = "pisang-terlalu-banyak";
      lang = "en";
    } else if (title.includes("Pisang Terlalu Banyak") || desc.includes("Pisang Terlalu Banyak")) {
      slug = "pisang-terlalu-banyak";
      lang = "id";
    } else if (title.includes("Fat King") || desc.includes("Fat King")) {
      slug = "raja-gemuk-anjing-kurus";
      lang = "en";
    } else if (title.includes("Raja Gemuk") || desc.includes("Raja Gemuk")) {
      slug = "raja-gemuk-anjing-kurus";
      lang = "id";
    } else if (title.includes("Cat") || desc.includes("It\x27s All the Cat\x27s Fault")) {
      slug = "gara-gara-kucing";
      lang = "en";
    } else if (title.includes("Kucing") || desc.includes("Gara-Gara Kucing")) {
      slug = "gara-gara-kucing";
      lang = "id";
    }

    let targetThumb = "";
    if (slug === "compilation") {
      targetThumb = `exports/compilations/thumbnail-compilation-bedtime-${lang}.png`;
    } else if (slug) {
      if (isVertical) {
        targetThumb = `stories/${slug}/exports/${lang}/thumbnail-vertical.png`;
      } else {
        targetThumb = `stories/${slug}/exports/${lang}/thumbnail-popular.png`;
      }
    }

    if (targetThumb && existsSync(targetThumb)) {
      updatedCount++;
      process.stdout.write(`[${updatedCount}] Updating FB Video ${v.id} (${slug} [${lang}] - ${isVertical ? "VERTICAL" : "LANDSCAPE"})... `);
      try {
        await uploadThumbnailToFacebook(v.id, targetThumb, config.pageAccessToken);
        console.log("✔ Preferred Thumbnail Updated!");
      } catch (err: any) {
        console.log(`❌ Error: ${err.message}`);
      }
    }
  }

  console.log(`\n=======================================================`);
  console.log(`🎉 Resynced preferred thumbnails for ${updatedCount} Facebook videos!`);
  console.log(`=======================================================\n`);
}

main().catch(console.error);
