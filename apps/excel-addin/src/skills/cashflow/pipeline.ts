import {
  calculateCashFlow,
  verifySummaryArithmetic,
  type CashFlowInsights,
  type CashFlowResult,
  type CashFlowSummary,
  type GenerateInsightsResponse,
  type InsightsMeta,
  type PeriodSelection,
} from "@akaun/shared";
import type { AdapterReadResult, WorkbookAdapter } from "../../office/adapters/types";
import type { WorkbookPort } from "../../office/workbook-port";
import type { DashboardModel } from "../../office/dashboard/template";

export type Phase = "ready" | "reading" | "validating" | "calculating" | "generating" | "completed" | "error";

export const PHASE_LABEL_MS: Record<Phase, string> = {
  ready: "Sedia",
  reading: "Membaca Workbook",
  validating: "Mengesahkan Data",
  calculating: "Mengira",
  generating: "Menjana Insight",
  completed: "Selesai",
  error: "Ralat",
};

export interface AnalysisResult {
  read: AdapterReadResult;
  calc: CashFlowResult;
  insights: CashFlowInsights | null;
  meta: InsightsMeta | null;
  /** Set when figures were calculated but the AI step failed. */
  insightsError: string | null;
  completedAt: Date;
}

export interface PipelineDeps {
  port: WorkbookPort | null;
  adapter: WorkbookAdapter;
  period: PeriodSelection | null;
  onPhase: (p: Phase) => void;
  requestInsights: ((summary: CashFlowSummary) => Promise<GenerateInsightsResponse>) | null;
}

export async function runCashFlowAnalysis(deps: PipelineDeps): Promise<AnalysisResult> {
  deps.onPhase("reading");
  const read = await deps.adapter.read(deps.port);

  deps.onPhase("validating");
  // Validation happens inside the engine (dates, amounts, duplicates, transfers, reconciliation).
  deps.onPhase("calculating");
  const calc = calculateCashFlow({
    transactions: read.transactions,
    openingBalance: read.openingBalance,
    period: deps.period,
    source: read.source,
    expectedTotals: read.expectedTotals,
  });
  const problems = verifySummaryArithmetic(calc.summary);
  if (problems.length > 0) throw new Error(`Semakan aritmetik dalaman gagal: ${problems.join("; ")}`);

  let insights: CashFlowInsights | null = null;
  let meta: InsightsMeta | null = null;
  let insightsError: string | null = null;

  if (calc.status === "insufficient") {
    insightsError = "Data tidak mencukupi untuk menjana insight AI.";
  } else if (!deps.requestInsights) {
    insightsError = "Kod akses pilot belum dimasukkan. Angka dikira, tetapi insight AI tidak dijana.";
  } else {
    deps.onPhase("generating");
    try {
      const res = await deps.requestInsights(calc.summary);
      insights = res.insights;
      meta = res.meta;
    } catch (err) {
      insightsError = err instanceof Error ? err.message : "Insight AI gagal dijana.";
    }
  }
  deps.onPhase("completed");
  return { read, calc, insights, meta, insightsError, completedAt: new Date() };
}

export function toDashboardModel(r: AnalysisResult): DashboardModel {
  return {
    businessName: r.read.businessName,
    period: r.calc.period,
    updatedAt: r.completedAt,
    status: r.calc.status,
    sourceLabel: r.read.sourceLabel,
    monthly: r.calc.monthly,
    openingBalance: r.calc.summary.balances.opening,
    insights: r.insights,
    meta: r.meta,
    issues: r.calc.issues,
    reconciliation: r.calc.reconciliation,
  };
}
