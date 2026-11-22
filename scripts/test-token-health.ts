import assert from "node:assert/strict";
import http from "node:http";
import { runTokenHealthCheck } from "./check-token-health";

interface MockBehavior {
  geminiStatus?: number;
  geminiBody?: any;
  groqStatus?: number;
  groqBody?: any;
  openRouterStatus?: number;
  openRouterBody?: any;
  cfUserStatus?: number;
  cfUserBody?: any;
  cfAcctStatus?: number;
  cfAcctBody?: any;
}

async function withMockServer(behavior: MockBehavior, fn: (baseUrl: string) => Promise<void>) {
  const server = http.createServer((req, res) => {
    const url = req.url || "";
    res.setHeader("Content-Type", "application/json");

    if (url.startsWith("/gemini/models")) {
      assert.ok(req.headers["x-goog-api-key"], "Gemini probe must pass x-goog-api-key header");
      res.statusCode = behavior.geminiStatus ?? 200;
      res.end(JSON.stringify(behavior.geminiBody ?? { models: [{ name: "models/gemini-2.5-flash" }] }));
      return;
    }

    if (url.startsWith("/groq/models")) {
      assert.ok(
        String(req.headers.authorization || "").startsWith("Bearer "),
        "Groq probe must pass Bearer auth"
      );
      res.statusCode = behavior.groqStatus ?? 200;
      res.end(JSON.stringify(behavior.groqBody ?? { data: [{ id: "llama-3.3-70b-versatile" }] }));
      return;
    }

    if (url.startsWith("/openrouter/auth/key")) {
      res.statusCode = behavior.openRouterStatus ?? 200;
      res.end(
        JSON.stringify(
          behavior.openRouterBody ?? {
            data: { label: "test-key", limit: 10, limit_remaining: 8.5, is_free_tier: false },
          }
        )
      );
      return;
    }

    if (url.startsWith("/cf/user/tokens/verify")) {
      res.statusCode = behavior.cfUserStatus ?? 200;
      res.end(
        JSON.stringify(
          behavior.cfUserBody ?? { success: true, result: { id: "tok-1", status: "active" } }
        )
      );
      return;
    }

    if (url.startsWith("/cf/accounts/")) {
      res.statusCode = behavior.cfAcctStatus ?? 200;
      res.end(
        JSON.stringify(
          behavior.cfAcctBody ?? { success: true, result: { id: "acct-tok", status: "active" } }
        )
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function makeEndpoints(base: string) {
  return {
    geminiBase: `${base}/gemini`,
    groqBase: `${base}/groq`,
    openRouterBase: `${base}/openrouter`,
    cloudflareBase: `${base}/cf`,
  };
}

const FULL_ENV = {
  GEMINI_API_KEY: "AIza-test",
  GROQ_API_KEY: "gsk-test",
  OPENROUTER_API_KEY: "sk-or-test",
  CLOUDFLARE_API_TOKEN: "cf-test",
  CLOUDFLARE_ACCOUNT_ID: "acct-123",
};

async function runTests() {
  const fixedNow = Date.parse("2026-11-22T01:00:00Z");

  // 1. All healthy
  await withMockServer({}, async (base) => {
    const issues = await runTokenHealthCheck(true, {
      env: FULL_ENV,
      endpoints: makeEndpoints(base),
      requireAllKeys: true,
      nowMs: fixedNow,
    });
    assert.equal(issues.length, 0, "Expected 0 issues when all providers are healthy");
  });

  // 2. Cloudflare account-scoped token fallback succeeds
  await withMockServer(
    {
      cfUserStatus: 401,
      cfUserBody: { success: false, errors: [{ message: "Invalid API Token" }] },
      cfAcctStatus: 200,
      cfAcctBody: { success: true, result: { id: "acct-tok", status: "active" } },
    },
    async (base) => {
      const issues = await runTokenHealthCheck(true, {
        env: FULL_ENV,
        endpoints: makeEndpoints(base),
        requireAllKeys: true,
        nowMs: fixedNow,
      });
      assert.equal(issues.length, 0, "Account-scoped Cloudflare token should pass via fallback");
    }
  );

  // 3. Invalid/revoked keys across all 4 providers
  await withMockServer(
    {
      geminiStatus: 400,
      geminiBody: { error: { message: "API key not valid" } },
      groqStatus: 401,
      groqBody: { error: { message: "Invalid API Key" } },
      openRouterStatus: 401,
      openRouterBody: { error: { message: "User not found" } },
      cfUserStatus: 401,
      cfUserBody: { success: false, errors: [{ message: "Invalid API Token" }] },
      cfAcctStatus: 401,
      cfAcctBody: { success: false, errors: [{ message: "Invalid API Token" }] },
    },
    async (base) => {
      const issues = await runTokenHealthCheck(true, {
        env: FULL_ENV,
        endpoints: makeEndpoints(base),
        requireAllKeys: true,
        nowMs: fixedNow,
      });
      assert.equal(issues.length, 4);
      assert.deepEqual(
        issues.map((i) => i.status),
        ["INVALID", "INVALID", "INVALID", "INVALID"]
      );
    }
  );

  // 4. Quota exhausted + expired Cloudflare token
  await withMockServer(
    {
      geminiStatus: 429,
      groqStatus: 429,
      openRouterBody: { data: { limit: 5, limit_remaining: 0 } },
      cfUserBody: {
        success: true,
        result: { status: "active", expires_on: "2026-11-20T00:00:00Z" },
      },
    },
    async (base) => {
      const issues = await runTokenHealthCheck(true, {
        env: FULL_ENV,
        endpoints: makeEndpoints(base),
        requireAllKeys: true,
        nowMs: fixedNow,
      });
      assert.deepEqual(
        issues.map((i) => i.status),
        ["QUOTA_EXCEEDED", "QUOTA_EXCEEDED", "QUOTA_EXCEEDED", "EXPIRED"]
      );
    }
  );

  // 5. Low credit OpenRouter + expiring soon Cloudflare token
  await withMockServer(
    {
      openRouterBody: { data: { limit: 10, limit_remaining: 0.15 } },
      cfUserBody: {
        success: true,
        result: { status: "active", expires_on: "2026-11-25T01:00:00Z" },
      },
    },
    async (base) => {
      const issues = await runTokenHealthCheck(true, {
        env: FULL_ENV,
        endpoints: makeEndpoints(base),
        requireAllKeys: true,
        nowMs: fixedNow,
      });
      assert.deepEqual(
        issues.map((i) => i.status),
        ["LOW_CREDIT", "EXPIRING_SOON"]
      );
    }
  );

  // 6. Missing-key guard: strict vs non-strict
  await withMockServer({}, async (base) => {
    const strictIssues = await runTokenHealthCheck(true, {
      env: {},
      endpoints: makeEndpoints(base),
      requireAllKeys: true,
      nowMs: fixedNow,
    });
    assert.equal(strictIssues.length, 4);
    assert.deepEqual(
      strictIssues.map((i) => i.status),
      ["MISSING", "MISSING", "MISSING", "MISSING"]
    );

    const relaxedIssues = await runTokenHealthCheck(true, {
      env: {},
      endpoints: makeEndpoints(base),
      requireAllKeys: false,
      nowMs: fixedNow,
    });
    assert.equal(relaxedIssues.length, 0);
  });

  // 7. Transient 503 upstream errors must not trigger false rotation alerts
  await withMockServer(
    {
      geminiStatus: 503,
      groqStatus: 503,
      openRouterStatus: 502,
      cfUserStatus: 503,
    },
    async (base) => {
      const issues = await runTokenHealthCheck(true, {
        env: FULL_ENV,
        endpoints: makeEndpoints(base),
        requireAllKeys: true,
        nowMs: fixedNow,
      });
      assert.equal(issues.length, 0, "Transient 5xx errors should not trigger rotation alerts");
    }
  );

  console.log("\n✅ All 7 token-health E2E integration tests passed!");
}

runTests().catch((err) => {
  console.error("❌ test-token-health failed:", err);
  process.exit(1);
});
