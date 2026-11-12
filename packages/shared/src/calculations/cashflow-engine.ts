/**
 * Deterministic Cash Flow calculation engine.
 *
 * - Pure function: no I/O, no AI, no Office.js.
 * - All arithmetic in integer sen.
 * - Never throws on bad workbook data; problems are reported as DataIssues.
 *
 *   Net Cash Flow   = Cash Inflow − Cash Outflow
 *   Closing Balance = Opening Balance + Net Cash Flow
 */
import { CASH_FLOW_SKILL_ID, CASH_FLOW_SKILL_VERSION, MAX_CATEGORIES, MAX_PERIOD_MONTHS } from "../constants.js";
import type { CashFlowSummary } from "../schemas/cashflow-summary.js";
import type {
  CategoryFigure,
  DataIssue,
  DataSourceInfo,
  DataStatus,
  MonthlyFigure,
  NormalizedTransaction,
  PeriodSelection,
  RawTransaction,
  ReconciliationCheck,
} from "../types/cashflow.js";
import { addMonths, isValidMonth, monthOf, monthRange, parseDate } from "./dates.js";
import { ISSUE_TEXT, type DataIssueCode } from "./issues.js";
import { fromSen, hasValue, parseAmount, toSen } from "./money.js";

export interface ExpectedTotals {
  /** The workbook's own total of all inflow rows (e.g. Deposits "Total" row). */
  inflow?: number | null;
  /** The workbook's own total of all outflow rows (e.g. Payments "Total" row). */
  outflow?: number | null;
}

export interface CashFlowEngineInput {
  transactions: RawTransaction[];
  /** Opening cash balance at the start of the dataset (raw cell value). */
  openingBalance?: unknown;
  /** Requested period. Defaults to the latest ≤24 months that contain data. */
  period?: PeriodSelection | null;
  source: DataSourceInfo;
  expectedTotals?: ExpectedTotals;
}

export interface CashFlowResult {
  summary: CashFlowSummary;
  status: DataStatus;
  issues: DataIssue[];
  reconciliation: ReconciliationCheck[];
  /** All months (yyyy-mm) that contain valid dated cash transactions. */
  availableMonths: string[];
  period: PeriodSelection;
  monthly: MonthlyFigure[];
  categories: CategoryFigure[];
  included: NormalizedTransaction[];
}

class IssueCollector {
  private readonly map = new Map<DataIssueCode, DataIssue>();
  add(code: DataIssueCode, ref?: string, count = 1) {
    const def = ISSUE_TEXT[code];
    const existing = this.map.get(code);
    if (existing) {
      existing.count += count;
      if (ref && existing.sourceRefs.length < 10) existing.sourceRefs.push(ref);
    } else {
      this.map.set(code, { code, severity: def.severity, message: "", count, sourceRefs: ref ? [ref] : [] });
    }
  }
  list(): DataIssue[] {
    const order = { error: 0, warning: 1, info: 2 } as const;
    return [...this.map.values()]
      .map((i) => ({ ...i, message: ISSUE_TEXT[i.code].message.replace("{n}", String(i.count)) }))
      .sort((a, b) => order[a.severity] - order[b.severity]);
  }
}

