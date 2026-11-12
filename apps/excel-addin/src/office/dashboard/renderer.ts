/**
 * Dashboard renderer: decides whether writing is safe, then executes a
 * guarded plan. Never touches any sheet it has not created and tagged.
 */
import { AI_DASHBOARD_SHEET, AI_DATA_SHEET, ownershipToken, type OwnedSheetRole } from "@akaun/shared";
import type { WorkbookPort } from "../workbook-port";
import { guardPlan } from "./guard";
import { buildDashboardPlan, type DashboardModel } from "./template";

export type SheetState = "missing" | "owned" | "conflict";

export interface DashboardInspection {
  dashboard: SheetState;
  data: SheetState;
  structureProtected: boolean;
  ownedSheetProtected: boolean;
  /** What a render would do right now. */
  action: "create" | "update" | "blocked";
  blockedReason: BlockedReason | null;
}

export type BlockedReason = "UNSUPPORTED_API" | "SHEET_NAME_TAKEN" | "STRUCTURE_PROTECTED" | "OWNED_SHEET_PROTECTED";

export const BLOCKED_MESSAGES_MS: Record<BlockedReason, string> = {
  UNSUPPORTED_API:
    "Versi Excel ini tidak menyokong ciri yang diperlukan untuk mencipta worksheet AI dengan selamat (ExcelApi 1.12). Keputusan dipaparkan dalam panel tugas sahaja.",
  SHEET_NAME_TAKEN:
    "Sheet bernama \"AI Cash Flow\" atau \"_AI_CF_DATA\" sudah wujud tetapi bukan dicipta oleh Akaun Simple AI. Ia tidak akan ditulis ganti. Namakan semula sheet tersebut atau lihat keputusan dalam panel tugas.",
  STRUCTURE_PROTECTED:
    "Struktur workbook dilindungi, jadi sheet baharu tidak boleh ditambah. Keputusan dipaparkan dalam panel tugas sahaja.",
  OWNED_SHEET_PROTECTED:
    "Sheet AI dilindungi (protected). Add-in tidak akan menukar perlindungan. Buang perlindungan sheet AI atau lihat keputusan dalam panel tugas.",
};

export class RenderBlockedError extends Error {
  constructor(readonly reason: BlockedReason) {
    super(BLOCKED_MESSAGES_MS[reason]);
  }
}

const SHEETS: { name: string; role: OwnedSheetRole; hidden: boolean }[] = [
  { name: AI_DASHBOARD_SHEET, role: "dashboard", hidden: false },
  { name: AI_DATA_SHEET, role: "data", hidden: true },
];

export async function inspectDashboard(port: WorkbookPort, writeApiSupported: boolean): Promise<DashboardInspection> {
  const sheets = await port.getSheets();
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const states: Record<OwnedSheetRole, SheetState> = { dashboard: "missing", data: "missing" };
  let ownedSheetProtected = false;

  for (const s of SHEETS) {
    // Excel sheet names are case-insensitive.
    const existing = byName.get(s.name.toLowerCase());
    if (!existing) continue;
    if (existing.name !== s.name) {
      states[s.role] = "conflict";
      continue;
    }
    const tag = writeApiSupported ? await port.getOwnershipTag(s.name) : null;
    states[s.role] = tag === ownershipToken(s.role) ? "owned" : "conflict";
    if (states[s.role] === "owned" && existing.protected) ownedSheetProtected = true;
  }
  const structureProtected = await port.isStructureProtected();
  const needsCreate = states.dashboard === "missing" || states.data === "missing";

  let blockedReason: BlockedReason | null = null;
  if (!writeApiSupported) blockedReason = "UNSUPPORTED_API";
  else if (states.dashboard === "conflict" || states.data === "conflict") blockedReason = "SHEET_NAME_TAKEN";
  else if (needsCreate && structureProtected) blockedReason = "STRUCTURE_PROTECTED";
  else if (ownedSheetProtected) blockedReason = "OWNED_SHEET_PROTECTED";

  const action = blockedReason ? "blocked" : states.dashboard === "owned" && states.data === "owned" ? "update" : "create";
  return { dashboard: states.dashboard, data: states.data, structureProtected, ownedSheetProtected, action, blockedReason };
}

export interface RenderOptions {
  writeApiSupported: boolean;
  /** Must be true to add new sheets. The UI sets it only after explicit user confirmation. */
  userConfirmedCreate: boolean;
}

export async function renderDashboard(port: WorkbookPort, model: DashboardModel, opts: RenderOptions): Promise<"created" | "updated"> {
  const inspection = await inspectDashboard(port, opts.writeApiSupported);
  if (inspection.action === "blocked") throw new RenderBlockedError(inspection.blockedReason!);

  const mode = inspection.action;
  // Build and guard BEFORE any workbook change, so an invalid plan writes nothing.
  const plan = buildDashboardPlan(model, mode);
  const allNames = SHEETS.map((s) => s.name);
  guardPlan(plan, allNames); // dry-run validation against the static allowlist

  if (mode === "create") {
    if (!opts.userConfirmedCreate) throw new Error("User confirmation is required before creating AI worksheets.");
    for (const s of SHEETS) {
      if (inspection[s.role] === "missing") {
        await port.createOwnedSheet(s.name, { hidden: s.hidden, ownershipTag: ownershipToken(s.role) });
      }
    }
  }

  // Re-verify ownership right before writing (the workbook may have changed meanwhile).
  const verified: string[] = [];
  for (const s of SHEETS) {
    if ((await port.getOwnershipTag(s.name)) === ownershipToken(s.role)) verified.push(s.name);
  }
  if (verified.length !== SHEETS.length) throw new RenderBlockedError("SHEET_NAME_TAKEN");

  await port.applyPlan(guardPlan(plan, verified));
  return mode === "create" ? "created" : "updated";
}
