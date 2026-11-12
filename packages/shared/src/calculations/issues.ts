import type { IssueSeverity } from "../types/cashflow.js";

export const DATA_ISSUE_CODES = [
  "MISSING_AMOUNT",
  "INVALID_AMOUNT",
  "INVALID_DATE",
  "MISSING_DATE",
  "NEGATIVE_AMOUNT",
  "DUPLICATE_SOURCE_ROW",
  "POSSIBLE_DUPLICATE",
  "INTERNAL_TRANSFER_EXCLUDED",
  "NON_CASH_EXCLUDED",
  "OUT_OF_PERIOD",
  "MISSING_MONTHS",
  "NO_OPENING_BALANCE",
  "PERIOD_TOO_LONG",
  "NO_TRANSACTIONS",
  "RECONCILIATION_MISMATCH",
  "DEMO_DATA",
] as const;

export type DataIssueCode = (typeof DATA_ISSUE_CODES)[number];

/** Bahasa Melayu message templates. `{n}` is replaced by the count. */
export const ISSUE_TEXT: Record<DataIssueCode, { severity: IssueSeverity; message: string }> = {
  MISSING_AMOUNT: { severity: "info", message: "{n} baris bertarikh tanpa jumlah diabaikan." },
  INVALID_AMOUNT: { severity: "warning", message: "{n} nilai jumlah tidak sah (bukan nombor) diabaikan." },
  INVALID_DATE: { severity: "warning", message: "{n} transaksi mempunyai tarikh tidak sah dan dikecualikan daripada analisis bulanan." },
  MISSING_DATE: { severity: "warning", message: "{n} transaksi tiada tarikh dan dikecualikan daripada analisis bulanan." },
  NEGATIVE_AMOUNT: { severity: "warning", message: "{n} jumlah negatif dikesan (mungkin pembetulan/pembalikan). Sila semak." },
  DUPLICATE_SOURCE_ROW: { severity: "warning", message: "{n} rekod sumber yang sama dibaca lebih sekali dan hanya dikira sekali." },
  POSSIBLE_DUPLICATE: { severity: "warning", message: "{n} transaksi kelihatan berulang (tarikh, butiran dan jumlah sama). Ia tetap dikira — sila sahkan." },
  INTERNAL_TRANSFER_EXCLUDED: { severity: "info", message: "{n} pindahan dalaman antara akaun tunai/bank dikecualikan." },
  NON_CASH_EXCLUDED: { severity: "info", message: "{n} entri bukan tunai dikecualikan." },
  OUT_OF_PERIOD: { severity: "info", message: "{n} transaksi di luar tempoh laporan yang dipilih tidak dikira." },
  MISSING_MONTHS: { severity: "warning", message: "{n} bulan dalam tempoh laporan tiada sebarang transaksi." },
  NO_OPENING_BALANCE: { severity: "info", message: "Baki tunai awal tidak tersedia; baki akhir tidak dapat dikira." },
  PERIOD_TOO_LONG: { severity: "warning", message: "Tempoh laporan dihadkan kepada 24 bulan terakhir." },
  NO_TRANSACTIONS: { severity: "error", message: "Tiada transaksi tunai yang sah ditemui untuk tempoh ini." },
  RECONCILIATION_MISMATCH: { severity: "error", message: "{n} semakan penyesuaian gagal. Angka belum boleh dianggap sah." },
  DEMO_DATA: { severity: "warning", message: "Ini DATA DEMO, bukan data workbook anda." },
};