const normDesc = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function calculateCashFlow(input: CashFlowEngineInput): CashFlowResult {
  const issues = new IssueCollector();
  if (input.source.kind === "demo") issues.add("DEMO_DATA");

  // ---- 1. Normalise + deduplicate by source reference ------------------------------
  const seenRefs = new Set<string>();
  const readTotalsSen = { inflow: 0, outflow: 0 };
  const valid: NormalizedTransaction[] = [];

  for (const raw of input.transactions) {
    if (seenRefs.has(raw.sourceRef)) {
      issues.add("DUPLICATE_SOURCE_ROW", raw.sourceRef);
      continue;
    }
    seenRefs.add(raw.sourceRef);

    const amount = parseAmount(raw.amount);
    if (amount === null) {
      if (hasValue(raw.amount)) issues.add("INVALID_AMOUNT", raw.sourceRef);
      else if (hasValue(raw.date)) issues.add("MISSING_AMOUNT", raw.sourceRef);
      continue;
    }
    const amountSen = toSen(amount);
    if (amountSen === 0) continue;

    // Everything with a numeric amount counts towards the "read" total used for
    // reconciliation against the workbook's own column totals.
    readTotalsSen[raw.direction] += amountSen;

    const kind = raw.kind ?? "cash";
    if (kind === "internal_transfer") {
      issues.add("INTERNAL_TRANSFER_EXCLUDED", raw.sourceRef);
      continue;
    }
    if (kind === "non_cash") {
      issues.add("NON_CASH_EXCLUDED", raw.sourceRef);
      continue;
    }
    if (amountSen < 0) issues.add("NEGATIVE_AMOUNT", raw.sourceRef);

    const date = parseDate(raw.date);
    if (!date) {
      issues.add(hasValue(raw.date) ? "INVALID_DATE" : "MISSING_DATE", raw.sourceRef);
      continue;
    }
    valid.push({
      sourceRef: raw.sourceRef,
      date,
      month: monthOf(date),
      amountSen,
      direction: raw.direction,
      category: (raw.category || "Tanpa Kategori").trim().slice(0, 80),
      categoryGroup: raw.categoryGroup ? raw.categoryGroup.trim().slice(0, 80) : null,
      description: raw.description ?? null,
      kind,
    });
  }

  // ---- 2. Possible duplicates (same date, direction, amount, description, category) --
  const dupKeys = new Map<string, number>();
  for (const t of valid) {
    const key = [t.date, t.direction, t.amountSen, normDesc(t.description), t.category].join("|");
    const n = (dupKeys.get(key) ?? 0) + 1;
    dupKeys.set(key, n);
    if (n > 1 && normDesc(t.description) !== "") issues.add("POSSIBLE_DUPLICATE", t.sourceRef);
  }

  // ---- 3. Reporting period ----------------------------------------------------------
  const availableMonths = [...new Set(valid.map((t) => t.month))].sort();
  const period = resolvePeriod(input.period, availableMonths, issues);
  const periodMonths = monthRange(period.start, period.end);

  const inPeriod = valid.filter((t) => t.month >= period.start && t.month <= period.end);
  const outOfPeriod = valid.length - inPeriod.length;
  if (outOfPeriod > 0) issues.add("OUT_OF_PERIOD", undefined, outOfPeriod);
  if (inPeriod.length === 0) issues.add("NO_TRANSACTIONS");

  // ---- 4. Aggregation -----------------------------------------------------------------
  const monthlySen = new Map(periodMonths.map((m) => [m, { inflow: 0, outflow: 0 }]));
  const catSen = new Map<string, { direction: "inflow" | "outflow"; group: string | null; name: string; sen: number }>();
  for (const t of inPeriod) {
    monthlySen.get(t.month)![t.direction] += t.amountSen;
    const key = `${t.direction}|${t.categoryGroup ?? ""}|${t.category}`;
    const c = catSen.get(key) ?? { direction: t.direction, group: t.categoryGroup, name: t.category, sen: 0 };
    c.sen += t.amountSen;
    catSen.set(key, c);
  }
  const emptyMonths = [...monthlySen.values()].filter((m) => m.inflow === 0 && m.outflow === 0).length;
  if (inPeriod.length > 0 && emptyMonths > 0) issues.add("MISSING_MONTHS", undefined, emptyMonths);

  const monthly: MonthlyFigure[] = periodMonths.map((m) => {
    const v = monthlySen.get(m)!;
    return { month: m, inflow: fromSen(v.inflow), outflow: fromSen(v.outflow), net: fromSen(v.inflow - v.outflow) };
  });
  const inflowSen = [...monthlySen.values()].reduce((a, v) => a + v.inflow, 0);
  const outflowSen = [...monthlySen.values()].reduce((a, v) => a + v.outflow, 0);
  const netSen = inflowSen - outflowSen;

  const categories = limitCategories(
    [...catSen.values()]
      .filter((c) => c.sen !== 0)
      .sort((a, b) => (a.direction === b.direction ? Math.abs(b.sen) - Math.abs(a.sen) : a.direction === "inflow" ? -1 : 1)),
  );

  // ---- 5. Balances ---------------------------------------------------------------------
  // The workbook's opening balance applies to the start of the dataset. When the
  // period starts later, roll it forward with the cash movements before the period.
  const openingRaw = parseAmount(input.openingBalance);
  let openingSen: number | null = null;
  if (openingRaw !== null) {
    const priorNet = valid
      .filter((t) => t.month < period.start)
      .reduce((a, t) => a + (t.direction === "inflow" ? t.amountSen : -t.amountSen), 0);
    openingSen = toSen(openingRaw) + priorNet;
  } else {
    issues.add("NO_OPENING_BALANCE");
  }
  const closingSen = openingSen === null ? null : openingSen + netSen;

  // ---- 6. Reconciliation ---------------------------------------------------------------
  const reconciliation: ReconciliationCheck[] = [];
  const recon = (id: string, labelMs: string, expected: number | null | undefined, actualSen: number) => {
    if (expected === undefined || expected === null) return;
    const expectedNum = parseAmount(expected);
    if (expectedNum === null) return;
    const diffSen = actualSen - toSen(expectedNum);
    reconciliation.push({
      id,
      label: labelMs,
      expected: expectedNum,
      actual: fromSen(actualSen),
      difference: fromSen(diffSen),
      passed: Math.abs(diffSen) <= 1,
    });
  };
  recon("inflow_total", "Jumlah penerimaan dibaca = jumlah workbook", input.expectedTotals?.inflow, readTotalsSen.inflow);
  recon("outflow_total", "Jumlah pembayaran dibaca = jumlah workbook", input.expectedTotals?.outflow, readTotalsSen.outflow);
  const failed = reconciliation.filter((r) => !r.passed).length;
  if (failed > 0) issues.add("RECONCILIATION_MISMATCH", undefined, failed);

  // ---- 7. Status -----------------------------------------------------------------------
  const issueList = issues.list();
  let status: DataStatus;
  if (inPeriod.length === 0) status = "insufficient";
  else if (input.source.kind === "demo") status = "demo";
  else if (reconciliation.length > 0 && failed === 0 && !issueList.some((i) => i.severity === "error")) status = "confirmed";
  else status = "unreconciled";

  const excludedCount = input.transactions.length - inPeriod.length;
  const summary: CashFlowSummary = {
    skill: { id: CASH_FLOW_SKILL_ID, version: CASH_FLOW_SKILL_VERSION },
    source: { ...input.source },
    currency: "MYR",
    period: { start: period.start, end: period.end, months: periodMonths.length },
    totals: {
      inflow: fromSen(inflowSen),
      outflow: fromSen(outflowSen),
      net: fromSen(netSen),
      inflowOutflowRatio: outflowSen === 0 ? null : Math.round((inflowSen / outflowSen) * 10000) / 10000,
    },
    balances: {
      opening: openingSen === null ? null : fromSen(openingSen),
      closing: closingSen === null ? null : fromSen(closingSen),
    },
    monthly,
    categories,
    dataQuality: {
      status,
      transactionCount: inPeriod.length,
      excludedCount: Math.max(0, excludedCount),
      issues: issueList.map(({ code, severity, count }) => ({ code, severity, count })),
      reconciliation: reconciliation.map(({ id, passed }) => ({ id, passed })),
    },
  };

  return { summary, status, issues: issueList, reconciliation, availableMonths, period, monthly, categories, included: inPeriod };
}

