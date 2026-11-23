/**
 * Buku Bank: the add-in-owned ledger sheet that holds imported bank transactions.
 * One row per transaction. The user edits Kategori (H), Catatan (M) and, if wanted, Butiran ringkas (N):
 * the text that goes into the Deposits / Payments Butiran column (~43 characters wide in the template).
 */
import {
  BANK_CATEGORY_IGNORE,
  BANK_CATEGORY_INTERNAL,
  BANK_LEDGER_SHEET,
  BANK_LISTS_SHEET,
  sanitizeCellText,
  shortDescription,
  type BankParseResult,
  type ParsedTransaction,
} from "@akaun/shared";
import type { CellValue, WriteOp, WritePlan } from "../../office/dashboard/plan";

export const LEDGER_HEADER_ROW = 1;
export const LEDGER_FIRST_ROW = 2;
export const LEDGER_LAST_ROW = 5001;
export const LEDGER_LAST_COL = "N";

export const LEDGER_HEADERS = [
  "ID",
  "Tarikh",
  "Butiran",
  "Masuk (RM)",
  "Keluar (RM)",
  "Baki (RM)",
  "Akaun",
  "Kategori",
  "Cadangan",
  "Keyakinan",
  "Status",
  "Dipindah ke",
  "Catatan",
  "Butiran ringkas (ke Deposits/Payments)",
] as const;

export const STATUS_NEW = "Baru";
export const STATUS_MOVED = "Dipindah";
export const STATUS_SKIPPED = "Tidak dipindah";

export interface LedgerRow {
  /** Worksheet row number. */
  row: number;
  id: string;
  /** Excel date serial. */
  dateSerial: number | null;
  description: string;
  inSen: number;
  outSen: number;
  account: string;
  category: string;
  status: string;
  movedTo: string;
  /** Text for the Deposits / Payments Butiran column (column N; may be edited by the user). */
  short: string;
}

/** Butiran to transfer: the user's column N if filled, otherwise the automatic short form. */
export const transferDescription = (r: LedgerRow) => r.short || shortDescription(r.description);

/** Excel (1900 system) serial for an ISO date. */
export function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export const senToRm = (sen: number) => Math.round(sen) / 100;
const rmToSen = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0);
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** FNV-1a 32-bit hash, base36. Stable across sessions; used to skip rows already imported. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

/**
 * Identity of a bank transaction. The running balance makes it unique even when the same amount and
 * description appear twice on one day; `occurrence` separates rows that are identical in every field.
 */
export function transactionId(account: string, t: ParsedTransaction, occurrence: number): string {
  const key = [account.trim().toLowerCase(), t.date, t.direction, t.amountSen, t.balanceSen ?? "", t.description.toLowerCase(), occurrence].join("|");
  return `BB-${fnv(key)}`;
}

export function parseLedger(values: unknown[][]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  values.forEach((v, i) => {
    const id = text(v[0]);
    if (!id) return;
    rows.push({
      row: LEDGER_FIRST_ROW + i,
      id,
      dateSerial: typeof v[1] === "number" ? v[1] : null,
      description: text(v[2]),
      inSen: rmToSen(v[3]),
      outSen: rmToSen(v[4]),
      account: text(v[6]),
      category: text(v[7]),
      status: text(v[10]),
      movedTo: text(v[11]),
      short: text(v[13]),
    });
  });
  return rows;
}

export async function readLedger(read: (sheet: string, address: string) => Promise<unknown[][]>): Promise<LedgerRow[]> {
  return parseLedger(await read(BANK_LEDGER_SHEET, `A${LEDGER_FIRST_ROW}:${LEDGER_LAST_COL}${LEDGER_LAST_ROW}`));
}

/** First worksheet row after the last row that has an ID. */
export const nextLedgerRow = (rows: LedgerRow[]) => (rows.length ? Math.max(...rows.map((r) => r.row)) + 1 : LEDGER_FIRST_ROW);

export interface CategoryLists {
  deposits: string[];
  payments: string[];
}

/** Dropdown source: Masuk rows list Deposits categories, Keluar rows list Payments categories. */
export function categoryValidationSource(lists: CategoryLists): string {
  const a = `'${BANK_LISTS_SHEET}'!$A$1:$A$${lists.deposits.length + 2}`;
  const b = `'${BANK_LISTS_SHEET}'!$B$1:$B$${lists.payments.length + 2}`;
  return `=IF($D${LEDGER_FIRST_ROW}<>"",${a},${b})`;
}

