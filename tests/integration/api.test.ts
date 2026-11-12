import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { calculateCashFlow, GenerateInsightsResponseSchema } from "@akaun/shared";
import { createApp } from "../../apps/api/src/app";
import { loadConfig } from "../../apps/api/src/config";
import { createLogger } from "../../apps/api/src/logger";
import { DailyQuota } from "../../apps/api/src/security/quota";
import { hashKey } from "../../apps/api/src/security/auth";
import { MockProvider } from "../../apps/api/src/ai/providers/mock";
import { ProviderError, type AIProvider } from "../../apps/api/src/ai/types";
import { buildDemoTransactions, DEMO_OPENING_BALANCE } from "../../apps/excel-addin/src/office/adapters/demo/demo-adapter";
import { validInsights } from "../fixtures/insights";

const KEY = "asai_test_key_0123456789abcdefghijklmnop";
const ORIGIN = "https://localhost:3000";

function makeApp(provider: AIProvider = new MockProvider(), opts: { quota?: number; env?: Record<string, string> } = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    PILOT_ACCESS_KEYS: `tester:${hashKey(KEY).toString("hex")}`,
    CORS_ALLOWED_ORIGINS: ORIGIN,
    AI_PROVIDER: "mock",
    AI_REQUEST_TIMEOUT_MS: "5000",
    RATE_LIMIT_MAX: "100",
    ...opts.env,
  });
  const lines: string[] = [];
  const logger = createLogger("debug", (l) => lines.push(l));
  const app = createApp({ config, provider, logger, quota: new DailyQuota(opts.quota ?? 30) });
  return { app, lines };
}

const summary = () =>
  calculateCashFlow({
    transactions: buildDemoTransactions(),
    openingBalance: DEMO_OPENING_BALANCE,
    source: { kind: "demo", adapterId: "demo", adapterVersion: "1.0.0" },
  }).summary;

const post = (app: ReturnType<typeof makeApp>["app"], body: unknown, key: string | null = KEY, skill = "CASH_FLOW_001") => {
  const r = request(app).post(`/api/v1/skills/${skill}/insights`).set("Origin", ORIGIN).set("Content-Type", "application/json");
  if (key) r.set("Authorization", `Bearer ${key}`);
  return r.send(JSON.stringify(body));
};

