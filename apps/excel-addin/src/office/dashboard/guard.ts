/**
 * WRITE ALLOWLIST ENFORCEMENT.
 *
 * Every workbook write passes through `guardPlan`. A plan is rejected as a
 * whole (nothing is written) if any operation:
 *  - targets a sheet that is not a verified connector-owned sheet
 *  - targets cells outside that sheet's fixed template bounds
 *  - writes a text value Excel would interpret as a formula
 *  - writes a formula that references another sheet, an external workbook,
 *    or uses a function outside the small developer whitelist
 *  - builds a chart from data outside connector-owned sheets
 */
import { AI_DASHBOARD_SHEET, AI_DATA_SHEET, isFormulaLike } from "@akaun/shared";
import { parseAddress, rectSize, rectWithin, type CellRect } from "../address";
import type { GuardedPlan, WriteOp, WritePlan } from "./plan";

export class WriteGuardError extends Error {
  constructor(readonly reason: string) {
    super(`Write blocked: ${reason}`);
  }
}

/** Fixed template bounds per connector-owned sheet. */
export const SHEET_BOUNDS: Record<string, CellRect> = {
  [AI_DASHBOARD_SHEET]: parseAddress("A1:N90")!,
  [AI_DATA_SHEET]: parseAddress("A1:J40")!,
};

const ALLOWED_FUNCTIONS = new Set(["SUM", "IF", "IFERROR", "ROUND", "ABS", "MAX", "MIN", "AVERAGE", "COUNT", "ISNUMBER", "AND", "OR", "NOT"]);
const MAX_OPS = 500;

function checkAddress(sheet: string, address: string): CellRect {
  const rect = parseAddress(address);
  if (!rect) throw new WriteGuardError(`invalid address "${address}"`);
  const bounds = SHEET_BOUNDS[sheet];
  if (!bounds || !rectWithin(rect, bounds)) throw new WriteGuardError(`address ${sheet}!${address} outside template bounds`);
  return rect;
}

/** Extracts sheet names referenced in a formula ('Name'!A1 or Name!A1). */
function referencedSheets(formula: string): string[] {
  const out: string[] = [];
  const quoted = /'((?:[^']|'')+)'!/g;
  for (const m of formula.matchAll(quoted)) out.push(m[1]!.replace(/''/g, "'"));
  const stripped = formula.replace(quoted, "").replace(/"[^"]*"/g, "");
  for (const m of stripped.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)!/g)) out.push(m[1]!);
  return out;
}

export function checkFormula(formula: string, allowedSheets: ReadonlySet<string>) {
  if (!formula.startsWith("=")) throw new WriteGuardError("formula must start with =");
  if (formula.length > 500) throw new WriteGuardError("formula too long");
  if (formula.includes("[")) throw new WriteGuardError("external workbook references are not allowed");
  for (const s of referencedSheets(formula)) {
    if (!allowedSheets.has(s)) throw new WriteGuardError(`formula references non-owned sheet "${s}"`);
  }
  const noStrings = formula.replace(/"[^"]*"/g, "");
  for (const m of noStrings.matchAll(/([A-Z][A-Z0-9.]*)\s*\(/gi)) {
    if (!ALLOWED_FUNCTIONS.has(m[1]!.toUpperCase())) throw new WriteGuardError(`function ${m[1]} is not allowed`);
  }
}

function checkOp(op: WriteOp, allowed: ReadonlySet<string>) {
  if (!allowed.has(op.sheet)) throw new WriteGuardError(`sheet "${op.sheet}" is not a verified connector-owned sheet`);
  switch (op.op) {
    case "clear":
    case "format":
    case "merge":
    case "rowHeight":
      checkAddress(op.sheet, op.address);
      return;
    case "columnWidth":
      if (!/^[A-Z]{1,2}$/.test(op.column)) throw new WriteGuardError("invalid column");
      checkAddress(op.sheet, `${op.column}1`);
      return;
    case "values": {
      const size = rectSize(checkAddress(op.sheet, op.address));
      if (op.values.length !== size.rows || op.values.some((r) => r.length !== size.cols)) {
        throw new WriteGuardError(`values shape does not match ${op.address}`);
      }
      for (const row of op.values) {
        for (const v of row) {
          if (typeof v === "number" && !Number.isFinite(v)) throw new WriteGuardError("non-finite number");
          if (typeof v === "string" && !v.startsWith("'") && isFormulaLike(v)) {
            throw new WriteGuardError("unsanitised formula-like text value");
          }
        }
      }
      return;
    }
    case "formulas": {
      const size = rectSize(checkAddress(op.sheet, op.address));
      if (op.formulas.length !== size.rows || op.formulas.some((r) => r.length !== size.cols)) {
        throw new WriteGuardError(`formulas shape does not match ${op.address}`);
      }
      op.formulas.flat().forEach((f) => checkFormula(f, allowed));
      return;
    }
    case "chart":
      if (!allowed.has(op.sourceSheet)) throw new WriteGuardError("chart source must be a connector-owned sheet");
      checkAddress(op.sourceSheet, op.sourceAddress);
      checkAddress(op.sheet, op.topLeft);
      checkAddress(op.sheet, op.bottomRight);
      if (!/^AS_AI_[A-Za-z0-9_]{1,40}$/.test(op.name)) throw new WriteGuardError("chart name must use the AS_AI_ prefix");
      return;
    case "activate":
      return;
  }
}

/**
 * @param verifiedOwnedSheets sheets whose ownership tag was verified at runtime
 *        immediately before rendering. Intersected with the static allowlist.
 */
export function guardPlan(plan: WritePlan, verifiedOwnedSheets: readonly string[]): GuardedPlan {
  const allowed = new Set(verifiedOwnedSheets.filter((s) => s in SHEET_BOUNDS));
  if (plan.ops.length > MAX_OPS) throw new WriteGuardError("plan too large");
  for (const op of plan.ops) checkOp(op, allowed);
  return Object.freeze({ ops: Object.freeze([...plan.ops]), allowedSheets: Object.freeze([...allowed]) }) as unknown as GuardedPlan;
}
