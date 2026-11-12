/**
 * Provider adapters tested against fake SDK clients (no network, no API keys).
 * Real provider calls are NOT exercised here – see docs/testing.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../apps/api/src/ai/providers/anthropic";
import { OpenAIProvider } from "../../apps/api/src/ai/providers/openai";
import { ProviderError } from "../../apps/api/src/ai/types";
import { validInsights } from "../fixtures/insights";

const req = () => ({
  instructions: "sys",
  financialSummary: "<financial_data>{}</financial_data>",
  responseSchema: { name: "x", schema: { type: "object" } },
  signal: new AbortController().signal,
});
const OPTS = { apiKey: "k", model: "m", timeoutMs: 1000, maxRetries: 0, maxOutputTokens: 2000 };

describe("OpenAIProvider", () => {
  const make = (create: (...a: unknown[]) => unknown) => {
    const fake = { responses: { create: vi.fn(create) } } as unknown as OpenAI;
    return { provider: new OpenAIProvider(OPTS, fake), create: (fake as unknown as { responses: { create: ReturnType<typeof vi.fn> } }).responses.create };
  };

  it("sends a strict json_schema request and parses output_text", async () => {
    const { provider, create } = make(async () => ({ status: "completed", output: [], output_text: JSON.stringify(validInsights()), model: "gpt-x" }));
    const res = await provider.generateFinancialInsights(req());
    expect(res).toEqual({ output: validInsights(), model: "gpt-x" });
    const body = create.mock.calls[0]![0] as Record<string, any>;
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: "x" });
    expect(body.store).toBe(false);
  });

  it.each([
    ["incomplete", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, "truncated"],
    ["refusal", { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], output_text: "" }, "refused"],
    ["non-JSON", { status: "completed", output: [], output_text: "not json" }, "invalid_json"],
  ])("maps %s", async (_n, response, kind) => {
    const { provider } = make(async () => response);
    await expect(provider.generateFinancialInsights(req())).rejects.toMatchObject({ kind });
  });

  it("maps SDK timeout errors", async () => {
    const { provider } = make(async () => Promise.reject(new OpenAI.APIConnectionTimeoutError()));
    await expect(provider.generateFinancialInsights(req())).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("AnthropicProvider", () => {
  const make = (create: (...a: unknown[]) => unknown, serverFallback = true) => {
    const fn = vi.fn(create);
    const fake = { beta: { messages: { create: fn } } } as unknown as Anthropic;
    return { provider: new AnthropicProvider({ ...OPTS, effort: "medium", serverFallback }, fake), create: fn };
  };
  const msg = (text: string, stop_reason = "end_turn") => ({ model: "claude-opus-5-5", stop_reason, content: [{ type: "text", text }] });

  it("uses output_config.format, effort and the refusal fallback beta", async () => {
    const { provider, create } = make(async () => msg(JSON.stringify(validInsights())));
    const res = await provider.generateFinancialInsights(req());
    expect(res.output).toEqual(validInsights());
    const body = create.mock.calls[0]![0] as Record<string, any>;
    expect(body.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: { type: "object" } } });
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.fallbacks).toBe("default");
    expect(body.thinking).toBeUndefined();
  });

  it("omits fallback params when disabled", async () => {
    const { provider, create } = make(async () => msg(JSON.stringify(validInsights())), false);
    await provider.generateFinancialInsights(req());
    expect((create.mock.calls[0]![0] as Record<string, unknown>).betas).toBeUndefined();
  });

  it.each([
    ["refusal", "refused"],
    ["max_tokens", "truncated"],
  ])("checks stop_reason %s before reading content", async (stop, kind) => {
    const { provider } = make(async () => msg(JSON.stringify(validInsights()), stop));
    await expect(provider.generateFinancialInsights(req())).rejects.toMatchObject({ kind });
  });

  it("maps SDK errors", async () => {
    const { provider } = make(async () => Promise.reject(new Anthropic.APIConnectionTimeoutError()));
    await expect(provider.generateFinancialInsights(req())).rejects.toBeInstanceOf(ProviderError);
  });
});
