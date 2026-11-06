import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface MetaConfig {
  appId: string;
  facebookPageId: string;
  facebookPageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  pageAccessToken: string;
}

interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  timestamp: string;
  thumbnail_url?: string;
  media_url?: string;
}

async function loadConfig(): Promise<MetaConfig> {
  const envFiles = [
    path.resolve(".env"),
    path.join(process.env.HOME || "", ".zshenv"),
  ];

  for (const envPath of envFiles) {
    if (existsSync(envPath)) {
      try {
        const envContent = await fs.readFile(envPath, "utf-8");
        envContent.split("\n").forEach((line) => {
          const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let val = (match[2] || "").trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      } catch {}
    }
  }

  const configPath = path.resolve("./config/meta-config.json");
  const raw = await fs.readFile(configPath, "utf-8");
  const config: MetaConfig = JSON.parse(raw);

  if (process.env.PERSONAL_META_ACCESS_TOKEN) config.pageAccessToken = process.env.PERSONAL_META_ACCESS_TOKEN;
  if (process.env.META_PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (process.env.PAGE_ACCESS_TOKEN) config.pageAccessToken = process.env.PAGE_ACCESS_TOKEN;
  if (process.env.PERSONAL_META_APP_ID) config.appId = process.env.PERSONAL_META_APP_ID;
  if (process.env.META_APP_ID) config.appId = process.env.META_APP_ID;

  return config;
}

function matchStory(caption = ""): { slug: string; lang: "id" | "en"; title: string } {
  const lower = caption.toLowerCase();

  // 1. Bulan dan Topi Biru / The Moon and the Cap
  if (lower.includes("bulan dan topi biru") || lower.includes("topi biru")) {
    return { slug: "bulan-dan-topi-biru", lang: "id", title: "Bulan dan Topi Biru" };
  }
  if (lower.includes("moon and the cap") || lower.includes("lost cap blown away")) {
    return { slug: "bulan-dan-topi-biru", lang: "en", title: "The Moon and the Cap" };
  }

  // 2. Gara-Gara Kucing / It's All the Cat's Fault
  if (lower.includes("gara-gara kucing") || lower.includes("tugas dimakan anjing")) {
    return { slug: "gara-gara-kucing", lang: "id", title: "Gara-Gara Kucing!" };
  }
  if (lower.includes("all the cat's fault") || lower.includes("cat's fault") || lower.includes("the dog ate my homework")) {
    return { slug: "gara-gara-kucing", lang: "en", title: "It's All the Cat's Fault!" };
  }

  // 3. Jas Hujan Merah / The Red Raincoat
  if (lower.includes("jas hujan merah") || lower.includes("manu pengen banget hujan")) {
    return { slug: "jas-hujan-merah", lang: "id", title: "Jas Hujan Merah" };
  }
  if (lower.includes("red raincoat") || lower.includes("red coat") || lower.includes("little manu")) {
    return { slug: "jas-hujan-merah", lang: "en", title: "The Red Raincoat" };
  }

  // 4. Raja Gemuk / Fat King Thin Dog
  if (lower.includes("raja gemuk") || lower.includes("raja gemuk, anjing kurus")) {
    return { slug: "raja-gemuk-anjing-kurus", lang: "id", title: "Raja Gemuk, Anjing Kurus!" };
  }
  if (lower.includes("fat king") || lower.includes("fat king, thin dog")) {
    return { slug: "raja-gemuk-anjing-kurus", lang: "en", title: "Fat King, Thin Dog!" };
  }

  // 5. Hari Cukur Rambut / Annual Haircut Day
  if (lower.includes("cukur rambut") || lower.includes("sringeri srinivas")) {
    return { slug: "hari-cukur-rambut", lang: "id", title: "Hari Cukur Rambut Sringeri Srinivas!" };
  }
  if (lower.includes("haircut day") || lower.includes("annual haircut")) {
    return { slug: "hari-cukur-rambut", lang: "en", title: "Annual Haircut Day!" };
  }

  // 6. Pisang Terlalu Banyak / Too Many Bananas
  if (lower.includes("pisang terlalu banyak") || lower.includes("108 pisang")) {
    return { slug: "pisang-terlalu-banyak", lang: "id", title: "Pisang Terlalu Banyak!" };
  }
  if (lower.includes("too many bananas") || lower.includes("sweet banana halwa")) {
    return { slug: "pisang-terlalu-banyak", lang: "en", title: "Too Many Bananas!" };
  }

  return { slug: "unknown", lang: "id", title: "Unknown Post" };
}

async function main() {
  console.log("\n=======================================================");
  console.log("🔍 AUDIT SEMUA MEDIA LIVE DI INSTAGRAM (@zayn.storybook)");
  console.log("=======================================================\n");

  const config = await loadConfig();

  const url = `https://graph.facebook.com/v21.0/${config.instagramUserId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url&limit=100&access_token=${config.pageAccessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    console.error("❌ Failed to query Instagram media:", data.error);
    process.exit(1);
  }

  const items: IgMediaItem[] = data.data || [];
  console.log(`📡 Total Media Ditemukan di Instagram: ${items.length} item\n`);

  const storyBuckets: Record<string, IgMediaItem[]> = {};

  for (const item of items) {
    const matched = matchStory(item.caption);
    const key = `${matched.slug} [${matched.lang.toUpperCase()}]`;
    if (!storyBuckets[key]) storyBuckets[key] = [];
    storyBuckets[key].push(item);
  }

  console.log("=========================================================================================");
  console.log("📖 AUDIT POSTINGAN PER JUDUL CERITA & DETEKSI DUPLIKAT:");
  console.log("=========================================================================================");

  const allExpectedKeys = [
    "gara-gara-kucing [ID]",
    "gara-gara-kucing [EN]",
    "jas-hujan-merah [ID]",
    "jas-hujan-merah [EN]",
    "raja-gemuk-anjing-kurus [ID]",
    "raja-gemuk-anjing-kurus [EN]",
    "bulan-dan-topi-biru [ID]",
    "bulan-dan-topi-biru [EN]",
    "hari-cukur-rambut [ID]",
    "hari-cukur-rambut [EN]",
    "pisang-terlalu-banyak [ID]",
    "pisang-terlalu-banyak [EN]",
  ];

  for (const key of allExpectedKeys) {
    const posts = storyBuckets[key] || [];
    const count = posts.length;

    let status = "❌ BELUM ADA DI IG";
    if (count === 1) {
      status = "✔ 1 Post (Tepat)";
    } else if (count > 1) {
      status = `⚠️ DUPLIKAT TERDETEKSI (${count} Posts!)`;
    }

    console.log(`\n📚 ${key.padEnd(32, " ")} | Status: ${status}`);

    if (posts.length === 0) {
      console.log(`   (Tidak ada postingan live)`);
    } else {
      posts.forEach((p, idx) => {
        const time = new Date(p.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        const isReel = p.media_product_type === "REELS" || p.media_type === "VIDEO";
        console.log(`   [#${idx + 1}] ID: ${p.id} | ${p.media_type}/${p.media_product_type || "FEED"} | ${time}`);
        console.log(`        🔗 ${p.permalink}`);
        if (p.caption) {
          const firstLine = p.caption.split("\n")[0].slice(0, 70);
          console.log(`        📝 "${firstLine}..."`);
        }
      });
    }
  }

  if (storyBuckets["unknown [ID]"] && storyBuckets["unknown [ID]"].length > 0) {
    console.log("\n-----------------------------------------------------------------------------------------");
    console.log(`❓ Postingan Lain / Tidak Terkategori (${storyBuckets["unknown [ID]"].length} item):`);
    storyBuckets["unknown [ID]"].forEach((p, idx) => {
      console.log(`   [#${idx + 1}] ID: ${p.id} | ${p.permalink} | ${p.timestamp}`);
      if (p.caption) console.log(`        "${p.caption.split("\n")[0]}..."`);
    });
  }

  console.log("\n=========================================================================================\n");
}

main().catch(console.error);
