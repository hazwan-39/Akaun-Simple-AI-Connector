/**
 * In-memory WorkbookPort used by automated tests and by the browser preview
 * (running the task pane outside Excel). It models just enough of Excel:
 * sheets, cell values/formulas, protection, custom properties and charts.
 */
import { OWNERSHIP_PROPERTY_KEY } from "@akaun/shared";
import { indexToCol, parseAddress } from "./address";
import type { GuardedPlan } from "./dashboard/plan";
import type { SheetInfo, SheetVisibility, WorkbookPort } from "./workbook-port";

export interface MemorySheet {
  name: string;
  visibility: SheetVisibility;
  protected: boolean;
  cells: Map<string, unknown>; // "B7" -> value or "=formula"
  props: Map<string, string>;
  charts: Map<string, { sourceSheet: string; sourceAddress: string; title: string; type: string }>;
  formats: number; // count of formatting ops (for assertions)
}

export class InMemoryWorkbookPort implements WorkbookPort {
  readonly sheets: MemorySheet[] = [];
  structureProtected = false;
  /** Every sheet name a write touched – used by integrity tests. */
  readonly writeLog: string[] = [];
  failNextApply = false;

  addSheet(name: string, init: { cells?: Record<string, unknown>; protected?: boolean; visibility?: SheetVisibility; props?: Record<string, string> } = {}) {
    this.sheets.push({
      name,
      visibility: init.visibility ?? "Visible",
      protected: init.protected ?? false,
      cells: new Map(Object.entries(init.cells ?? {})),
      props: new Map(Object.entries(init.props ?? {})),
      charts: new Map(),
      formats: 0,
    });
    return this;
  }

  sheet(name: string): MemorySheet | undefined {
    return this.sheets.find((s) => s.name === name);
  }

  /** Deep snapshot for before/after integrity comparison. */
  snapshot(name: string) {
    const s = this.sheet(name);
    if (!s) return null;
    return JSON.stringify({ ...s, cells: [...s.cells.entries()].sort(), props: [...s.props.entries()], charts: [...s.charts.entries()] });
  }

  async getSheets(): Promise<SheetInfo[]> {
    return this.sheets.map(({ name, visibility, protected: p }) => ({ name, visibility, protected: p }));
  }
  async isStructureProtected() {
    return this.structureProtected;
  }
  async readValues(sheetName: string, address: string): Promise<unknown[][]> {
    const s = this.sheet(sheetName);
    if (!s) throw new Error(`Sheet not found: ${sheetName}`);
    const r = parseAddress(address);
    if (!r) throw new Error(`Bad address ${address}`);
    const out: unknown[][] = [];
    for (let row = r.top; row <= r.bottom; row++) {
      const line: unknown[] = [];
      for (let col = r.left; col <= r.right; col++) {
        const v = s.cells.get(`${indexToCol(col)}${row}`);
        line.push(v === undefined ? "" : v);
      }
      out.push(line);
    }
    return out;
  }
  async getOwnershipTag(sheetName: string) {
    return this.sheet(sheetName)?.props.get(OWNERSHIP_PROPERTY_KEY) ?? null;
  }
  async createOwnedSheet(name: string, opts: { hidden: boolean; ownershipTag: string }) {
    if (this.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`exists: ${name}`);
    if (this.structureProtected) throw new Error("structure protected");
    this.addSheet(name, { visibility: opts.hidden ? "Hidden" : "Visible", props: { [OWNERSHIP_PROPERTY_KEY]: opts.ownershipTag } });
    this.writeLog.push(name);
  }
  async applyPlan(plan: GuardedPlan) {
    if (this.failNextApply) {
      this.failNextApply = false;
      throw new Error("simulated Excel failure");
    }
    for (const op of plan.ops) {
      const s = this.sheet(op.sheet);
      if (!s) throw new Error(`no sheet ${op.sheet}`);
      if (s.protected && op.op !== "activate") throw new Error(`sheet ${s.name} is protected`);
      this.writeLog.push(op.sheet);
      const each = (address: string, fn: (ref: string, r: number, c: number) => void) => {
        const rect = parseAddress(address)!;
        for (let r = rect.top; r <= rect.bottom; r++)
          for (let c = rect.left; c <= rect.right; c++) fn(`${indexToCol(c)}${r}`, r - rect.top, c - rect.left);
      };
      switch (op.op) {
        case "clear":
          each(op.address, (ref) => s.cells.delete(ref));
          break;
        case "values":
          each(op.address, (ref, r, c) => {
            const v = op.values[r]![c]!;
            // Excel stores a leading apostrophe as a text prefix, not as content.
            s.cells.set(ref, typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);
          });
          break;
        case "formulas":
          each(op.address, (ref, r, c) => s.cells.set(ref, op.formulas[r]![c]!));
          break;
        case "chart": {
          const target = this.sheet(op.sheet)!;
          target.charts.set(op.name, { sourceSheet: op.sourceSheet, sourceAddress: op.sourceAddress, title: op.title, type: op.chartType });
          break;
        }
        default:
          s.formats += 1;
      }
    }
  }
}
