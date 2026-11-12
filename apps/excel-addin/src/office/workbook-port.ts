/**
 * WorkbookPort – the only gateway between the add-in and the workbook.
 *
 * Read methods may be used on any sheet. Write methods exist only for the
 * dashboard renderer and only accept a GuardedPlan (see dashboard/guard.ts),
 * which can only be produced after the write allowlist has been enforced.
 * Implementations: OfficeWorkbookPort (Office.js) and InMemoryWorkbookPort (tests).
 */
import type { GuardedPlan } from "./dashboard/plan";

export type SheetVisibility = "Visible" | "Hidden" | "VeryHidden";

export interface SheetInfo {
  name: string;
  visibility: SheetVisibility;
  protected: boolean;
}

export interface WorkbookPort {
  getSheets(): Promise<SheetInfo[]>;
  isStructureProtected(): Promise<boolean>;
  /** Returns cell values (not formulas) for an A1 address on the named sheet. */
  readValues(sheet: string, address: string): Promise<unknown[][]>;
  /** Connector ownership tag stored on the worksheet, or null if none. */
  getOwnershipTag(sheet: string): Promise<string | null>;

  /** Adds a new sheet (never replaces) and stamps it with the ownership tag. Fails if the name exists. */
  createOwnedSheet(name: string, opts: { hidden: boolean; ownershipTag: string }): Promise<void>;
  /** Executes a guarded write plan. */
  applyPlan(plan: GuardedPlan): Promise<void>;
}
