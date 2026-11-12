import { describe, expect, it } from "vitest";
import { calculateCashFlow, verifySummaryArithmetic, type RawTransaction } from "@akaun/shared";

const WB = { kind: "workbook" as const, adapterId: "test", adapterVersion: "1" };
let ref = 0;
const tx = (date: unknown, direction: "inflow" | "outflow", amount: unknown, extra: Partial<RawTransaction> = {}): RawTransaction => ({
  sourceRef: `T!${++ref}`,
  date,
  amount,
  direction,
  category: direction === "inflow" ? "Jualan" : "Sewa",
  description: `d${ref}`,
  ...extra,
});
const issue = (r: ReturnType<typeof calculateCashFlow>, code: string) => r.issues.find((i) => i.code === code);

describe("cash flow arithmetic", () => {
  it("computes totals, net, ratio and closing balance", () => {
    const r = calculateCashFlow({
      transactions: [tx("2026-01-05", "inflow", 1000), tx("2026-01-20", "outflow", 400.1), tx("2026-02-03", "inflow", 250.25), tx("2026-02-28", "outflow", 600)],
      openingBalance: 500,
      source: WB,
    });
    expect(r.summary.totals).toEqual({ inflow: 1250.25, outflow: 1000.1, net: 250.15, inflowOutflowRatio: 1.2501 });
    expect(r.summary.balances).toEqual({ opening: 500, closing: 750.15 });
    expect(verifySummaryArithmetic(r.summary)).toEqual([]);
  });

  it("aggregates by month including empty months", () => {
    const r = calculateCashFlow({
      transactions: [tx("2026-01-05", "inflow", 100), tx("2026-01-06", "inflow", 50), tx("2026-03-01", "outflow", 30)],
      source: WB,
    });
    expect(r.monthly).toEqual([
      { month: "2026-01", inflow: 150, outflow: 0, net: 150 },
      { month: "2026-02", inflow: 0, outflow: 0, net: 0 },
      { month: "2026-03", inflow: 0, outflow: 30, net: -30 },
    ]);
    expect(issue(r, "MISSING_MONTHS")?.count).toBe(1);
  });

  it("returns null ratio when there is no outflow, and no closing balance without opening", () => {
    const r = calculateCashFlow({ transactions: [tx("2026-01-05", "inflow", 100)], source: WB });
    expect(r.summary.totals.inflowOutflowRatio).toBeNull();
    expect(r.summary.balances).toEqual({ opening: null, closing: null });
    expect(issue(r, "NO_OPENING_BALANCE")).toBeDefined();
  });

  it("rolls the opening balance forward when the period starts later", () => {
    const r = calculateCashFlow({
      transactions: [tx("2026-01-05", "inflow", 1000), tx("2026-01-09", "outflow", 200), tx("2026-02-05", "inflow", 300)],
      openingBalance: 100,
      period: { start: "2026-02", end: "2026-02" },
      source: WB,
    });
    expect(r.summary.balances).toEqual({ opening: 900, closing: 1200 });
    expect(r.summary.totals.inflow).toBe(300);
    expect(issue(r, "OUT_OF_PERIOD")?.count).toBe(2);
  });
});

