/** Bank import workflow used by the task pane. Every write goes through applyBankPlan (guarded, owned sheets only). */
import { BANK_LEDGER_SHEET, BANK_TRANSFER_SHEET, type BankParseResult } from "@akaun/shared";
import { colToIndex } from "../../office/address";
import { AS_V2 } from "../../office/adapters/akaun-simple-v2/layout";
import type { WorkbookPort } from "../../office/workbook-port";
import { appendPlan, ledgerSetupPlan, listsPlan, readLedger, STATUS_MOVED, type AppendResult, type CategoryLists } from "./ledger";
import { applyBankPlan, ensureBankSheets, inspectBankSheets } from "./sheets";
import {
  diffTransfer,
  eligibleRows,
  inspectTarget,
  markMovedPlan,
  prepareBlock,
  readPendingTransfer,
  TARGETS,
  type CellDiff,
  type Eligibility,
  type PreparedBlock,
  type TransferTarget,
} from "./transfer";

const read = (port: WorkbookPort) => (sheet: string, address: string) => port.readValues(sheet, address);

/** Category labels exactly as the user's workbook prints them (headers were verified by the adapter). */
export async function readCategoryLists(port: WorkbookPort): Promise<CategoryLists> {
  const row = async (sheet: string, from: string, to: string, headerRow: number) =>
    ((await port.readValues(sheet, `${from}${headerRow}:${to}${headerRow}`))[0] ?? []).map((v) => String(v ?? "").replace(/\s+/g, " ").trim());
  const firstPayCol = AS_V2.payments.firstCategoryCol;
  return {
    deposits: await row(AS_V2.deposits.sheet, "D", AS_V2.deposits.lastCol, AS_V2.deposits.headerRow),
    payments: (await row(AS_V2.payments.sheet, firstPayCol, AS_V2.payments.lastCol, AS_V2.payments.headerRow)).slice(0, colToIndex(AS_V2.payments.lastCol) - colToIndex(firstPayCol) + 1),
  };
}

export interface ImportOutcome extends Omit<AppendResult, "plan"> {
  createdSheets: boolean;
}

export async function importStatement(
  port: WorkbookPort,
  parsed: BankParseResult,
  account: string,
  opts: { writeApiSupported: boolean; userConfirmedCreate: boolean },
): Promise<ImportOutcome> {
  if (!account.trim()) throw new Error("Masukkan nama akaun (contoh: Maybank 5123).");
  const lists = await readCategoryLists(port);
  const createdSheets = await ensureBankSheets(port, opts.writeApiSupported, opts.userConfirmedCreate);
  // Lists and the header/dropdown are rewritten on every import so they always match the workbook.
  await applyBankPlan(port, listsPlan(lists));
  await applyBankPlan(port, ledgerSetupPlan(lists));
  const ledger = await readLedger(read(port));
  const { plan, ...rest } = appendPlan(ledger, parsed, account);
  if (plan.ops.length) await applyBankPlan(port, plan);
  return { ...rest, createdSheets };
}

export interface LedgerSummary {
  exists: boolean;
  total: number;
  moved: number;
  uncategorisedIn: number;
  uncategorisedOut: number;
  readyIn: number;
  readyOut: number;
  pending: { sheet: string; startRow: number; count: number } | null;
}

export async function ledgerSummary(port: WorkbookPort, writeApiSupported: boolean): Promise<LedgerSummary> {
  const insp = await inspectBankSheets(port, writeApiSupported);
  if (insp.states.ledger !== "owned" || insp.states.transfer !== "owned") {
    return { exists: false, total: 0, moved: 0, uncategorisedIn: 0, uncategorisedOut: 0, readyIn: 0, readyOut: 0, pending: null };
  }
  const ledger = await readLedger(read(port));
  const dep = eligibleRows(ledger, TARGETS.deposits);
  const pay = eligibleRows(ledger, TARGETS.payments);
  const pending = await readPendingTransfer(read(port));
  return {
    exists: true,
    total: ledger.length,
    moved: ledger.filter((r) => r.status === STATUS_MOVED).length,
    uncategorisedIn: dep.uncategorised,
    uncategorisedOut: pay.uncategorised,
    readyIn: dep.rows.length,
    readyOut: pay.rows.length,
    pending: pending ? { sheet: pending.layout.sheet, startRow: pending.startRow, count: pending.count } : null,
  };
}

export interface PrepareOutcome extends Omit<PreparedBlock, "plan"> {
  eligibility: Eligibility;
}

export async function prepareTransfer(port: WorkbookPort, target: TransferTarget): Promise<PrepareOutcome> {
  const layout = TARGETS[target];
  const ledger = await readLedger(read(port));
  const eligibility = eligibleRows(ledger, layout);
  const state = await inspectTarget(read(port), layout);
  const { plan, ...block } = prepareBlock(layout, eligibility.rows, state);
  await applyBankPlan(port, plan);
  return { ...block, eligibility };
}

export async function goToPasteCell(port: WorkbookPort): Promise<string | null> {
  const pending = await readPendingTransfer(read(port));
  if (!pending) return null;
  await port.selectRange(pending.layout.sheet, `A${pending.startRow}`);
  return `${pending.layout.sheet}!A${pending.startRow}`;
}

export async function selectBlock(port: WorkbookPort): Promise<void> {
  const pending = await readPendingTransfer(read(port));
  if (pending) await port.selectRange(BANK_TRANSFER_SHEET, `A5:${pending.layout.lastCol}${4 + pending.count}`);
}

export type ConfirmOutcome = { ok: true; moved: number; sheet: string } | { ok: false; diffs: CellDiff[] } | { ok: false; noPending: true };

/** Reads the target back (read-only) and marks Buku Bank rows Dipindah only if every cell matches. */
export async function confirmTransfer(port: WorkbookPort): Promise<ConfirmOutcome> {
  const pending = await readPendingTransfer(read(port));
  if (!pending) return { ok: false, noPending: true };
  const end = pending.startRow + pending.count - 1;
  const target = await port.readValues(pending.layout.sheet, `A${pending.startRow}:${pending.layout.lastCol}${end}`);
  const diffs = diffTransfer(pending, target);
  if (diffs.length) return { ok: false, diffs };
  const ledger = await readLedger(read(port));
  await applyBankPlan(port, markMovedPlan(pending, ledger));
  await port.selectRange(BANK_LEDGER_SHEET, "A1");
  return { ok: true, moved: pending.count, sheet: pending.layout.sheet };
}
