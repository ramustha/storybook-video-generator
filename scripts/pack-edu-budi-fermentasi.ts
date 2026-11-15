import path from "path";
import { compileEduMotionStory } from "../src/motion/compile-edu-motion";

compileEduMotionStory(path.resolve("stories/edu-budi-fermentasi-nusantara")).catch((err) => {
  console.error("❌ Failed packaging BUDI Edu-Motion story:", err);
  process.exit(1);
});
