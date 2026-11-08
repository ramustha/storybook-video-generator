import { execSync } from "child_process";

interface TriggerOptions {
  book: string;
  lang: string;
  slot: string;
  dryRun: boolean;
}

function parseArgs(): TriggerOptions {
  const args = process.argv.slice(2);
  const options: TriggerOptions = {
    book: "auto",
    lang: "auto",
    slot: "auto",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--book" && args[i + 1]) options.book = args[++i];
    else if (a === "--lang" && args[i + 1]) options.lang = args[++i];
    else if (a === "--slot" && args[i + 1]) options.slot = args[++i];
    else if (a === "--dry-run") options.dryRun = true;
  }
  return options;
}

async function main() {
  const options = parseArgs();

  console.log("\n=======================================================");
  console.log("🚀 TRIGGER GITHUB ACTIONS BROADCAST WORKFLOW");
  console.log("=======================================================");
  console.log(`📖 Book Target : ${options.book}`);
  console.log(`🌐 Lang Target : ${options.lang}`);
  console.log(`⏰ Slot Target : ${options.slot}`);
  console.log(`🧪 Dry Run     : ${options.dryRun}`);
  console.log("=======================================================\n");

  const cmd = `gh workflow run daily-broadcast.yml -R ramustha/storybook-video-generator -f book=${options.book} -f lang=${options.lang} -f slot=${options.slot} -f dry_run=${options.dryRun}`;

  console.log(`Executing: ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: "utf-8" });
    console.log(out);
    console.log("✔ Broadcast workflow triggered successfully on GitHub Actions!");
  } catch (err: any) {
    console.error("❌ Failed to trigger workflow:", err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("trigger-broadcast")) {
  main();
}