export function listsPlan(lists: CategoryLists): WritePlan {
  const col = (items: string[]) => [...items, BANK_CATEGORY_INTERNAL, BANK_CATEGORY_IGNORE].map((s) => [sanitizeCellText(s)]);
  const a = col(lists.deposits);
  const b = col(lists.payments);
  return {
    ops: [
      { op: "clear", sheet: BANK_LISTS_SHEET, address: "A1:B80" },
      { op: "values", sheet: BANK_LISTS_SHEET, address: `A1:A${a.length}`, values: a },
      { op: "values", sheet: BANK_LISTS_SHEET, address: `B1:B${b.length}`, values: b },
    ],
  };
}

export function ledgerSetupPlan(lists: CategoryLists): WritePlan {
  const widths: [string, number][] = [["A", 80], ["B", 70], ["C", 260], ["D", 80], ["E", 80], ["F", 85], ["G", 110], ["H", 170], ["I", 110], ["J", 70], ["K", 80], ["L", 95], ["M", 160], ["N", 240]];
  return {
    ops: [
      { op: "values", sheet: BANK_LEDGER_SHEET, address: `A${LEDGER_HEADER_ROW}:${LEDGER_LAST_COL}${LEDGER_HEADER_ROW}`, values: [[...LEDGER_HEADERS]] },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `A${LEDGER_HEADER_ROW}:${LEDGER_LAST_COL}${LEDGER_HEADER_ROW}`, style: { bold: true, fill: "#1F4E78", fontColor: "#FFFFFF" } },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `H${LEDGER_HEADER_ROW}`, style: { fill: "#C65911" } },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `N${LEDGER_HEADER_ROW}`, style: { fill: "#C65911", wrap: true } },
      ...widths.map(([column, width]): WriteOp => ({ op: "columnWidth", sheet: BANK_LEDGER_SHEET, column, width })),
      { op: "validationList", sheet: BANK_LEDGER_SHEET, address: `H${LEDGER_FIRST_ROW}:H${LEDGER_LAST_ROW}`, source: categoryValidationSource(lists) },
    ],
  };
}

export interface AppendResult {
  plan: WritePlan;
  added: number;
  duplicates: number;
  firstRow: number;
  lastRow: number;
}

export class LedgerFullError extends Error {
  constructor(readonly needed: number, readonly free: number) {
    super(`Buku Bank penuh: perlu ${needed} baris, tinggal ${free}.`);
  }
}

/** Rows to append for a reconciled statement. Rows already in the ledger (same ID) are skipped. */
export function appendPlan(existing: LedgerRow[], parsed: BankParseResult, account: string): AppendResult {
  if (!parsed.reconciled) throw new Error("Penyata belum disahkan (semakan baki gagal). Tiada baris ditambah.");
  const known = new Set(existing.map((r) => r.id));
  const seen = new Map<string, number>();
  const values: CellValue[][] = [];
  let duplicates = 0;
  for (const t of parsed.transactions) {
    const base = [t.date, t.direction, t.amountSen, t.balanceSen ?? "", t.description].join("|");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const id = transactionId(account, t, occurrence);
    if (known.has(id)) {
      duplicates++;
      continue;
    }
    known.add(id);
    values.push([
      id,
      isoToSerial(t.date),
      sanitizeCellText(t.description, 250),
      t.direction === "in" ? senToRm(t.amountSen) : "",
      t.direction === "out" ? senToRm(t.amountSen) : "",
      t.balanceSen === null ? "" : senToRm(t.balanceSen),
      sanitizeCellText(account, 60),
      "",
      "",
      "",
      STATUS_NEW,
      "",
      "",
      sanitizeCellText(shortDescription(t.description), 120),
    ]);
  }
  const firstRow = nextLedgerRow(existing);
  const lastRow = firstRow + values.length - 1;
  if (lastRow > LEDGER_LAST_ROW) throw new LedgerFullError(values.length, LEDGER_LAST_ROW - firstRow + 1);
  const ops: WriteOp[] = [];
  if (values.length) {
    ops.push(
      { op: "values", sheet: BANK_LEDGER_SHEET, address: `A${firstRow}:${LEDGER_LAST_COL}${lastRow}`, values },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `B${firstRow}:B${lastRow}`, style: { numberFormat: "dd/mm/yyyy" } },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `D${firstRow}:F${lastRow}`, style: { numberFormat: "#,##0.00" } },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `H${firstRow}:H${lastRow}`, style: { fill: "#FCE4D6" } },
      { op: "format", sheet: BANK_LEDGER_SHEET, address: `N${firstRow}:N${lastRow}`, style: { fill: "#FCE4D6" } },
      { op: "activate", sheet: BANK_LEDGER_SHEET },
    );
  }
  return { plan: { ops }, added: values.length, duplicates, firstRow, lastRow };
}
