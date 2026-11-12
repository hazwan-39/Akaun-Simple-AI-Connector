import { formatRM, type CashFlowSummary } from "@akaun/shared";
import { extractSummaryFromPrompt } from "../../skills/cashflow/prompt.js";
import { ProviderError, type AIProvider, type FinancialInsightsRequest, type ProviderResult } from "../types.js";

/**
 * Deterministic offline provider for development and automated tests.
 * Responses are labelled `mock: true` and the UI shows a clear banner.
 * Refused at startup in production unless ALLOW_MOCK_IN_PRODUCTION=true.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = "mock-cashflow-v1";

  async generateFinancialInsights(req: FinancialInsightsRequest): Promise<ProviderResult> {
    if (req.signal.aborted) throw new ProviderError("timeout", this.name, "aborted");
    const s = extractSummaryFromPrompt(req.financialSummary);
    if (!s) throw new ProviderError("invalid_json", this.name, "no summary in prompt");
    return { output: buildMockInsights(s), model: this.model };
  }
}

export function buildMockInsights(s: CashFlowSummary) {
  const t = s.totals;
  const positive = t.net >= 0;
  const worst = [...s.monthly].sort((a, b) => a.net - b.net)[0];
  const best = [...s.monthly].sort((a, b) => b.net - a.net)[0];
  const topExpense = s.categories.filter((c) => c.direction === "outflow").sort((a, b) => b.amount - a.amount)[0];
  const negMonths = s.monthly.filter((m) => m.net < 0).length;

  return {
    executiveSummary:
      `[MOD DEMO – bukan analisis AI sebenar] Bagi tempoh ${s.period.start} hingga ${s.period.end}, aliran masuk tunai berjumlah ` +
      `${formatRM(t.inflow)} manakala aliran keluar berjumlah ${formatRM(t.outflow)}, menghasilkan aliran tunai bersih ` +
      `${formatRM(t.net)}. Kedudukan tunai ${positive ? "positif" : "negatif"} bagi tempoh ini.`,
    trends: [
      {
        title: positive ? "Aliran tunai bersih positif" : "Aliran tunai bersih negatif",
        detail: `Aliran tunai bersih bagi tempoh ini ialah ${formatRM(t.net)}.`,
        basis: "fakta" as const,
      },
      ...(best && worst && best.month !== worst.month
        ? [
            {
              title: "Variasi bulanan",
              detail: `Bulan terbaik ialah ${best.month} (${formatRM(best.net)}) dan bulan terlemah ialah ${worst.month} (${formatRM(worst.net)}).`,
              basis: "fakta" as const,
            },
          ]
        : []),
    ],
    risks:
      negMonths > 0
        ? [
            {
              title: "Bulan dengan aliran tunai negatif",
              detail: `${negMonths} bulan mencatatkan aliran keluar melebihi aliran masuk.`,
              severity: negMonths >= 3 ? ("tinggi" as const) : ("sederhana" as const),
            },
          ]
        : [],
    expenseObservations: topExpense
      ? [{ title: `Perbelanjaan terbesar: ${topExpense.name}`, detail: `Kategori ini berjumlah ${formatRM(topExpense.amount)}.` }]
      : [],
    recommendedActions: [
      {
        action: "Semak transaksi bulan dengan aliran tunai terendah",
        rationale: "Memahami punca bulan yang lemah membantu merancang simpanan tunai.",
        priority: "sederhana" as const,
      },
    ],
    dataLimitations:
      s.dataQuality.status === "confirmed" ? [] : ["Angka belum disahkan sepenuhnya dengan workbook sumber."],
  };
}