describe("API: health + auth", () => {
  it("exposes an unauthenticated health check", async () => {
    const res = await request(makeApp().app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it.each([
    ["no header", null],
    ["wrong key", "asai_wrong_key_0123456789abcdefghijklmn"],
    ["short key", "abc"],
  ])("rejects %s with 401", async (_n, key) => {
    const res = await post(makeApp().app, { summary: summary() }, key);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("refuses to start in production without keys, with mock provider, or with wildcard CORS", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AI_PROVIDER: "mock", PILOT_ACCESS_KEYS: `a:${"0".repeat(64)}` })).toThrow(/mock/);
    expect(() => loadConfig({ NODE_ENV: "production", AI_PROVIDER: "openai", OPENAI_API_KEY: "x" })).toThrow(/PILOT_ACCESS_KEYS/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", AI_PROVIDER: "openai", OPENAI_API_KEY: "x", PILOT_ACCESS_KEYS: `a:${"0".repeat(64)}`, CORS_ALLOWED_ORIGINS: "*" }),
    ).toThrow(/CORS/);
    expect(() => loadConfig({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("does not send CORS headers to unknown origins", async () => {
    const res = await request(makeApp().app).options("/api/v1/skills").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("API: insights", () => {
  it("returns validated insights for a valid summary", async () => {
    const res = await post(makeApp().app, { summary: summary() });
    expect(res.status).toBe(200);
    expect(GenerateInsightsResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.meta).toMatchObject({ provider: "mock", mock: true, skillId: "CASH_FLOW_001" });
    expect(res.headers["x-quota-remaining"]).toBe("29");
  });

  it("rejects malformed bodies with 400", async () => {
    const res = await post(makeApp().app, { summary: { nope: true } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects internally inconsistent figures with 422", async () => {
    const s = summary();
    s.totals.net = s.totals.net + 500;
    const res = await post(makeApp().app, { summary: s });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INCONSISTENT_SUMMARY");
  });

  it("rejects oversized payloads with 413", async () => {
    const res = await post(makeApp().app, { summary: summary(), padding: "x".repeat(70_000) });
    expect(res.status).toBe(413);
  });

  it("returns 404 for unknown skills and 403 for coming-soon skills", async () => {
    expect((await post(makeApp().app, { summary: summary() }, KEY, "NOPE")).status).toBe(404);
    expect((await post(makeApp().app, { summary: summary() }, KEY, "TAX_001")).status).toBe(403);
  });

  it("enforces the per-key daily quota", async () => {
    const { app } = makeApp(undefined, { quota: 1 });
    expect((await post(app, { summary: summary() })).status).toBe(200);
    const res = await post(app, { summary: summary() });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("enforces the per-key rate limit", async () => {
    const { app } = makeApp(undefined, { env: { RATE_LIMIT_MAX: "2" } });
    await post(app, { summary: summary() });
    await post(app, { summary: summary() });
    const res = await post(app, { summary: summary() });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("never logs financial data or keys", async () => {
    const { app, lines } = makeApp();
    const s = summary();
    await post(app, { summary: s });
    const log = lines.join("\n");
    expect(log).not.toContain(KEY);
    expect(log).not.toContain(String(s.totals.inflow));
    expect(log).not.toContain("executiveSummary");
  });
});

describe("API: provider failures", () => {
  const failing = (fn: () => Promise<unknown>): AIProvider => ({ name: "openai", model: "test", generateFinancialInsights: vi.fn(fn) as never });

  it("maps provider timeouts to 504 and refunds the quota", async () => {
    const { app } = makeApp(failing(async () => Promise.reject(new ProviderError("timeout", "openai", "t"))), { quota: 1 });
    const res = await post(app, { summary: summary() });
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("AI_TIMEOUT");
    // quota refunded → next call still allowed through to the provider
    expect((await post(app, { summary: summary() })).body.error.code).toBe("AI_TIMEOUT");
  });

  it("aborts slow providers using the configured timeout", async () => {
    const slow: AIProvider = {
      name: "anthropic",
      model: "slow",
      generateFinancialInsights: (req) =>
        new Promise((_, reject) => req.signal.addEventListener("abort", () => reject(new ProviderError("timeout", "anthropic", "aborted")))),
    };
    const config = loadConfig({ NODE_ENV: "test", PILOT_ACCESS_KEYS: `t:${hashKey(KEY).toString("hex")}`, AI_REQUEST_TIMEOUT_MS: "5000" });
    config.ai.timeoutMs = 50;
    const app = createApp({ config, provider: slow, logger: createLogger("error", () => {}) });
    const res = await post(app, { summary: summary() });
    expect(res.status).toBe(504);
  });

  it("retries once on schema-invalid AI output, then rejects with 502", async () => {
    const provider = failing(async () => ({ output: { executiveSummary: 42 }, model: "m" }));
    const res = await post(makeApp(provider).app, { summary: summary() });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("AI_INVALID_RESPONSE");
    expect(provider.generateFinancialInsights).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry returns valid output", async () => {
    let n = 0;
    const provider = failing(async () => (++n === 1 ? Promise.reject(new ProviderError("invalid_json", "openai", "x")) : { output: validInsights(), model: "m" }));
    const res = await post(makeApp(provider).app, { summary: summary() });
    expect(res.status).toBe(200);
    expect(res.body.meta.mock).toBe(false);
  });

  it.each([
    ["refused", "AI_REFUSED"],
    ["upstream", "AI_PROVIDER_ERROR"],
    ["rate_limited", "AI_PROVIDER_ERROR"],
    ["auth", "AI_PROVIDER_ERROR"],
  ] as const)("maps provider error %s to %s without leaking details", async (kind, code) => {
    const res = await post(makeApp(failing(async () => Promise.reject(new ProviderError(kind, "openai", "secret detail")))).app, { summary: summary() });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain("secret detail");
  });

  it("flags amounts the AI invented", async () => {
    const provider = failing(async () => ({ output: { ...validInsights(), executiveSummary: "Untung RM 1,234,567.89 tahun ini." }, model: "m" }));
    const res = await post(makeApp(provider).app, { summary: summary() });
    expect(res.status).toBe(200);
    expect(res.body.meta.unverifiedAmounts).toEqual(["RM 1,234,567.89"]);
  });
});
