/** A1-notation helpers (single-sheet, relative or absolute refs, no sheet prefix). */
export interface CellRect {
  top: number; // 1-based row
  left: number; // 1-based column
  bottom: number;
  right: number;
}

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) return NaN;
    n = n * 26 + (c - 64);
  }
  return n;
}

export function indexToCol(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CELL = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i;

/** Parses "B7" or "B7:M9" (no sheet name). Returns null for anything else. */
export function parseAddress(address: string): CellRect | null {
  if (address.includes("!")) return null;
  const parts = address.split(":");
  if (parts.length < 1 || parts.length > 2) return null;
  const cells = parts.map((p) => CELL.exec(p.trim()));
  if (cells.some((c) => !c)) return null;
  const [a, b = a] = cells as RegExpExecArray[];
  const r1 = Number(a![2]);
  const r2 = Number(b![2]);
  const c1 = colToIndex(a![1]!);
  const c2 = colToIndex(b![1]!);
  if (![r1, r2, c1, c2].every((n) => Number.isFinite(n) && n >= 1)) return null;
  return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: Math.min(c1, c2), right: Math.max(c1, c2) };
}

export const rectWithin = (inner: CellRect, outer: CellRect) =>
  inner.top >= outer.top && inner.bottom <= outer.bottom && inner.left >= outer.left && inner.right <= outer.right;

export const rectSize = (r: CellRect) => ({ rows: r.bottom - r.top + 1, cols: r.right - r.left + 1 });

export const cell = (col: string, row: number) => `${col}${row}`;
export const range = (c1: string, r1: number, c2: string, r2: number) => `${c1}${r1}:${c2}${r2}`;
