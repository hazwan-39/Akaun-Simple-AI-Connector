import {
  BANK_LEDGER_SHEET,
  BANK_LISTS_SHEET,
  BANK_PROFILES,
  BANK_TRANSFER_SHEET,
  formatRM,
  parseBankStatement,
  type BankParseIssueCode,
  type BankParseResult,
} from "@akaun/shared";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app-context";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { buildPreviewWorkbook } from "../dev/preview-workbook";
import { WriteGuardError } from "../office/dashboard/guard";
import { InMemoryWorkbookPort } from "../office/memory-port";
import type { WorkbookPort } from "../office/workbook-port";
import { LedgerFullError } from "../skills/bankimport/ledger";
import { PdfReadError, readPdfItems } from "../skills/bankimport/pdf";
import {
  confirmTransfer,
  goToPasteCell,
  importStatement,
  ledgerSummary,
  prepareTransfer,
  selectBlock,
  type LedgerSummary,
  type PrepareOutcome,
} from "../skills/bankimport/service";
import { BankSheetsBlockedError, inspectBankSheets } from "../skills/bankimport/sheets";
import { TransferBlockedError, type CellDiff, type TransferTarget } from "../skills/bankimport/transfer";

const ISSUE_MS: Record<BankParseIssueCode, string> = {
  NO_TRANSACTIONS: "Tiada transaksi ditemui dalam PDF ini.",
  NO_OPENING_BALANCE: "Baki awal tidak ditemui.",
  NO_CLOSING_BALANCE: "Baki akhir tidak ditemui.",
  RUNNING_BALANCE_MISMATCH: "Baki berjalan pada sesetengah baris tidak sepadan dengan amaun.",
  CLOSING_BALANCE_MISMATCH: "Baki awal + masuk − keluar tidak sama dengan baki akhir penyata.",
  DIRECTION_UNKNOWN: "Arah (masuk/keluar) sesetengah transaksi tidak dapat ditentukan.",
  NO_RUNNING_BALANCE: "Penyata ini tiada baki berjalan, jadi tidak boleh disahkan. Gunakan e-statement bulanan rasmi, bukan eksport sejarah transaksi.",
  UNSUPPORTED_STATEMENT: "Jenis penyata ini tidak disokong.",
  UNKNOWN_BANK: "Bank tidak dikenali.",
  YEAR_UNKNOWN: "Tahun transaksi tidak dapat ditentukan kerana tempoh penyata tidak ditemui.",
};

const fmt = (sen: number | null) => (sen === null ? "—" : formatRM(sen / 100));
const bankLabel = (id: string) => BANK_PROFILES.find((p) => p.id === id)?.label ?? "Bank tidak dikenali";
const isPreview = (port: WorkbookPort | null) => port instanceof InMemoryWorkbookPort;

