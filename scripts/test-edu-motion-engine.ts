import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { splitIntoSentences, solveDurationBudget } from "../src/motion/compile-edu-motion";
import { buildHostCircularBadgeSvg } from "../src/motion/character-registry";
import { validateStoryMotionSpec } from "../src/motion/edu-motion-spec";
import { buildOverlayScenesHtml } from "../src/motion/overlay-scenes";

async function runTests() {
  // 1. Sentence splitter preserves child-friendly pauses and decimal numbers
  const s1 = splitIntoSentences("Lihat karang ini! Beratnya 45.5 kilogram. Keren sekali, bukan?");
  assert.deepStrictEqual(s1, [
    "Lihat karang ini!",
    "Beratnya 45.5 kilogram.",
    "Keren sekali, bukan?",
  ]);

  // 2. Duration guardrail keeps natural timing intact when already under ceiling
  const naturalPlan = solveDurationBudget(
    0.3,
    [
      { speechDurSec: 5.0, pauseAfterSec: 0.65, minPauseAfterSec: 0.34 },
      { speechDurSec: 6.0, pauseAfterSec: 0.72, minPauseAfterSec: 0.42 },
    ],
    88.0
  );
  assert.strictEqual(naturalPlan.speechTempo, 1.0);
  assert.strictEqual(naturalPlan.fittedTotalSec, 12.67);

  // 3. Soft pause squeeze absorbs mild overshoot without speeding up narrator speech
  const longPauses = Array.from({ length: 16 }, () => ({
    speechDurSec: 4.9,
    pauseAfterSec: 0.9,
    minPauseAfterSec: 0.35,
  }));
  const squeezedPlan = solveDurationBudget(0.3, longPauses, 88.0);
  assert.strictEqual(squeezedPlan.speechTempo, 1.0);
  assert(squeezedPlan.fittedTotalSec <= 88.0, `Expected <= 88s, got ${squeezedPlan.fittedTotalSec}`);

  // 4. Hard budget engages mild atempo only when speech alone exceeds limit
  const denseSpeech = Array.from({ length: 16 }, () => ({
    speechDurSec: 5.5,
    pauseAfterSec: 0.65,
    minPauseAfterSec: 0.35,
  }));
  const tempoPlan = solveDurationBudget(0.3, denseSpeech, 88.0);
  assert(tempoPlan.speechTempo > 1.0 && tempoPlan.speechTempo <= 1.28);
  assert(tempoPlan.fittedTotalSec <= 88.0, `Expected <= 88s, got ${tempoPlan.fittedTotalSec}`);

  // 5. All swappable character rigs expose exact standardized DOM hooks
  const requiredIds = [
    "host-head-rig",
    "host-eyes-open",
    "host-eyes-blink",
    "host-mouth-idle",
    "host-mouth-talk",
    "host-mouth-shock",
    "host-pose-wave",
    "host-pose-point",
    "host-pose-shock",
    "host-pose-eureka",
  ];
  for (const cid of ["zayn", "luna", "bimo"] as const) {
    const svg = buildHostCircularBadgeSvg({ uid: `test-${cid}`, characterId: cid });
    for (const id of requiredIds) {
      assert(svg.includes(`id="${id}"`), `Character "${cid}" missing required hook #${id}`);
    }
  }

  // 6. Validate deterministic inline fixture spec (works in clean CI without gitignored stories/*)
  const fixtureSpec = validateStoryMotionSpec({
    schemaVersion: 1,
    book: {
      slug: "ci-fixture-story",
      title: "Petualangan Air Bersih",
      originalTitle: "Clean Water Adventure",
      author: "Penulis Uji",
    },
    narrator: { characterId: "luna" },
    backdrop: { preset: "sunny-meadow", portraitBg: "#021024", landscapeBg: "#021024" },
    actors: [{ id: "pakasam-rig", prefab: "pakasam-crock", x: 500, y: 620 }],
    chapters: [
      { id: "intro", section: "cover", pose: "wave", text: { id: "Halo.", en: "Hello." } },
      { id: "ch1", section: "story", pose: "point", text: { id: "Isi cerita.", en: "Story beat." } },
      { id: "moral", section: "moral", pose: "eureka", text: { id: "Pesan baik.", en: "Good lesson." } },
      { id: "outro", section: "outro", pose: "wave", text: { id: "Sampai jumpa.", en: "See you." } },
    ],
    moral: { headlineId: "Jaga Air", spokenId: "Hemat air!", headlineEn: "Save Water", spokenEn: "Save water!" },
  });
  assert.strictEqual(fixtureSpec.narrator.characterId, "luna");

  // Also validate any local stories/*/motion-spec.json present outside Git (.gitignore)
  for (const slug of ["edu-budi-papang-teripang", "edu-budi-fermentasi-nusantara"]) {
    const specFile = path.resolve("stories", slug, "motion-spec.json");
    try {
      const specRaw = JSON.parse(await fs.readFile(specFile, "utf-8"));
      const spec = validateStoryMotionSpec(specRaw);
      assert(spec.chapters.some((c) => c.section === "cover"));
      assert(spec.chapters.some((c) => c.section === "moral"));
      assert(spec.chapters.some((c) => c.section === "outro"));
      if (slug === "edu-budi-fermentasi-nusantara") {
        const textAll = spec.chapters.map((c) => `${c.text.id} ${c.text.en}`).join(" ").toLowerCase();
        for (const food of ["tempe", "dadih", "mandai", "pakasam"]) {
          assert(textAll.includes(food), `Fermentasi narration missing food: ${food}`);
        }
        assert(spec.actors.some((a) => a.id === "pakasam-rig" && a.prefab === "pakasam-crock"));
      }
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }

  // 7. Overlay uses clean KEMENDIKDASMEN branding without BUDI prefix
  const overlayHtml = buildOverlayScenesHtml({
    lang: "id",
    book: { slug: "test", title: "Cerita Uji", originalTitle: "Test Story", author: "Penulis" },
    moral: { headlineId: "Pesan", spokenId: "Isi", headlineEn: "Moral", spokenEn: "Body" },
  });
  assert(overlayHtml.includes("KEMENDIKDASMEN •"));
  assert(!/\bBUDI\b/i.test(overlayHtml), "Overlay HTML should not expose BUDI prefix");

  console.log("✅ All 7 Universal Edu-Motion unit checks passed!");
}

runTests().catch((err) => {
  console.error("❌ Unit test failure:", err);
  process.exit(1);
});
