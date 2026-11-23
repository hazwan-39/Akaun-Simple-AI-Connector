/**
 * Ownership checks and guarded writes for the bank-import sheets. Same rules as the AI Cash Flow
 * dashboard: a sheet is only written if the add-in created it and its ownership tag still matches.
 */
import { BANK_LEDGER_SHEET, BANK_LISTS_SHEET, BANK_TRANSFER_SHEET, bankOwnershipToken, type BankSheetRole } from "@akaun/shared";
import { guardPlan } from "../../office/dashboard/guard";
import type { WritePlan } from "../../office/dashboard/plan";
import type { WorkbookPort } from "../../office/workbook-port";

export const BANK_SHEETS: { name: string; role: BankSheetRole; hidden: boolean }[] = [
  { name: BANK_LEDGER_SHEET, role: "ledger", hidden: false },
  { name: BANK_TRANSFER_SHEET, role: "transfer", hidden: false },
  { name: BANK_LISTS_SHEET, role: "lists", hidden: true },
];

export type BankBlockedReason = "UNSUPPORTED_API" | "SHEET_NAME_TAKEN" | "STRUCTURE_PROTECTED" | "OWNED_SHEET_PROTECTED";

export const BANK_BLOCKED_MESSAGES_MS: Record<BankBlockedReason, string> = {
  UNSUPPORTED_API: "Versi Excel ini tidak menyokong ciri yang diperlukan untuk menulis Buku Bank dengan selamat (ExcelApi 1.12).",
  SHEET_NAME_TAKEN: `Sheet bernama "${BANK_LEDGER_SHEET}", "${BANK_TRANSFER_SHEET}" atau "${BANK_LISTS_SHEET}" sudah wujud tetapi bukan dicipta oleh Akaun Simple AI. Ia tidak akan ditulis ganti.`,
  STRUCTURE_PROTECTED: "Struktur workbook dilindungi, jadi sheet Buku Bank tidak boleh ditambah.",
  OWNED_SHEET_PROTECTED: "Sheet Buku Bank dilindungi (protected). Add-in tidak akan menukar perlindungan.",
};

export class BankSheetsBlockedError extends Error {
  constructor(readonly reason: BankBlockedReason) {
    super(BANK_BLOCKED_MESSAGES_MS[reason]);
  }
}

export interface BankSheetsInspection {
  states: Record<BankSheetRole, "missing" | "owned" | "conflict">;
  action: "create" | "ready" | "blocked";
  blockedReason: BankBlockedReason | null;
}

export async function inspectBankSheets(port: WorkbookPort, writeApiSupported: boolean): Promise<BankSheetsInspection> {
  const sheets = await port.getSheets();
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const states: BankSheetsInspection["states"] = { ledger: "missing", transfer: "missing", lists: "missing" };
  let ownedProtected = false;
  for (const s of BANK_SHEETS) {
    const existing = byName.get(s.name.toLowerCase());
    if (!existing) continue;
    const tag = existing.name === s.name && writeApiSupported ? await port.getOwnershipTag(s.name) : null;
    states[s.role] = tag === bankOwnershipToken(s.role) ? "owned" : "conflict";
    if (states[s.role] === "owned" && existing.protected) ownedProtected = true;
  }
  const needsCreate = Object.values(states).includes("missing");
  let blockedReason: BankBlockedReason | null = null;
  if (!writeApiSupported) blockedReason = "UNSUPPORTED_API";
  else if (Object.values(states).includes("conflict")) blockedReason = "SHEET_NAME_TAKEN";
  else if (needsCreate && (await port.isStructureProtected())) blockedReason = "STRUCTURE_PROTECTED";
  else if (ownedProtected) blockedReason = "OWNED_SHEET_PROTECTED";
  return { states, action: blockedReason ? "blocked" : needsCreate ? "create" : "ready", blockedReason };
}

/** Creates missing bank sheets. Callers must have asked the user first. Returns true if any sheet was created. */
export async function ensureBankSheets(port: WorkbookPort, writeApiSupported: boolean, userConfirmedCreate: boolean): Promise<boolean> {
  const insp = await inspectBankSheets(port, writeApiSupported);
  if (insp.action === "blocked") throw new BankSheetsBlockedError(insp.blockedReason!);
  if (insp.action === "ready") return false;
  if (!userConfirmedCreate) throw new Error("User confirmation is required before creating Buku Bank sheets.");
  for (const s of BANK_SHEETS) {
    if (insp.states[s.role] === "missing") await port.createOwnedSheet(s.name, { hidden: s.hidden, ownershipTag: bankOwnershipToken(s.role) });
  }
  return true;
}

/** Validates the plan first (nothing is written if any op is rejected), re-verifies ownership, then writes. */
export async function applyBankPlan(port: WorkbookPort, plan: WritePlan): Promise<void> {
  guardPlan(plan, BANK_SHEETS.map((s) => s.name));
  const verified: string[] = [];
  for (const s of BANK_SHEETS) if ((await port.getOwnershipTag(s.name)) === bankOwnershipToken(s.role)) verified.push(s.name);
  if (verified.length !== BANK_SHEETS.length) throw new BankSheetsBlockedError("SHEET_NAME_TAKEN");
  await port.applyPlan(guardPlan(plan, verified));
}
