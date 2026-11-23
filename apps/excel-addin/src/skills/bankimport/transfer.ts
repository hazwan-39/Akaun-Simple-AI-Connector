/**
 * Moving categorised Buku Bank rows into Deposits / Payments.
 *
 * The add-in NEVER writes to Deposits or Payments. It prepares a block on its own sheet laid out exactly
 * like the target columns, selects it for the user to copy, and after the user's
 * Paste Special → Values + Skip blanks it reads the target back and compares every cell.
 *
 * Rules taken from the template's VBA forms (docs/spec-bank-statement-import.md §11):
 *  - the forms put the next entry at COUNTA(column A) + 1, so the block starts there and fills column A
 *    (date for Deposits, No. = row − 5 for Payments) or the next form entry would overwrite it;
 *  - the total column (Deposits C, Payments D) holds the workbook's SUM formula and is left blank in the
 *    block so Skip blanks keeps it.
 */
import { BANK_CATEGORY_IGNORE, BANK_CATEGORY_INTERNAL, BANK_LEDGER_SHEET, BANK_TRANSFER_SHEET, sanitizeCellText } from "@akaun/shared";
import { colToIndex, indexToCol } from "../../office/address";
import type { CellValue, WriteOp, WritePlan } from "../../office/dashboard/plan";
import { AS_V2, normLabel } from "../../office/adapters/akaun-simple-v2/layout";
import { senToRm, STATUS_MOVED, type LedgerRow } from "./ledger";

export type TransferTarget = "deposits" | "payments";

export interface TargetLayout {
  target: TransferTarget;
  sheet: string;
  lastCol: string;
  totalCol: string;
  totalLabelCol: string;
  firstDataRow: number;
  /** Column letter → header label, category columns only. */
  categories: Record<string, string>;
  /** Columns before the category columns, in order. */
  leading: ("no" | "date" | "desc" | "total")[];
}

export const TARGETS: Record<TransferTarget, TargetLayout> = {
  deposits: {
    target: "deposits",
    sheet: AS_V2.deposits.sheet,
    lastCol: AS_V2.deposits.lastCol,
    totalCol: AS_V2.deposits.totalCol,
    totalLabelCol: AS_V2.deposits.totalLabelCol,
    firstDataRow: AS_V2.deposits.firstDataRow,
    categories: Object.fromEntries(AS_V2.deposits.categories.map((c) => [c.col, AS_V2.deposits.headers[c.col]!])),
    leading: ["date", "desc", "total"],
  },
  payments: {
    target: "payments",
    sheet: AS_V2.payments.sheet,
    lastCol: AS_V2.payments.lastCol,
    totalCol: AS_V2.payments.totalCol,
    totalLabelCol: AS_V2.payments.totalLabelCol,
    firstDataRow: AS_V2.payments.firstDataRow,
    categories: Object.fromEntries(
      Object.entries(AS_V2.payments.headers).filter(([col]) => colToIndex(col) >= colToIndex(AS_V2.payments.firstCategoryCol)),
    ),
    leading: ["no", "date", "desc", "total"],
  },
};

/** Column (in the target sheet) for a category label, or null if the label is not a column of that sheet. */
export function categoryColumn(layout: TargetLayout, category: string): string | null {
  const want = normLabel(category);
  return Object.entries(layout.categories).find(([, label]) => normLabel(label) === want)?.[0] ?? null;
}

export interface Eligibility {
  rows: LedgerRow[];
  /** Categorised for this target but the label is not a column of the target sheet. */
  invalid: LedgerRow[];
  /** Still without a category. */
  uncategorised: number;
}

export function eligibleRows(ledger: LedgerRow[], layout: TargetLayout, onlyCategory?: string): Eligibility {
  const rows: LedgerRow[] = [];
  const invalid: LedgerRow[] = [];
  let uncategorised = 0;
  for (const r of ledger) {
    if (r.status === STATUS_MOVED) continue;
    const isIn = r.inSen > 0;
    if ((layout.target === "deposits") !== isIn) continue;
    if (!r.category) {
      uncategorised++;
      continue;
    }
    if (r.category === BANK_CATEGORY_INTERNAL || r.category === BANK_CATEGORY_IGNORE) continue;
    if (onlyCategory && normLabel(onlyCategory) !== normLabel(r.category)) continue;
    if (!categoryColumn(layout, r.category)) invalid.push(r);
    else rows.push(r);
  }
  rows.sort((a, b) => (a.dateSerial ?? 0) - (b.dateSerial ?? 0) || a.row - b.row);
  return { rows, invalid, uncategorised };
}

export interface TargetState {
  /** Row the VBA forms would use next: COUNTA(column A) + 1. */
  nextRow: number;
  totalRow: number;
  freeRows: number;
  /** First row at or below nextRow that already has content (a gap in column A). */
  conflictRow: number | null;
}

