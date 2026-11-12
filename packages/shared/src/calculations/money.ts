/**
 * All money arithmetic is done in integer sen to avoid floating-point drift.
 */
export const toSen = (ringgit: number): number => Math.round(ringgit * 100);
export const fromSen = (sen: number): number => Math.round(sen) / 100;

/** Parses a cell value into a finite number, or null when not a usable amount. */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "-") return null;
    // Accept "RM 1,234.50", "(1,234.50)" accounting negatives, "1234.5"
    let s = trimmed.replace(/^RM\s*/i, "").replace(/,/g, "");
    let negative = false;
    if (/^\(.*\)$/.test(s)) {
      negative = true;
      s = s.slice(1, -1);
    }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  }
  return null;
}

/** True when the cell holds something (so a failed parse is "invalid", not "empty"). */
export const hasValue = (value: unknown): boolean =>
  !(value === null || value === undefined || (typeof value === "string" && value.trim() === ""));

export const formatRM = (amount: number | null | undefined): string =>
  amount === null || amount === undefined
    ? "—"
    : `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
