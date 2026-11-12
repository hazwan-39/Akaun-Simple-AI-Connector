import type { CashFlowInsights, CashFlowSummary } from "@akaun/shared";

/**
 * Hallucination guard: finds RM amounts quoted in the AI output that do not
 * match any figure in the validated summary (within RM 1, or within 1% for
 * rounded figures like "RM 12k" / "RM 1.2 juta").
 */
const RM_PATTERN = /RM\s?(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)(\s?(?:juta|j|ribu|k|mil)\b)?/gi;

function knownFigures(s: CashFlowSummary): number[] {
  const xs: number[] = [s.totals.inflow, s.totals.outflow, s.totals.net];
  if (s.balances.opening !== null) xs.push(s.balances.opening);
  if (s.balances.closing !== null) xs.push(s.balances.closing);
  for (const m of s.monthly) xs.push(m.inflow, m.outflow, m.net);
  for (const c of s.categories) xs.push(c.amount);
  return xs.flatMap((x) => [x, Math.abs(x)]);
}

export function allInsightText(i: CashFlowInsights): string[] {
  return [
    i.executiveSummary,
    ...i.trends.flatMap((t) => [t.title, t.detail]),
    ...i.risks.flatMap((r) => [r.title, r.detail]),
    ...i.expenseObservations.flatMap((e) => [e.title, e.detail]),
    ...i.recommendedActions.flatMap((a) => [a.action, a.rationale]),
    ...i.dataLimitations,
  ];
}

export function findUnverifiedAmounts(insights: CashFlowInsights, summary: CashFlowSummary): string[] {
  const known = knownFigures(summary);
  const out = new Set<string>();
  for (const text of allInsightText(insights)) {
    for (const m of text.matchAll(RM_PATTERN)) {
      let value = Number(m[1]!.replace(/,/g, ""));
      const unit = (m[2] ?? "").trim().toLowerCase();
      let tolerance = 1;
      if (unit === "juta" || unit === "j" || unit === "mil") {
        value *= 1_000_000;
        tolerance = Math.abs(value) * 0.06;
      } else if (unit === "ribu" || unit === "k") {
        value *= 1_000;
        tolerance = Math.abs(value) * 0.06;
      }
      if (!Number.isFinite(value)) continue;
      if (!known.some((k) => Math.abs(k - value) <= Math.max(tolerance, 1))) out.add(m[0].trim());
    }
  }
  return [...out].slice(0, 20);
}
