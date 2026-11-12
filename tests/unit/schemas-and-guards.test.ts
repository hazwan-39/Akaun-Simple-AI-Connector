import { describe, expect, it } from "vitest";
import {
  calculateCashFlow,
  CashFlowInsightsSchema,
  CashFlowSummarySchema,
  isFormulaLike,
  sanitizeCellText,
  verifySummaryArithmetic,
} from "@akaun/shared";
import { buildDemoTransactions, DEMO_OPENING_BALANCE } from "../../apps/excel-addin/src/office/adapters/demo/demo-adapter";
import { findUnverifiedAmounts } from "../../apps/api/src/validation/amount-guard";
import { validInsights } from "../fixtures/insights";

const demo = () =>
  calculateCashFlow({
    transactions: buildDemoTransactions(),
    openingBalance: DEMO_OPENING_BALANCE,
    source: { kind: "demo", adapterId: "demo", adapterVersion: "1.0.0" },
  });

describe("CashFlowSummary schema", () => {
  it("accepts engine output", () => {
    expect(CashFlowSummarySchema.safeParse(demo().summary).success).toBe(true);
  });
  it("rejects unknown fields (e.g. smuggled transaction descriptions)", () => {
    const s = { ...demo().summary, transactions: [{ description: "x" }] };
    expect(CashFlowSummarySchema.safeParse(s).success).toBe(false);
  });
  it("rejects category labels with control characters or excessive length", () => {
    const s = demo().summary;
    const bad = { ...s, categories: [{ ...s.categories[0]!, name: "a\u0000b" }] };
    expect(CashFlowSummarySchema.safeParse(bad).success).toBe(false);
    const long = { ...s, categories: [{ ...s.categories[0]!, name: "x".repeat(81) }] };
    expect(CashFlowSummarySchema.safeParse(long).success).toBe(false);
  });
  it("detects tampered arithmetic", () => {
    const s = structuredClone(demo().summary);
    expect(verifySummaryArithmetic(s)).toEqual([]);
    s.totals.inflow += 1000;
    expect(verifySummaryArithmetic(s).length).toBeGreaterThan(0);
    const s2 = structuredClone(demo().summary);
    s2.balances.closing = (s2.balances.closing ?? 0) + 5;
    expect(verifySummaryArithmetic(s2)).toContain("closing != opening + net");
  });
});

describe("AI insight schema", () => {
  it("accepts a valid response", () => {
    expect(CashFlowInsightsSchema.safeParse(validInsights()).success).toBe(true);
  });
  it.each([
    ["missing field", (o: Record<string, unknown>) => delete o.recommendedActions],
    ["extra field", (o: Record<string, unknown>) => (o.code = "rm -rf /")],
    ["wrong enum", (o: any) => (o.trends[0].basis = "certain")],
    ["empty summary", (o: any) => (o.executiveSummary = "")],
    ["too many actions", (o: any) => (o.recommendedActions = Array(7).fill(o.recommendedActions[0]))],
    ["script tag", (o: any) => (o.executiveSummary = "<script>alert(1)</script>")],
    ["overlong text", (o: any) => (o.executiveSummary = "a".repeat(1501))],
    ["wrong type", (o: any) => (o.risks = "none")],
  ])("rejects %s", (_name, mutate) => {
    const o = validInsights() as Record<string, unknown>;
    mutate(o);
    expect(CashFlowInsightsSchema.safeParse(o).success).toBe(false);
  });
});

describe("formula injection protection", () => {
  it.each(["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", " =cmd|' /C calc'!A0", "＝1"])("neutralises %s", (s) => {
    const out = sanitizeCellText(s);
    expect(out.startsWith("'")).toBe(true);
  });
  it("leaves normal text alone and strips control characters", () => {
    expect(sanitizeCellText("Aliran tunai positif")).toBe("Aliran tunai positif");
    expect(sanitizeCellText("a\u0007b")).toBe("ab");
    expect(isFormulaLike("Biasa")).toBe(false);
  });
  it("truncates very long text", () => {
    expect(sanitizeCellText("x".repeat(5000)).length).toBeLessThanOrEqual(2000);
  });
});

describe("hallucinated amount guard", () => {
  it("accepts amounts that exist in the summary and flags invented ones", () => {
    const s = demo().summary;
    const ins = validInsights();
    const real = s.totals.inflow.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ins.executiveSummary = `Aliran masuk RM ${real}. Pelanggan baharu membayar RM 99,999.99.`;
    expect(findUnverifiedAmounts(ins, s)).toEqual(["RM 99,999.99"]);
  });
});
