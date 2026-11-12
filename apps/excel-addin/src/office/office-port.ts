/* global Excel */
/**
 * Office.js implementation of WorkbookPort.
 *
 * Requirement sets:
 *  - reading + protection checks: ExcelApi 1.7 (workbook.protection, worksheet.protection)
 *  - writing (ownership tags via worksheet.customProperties): ExcelApi 1.12
 *  - chart.plotVisibleOnly: ExcelApi 1.8
 */
import { OWNERSHIP_PROPERTY_KEY } from "@akaun/shared";
import { parseAddress, rectSize } from "./address";
import type { CellStyle, GuardedPlan, WriteOp } from "./dashboard/plan";
import type { SheetInfo, WorkbookPort } from "./workbook-port";

export class OfficeWorkbookPort implements WorkbookPort {
  async getSheets(): Promise<SheetInfo[]> {
    return Excel.run(async (ctx) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name,items/visibility,items/protection/protected");
      await ctx.sync();
      return sheets.items.map((s) => ({
        name: s.name,
        visibility: s.visibility as SheetInfo["visibility"],
        protected: s.protection.protected,
      }));
    });
  }

  async isStructureProtected(): Promise<boolean> {
    return Excel.run(async (ctx) => {
      const p = ctx.workbook.protection;
      p.load("protected");
      await ctx.sync();
      return p.protected;
    });
  }

  async readValues(sheet: string, address: string): Promise<unknown[][]> {
    return Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItemOrNullObject(sheet);
      await ctx.sync();
      if (ws.isNullObject) throw new Error(`Sheet not found: ${sheet}`);
      const r = ws.getRange(address);
      r.load("values");
      await ctx.sync();
      return r.values as unknown[][];
    });
  }

  async getOwnershipTag(sheet: string): Promise<string | null> {
    return Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItemOrNullObject(sheet);
      await ctx.sync();
      if (ws.isNullObject) return null;
      const prop = ws.customProperties.getItemOrNullObject(OWNERSHIP_PROPERTY_KEY);
      prop.load("value");
      await ctx.sync();
      return prop.isNullObject ? null : String(prop.value);
    });
  }

  async createOwnedSheet(name: string, opts: { hidden: boolean; ownershipTag: string }): Promise<void> {
    await Excel.run(async (ctx) => {
      const existing = ctx.workbook.worksheets.getItemOrNullObject(name);
      await ctx.sync();
      if (!existing.isNullObject) throw new Error(`Refusing to create: sheet "${name}" already exists`);
      const ws = ctx.workbook.worksheets.add(name);
      ws.customProperties.add(OWNERSHIP_PROPERTY_KEY, opts.ownershipTag);
      if (opts.hidden) ws.visibility = Excel.SheetVisibility.hidden;
      await ctx.sync();
    });
  }

  async applyPlan(plan: GuardedPlan): Promise<void> {
    const allowed = new Set(plan.allowedSheets);
    await Excel.run(async (ctx) => {
      const ws = (name: string) => {
        // Defence in depth: the plan is already guarded, but never resolve a non-owned sheet here.
        if (!allowed.has(name)) throw new Error(`Blocked write to ${name}`);
        return ctx.workbook.worksheets.getItem(name);
      };
      const charts: Extract<WriteOp, { op: "chart" }>[] = [];
      let activate: string | null = null;

      for (const op of plan.ops) {
        switch (op.op) {
          case "clear":
            ws(op.sheet).getRange(op.address).clear(Excel.ClearApplyTo.contents);
            break;
          case "values":
            ws(op.sheet).getRange(op.address).values = op.values;
            break;
          case "formulas":
            ws(op.sheet).getRange(op.address).formulas = op.formulas;
            break;
          case "format":
            applyStyle(ws(op.sheet).getRange(op.address), op.address, op.style);
            break;
          case "merge":
            ws(op.sheet).getRange(op.address).merge(false);
            break;
          case "columnWidth":
            ws(op.sheet).getRange(`${op.column}:${op.column}`).format.columnWidth = op.width;
            break;
          case "rowHeight":
            ws(op.sheet).getRange(op.address).format.rowHeight = op.height;
            break;
          case "chart":
            charts.push(op);
            break;
          case "activate":
            activate = op.sheet;
            break;
        }
      }
      await ctx.sync();

      // Charts: update in place when our named chart exists, otherwise create it once.
      const lookups = charts.map((c) => {
        const found = ws(c.sheet).charts.getItemOrNullObject(c.name);
        found.load("name");
        return { c, found };
      });
      await ctx.sync();
      for (const { c, found } of lookups) {
        const source = ws(c.sourceSheet).getRange(c.sourceAddress);
        if (found.isNullObject) {
          const chart = ws(c.sheet).charts.add(c.chartType as Excel.ChartType, source, Excel.ChartSeriesBy.columns);
          chart.name = c.name;
          chart.title.text = c.title;
          chart.legend.position = Excel.ChartLegendPosition.bottom;
          chart.plotVisibleOnly = false; // source sheet is hidden
          chart.setPosition(c.topLeft, c.bottomRight);
        } else {
          found.setData(source, Excel.ChartSeriesBy.columns);
          found.title.text = c.title;
        }
      }
      if (activate) ws(activate).activate();
      await ctx.sync();
    });
  }
}

function applyStyle(r: Excel.Range, address: string, s: CellStyle) {
  const f = r.format;
  if (s.bold !== undefined) f.font.bold = s.bold;
  if (s.italic !== undefined) f.font.italic = s.italic;
  if (s.fontSize !== undefined) f.font.size = s.fontSize;
  if (s.fontColor) f.font.color = s.fontColor;
  if (s.fill) f.fill.color = s.fill;
  if (s.wrap !== undefined) f.wrapText = s.wrap;
  if (s.hAlign) f.horizontalAlignment = s.hAlign as Excel.HorizontalAlignment;
  if (s.vAlign) f.verticalAlignment = s.vAlign as Excel.VerticalAlignment;
  if (s.numberFormat) {
    const rect = parseAddress(address);
    if (rect) {
      const { rows, cols } = rectSize(rect);
      r.numberFormat = Array.from({ length: rows }, () => Array<string>(cols).fill(s.numberFormat!));
    }
  }
  if (s.borderBottom) {
    const b = f.borders.getItem(Excel.BorderIndex.edgeBottom);
    b.style = Excel.BorderLineStyle.continuous;
    b.color = s.borderBottom;
  }
}
