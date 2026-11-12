import { z } from "zod";
import { CASH_FLOW_SKILL_ID, MAX_CATEGORIES, MAX_PERIOD_MONTHS } from "../constants.js";
import { DATA_ISSUE_CODES } from "../calculations/issues.js";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan mesti dalam format yyyy-mm");
/** Money values: finite, bounded, at most 2 decimal places. */
const money = z
  .number()
  .finite()
  .gte(-1e12)
  .lte(1e12)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Maksimum 2 tempat perpuluhan");

/** Free-text labels coming from the workbook: short, single-line, no control chars. */
const label = z
  .string()
  .min(1)
  .max(80)
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Aksara kawalan tidak dibenarkan");

/**
 * The ONLY financial payload the add-in sends to the backend.
 * Aggregates only: no transaction descriptions, no business name, no SSM number.
 */
export const CashFlowSummarySchema = z
  .object({
    skill: z.object({ id: z.literal(CASH_FLOW_SKILL_ID), version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict(),
    source: z
      .object({
        kind: z.enum(["demo", "workbook"]),
        adapterId: z.string().regex(/^[a-z0-9._-]{1,60}$/),
        adapterVersion: z.string().max(20),
      })
      .strict(),
    currency: z.literal("MYR"),
    period: z.object({ start: month, end: month, months: z.number().int().min(1).max(MAX_PERIOD_MONTHS) }).strict(),
    totals: z
      .object({
        inflow: money,
        outflow: money,
        net: money,
        inflowOutflowRatio: z.number().finite().nullable(),
      })
      .strict(),
    balances: z.object({ opening: money.nullable(), closing: money.nullable() }).strict(),
    monthly: z
      .array(z.object({ month, inflow: money, outflow: money, net: money }).strict())
      .min(1)
      .max(MAX_PERIOD_MONTHS),
    categories: z
      .array(
        z
          .object({
            direction: z.enum(["inflow", "outflow"]),
            group: label.nullable(),
            name: label,
            amount: money,
          })
          .strict(),
      )
      .max(MAX_CATEGORIES),
    dataQuality: z
      .object({
        status: z.enum(["confirmed", "unreconciled", "demo", "insufficient"]),
        transactionCount: z.number().int().min(0),
        excludedCount: z.number().int().min(0),
        issues: z
          .array(
            z
              .object({
                code: z.enum(DATA_ISSUE_CODES),
                severity: z.enum(["info", "warning", "error"]),
                count: z.number().int().min(0),
              })
              .strict(),
          )
          .max(DATA_ISSUE_CODES.length),
        reconciliation: z.array(z.object({ id: z.string().max(40), passed: z.boolean() }).strict()).max(10),
      })
      .strict(),
  })
  .strict();

export type CashFlowSummary = z.infer<typeof CashFlowSummarySchema>;

const TOLERANCE = 0.011;
const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

/**
 * Server-side (and client-side) arithmetic consistency check. Returns a list of
 * problems; an empty list means the summary is internally consistent.
 */
export function verifySummaryArithmetic(s: CashFlowSummary): string[] {
  const problems: string[] = [];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + Math.round(b * 100), 0) / 100;

  if (!near(s.totals.net, s.totals.inflow - s.totals.outflow)) problems.push("totals.net != inflow - outflow");
  if (!near(sum(s.monthly.map((m) => m.inflow)), s.totals.inflow)) problems.push("sum(monthly.inflow) != totals.inflow");
  if (!near(sum(s.monthly.map((m) => m.outflow)), s.totals.outflow)) problems.push("sum(monthly.outflow) != totals.outflow");
  for (const m of s.monthly) {
    if (!near(m.net, m.inflow - m.outflow)) problems.push(`monthly ${m.month}: net != inflow - outflow`);
  }
  const months = s.monthly.map((m) => m.month);
  if (new Set(months).size !== months.length) problems.push("duplicate months");
  if (months.some((m) => m < s.period.start || m > s.period.end)) problems.push("monthly outside period");
  if (s.monthly.length !== s.period.months) problems.push("period.months != monthly.length");
  if (s.balances.opening !== null && s.balances.closing !== null) {
    if (!near(s.balances.closing, s.balances.opening + s.totals.net)) problems.push("closing != opening + net");
  }
  if (s.balances.opening === null && s.balances.closing !== null) problems.push("closing without opening");
  if (s.categories.length > 0) {
    const cin = sum(s.categories.filter((c) => c.direction === "inflow").map((c) => c.amount));
    const cout = sum(s.categories.filter((c) => c.direction === "outflow").map((c) => c.amount));
    if (!near(cin, s.totals.inflow)) problems.push("sum(categories.inflow) != totals.inflow");
    if (!near(cout, s.totals.outflow)) problems.push("sum(categories.outflow) != totals.outflow");
  }
  if (s.totals.outflow !== 0 && s.totals.inflowOutflowRatio !== null) {
    if (Math.abs(s.totals.inflowOutflowRatio - s.totals.inflow / s.totals.outflow) > 0.01) problems.push("ratio mismatch");
  }
  return problems;
}