const blank = (v: unknown) => v === "" || v === null || v === undefined;

export async function inspectTarget(read: (sheet: string, address: string) => Promise<unknown[][]>, layout: TargetLayout): Promise<TargetState> {
  const colA = await read(layout.sheet, `A1:A${AS_V2.maxScanRow}`);
  const counta = colA.filter((r) => !blank(r[0])).length;
  const nextRow = counta + 1;
  const labels = await read(layout.sheet, `${layout.totalLabelCol}${layout.firstDataRow}:${layout.totalLabelCol}${AS_V2.maxScanRow}`);
  const idx = labels.findIndex((r) => normLabel(r[0]) === "total");
  if (idx < 0) throw new Error(`Baris "Total" tidak ditemui dalam sheet ${layout.sheet}.`);
  const totalRow = layout.firstDataRow + idx;
  let conflictRow: number | null = null;
  if (nextRow < totalRow) {
    const area = await read(layout.sheet, `A${nextRow}:${layout.lastCol}${totalRow - 1}`);
    const totalIdx = colToIndex(layout.totalCol) - 1;
    const k = area.findIndex((row) => row.some((v, c) => c !== totalIdx && !blank(v) && v !== 0));
    if (k >= 0) conflictRow = nextRow + k;
  }
  return { nextRow, totalRow, freeRows: Math.max(0, totalRow - nextRow), conflictRow };
}

export const BLOCK_FIRST_ROW = 5;
export const ID_COL = "AQ";
const META_ROW = 3;

export interface PreparedBlock {
  plan: WritePlan;
  /** Range on the transfer sheet the user copies. */
  blockAddress: string;
  /** Top-left cell in the target sheet where the user pastes. */
  pasteAt: string;
  count: number;
}

export class TransferBlockedError extends Error {}

export function blockRow(layout: TargetLayout, r: LedgerRow, targetRow: number): CellValue[] {
  const width = colToIndex(layout.lastCol);
  const out: CellValue[] = Array<CellValue>(width).fill("");
  const sen = layout.target === "deposits" ? r.inSen : r.outSen;
  layout.leading.forEach((kind, i) => {
    if (kind === "no") out[i] = targetRow - 5;
    if (kind === "date") out[i] = r.dateSerial ?? "";
    if (kind === "desc") out[i] = sanitizeCellText(r.description, 250);
    // "total" stays blank: Skip blanks keeps the workbook's own SUM formula.
  });
  const col = categoryColumn(layout, r.category)!;
  out[colToIndex(col) - 1] = senToRm(sen);
  return out;
}

export function prepareBlock(layout: TargetLayout, rows: LedgerRow[], state: TargetState): PreparedBlock {
  if (!rows.length) throw new TransferBlockedError("Tiada baris berkategori untuk dipindah.");
  if (state.conflictRow !== null) {
    throw new TransferBlockedError(
      `${layout.sheet} baris ${state.conflictRow} sudah ada data walaupun lajur A kosong. Form VBA dan blok ini akan bertembung. Isi lajur A atau alihkan data tersebut dahulu.`,
    );
  }
  if (rows.length > state.freeRows) {
    throw new TransferBlockedError(`${layout.sheet} hanya ada ${state.freeRows} baris kosong, tetapi ${rows.length} baris perlu dipindah. Pindah ikut bulan atau tambah baris (FAQ #11).`);
  }
  const width = colToIndex(layout.lastCol);
  const last = BLOCK_FIRST_ROW + rows.length - 1;
  const blockAddress = `A${BLOCK_FIRST_ROW}:${layout.lastCol}${last}`;
  const values = rows.map((r, i) => blockRow(layout, r, state.nextRow + i));
  const headerRow: CellValue[] = Array.from({ length: width }, (_, i) => {
    const col = indexToCol(i + 1);
    const lead = layout.leading[i];
    if (lead === "no") return "No.";
    if (lead === "date") return "Tarikh";
    if (lead === "desc") return "Butiran";
    if (lead === "total") return "(Jumlah: formula kekal)";
    return sanitizeCellText(layout.categories[col] ?? "");
  });
  const dateCol = indexToCol(layout.leading.indexOf("date") + 1);
  const ops: WriteOp[] = [
    { op: "clear", sheet: BANK_TRANSFER_SHEET, address: "A1:AQ400" },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: "A1:A2", values: [[`Blok untuk ${layout.sheet}`], [`Copy blok bertanda (${blockAddress}), kemudian di ${layout.sheet}!A${state.nextRow}: Paste Special → Values + Skip blanks. Lepas itu tekan "Sahkan Pindahan".`]] },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: `A${META_ROW}:H${META_ROW}`, values: [["Sasaran", layout.sheet, "Baris mula", state.nextRow, "Bilangan", rows.length, "Status", "MENUNGGU PASTE"]] },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: `A4:${layout.lastCol}4`, values: [headerRow] },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: `${ID_COL}4`, values: [["ID Buku Bank"]] },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: blockAddress, values },
    { op: "values", sheet: BANK_TRANSFER_SHEET, address: `${ID_COL}${BLOCK_FIRST_ROW}:${ID_COL}${last}`, values: rows.map((r) => [r.id]) },
    { op: "format", sheet: BANK_TRANSFER_SHEET, address: "A1", style: { bold: true, fontSize: 13 } },
    { op: "format", sheet: BANK_TRANSFER_SHEET, address: `A4:${layout.lastCol}4`, style: { bold: true, fill: "#D9E1F2", wrap: true } },
    { op: "format", sheet: BANK_TRANSFER_SHEET, address: `${dateCol}${BLOCK_FIRST_ROW}:${dateCol}${last}`, style: { numberFormat: "dd/mm/yyyy" } },
    { op: "format", sheet: BANK_TRANSFER_SHEET, address: blockAddress, style: { fill: "#FFF2CC" } },
    { op: "select", sheet: BANK_TRANSFER_SHEET, address: blockAddress },
  ];
  return { plan: { ops }, blockAddress, pasteAt: `${layout.sheet}!A${state.nextRow}`, count: rows.length };
}

