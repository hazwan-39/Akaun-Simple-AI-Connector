/**
 * Akaun Simple 2026 – workbook layout v2.26.02
 *
 * Source of truth: inspection of "Akaun Simple 2026 v2.26.02.xlsm" (blank
 * template, no transactions) on 2026-11-12. See docs/workbook-mapping.md.
 * Every label below is verified at runtime before any data is read; if any
 * label differs, the adapter refuses to read.
 */
export const AS_V2_SUPPORTED_VERSIONS = ["v2.26.02"] as const;

export const AS_V2 = {
  version: { sheet: "Utama", cell: "AF25" },
  business: { sheet: "Utama", name: "F5", ssm: "F6", yearEnd: "F7", openingBalance: "F10", openingBalanceLabel: { cell: "D10", text: "Baki Mula" } },
  requiredSheets: ["Utama", "Deposits", "Payments", "Cash Flow"],
  deposits: {
    sheet: "Deposits",
    headerRow: 5,
    firstDataRow: 6,
    dateCol: "A",
    descCol: "B",
    totalCol: "C",
    totalLabelCol: "B",
    headers: {
      A: "Tarikh",
      B: "Butiran",
      C: "Jumlah Deposit (RM)",
      D: "Pendapatan / Revenue",
      E: "Modal Pemilik & Rakan Kongsi",
      F: "Refunds",
      G: "Pinjaman",
    } as Record<string, string>,
    /** Category columns and the cash-flow group each belongs to. */
    categories: [
      { col: "D", group: "Operasi" },
      { col: "E", group: "Pembiayaan" },
      { col: "F", group: "Operasi" },
      { col: "G", group: "Pembiayaan" },
    ],
    lastCol: "G",
  },
  payments: {
    sheet: "Payments",
    groupRow: 4,
    headerRow: 5,
    firstDataRow: 6,
    dateCol: "B",
    descCol: "C",
    totalCol: "D",
    totalLabelCol: "C",
    headers: {
      A: "No.",
      B: "Tarikh",
      C: "Butiran",
      D: "Jumlah (RM)",
      E: "Gaji / EPF / SOCSO",
      F: "Komisen",
      G: "Bonus",
      H: "Postage & Penghantaran",
      I: "Bil Telefon & Internet",
      J: "Alat Tulis & Percetakan",
      K: "Keraian & Hiburan",
      L: "Lain-lain Perbelanjaan",
      M: "Bil Utiliti",
      N: "Perbelanjaan Berkaitan IT",
      O: "Caj Pengangkutan",
      P: "Insuran",
      Q: "Consultancy Fee",
      R: "Lesen",
      S: "Legal Fee",
      T: "Cas Kerajaan",
      U: "Audit",
      V: "Petrol, Parking & Tol",
      W: "Hotel",
      X: "Membaiki & Menyelenggara Peralatan",
      Y: "Membaiki & Menyelenggara Umum",
      Z: "Membaiki & Menyelenggara Kenderaan",
      AA: "Pemasaran",
      AB: "Sewa",
      AC: "Caj Bank",
      AD: "Caj Faedah",
      AE: "Bayaran Kepada Pembekal",
      AF: "Clearing & Forwarding",
      AG: "Ambilan",
      AH: "Hartanah",
      AI: "Bekalan & Peralatan",
      AJ: "Intengible Asset",
      AK: "Kelengkapan Komputer",
      AL: "Kenderaan",
      AM: "Security Deposits",
      AN: "Hire Purchase",
      AO: "Term Loan",
    } as Record<string, string>,
    firstCategoryCol: "E",
    lastCol: "AO",
  },
  /** Upper bound when searching for the "Total" row (users may insert rows, see FAQ 11). */
  maxScanRow: 5000,
} as const;

export const normLabel = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
