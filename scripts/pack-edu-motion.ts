import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { compileEduMotionStory } from "../src/motion/compile-edu-motion";

async function discoverMotionSpecSlugs(storiesRoot: string): Promise<string[]> {
  const entries = await fs.readdir(storiesRoot, { withFileTypes: true });
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const specPath = path.join(storiesRoot, entry.name, "motion-spec.json");
    if (existsSync(specPath)) slugs.push(entry.name);
  }
  return slugs.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const storiesRoot = path.resolve("stories");

  const runAll = args.includes("--all");
  const bookIdx = args.indexOf("--book");
  const bookSlug = bookIdx >= 0 ? args[bookIdx + 1] : undefined;

  let targets: string[] = [];
  if (runAll) {
    targets = await discoverMotionSpecSlugs(storiesRoot);
  } else if (bookSlug) {
    targets = [bookSlug];
  } else {
    console.error("Usage: npx tsx scripts/pack-edu-motion.ts --book <slug> | --all");
    process.exit(1);
  }

  if (targets.length === 0) {
    console.log("No stories containing motion-spec.json found.");
    return;
  }

  const results = [];
  for (const slug of targets) {
    const dir = path.join(storiesRoot, slug);
    results.push(await compileEduMotionStory(dir));
  }

  console.log(`\n==================================================================`);
  console.log(`📊 UNIVERSAL EDU-MOTION PACKAGING SUMMARY`);
  for (const r of results) {
    console.log(
      `   ✔ ${r.slug.padEnd(32)} Short(9:16) ID=${r.idDurationSec.toFixed(2)}s | EN=${r.enDurationSec.toFixed(2)}s || Long(16:9) ID=${r.idLongDurationSec.toFixed(2)}s | EN=${r.enLongDurationSec.toFixed(2)}s`
    );
  }
  console.log(`==================================================================\n`);
}

main().catch((err) => {
  console.error("❌ Failed packing Edu-Motion story:", err);
  process.exit(1);
});