function resolvePeriod(
  requested: PeriodSelection | null | undefined,
  available: string[],
  issues: IssueCollector,
): PeriodSelection {
  let start: string;
  let end: string;
  if (requested && isValidMonth(requested.start) && isValidMonth(requested.end) && requested.start <= requested.end) {
    ({ start, end } = requested);
  } else if (available.length > 0) {
    start = available[0]!;
    end = available[available.length - 1]!;
  } else {
    const now = new Date();
    end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    start = end;
  }
  if (monthRange(start, end).length > MAX_PERIOD_MONTHS) {
    start = addMonths(end, -(MAX_PERIOD_MONTHS - 1));
    issues.add("PERIOD_TOO_LONG");
  }
  return { start, end };
}

function limitCategories(
  cats: { direction: "inflow" | "outflow"; group: string | null; name: string; sen: number }[],
): CategoryFigure[] {
  const toFig = (c: (typeof cats)[number]): CategoryFigure => ({
    direction: c.direction,
    group: c.group,
    name: c.name,
    amount: fromSen(c.sen),
  });
  if (cats.length <= MAX_CATEGORIES) return cats.map(toFig);
  // Keep the largest categories per direction, merge the remainder so totals still reconcile.
  const out: CategoryFigure[] = [];
  for (const dir of ["inflow", "outflow"] as const) {
    const list = cats.filter((c) => c.direction === dir);
    const keep = list.slice(0, MAX_CATEGORIES / 2 - 1);
    const rest = list.slice(MAX_CATEGORIES / 2 - 1);
    out.push(...keep.map(toFig));
    if (rest.length > 0) {
      out.push({ direction: dir, group: null, name: "Lain-lain (gabungan)", amount: fromSen(rest.reduce((a, c) => a + c.sen, 0)) });
    }
  }
  return out;
}
