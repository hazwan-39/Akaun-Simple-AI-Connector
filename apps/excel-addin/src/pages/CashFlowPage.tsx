import { AI_DASHBOARD_SHEET, AI_DATA_SHEET, monthLabelMs, type PeriodSelection } from "@akaun/shared";
import { useRef, useState } from "react";
import { useApp } from "../app-context";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Results } from "../components/Results";
import { demoAdapter } from "../office/adapters/registry";
import { BLOCKED_MESSAGES_MS, inspectDashboard, RenderBlockedError, renderDashboard, type DashboardInspection } from "../office/dashboard/renderer";
import { WriteGuardError } from "../office/dashboard/guard";
import { requestCashFlowInsights } from "../services/api-client";
import { PHASE_LABEL_MS, runCashFlowAnalysis, toDashboardModel, type AnalysisResult, type Phase } from "../skills/cashflow/pipeline";

type Source = "workbook" | "demo";

export function CashFlowPage({ onBack }: { onBack: () => void }) {
  const { host, port, workbook, accessKey } = useApp();
  const realAvailable = workbook?.detection.status === "supported" && workbook.adapter !== null;
  const [sourceChoice, setSourceChoice] = useState<Source | null>(null);
  // Default to the real workbook whenever a supported one is detected; demo only by explicit choice.
  const source: Source = sourceChoice ?? (realAvailable ? "workbook" : "demo");
  const [demoAcknowledged, setDemoAcknowledged] = useState(false);
  const setSource = (s: Source) => {
    if (s === source) return;
    setSourceChoice(s);
    setResult(null);
    setPeriod(null);
    setPhase("ready");
    setError(null);
    setNotice(null);
  };
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [period, setPeriod] = useState<PeriodSelection | null>(null);
  const [confirm, setConfirm] = useState<DashboardInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const canWrite = host.isExcel && port !== null;
  const adapter = source === "workbook" && realAvailable ? workbook!.adapter! : demoAdapter;

  async function analyse(): Promise<AnalysisResult | null> {
    setError(null);
    setNotice(null);
    try {
      const r = await runCashFlowAnalysis({
        port,
        adapter,
        period,
        onPhase: setPhase,
        requestInsights: accessKey ? (s) => requestCashFlowInsights(s, accessKey) : null,
      });
      setResult(r);
      if (!period) setPeriod(r.calc.period);
      return r;
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Ralat tidak diketahui.");
      return null;
    }
  }

  async function onGenerate() {
    setBusy(true);
    await analyse();
    setBusy(false);
  }

  /** Re-read, recalculate, regenerate; refresh the AI worksheet if we own one. */
  async function onUpdate() {
    setBusy(true);
    const r = await analyse();
    if (r && canWrite) {
      try {
        const insp = await inspectDashboard(port!, host.writeApiSupported);
        if (insp.action === "update") {
          await renderDashboard(port!, toDashboardModel(r), { writeApiSupported: host.writeApiSupported, userConfirmedCreate: false });
          setNotice(`Worksheet "${AI_DASHBOARD_SHEET}" telah dikemas kini.`);
        }
      } catch (err) {
        setError(writeErrorMessage(err));
      }
    }
    setBusy(false);
  }

  async function onCreateWorksheet() {
    if (!result || !canWrite) return;
    setError(null);
    setNotice(null);
    try {
      const insp = await inspectDashboard(port!, host.writeApiSupported);
      if (insp.action === "blocked") {
        setError(BLOCKED_MESSAGES_MS[insp.blockedReason!]);
        return;
      }
      if (insp.action === "create") {
        setConfirm(insp);
        return;
      }
      await doRender(false);
    } catch (err) {
      setError(writeErrorMessage(err));
    }
  }

  async function doRender(userConfirmedCreate: boolean) {
    if (!result) return;
    setConfirm(null);
    setBusy(true);
    try {
      const outcome = await renderDashboard(port!, toDashboardModel(result), { writeApiSupported: host.writeApiSupported, userConfirmedCreate });
      setNotice(outcome === "created" ? `Worksheet "${AI_DASHBOARD_SHEET}" telah dicipta.` : `Worksheet "${AI_DASHBOARD_SHEET}" telah dikemas kini.`);
    } catch (err) {
      setError(writeErrorMessage(err));
    }
    setBusy(false);
  }

  const months = result?.calc.availableMonths ?? [];
  const running = busy || ["reading", "validating", "calculating", "generating"].includes(phase);

  return (
    <div>
      <button className="link" onClick={onBack}>
        ← Kemahiran AI
      </button>
      <h2 className="page-title">Cash Flow Intelligence</h2>

      <section className="card">
        <div className="field">
          <span>Sumber data</span>
          <div className="seg">
            <button className={source === "workbook" ? "on" : ""} disabled={!realAvailable} onClick={() => setSource("workbook")}>
              Workbook ini
            </button>
            <button className={source === "demo" ? "on" : ""} onClick={() => setSource("demo")}>
              Data demo
            </button>
          </div>
          {!realAvailable && <p className="muted small">{workbook?.detection.message ?? "Workbook Akaun Simple tidak dikesan."}</p>}
        </div>

        {source === "demo" && !demoAcknowledged && (
          <div className="banner banner-demo">
            Mod demo menggunakan data contoh, <strong>bukan</strong> data workbook anda.
            <button className="btn btn-small" onClick={() => setDemoAcknowledged(true)}>
              Saya faham, guna data demo
            </button>
          </div>
        )}
        {source === "demo" && demoAcknowledged && <div className="banner banner-demo">DATA DEMO: bukan data workbook anda.</div>}

        <div className="field">
          <span>Tempoh laporan</span>
          {months.length > 0 && period ? (
            <div className="period">
              <select value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} aria-label="Bulan mula">
                {months.map((m) => (
                  <option key={m} value={m} disabled={m > period.end}>
                    {monthLabelMs(m)}
                  </option>
                ))}
              </select>
              <span>hingga</span>
              <select value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} aria-label="Bulan akhir">
                {months.map((m) => (
                  <option key={m} value={m} disabled={m < period.start}>
                    {monthLabelMs(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="muted small">Automatik: semua bulan yang ada data (maksimum 24 bulan).</p>
          )}
        </div>

        {!accessKey && <p className="muted small">Tiada kod akses pilot: angka akan dikira, tetapi insight AI tidak dijana. Tetapkan kod di ⚙.</p>}

        <div className="btn-grid">
          <button className="btn btn-primary" disabled={running || (source === "demo" && !demoAcknowledged)} onClick={onGenerate}>
            Jana Analisis
          </button>
          <button className="btn" disabled={running || !result} onClick={onUpdate}>
            Kemas Kini Analisis
          </button>
          <button className="btn" disabled={!result} onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}>
            Lihat Keputusan
          </button>
          <button
            className="btn"
            disabled={running || !result || !canWrite}
            onClick={onCreateWorksheet}
            title={canWrite ? "" : "Hanya tersedia dalam Excel"}
          >
            Cipta Worksheet AI
          </button>
        </div>

        <div className={`phase phase-${phase}`} role="status" aria-live="polite">
          <span className="dot" /> {PHASE_LABEL_MS[phase]}
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        {notice && <div className="banner banner-ok">{notice}</div>}
      </section>

      <div ref={resultsRef}>{result && <Results result={result} />}</div>

      {confirm && (
        <ConfirmDialog title="Cipta worksheet AI?" confirmLabel="Ya, cipta" onCancel={() => setConfirm(null)} onConfirm={() => void doRender(true)}>
          <p>Add-in akan menambah sheet baharu berikut:</p>
          <ul>
            {confirm.dashboard === "missing" && (
              <li>
                <strong>{AI_DASHBOARD_SHEET}</strong>: papan pemuka dengan carta dan insight
              </li>
            )}
            {confirm.data === "missing" && (
              <li>
                <strong>{AI_DATA_SHEET}</strong>: data sokongan carta (tersembunyi)
              </li>
            )}
          </ul>
          <p>Tiada sheet, formula, makro atau data asal Akaun Simple akan diubah. Anda boleh memadam sheet AI ini pada bila-bila masa.</p>
          {result?.calc.status === "demo" && <p className="error">Nota: worksheet ini akan mengandungi DATA DEMO.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}

function writeErrorMessage(err: unknown): string {
  if (err instanceof RenderBlockedError) return err.message;
  if (err instanceof WriteGuardError) return "Penulisan disekat oleh semakan keselamatan. Tiada perubahan dibuat pada sheet asal.";
  return `Worksheet AI tidak dapat ditulis: ${err instanceof Error ? err.message : "ralat tidak diketahui"}. Sheet asal tidak diubah.`;
}
