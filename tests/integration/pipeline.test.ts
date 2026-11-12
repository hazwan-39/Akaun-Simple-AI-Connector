import { describe, expect, it, vi } from "vitest";
import { demoAdapter } from "../../apps/excel-addin/src/office/adapters/registry";
import { runCashFlowAnalysis, toDashboardModel, type Phase } from "../../apps/excel-addin/src/skills/cashflow/pipeline";
import { validInsights } from "../fixtures/insights";

describe("cash flow pipeline (demo adapter)", () => {
  it("runs every phase in order and labels demo data", async () => {
    const phases: Phase[] = [];
    const requestInsights = vi.fn(async () => ({
      insights: validInsights(),
      meta: { skillId: "CASH_FLOW_001", skillVersion: "1.0.0", provider: "mock" as const, model: "m", generatedAt: "x", mock: true, unverifiedAmounts: [] },
    }));
    const r = await runCashFlowAnalysis({ port: null, adapter: demoAdapter, period: null, onPhase: (p) => phases.push(p), requestInsights });
    expect(phases).toEqual(["reading", "validating", "calculating", "generating", "completed"]);
    expect(r.calc.status).toBe("demo");
    // Demo data deliberately contains exactly one invalid date, one reversal, one look-alike, 2 transfers, 1 non-cash.
    const counts = Object.fromEntries(r.calc.issues.map((i) => [i.code, i.count]));
    expect(counts).toMatchObject({ INVALID_DATE: 1, NEGATIVE_AMOUNT: 1, POSSIBLE_DUPLICATE: 1, INTERNAL_TRANSFER_EXCLUDED: 2, NON_CASH_EXCLUDED: 1 });
    expect(r.read.source.kind).toBe("demo");
    expect(toDashboardModel(r).sourceLabel).toBe("DATA DEMO");
    // Only the aggregate summary is sent – never raw transactions.
    const sent = JSON.stringify(requestInsights.mock.calls[0]![0]);
    expect(sent).not.toContain("Pindahan bank ke tunai");
    expect(sent).not.toContain("Kedai Contoh");
  });

  it("keeps the deterministic figures when the AI call fails", async () => {
    const r = await runCashFlowAnalysis({
      port: null,
      adapter: demoAdapter,
      period: null,
      onPhase: () => {},
      requestInsights: async () => Promise.reject(new Error("Perkhidmatan AI tidak dapat dihubungi")),
    });
    expect(r.insights).toBeNull();
    expect(r.insightsError).toContain("tidak dapat dihubungi");
    expect(r.calc.summary.totals.inflow).toBeGreaterThan(0);
  });

  it("calculates without calling AI when no access key is configured", async () => {
    const r = await runCashFlowAnalysis({ port: null, adapter: demoAdapter, period: { start: "2026-03", end: "2026-05" }, onPhase: () => {}, requestInsights: null });
    expect(r.insightsError).toMatch(/Kod akses/);
    expect(r.calc.summary.period).toEqual({ start: "2026-03", end: "2026-05", months: 3 });
  });
});
