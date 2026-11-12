/**
 * Synthetic workbook that reproduces the layout of the real
 * "Akaun Simple 2026 v2.26.02.xlsm" template (labels copied verbatim from the
 * template, including trailing spaces). Contains NO customer data.
 */
import { InMemoryWorkbookPort } from "../../apps/excel-addin/src/office/memory-port";

const PAYMENT_HEADERS: Record<string, string> = {
  A: "No. ", B: "Tarikh", C: "Butiran", D: "Jumlah (RM)", E: "Gaji / EPF / SOCSO", F: "Komisen", G: "Bonus",
  H: "Postage & Penghantaran", I: "Bil Telefon & Internet ", J: "Alat Tulis & Percetakan", K: "Keraian & Hiburan",
  L: "Lain-lain Perbelanjaan", M: "Bil Utiliti", N: "Perbelanjaan Berkaitan IT", O: "Caj Pengangkutan", P: "Insuran",
  Q: "Consultancy Fee", R: "Lesen", S: "Legal Fee", T: "Cas Kerajaan", U: " Audit ", V: "Petrol, Parking & Tol", W: "Hotel",
  X: "Membaiki & Menyelenggara Peralatan", Y: "Membaiki & Menyelenggara Umum", Z: "Membaiki & Menyelenggara Kenderaan",
  AA: "Pemasaran", AB: "Sewa", AC: "Caj Bank", AD: "Caj Faedah", AE: "Bayaran Kepada Pembekal", AF: "Clearing & Forwarding",
  AG: "Ambilan", AH: "Hartanah", AI: "Bekalan & Peralatan", AJ: "Intengible Asset", AK: "Kelengkapan Komputer",
  AL: "Kenderaan", AM: "Security Deposits", AN: "Hire Purchase", AO: "Term Loan",
};
const PAYMENT_GROUPS: Record<string, string> = {
  E: "PERBELANJAAN PENTADBIRAN", Q: "PERBELANJAAN PROFESIONAL", V: "PERBELANJAAN PERJALANAN", X: "PEMBAIKAN & PENYELENGGARAAN",
  AC: "CAJ KEWANGAN", AE: "KOS JUALAN", AH: "ASET BUKAN SEMASA", AN: "LIABILITI SEMASA",
};

export interface DepositRow { date: unknown; desc?: string; revenue?: number; capital?: number; refunds?: number; loan?: number }
export interface PaymentRow { date: unknown; desc?: string; amounts: Record<string, number> }

export interface FixtureOptions {
  version?: string;
  deposits?: DepositRow[];
  payments?: PaymentRow[];
  openingBalance?: number | "";
  businessName?: string;
  /** Rows in each transaction table before the Total row (template has 360/359). */
  depositCapacity?: number;
  paymentCapacity?: number;
  /** Override the workbook's own Total values (to simulate reconciliation mismatch). */
  depositTotalOverride?: number;
  paymentTotalOverride?: number;
  extraSheets?: string[];
}

export function buildAkaunSimpleV2(opts: FixtureOptions = {}): InMemoryWorkbookPort {
  const port = new InMemoryWorkbookPort();
  const depCap = opts.depositCapacity ?? 30;
  const payCap = opts.paymentCapacity ?? 30;

  const bs: Record<string, unknown> = { A3: "Balance Sheet", H12: 0 };
  port.addSheet("Balance Sheet", { cells: bs, protected: true });
  port.addSheet("P&L", { cells: { A3: "Profit & Loss", G30: 0 }, protected: true });
  port.addSheet("SOCI", { cells: {}, protected: true, visibility: "Hidden" });
  port.addSheet("Cash Flow", {
    cells: { A3: "Cash Flow Statement", G37: "=G22+G27+G35", G38: "=Utama!F10", G39: "=G37+G38" },
    protected: true,
  });
  port.addSheet("Assets", { cells: {}, protected: true });
  port.addSheet("Notes", { cells: {}, protected: true });
  port.addSheet("Trial Balance", { cells: {}, protected: true });
  port.addSheet("Cukai & Zakat", { cells: {}, protected: true });

  // ---- Deposits ----
  const dep: Record<string, unknown> = {
    A1: "=Utama!F5", A3: "Bookkeeping", A4: "Penerimaan Tunai & Bank",
    A5: "Tarikh", B5: "Butiran", C5: "Jumlah Deposit (RM)", D5: "Pendapatan / Revenue",
    E5: "Modal Pemilik & Rakan Kongsi", F5: "Refunds", G5: "Pinjaman",
  };
  let depSum = 0;
  (opts.deposits ?? []).forEach((r, i) => {
    const row = 6 + i;
    dep[`A${row}`] = r.date;
    if (r.desc) dep[`B${row}`] = r.desc;
    const parts: [string, number | undefined][] = [["D", r.revenue], ["E", r.capital], ["F", r.refunds], ["G", r.loan]];
    let rowSum = 0;
    for (const [col, v] of parts) if (v !== undefined) { dep[`${col}${row}`] = v; rowSum += v; }
    dep[`C${row}`] = rowSum;
    depSum += rowSum;
  });
  const depTotalRow = 6 + depCap;
  dep[`B${depTotalRow}`] = "Total";
  dep[`C${depTotalRow}`] = opts.depositTotalOverride ?? Math.round(depSum * 100) / 100;
  port.addSheet("Deposits", { cells: dep, protected: true });

  // ---- Payments ----
  const pay: Record<string, unknown> = { A1: "=Utama!F5", A3: "Bookkeeping", A4: "Pembayaran Tunai & Bank" };
  for (const [col, v] of Object.entries(PAYMENT_HEADERS)) pay[`${col}5`] = v;
  for (const [col, v] of Object.entries(PAYMENT_GROUPS)) pay[`${col}4`] = v;
  let paySum = 0;
  (opts.payments ?? []).forEach((r, i) => {
    const row = 6 + i;
    pay[`A${row}`] = i + 1;
    pay[`B${row}`] = r.date;
    if (r.desc) pay[`C${row}`] = r.desc;
    let rowSum = 0;
    for (const [col, v] of Object.entries(r.amounts)) { pay[`${col}${row}`] = v; rowSum += v; }
    pay[`D${row}`] = rowSum;
    paySum += rowSum;
  });
  const payTotalRow = 6 + payCap;
  pay[`C${payTotalRow}`] = "Total";
  pay[`D${payTotalRow}`] = opts.paymentTotalOverride ?? Math.round(paySum * 100) / 100;
  port.addSheet("Payments", { cells: pay, protected: true });

  port.addSheet("Mapping", { cells: {}, visibility: "Hidden" });
  port.addSheet("Utama", {
    cells: {
      B1: "UTAMA", D5: "Nama Perniagaan", F5: opts.businessName ?? "Syarikat Ujian", D6: "No. SSM", D7: "Tahun Berakhir",
      D10: "Baki Mula", F10: opts.openingBalance ?? 5000, AF25: opts.version ?? "v2.26.02",
    },
    protected: true,
  });
  for (const s of opts.extraSheets ?? []) port.addSheet(s, { cells: { A1: "user content" } });
  return port;
}

/** Excel serial for a yyyy-mm-dd date (1900 date system). */
export const serial = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000);

export const ORIGINAL_SHEETS = [
  "Balance Sheet", "P&L", "SOCI", "Cash Flow", "Assets", "Notes", "Trial Balance", "Cukai & Zakat", "Deposits", "Payments", "Mapping", "Utama",
];