export function BankImportPage({ onBack }: { onBack: () => void }) {
  const { host, port: excelPort, workbook } = useApp();
  // Outside Excel (development preview only) the flow runs against an empty in-memory template.
  const previewPort = useMemo(() => (!host.isExcel && import.meta.env.DEV ? buildPreviewWorkbook() : null), [host.isExcel]);
  const port: WorkbookPort | null = excelPort ?? previewPort;
  // Development preview only: lets a developer set categories from the console (there is no Excel grid).
  if (previewPort && import.meta.env.DEV) (window as unknown as { __akaunPreview?: InMemoryWorkbookPort }).__akaunPreview = previewPort;
  const writeApi = previewPort ? true : host.writeApiSupported;
  const status = previewPort ? "supported" : workbook?.detection.status;
  const workbookOk = status === "supported" || status === "disabled";

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<BankParseResult | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [prepared, setPrepared] = useState<PrepareOutcome | null>(null);
  const [diffs, setDiffs] = useState<CellDiff[] | null>(null);

  const refresh = async () => {
    if (!port || !workbookOk) return;
    try {
      setSummary(await ledgerSummary(port, writeApi));
    } catch {
      setSummary(null);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, workbookOk]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
    await refresh();
  };

  async function onFile(file: File | undefined) {
    setParsed(null);
    setFileName(file?.name ?? null);
    setPrepared(null);
    setDiffs(null);
    if (!file) return;
    await run(async () => {
      const items = await readPdfItems(file);
      const result = parseBankStatement(items);
      setParsed(result);
      if (!account && result.bank !== "UNKNOWN") setAccount(bankLabel(result.bank));
    });
  }

  async function onImport(userConfirmedCreate: boolean) {
    if (!port || !parsed) return;
    setConfirmCreate(false);
    if (!userConfirmedCreate) {
      const insp = await inspectBankSheets(port, writeApi);
      if (insp.action === "create") {
        setConfirmCreate(true);
        return;
      }
    }
    await run(async () => {
      const r = await importStatement(port, parsed, account, { writeApiSupported: writeApi, userConfirmedCreate });
      setNotice(
        r.added
          ? `${r.added} transaksi ditambah ke "${BANK_LEDGER_SHEET}" (baris ${r.firstRow}–${r.lastRow}).${r.duplicates ? ` ${r.duplicates} sudah ada dan dilangkau.` : ""} Pilih kategori di lajur H.`
          : `Tiada transaksi baharu: ${r.duplicates} transaksi sudah ada dalam Buku Bank.`,
      );
    });
  }

  async function onPrepare(target: TransferTarget) {
    if (!port) return;
    setDiffs(null);
    await run(async () => {
      const r = await prepareTransfer(port, target);
      setPrepared(r);
      const skipped = r.eligibility.invalid.length;
      setNotice(`Blok ${r.count} baris sedia dan sudah dipilih di "${BANK_TRANSFER_SHEET}". Tekan Ctrl+C.${skipped ? ` ${skipped} baris dilangkau kerana kategori bukan lajur sheet ini.` : ""}`);
    });
  }

  async function onConfirm() {
    if (!port) return;
    await run(async () => {
      const r = await confirmTransfer(port);
      if (r.ok) {
        setPrepared(null);
        setDiffs(null);
        setNotice(`Disahkan: ${r.moved} baris kini dalam ${r.sheet} dan ditanda "Dipindah" dalam Buku Bank.`);
      } else if ("diffs" in r) {
        setDiffs(r.diffs);
        setError(`Paste belum sepadan (${r.diffs.length} sel berbeza). Tiada baris ditanda. Semak dan betulkan, kemudian sahkan semula.`);
      } else {
        setError("Tiada blok yang menunggu paste.");
      }
    });
  }

  /** Preview only: imitates the user's Paste Special → Formulas. */
  async function onPreviewPaste() {
    if (!(port instanceof InMemoryWorkbookPort) || !summary?.pending) return;
    const { sheet, startRow, count } = summary.pending;
    const lastCol = sheet === "Deposits" ? "G" : "AO";
    port.pasteFormulas(BANK_TRANSFER_SHEET, `A5:${lastCol}${4 + count}`, sheet, `A${startRow}`);
    setNotice(`(Pratonton) Blok telah "dipaste" ke ${sheet}!A${startRow}.`);
  }

  if (!port) {
    return (
      <Shell onBack={onBack}>
        <div className="banner banner-error">Ciri ini hanya tersedia dalam Excel.</div>
      </Shell>
    );
  }
  if (!workbookOk) {
    return (
      <Shell onBack={onBack}>
        <div className="banner banner-error">{workbook?.detection.message ?? "Workbook Akaun Simple v2.26.02 tidak dikesan."} Import penyata bank perlukan workbook Akaun Simple yang disokong.</div>
      </Shell>
    );
  }

  const period = parsed?.transactions.length ? `${parsed.transactions[0]!.date} hingga ${parsed.transactions[parsed.transactions.length - 1]!.date}` : "—";
  const issues = parsed ? [...new Set(parsed.issues.map((i) => i.code))] : [];

  return (
    <Shell onBack={onBack}>
      {isPreview(port) && <div className="banner banner-demo">PRATONTON: workbook contoh kosong dalam pelayar, bukan Excel.</div>}

      <section className="card">
        <h3 className="section-title">1. Muat naik penyata</h3>
        <p className="muted small">E-statement PDF bulanan dari bank. Fail dibaca dalam Excel sahaja, tidak dihantar ke mana-mana.</p>
        <label className="field">
          <span>Fail PDF</span>
          <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {fileName && !parsed && busy && <p className="muted small">Membaca {fileName}…</p>}

        {parsed && (
          <>
            <table className="kv">
              <tbody>
                <tr><th>Bank</th><td>{bankLabel(parsed.bank)}</td></tr>
                <tr><th>Tempoh</th><td>{period}</td></tr>
                <tr><th>Transaksi</th><td>{parsed.transactions.length}</td></tr>
                <tr><th>Baki awal</th><td>{fmt(parsed.openingSen)}</td></tr>
                <tr><th>Masuk</th><td>{fmt(parsed.totals.inSen)}</td></tr>
                <tr><th>Keluar</th><td>{fmt(parsed.totals.outSen)}</td></tr>
                <tr><th>Baki akhir</th><td>{fmt(parsed.closingSen)}</td></tr>
              </tbody>
            </table>
            {parsed.reconciled ? (
              <div className="banner banner-ok">Disahkan: setiap baki berjalan dan baki akhir sepadan tepat ke sen.</div>
            ) : (
              <div className="banner banner-error">
                Penyata tidak boleh diimport:
                <ul>
                  {issues.filter((c) => c !== "UNKNOWN_BANK" || issues.length === 1).map((c) => (
                    <li key={c}>{c === "UNSUPPORTED_STATEMENT" ? parsed.issues.find((i) => i.code === c)?.detail ?? ISSUE_MS[c] : ISSUE_MS[c]}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsed.reconciled && (
              <>
                <label className="field">
                  <span>Nama akaun (contoh: Maybank 5123)</span>
                  <input value={account} maxLength={60} onChange={(e) => setAccount(e.target.value)} />
                </label>
                <button className="btn btn-primary" disabled={busy || !account.trim()} onClick={() => void onImport(false)}>
                  Tambah ke Buku Bank
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">2. Pilih kategori</h3>
        {summary?.exists ? (
          <>
            <p className="small">
              Pilih kategori di lajur <strong>H</strong> sheet <strong>{BANK_LEDGER_SHEET}</strong>. Masuk → kategori Deposits, Keluar → kategori Payments. Guna
              "Pindahan Dalaman" untuk pindahan antara akaun sendiri. Lajur <strong>N</strong> ialah butiran ringkas (≤ 43 aksara) yang akan masuk ke
              Deposits/Payments. Ubah jika perlu. Butiran penuh kekal di lajur C.
            </p>
            <table className="kv">
              <tbody>
                <tr><th>Jumlah baris</th><td>{summary.total}</td></tr>
                <tr><th>Belum berkategori</th><td>{summary.uncategorisedIn} masuk · {summary.uncategorisedOut} keluar</td></tr>
                <tr><th>Sudah dipindah</th><td>{summary.moved}</td></tr>
              </tbody>
            </table>
            <div className="btn-grid">
              <button className="btn" disabled={busy} onClick={() => void run(async () => port.selectRange(BANK_LEDGER_SHEET, "H2"))}>Buka Buku Bank</button>
              <button className="btn" disabled={busy} onClick={() => void refresh()}>Muat semula status</button>
            </div>
          </>
        ) : (
          <p className="muted small">Buku Bank belum dicipta. Tambah penyata pertama di atas.</p>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">3. Pindah ke Deposits / Payments</h3>
        {summary?.exists ? (
          <>
            <div className="btn-grid">
              <button className="btn btn-primary" disabled={busy || !summary.readyIn} onClick={() => void onPrepare("deposits")}>
                Sedia untuk Deposits ({summary.readyIn})
              </button>
              <button className="btn btn-primary" disabled={busy || !summary.readyOut} onClick={() => void onPrepare("payments")}>
                Sedia untuk Payments ({summary.readyOut})
              </button>
            </div>
            {summary.pending && (
              <div className="steps">
                <ol className="small">
                  <li>
                    Copy blok di <strong>{BANK_TRANSFER_SHEET}</strong> ({summary.pending.count} baris). <button className="link" onClick={() => void run(() => selectBlock(port))}>Pilih blok semula</button>
                  </li>
                  <li>
                    Pergi ke <strong>{summary.pending.sheet}!A{summary.pending.startRow}</strong>.{" "}
                    <button className="link" onClick={() => void run(async () => void (await goToPasteCell(port)))}>Pergi ke sel</button>
                  </li>
                  <li>
                    Klik kanan → <strong>Paste Special → Formulas</strong> (atau Ctrl+Alt+V, F, Enter). Blok sudah mengandungi formula Jumlah yang sama dengan template, dan
                    Excel akan menyesuaikannya ke baris baharu. Jangan guna Paste Values: Jumlah akan jadi nombor tetap.
                  </li>
                  <li>Tekan Sahkan Pindahan.</li>
                </ol>
                <div className="btn-grid">
                  {isPreview(port) && (
                    <button className="btn" disabled={busy} onClick={() => void onPreviewPaste()}>
                      (Pratonton) Simulasi paste
                    </button>
                  )}
                  <button className="btn btn-primary" disabled={busy} onClick={() => void onConfirm()}>
                    Sahkan Pindahan
                  </button>
                </div>
              </div>
            )}
            {prepared && prepared.eligibility.invalid.length > 0 && (
              <p className="muted small">{prepared.eligibility.invalid.length} baris ada kategori yang bukan lajur sheet sasaran dan tidak dimasukkan.</p>
            )}
          </>
        ) : (
          <p className="muted small">Tiada data lagi.</p>
        )}
        {diffs && diffs.length > 0 && (
          <table className="diffs small">
            <thead>
              <tr><th>Sel</th><th>Dijangka</th><th>Sebenar</th></tr>
            </thead>
            <tbody>
              {diffs.slice(0, 12).map((d) => (
                <tr key={`${d.col}${d.row}`}>
                  <td>{d.col}{d.row}</td>
                  <td>{String(d.expected)}</td>
                  <td>{d.actual === "" ? "(kosong)" : String(d.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-ok">{notice}</div>}

      {confirmCreate && (
        <ConfirmDialog title="Cipta sheet Buku Bank?" confirmLabel="Ya, cipta" onCancel={() => setConfirmCreate(false)} onConfirm={() => void onImport(true)}>
          <p>Add-in akan menambah sheet baharu berikut:</p>
          <ul>
            <li><strong>{BANK_LEDGER_SHEET}</strong>: transaksi bank, satu baris setiap transaksi</li>
            <li><strong>{BANK_TRANSFER_SHEET}</strong>: blok untuk dicopy ke Deposits / Payments</li>
            <li><strong>{BANK_LISTS_SHEET}</strong>: senarai kategori untuk dropdown (tersembunyi)</li>
          </ul>
          <p>Deposits, Payments dan sheet asal lain tidak akan diubah oleh add-in. Hanya anda yang paste ke situ.</p>
        </ConfirmDialog>
      )}
    </Shell>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button className="link" onClick={onBack}>
        ← Kemahiran AI
      </button>
      <h2 className="page-title">Import Penyata Bank</h2>
      {children}
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof PdfReadError || err instanceof TransferBlockedError || err instanceof BankSheetsBlockedError || err instanceof LedgerFullError) return err.message;
  if (err instanceof WriteGuardError) return "Penulisan disekat oleh semakan keselamatan. Tiada perubahan dibuat.";
  return `Ralat: ${err instanceof Error ? err.message : "tidak diketahui"}. Sheet asal tidak diubah.`;
}
