/** Declarative write operations. The renderer never calls Office.js directly. */
export type CellValue = string | number | boolean;

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;
  fill?: string;
  wrap?: boolean;
  hAlign?: "Left" | "Center" | "Right";
  vAlign?: "Top" | "Center" | "Bottom";
  numberFormat?: string;
  borderBottom?: string;
}

export type WriteOp =
  | { op: "clear"; sheet: string; address: string }
  | { op: "values"; sheet: string; address: string; values: CellValue[][] }
  | { op: "formulas"; sheet: string; address: string; formulas: string[][] }
  | { op: "format"; sheet: string; address: string; style: CellStyle }
  | { op: "merge"; sheet: string; address: string }
  | { op: "columnWidth"; sheet: string; column: string; width: number }
  | { op: "rowHeight"; sheet: string; address: string; height: number }
  | {
      op: "chart";
      sheet: string;
      name: string;
      chartType: "ColumnClustered" | "Line" | "ColumnStacked";
      sourceSheet: string;
      sourceAddress: string;
      title: string;
      topLeft: string;
      bottomRight: string;
    }
  | { op: "activate"; sheet: string };

export interface WritePlan {
  ops: WriteOp[];
}

declare const guardedBrand: unique symbol;
/** A plan that has passed the write allowlist. Only guard.ts can create one. */
export interface GuardedPlan {
  readonly ops: readonly WriteOp[];
  readonly allowedSheets: readonly string[];
  readonly [guardedBrand]: true;
}
