import { describe, expect, it } from "vitest";
import { AI_DASHBOARD_SHEET, AI_DATA_SHEET, calculateCashFlow } from "@akaun/shared";
import { guardPlan, WriteGuardError } from "../../apps/excel-addin/src/office/dashboard/guard";
import type { WriteOp } from "../../apps/excel-addin/src/office/dashboard/plan";
import { buildDashboardPlan, type DashboardModel } from "../../apps/excel-addin/src/office/dashboard/template";
import { buildDemoTransactions, DEMO_OPENING_BALANCE } from "../../apps/excel-addin/src/office/adapters/demo/demo-adapter";
import { validInsights } from "../fixtures/insights";

const OWNED = [AI_DASHBOARD_SHEET, AI_DATA_SHEET];
const guard = (...ops: WriteOp[]) => guardPlan({ ops }, OWNED);

describe("write allowlist", () => {
  it.each(["Deposits", "Payments", "Cash Flow", "Utama", "ai cash flow", "Sheet1"])("blocks writes to non-owned sheet %s", (sheet) => {
    expect(() => guard({ op: "values", sheet, address: "A1", values: [["x"]] })).toThrow(WriteGuardError);
    expect(() => guard({ op: "clear", sheet, address: "A1:Z99" })).toThrow(WriteGuardError);
  });

  it("blocks owned sheets that were not verified at runtime", () => {
    expect(() => guardPlan({ ops: [{ op: "values", sheet: AI_DASHBOARD_SHEET, address: "B2", values: [["x"]] }] }, [AI_DATA_SHEET])).toThrow(
      /not a verified connector-owned sheet/,
    );
  });

  it("blocks addresses outside the template bounds or with sheet prefixes", () => {
    expect(() => guard({ op: "values", sheet: AI_DASHBOARD_SHEET, address: "Z500", values: [[1]] })).toThrow(/outside/);
    expect(() => guard({ op: "clear", sheet: AI_DASHBOARD_SHEET, address: "Deposits!A1" })).toThrow(/invalid address/);
  });

  it("blocks unsanitised formula-like text", () => {
    expect(() => guard({ op: "values", sheet: AI_DASHBOARD_SHEET, address: "B2", values: [["=WEBSERVICE(\"http://x\")"]] })).toThrow(/formula-like/);
    expect(() => guard({ op: "values", sheet: AI_DASHBOARD_SHEET, address: "B2", values: [["'=safe text"]] })).not.toThrow();
  });

  it("blocks values whose shape does not match the address", () => {
    expect(() => guard({ op: "values", sheet: AI_DASHBOARD_SHEET, address: "B2:C2", values: [["x"]] })).toThrow(/shape/);
  });

  it.each([
    ["='Deposits'!C366", /non-owned sheet/],
    ["=Payments!D365", /non-owned sheet/],
    ["=[Book2.xlsx]Sheet1!A1", /external/],
    ["=WEBSERVICE(\"http://evil\")", /not allowed/],
    ["=INDIRECT(\"Deposits!A1\")", /not allowed/],
    ["=HYPERLINK(\"http://evil\")", /not allowed/],
    ["SUM(A1)", /must start/],
  ])("blocks formula %s", (f, re) => {
    expect(() => guard({ op: "formulas", sheet: AI_DASHBOARD_SHEET, address: "B8", formulas: [[f]] })).toThrow(re);
  });

  it("allows whitelisted formulas on owned sheets", () => {
    expect(() =>
      guard({ op: "formulas", sheet: AI_DASHBOARD_SHEET, address: "B8:C8", formulas: [["='_AI_CF_DATA'!G6", "=IF(ISNUMBER(B8),ROUND(B8,2),\"Deposits!A1\")"]] }),
    ).not.toThrow();
  });

  it("blocks charts sourced from original sheets or without the AS_AI_ prefix", () => {
    const chart = { op: "chart" as const, sheet: AI_DASHBOARD_SHEET, name: "AS_AI_X", chartType: "Line" as const, sourceSheet: "Deposits", sourceAddress: "A5:C10", title: "t", topLeft: "B10", bottomRight: "G25" };
    expect(() => guard(chart)).toThrow(/chart source/);
    expect(() => guard({ ...chart, sourceSheet: AI_DATA_SHEET, name: "Chart 1" })).toThrow(/AS_AI_/);
  });
});

describe("dashboard template", () => {
  const model = (overrides: Partial<DashboardModel> = {}): DashboardModel => {
    const calc = calculateCashFlow({ transactions: buildDemoTransactions(), openingBalance: DEMO_OPENING_BALANCE, source: { kind: "demo", adapterId: "demo", adapterVersion: "1" } });
    return {
      businessName: "=cmd|'/C calc'!A0",
      period: calc.period,
      updatedAt: new Date(2026, 10, 12, 9, 30),
      status: calc.status,
      sourceLabel: "DATA DEMO",
      monthly: calc.monthly,
      openingBalance: calc.summary.balances.opening,
      insights: { ...validInsights(), executiveSummary: "=HYPERLINK(\"http://evil\",\"klik\")" },
      meta: null,
      issues: calc.issues,
      reconciliation: calc.reconciliation,
      ...overrides,
    };
  };

  it.each(["create", "update"] as const)("produces a %s plan that passes the guard and only touches owned sheets", (mode) => {
    const plan = buildDashboardPlan(model(), mode);
    expect(() => guardPlan(plan, OWNED)).not.toThrow();
    expect(new Set(plan.ops.map((o) => o.sheet))).toEqual(new Set(OWNED));
  });

  it("sanitises hostile AI text and workbook labels", () => {
    const plan = buildDashboardPlan(model(), "update");
    const texts = plan.ops.flatMap((o) => (o.op === "values" ? o.values.flat() : [])).filter((v): v is string => typeof v === "string");
    expect(texts).toContain("'=HYPERLINK(\"http://evil\",\"klik\")");
    expect(texts.some((t) => t.includes("Perniagaan: =cmd"))).toBe(true); // prefixed label, not a formula
  });

  it("update mode does not re-apply layout formatting (preserves user layout)", () => {
    const plan = buildDashboardPlan(model(), "update").ops;
    const ops = plan.map((o) => o.op);
    // Only the status line colour (confirmed vs. unverified) is re-applied.
    expect(plan.filter((o) => o.op === "format")).toEqual([
      { op: "format", sheet: AI_DASHBOARD_SHEET, address: "B5:M5", style: { fontColor: expect.any(String) } },
    ]);
    expect(ops).not.toContain("rowHeight");
    expect(ops).not.toContain("merge");
    expect(ops).not.toContain("columnWidth");
  });

  it("works without AI insights", () => {
    const plan = buildDashboardPlan(model({ insights: null }), "create");
    expect(() => guardPlan(plan, OWNED)).not.toThrow();
  });
});
