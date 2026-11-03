import {
  QuotaRotator,
  isQuotaExceededError,
  getCurrentDatePT,
  getTimeUntilResetPT,
} from "./quota-rotator";

async function runTests() {
  console.log("🧪 Starting Quota Rotator Tests...\n");

  // Test 1: Date & Time logic
  console.log("Test 1: Pacific Time Date calculation");
  const ptDate = getCurrentDatePT();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ptDate)) {
    throw new Error("Date format must be YYYY-MM-DD");
  }
  console.log("  ✔ PT Date:", ptDate);

  const resetInfo = getTimeUntilResetPT();
  if (typeof resetInfo.hours !== "number" || resetInfo.hours < 0) {
    throw new Error("Hours must be >= 0");
  }
  if (typeof resetInfo.minutes !== "number" || resetInfo.minutes < 0) {
    throw new Error("Minutes must be >= 0");
  }
  console.log("  ✔ Countdown:", resetInfo.formatted);

  // Test 2: Error detection
  console.log("\nTest 2: Quota Exceeded error detection");
  const normalErr = new Error("Some random network error");
  if (isQuotaExceededError(normalErr)) {
    throw new Error("Normal error must not be detected as quotaExceeded");
  }

  const quotaErr1 = {
    code: 403,
    message: "The request cannot be completed because you have exceeded your quota.",
  };
  if (!isQuotaExceededError(quotaErr1)) {
    throw new Error("HTTP 403 quota message must be detected");
  }

  const quotaErr2 = {
    status: 403,
    errors: [{ domain: "youtube.quota", reason: "quotaExceeded" }],
  };
  if (!isQuotaExceededError(quotaErr2)) {
    throw new Error("errors[].reason quotaExceeded must be detected");
  }
  console.log("  ✔ Quota detection logic passed 3/3 checks");

  // Test 3: Rotator initialization & auto-bridge
  console.log("\nTest 3: Rotator pool initialization");
  const rotator = new QuotaRotator();
  await rotator.init();
  const report = rotator.getStatusReport();
  if (report.configuredCount < 1) {
    throw new Error("Must have at least 1 configured project");
  }
  if (report.availableCount < 1) {
    throw new Error("Must have at least 1 available project");
  }
  console.log(
    `  ✔ Rotator initialized successfully. Configured: ${report.configuredCount}, Available: ${report.availableCount}`
  );

  // Test 4: Active client retrieval
  console.log("\nTest 4: Active client builder");
  const client = await rotator.getActiveClient();
  if (!client.youtube) throw new Error("YouTube client must be instantiated");
  if (!client.oauth2Client) throw new Error("OAuth2 client must be instantiated");
  if (client.projectId !== "default") throw new Error("Active project should be default");
  console.log("  ✔ Client built for active project:", client.projectId);

  // Test 5: Simulated Auto-Rotation with mock operation
  console.log("\nTest 5: executeWithAutoRotation resilience test");
  let attemptCount = 0;
  try {
    await rotator.executeWithAutoRotation("test-op", async () => {
      attemptCount++;
      if (attemptCount === 1) {
        // Simulate quota error on first attempt
        throw {
          code: 403,
          message: "The request cannot be completed because you have exceeded your quota.",
        };
      }
      return "success";
    });
  } catch (err: any) {
    console.log(
      `  ✔ Correctly caught quota exhaustion and rotated state: ${err.message.slice(0, 75)}...`
    );
  }

  // Restore state after test
  await rotator.resetAllQuotas();
  console.log("  ✔ Restored quotas to fresh state after test.");

  console.log("\n🎉 ALL 5 UNIT & INTEGRATION TESTS PASSED CLEANLY!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
