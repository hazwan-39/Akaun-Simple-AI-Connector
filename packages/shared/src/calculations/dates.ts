/**
 * Date parsing for workbook values. Excel (1900 date system) returns dates as
 * serial numbers through Office.js `values`. The 1904 date system is not used
 * by Akaun Simple and is not handled here.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
export const MIN_YEAR = 1990;
export const MAX_YEAR = 2100;

const pad = (n: number) => String(n).padStart(2, "0");

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Returns an ISO yyyy-mm-dd string, or null for missing/invalid dates. */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1) return null;
    const dt = new Date(EXCEL_EPOCH_UTC + Math.floor(value) * MS_PER_DAY);
    return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "string") {
    const s = value.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return isoFromParts(+m[1]!, +m[2]!, +m[3]!);
    // Malaysian convention: dd/mm/yyyy, dd-mm-yyyy or dd.mm.yyyy
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return isoFromParts(+m[3]!, +m[2]!, +m[1]!);
    return null;
  }
  return null;
}

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export const isValidMonth = (m: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Inclusive list of yyyy-mm months between start and end. */
export function monthRange(start: string, end: string): string[] {
  if (!isValidMonth(start) || !isValidMonth(end) || start > end) return [];
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 1200) break;
  }
  return out;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

const MS_MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
export const monthLabelMs = (month: string): string => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MS_MONTHS[m - 1] ?? "?"} ${y}`;
};