describe("data validation", () => {
  it("counts the same source row only once", () => {
    const a = tx("2026-01-05", "inflow", 100);
    const r = calculateCashFlow({ transactions: [a, { ...a }], source: WB });
    expect(r.summary.totals.inflow).toBe(100);
    expect(issue(r, "DUPLICATE_SOURCE_ROW")?.count).toBe(1);
  });

  it("flags but still counts look-alike transactions (the workbook counts them too)", () => {
    const r = calculateCashFlow({
      transactions: [tx("2026-01-05", "outflow", 99, { description: "Stok" }), tx("2026-01-05", "outflow", 99, { description: " stok " })],
      source: WB,
    });
    expect(r.summary.totals.outflow).toBe(198);
    expect(issue(r, "POSSIBLE_DUPLICATE")?.count).toBe(1);
  });

  it("excludes internal transfers and non-cash entries", () => {
    const r = calculateCashFlow({
      transactions: [
        tx("2026-01-05", "inflow", 100),
        tx("2026-01-06", "inflow", 5000, { kind: "internal_transfer" }),
        tx("2026-01-06", "outflow", 5000, { kind: "internal_transfer" }),
        tx("2026-01-31", "outflow", 300, { kind: "non_cash" }),
      ],
      source: WB,
    });
    expect(r.summary.totals).toMatchObject({ inflow: 100, outflow: 0 });
    expect(issue(r, "INTERNAL_TRANSFER_EXCLUDED")?.count).toBe(2);
    expect(issue(r, "NON_CASH_EXCLUDED")?.count).toBe(1);
  });

  it("handles missing amounts, invalid amounts, invalid and missing dates", () => {
    const r = calculateCashFlow({
      transactions: [
        tx("2026-01-05", "inflow", 100),
        tx("2026-01-05", "inflow", ""),
        tx("2026-01-05", "inflow", "abc"),
        tx("2026-02-31", "inflow", 50),
        tx("", "inflow", 70),
      ],
      source: WB,
    });
    expect(r.summary.totals.inflow).toBe(100);
    expect(issue(r, "MISSING_AMOUNT")?.count).toBe(1);
    expect(issue(r, "INVALID_AMOUNT")?.count).toBe(1);
    expect(issue(r, "INVALID_DATE")?.count).toBe(1);
    expect(issue(r, "MISSING_DATE")?.count).toBe(1);
    expect(r.summary.dataQuality.excludedCount).toBe(4);
  });

  it("keeps negative amounts (reversals) and warns", () => {
    const r = calculateCashFlow({ transactions: [tx("2026-01-05", "inflow", 500), tx("2026-01-08", "inflow", -150)], source: WB });
    expect(r.summary.totals.inflow).toBe(350);
    expect(issue(r, "NEGATIVE_AMOUNT")?.count).toBe(1);
  });

  it("caps the reporting period at 24 months", () => {
    const r = calculateCashFlow({ transactions: [tx("2023-01-05", "inflow", 1), tx("2026-06-05", "inflow", 1)], source: WB });
    expect(r.summary.period).toEqual({ start: "2024-07", end: "2026-06", months: 24 });
    expect(issue(r, "PERIOD_TOO_LONG")).toBeDefined();
  });

  it("reports insufficient data when there are no valid transactions", () => {
    const r = calculateCashFlow({ transactions: [tx("bad", "inflow", 10)], source: WB });
    expect(r.status).toBe("insufficient");
    expect(issue(r, "NO_TRANSACTIONS")?.severity).toBe("error");
  });
});

describe("reconciliation and status", () => {
  const base = [tx("2026-01-05", "inflow", 1000), tx("2026-01-08", "outflow", 400)];

  it("is confirmed only when workbook totals match", () => {
    const r = calculateCashFlow({ transactions: base, source: WB, openingBalance: 0, expectedTotals: { inflow: 1000, outflow: 400 } });
    expect(r.status).toBe("confirmed");
    expect(r.reconciliation.every((c) => c.passed)).toBe(true);
  });

  it("is unreconciled when a workbook total differs", () => {
    const r = calculateCashFlow({ transactions: base, source: WB, expectedTotals: { inflow: 1000, outflow: 450 } });
    expect(r.status).toBe("unreconciled");
    expect(r.reconciliation.find((c) => c.id === "outflow_total")).toMatchObject({ passed: false, difference: -50 });
    expect(issue(r, "RECONCILIATION_MISMATCH")?.severity).toBe("error");
  });

  it("is unreconciled when nothing can be reconciled", () => {
    expect(calculateCashFlow({ transactions: base, source: WB }).status).toBe("unreconciled");
  });

  it("marks demo data as demo, never confirmed", () => {
    const r = calculateCashFlow({ transactions: base, source: { kind: "demo", adapterId: "demo", adapterVersion: "1" }, expectedTotals: { inflow: 1000, outflow: 400 } });
    expect(r.status).toBe("demo");
    expect(issue(r, "DEMO_DATA")).toBeDefined();
  });

  it("never sends descriptions in the summary", () => {
    const r = calculateCashFlow({ transactions: [tx("2026-01-05", "inflow", 10, { description: "Bayaran Encik Ali 0123456789" })], source: WB });
    expect(JSON.stringify(r.summary)).not.toContain("Ali");
  });
});
