import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { splitIntoSentences, solveDurationBudget } from "../src/motion/compile-edu-motion";
import { buildHostCircularBadgeSvg } from "../src/motion/character-registry";
import { validateStoryMotionSpec } from "../src/motion/edu-motion-spec";

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

  // 6. Both BUDI story specs pass structural & full-content validation
  for (const slug of ["edu-budi-papang-teripang", "edu-budi-fermentasi-nusantara"]) {
    const specRaw = JSON.parse(await fs.readFile(path.resolve("stories", slug, "motion-spec.json"), "utf-8"));
    const spec = validateStoryMotionSpec(specRaw);
    assert(spec.chapters.some((c) => c.section === "cover"));
    assert(spec.chapters.some((c) => c.section === "moral"));
    assert(spec.chapters.some((c) => c.section === "outro"));
  }

  // Verify Pakasam is explicitly included in Fermentasi narration & actors
  const fermRaw = JSON.parse(
    await fs.readFile(path.resolve("stories/edu-budi-fermentasi-nusantara/motion-spec.json"), "utf-8")
  );
  const fermTextAll = fermRaw.chapters.map((c: any) => `${c.text.id} ${c.text.en}`).join(" ").toLowerCase();
  for (const food of ["tempe", "dadih", "mandai", "pakasam"]) {
    assert(fermTextAll.includes(food), `Fermentasi narration missing food: ${food}`);
  }
  assert(fermRaw.actors.some((a: any) => a.id === "pakasam-rig" && a.prefab === "pakasam-crock"));

  console.log("✅ All 6 Universal Edu-Motion unit checks passed!");
}

runTests().catch((err) => {
  console.error("❌ Unit test failure:", err);
  process.exit(1);
});
