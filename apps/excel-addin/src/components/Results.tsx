import { formatRM, monthLabelMs } from "@akaun/shared";
import type { AnalysisResult } from "../skills/cashflow/pipeline";
import { MonthlyChart } from "./MonthlyChart";

const STATUS_TEXT = {
  confirmed: { cls: "ok", text: "Disahkan: sepadan dengan jumlah workbook" },
  unreconciled: { cls: "warn", text: "Belum disahkan: semak amaran kualiti data" },
  demo: { cls: "demo", text: "DATA DEMO: bukan data workbook anda" },
  insufficient: { cls: "warn", text: "Data tidak mencukupi" },
} as const;

export function Results({ result }: { result: AnalysisResult }) {
  const { calc, insights, meta, insightsError } = result;
  const s = calc.summary;
  const st = STATUS_TEXT[calc.status];

  return (
    <div className="results">
      <div className={`status-chip chip-${st.cls}`}>{st.text}</div>
      <p className="muted small">
        Tempoh: {monthLabelMs(calc.period.start)} – {monthLabelMs(calc.period.end)} · {s.dataQuality.transactionCount} transaksi
      </p>

      <div className="kpis">
        <Kpi label="Aliran Masuk" value={s.totals.inflow} tone="in" />
        <Kpi label="Aliran Keluar" value={s.totals.outflow} tone="out" />
        <Kpi label="Aliran Bersih" value={s.totals.net} tone={s.totals.net >= 0 ? "in" : "out"} wide />
        {s.balances.opening !== null && <Kpi label="Baki Awal" value={s.balances.opening} />}
        {s.balances.closing !== null && <Kpi label="Baki Akhir" value={s.balances.closing} />}
      </div>
      {s.totals.inflowOutflowRatio !== null && (
        <p className="muted small">Nisbah masuk/keluar: {s.totals.inflowOutflowRatio.toFixed(2)}</p>
      )}

      <section className="card">
        <h3 className="section-title">Aliran Tunai Bulanan</h3>
        <MonthlyChart data={calc.monthly} />
      </section>

      <section className="card">
        <h3 className="section-title">Insight AI</h3>
        {meta?.mock && <div className="banner banner-demo">MOD MOCK: teks ini dijana secara tetap untuk ujian, bukan oleh model AI.</div>}
        {insightsError && <div className="banner banner-warn">{insightsError}</div>}
        {insights && (
          <>
            <p>{insights.executiveSummary}</p>
            <h4>Trend Utama</h4>
            <ul className="list">
              {insights.trends.map((t, i) => (
                <li key={i}>
                  <strong>{t.title}</strong> <span className={`tag tag-${t.basis}`}>{t.basis}</span>
                  <div>{t.detail}</div>
                </li>
              ))}
            </ul>
            {insights.risks.length > 0 && (
              <>
                <h4>Risiko</h4>
                <ul className="list">
                  {insights.risks.map((r, i) => (
                    <li key={i}>
                      <strong>{r.title}</strong> <span className={`tag sev-${r.severity}`}>{r.severity}</span>
                      <div>{r.detail}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {insights.expenseObservations.length > 0 && (
              <>
                <h4>Pemerhatian Perbelanjaan</h4>
                <ul className="list">
                  {insights.expenseObservations.map((e, i) => (
                    <li key={i}>
                      <strong>{e.title}</strong>
                      <div>{e.detail}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {insights && (
        <section className="card">
          <h3 className="section-title">Cadangan Tindakan</h3>
          <ol className="list">
            {insights.recommendedActions.map((a, i) => (
              <li key={i}>
                <strong>{a.action}</strong> <span className={`tag sev-${a.priority}`}>{a.priority}</span>
                <div>{a.rationale}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h3 className="section-title">Amaran Kualiti Data</h3>
        <ul className="list quality">
          {calc.reconciliation.map((r) => (
            <li key={r.id} className={r.passed ? "q-ok" : "q-error"}>
              {r.passed ? "✔" : "✖"} {r.label}
              {!r.passed && ` (dibaca ${formatRM(r.actual)}, workbook ${formatRM(r.expected)})`}
            </li>
          ))}
          {calc.issues.map((i) => (
            <li key={i.code} className={`q-${i.severity}`} title={i.sourceRefs.join(", ")}>
              {i.severity === "error" ? "✖" : i.severity === "warning" ? "⚠" : "ℹ"} {i.message}
            </li>
          ))}
          {insights?.dataLimitations.map((d, i) => (
            <li key={`l${i}`} className="q-info">
              ℹ {d}
            </li>
          ))}
          {meta && meta.unverifiedAmounts.length > 0 && (
            <li className="q-warning">⚠ Angka dalam teks AI yang tidak sepadan dengan data: {meta.unverifiedAmounts.join(", ")}</li>
          )}
          {calc.reconciliation.length === 0 && calc.issues.length === 0 && <li className="q-ok">✔ Tiada isu dikesan.</li>}
        </ul>
        {meta && (
          <p className="muted small">
            AI: {meta.provider}/{meta.model} · {new Date(meta.generatedAt).toLocaleString("ms-MY")}
          </p>
        )}
        <p className="muted small">
          Angka dikira terus daripada data (bukan oleh AI). Insight AI bukan nasihat kewangan profesional.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone, wide }: { label: string; value: number; tone?: "in" | "out"; wide?: boolean }) {
  return (
    <div className={`kpi ${wide ? "kpi-wide" : ""} ${tone ? `kpi-${tone}` : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{formatRM(value)}</div>
    </div>
  );
}