export interface PendingTransfer {
  layout: TargetLayout;
  startRow: number;
  count: number;
  ids: string[];
  block: unknown[][];
}

export async function readPendingTransfer(read: (sheet: string, address: string) => Promise<unknown[][]>): Promise<PendingTransfer | null> {
  const [meta] = await read(BANK_TRANSFER_SHEET, `A${META_ROW}:H${META_ROW}`);
  if (!meta || meta[7] !== "MENUNGGU PASTE") return null;
  const layout = Object.values(TARGETS).find((t) => t.sheet === meta[1]);
  const startRow = Number(meta[3]);
  const count = Number(meta[5]);
  if (!layout || !Number.isInteger(startRow) || !Number.isInteger(count) || count < 1) return null;
  const last = BLOCK_FIRST_ROW + count - 1;
  const block = await read(BANK_TRANSFER_SHEET, `A${BLOCK_FIRST_ROW}:${layout.lastCol}${last}`);
  const ids = (await read(BANK_TRANSFER_SHEET, `${ID_COL}${BLOCK_FIRST_ROW}:${ID_COL}${last}`)).map((r) => String(r[0] ?? ""));
  return { layout, startRow, count, ids, block };
}

export interface CellDiff {
  row: number;
  col: string;
  expected: unknown;
  actual: unknown;
}

const asSen = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) : NaN);
const plain = (v: unknown) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);

/** Compares the target rows with the block, cell by cell. Empty result = the paste is exactly right. */
export function diffTransfer(p: PendingTransfer, target: unknown[][]): CellDiff[] {
  const diffs: CellDiff[] = [];
  const totalIdx = colToIndex(p.layout.totalCol) - 1;
  const firstCat = Math.min(...Object.keys(p.layout.categories).map(colToIndex)) - 1;
  p.block.forEach((exp, i) => {
    const act = target[i] ?? [];
    const row = p.startRow + i;
    const amountSen = exp.slice(firstCat).map(asSen).find((n) => Number.isFinite(n) && n > 0) ?? NaN;
    exp.forEach((e, c) => {
      const a = act[c];
      const col = indexToCol(c + 1);
      let ok: boolean;
      if (c === totalIdx) ok = asSen(a) === amountSen; // the workbook's SUM formula must now show the amount
      else if (blank(e)) ok = blank(a) || a === 0;
      else if (typeof e === "number") ok = asSen(a) === asSen(e);
      else ok = String(plain(a) ?? "").trim() === String(plain(e)).trim();
      if (!ok) diffs.push({ row, col, expected: c === totalIdx ? amountSen / 100 : e, actual: a });
    });
  });
  return diffs;
}

export function markMovedPlan(p: PendingTransfer, ledger: LedgerRow[]): WritePlan {
  const byId = new Map(ledger.map((r) => [r.id, r]));
  const ops: WriteOp[] = [];
  p.ids.forEach((id, i) => {
    const r = byId.get(id);
    if (!r) throw new Error(`Baris Buku Bank ${id} tidak ditemui.`);
    if (r.status === STATUS_MOVED) throw new Error(`Baris Buku Bank ${id} sudah ditanda Dipindah.`);
    ops.push({ op: "values", sheet: BANK_LEDGER_SHEET, address: `K${r.row}:L${r.row}`, values: [[STATUS_MOVED, `${p.layout.sheet}!${p.startRow + i}`]] });
  });
  ops.push({ op: "values", sheet: BANK_TRANSFER_SHEET, address: `H${META_ROW}`, values: [["SELESAI"]] });
  return { ops };
}
