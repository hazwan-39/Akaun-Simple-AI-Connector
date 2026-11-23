/** Amount / date token recognisers shared by every bank profile. */

export interface AmountToken {
  sen: number;
  /** Explicit sign printed with the amount: "-", "DR", "+", "CR". */
  sign: "neg" | "pos" | null;
}

// 1,234.56 | 1234.56 | .00 | 1,234.56- | 1,234.56 CR | - MYR 100.00 | + RM 5.00 | (12.00)
const AMOUNT_RE =
  /^(?<pre>[+-])?\s*(?:MYR|RM)?\s*(?<open>\()?(?<int>\d{1,3}(?:,\d{3})+|\d+)?\.(?<dec>\d{2})(?<close>\))?\s*(?<post>-|\+|CR|DR|DB|Cr|Dr)?$/;

export function parseAmountToken(raw: string): AmountToken | null {
  const s = raw.replace(/\s+/g, " ").trim();
  const m = AMOUNT_RE.exec(s);
  if (!m?.groups) return null;
  const g = m.groups;
  if (Boolean(g.open) !== Boolean(g.close)) return null;
  const int = (g.int ?? "0").replace(/,/g, "");
  if (int.length > 12) return null;
  const sen = Number(int) * 100 + Number(g.dec);
  let sign: AmountToken["sign"] = null;
  if (g.pre === "-" || g.open || g.post === "-" || /^d/i.test(g.post ?? "")) sign = "neg";
  else if (g.pre === "+" || g.post === "+" || /^cr$/i.test(g.post ?? "")) sign = "pos";
  return { sen, sign };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogos: 8, ogo: 8,
  sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

export interface DateToken {
  day: number;
  month: number;
  /** Full year if printed, otherwise null (inferred later from the statement period). */
  year: number | null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const valid = (d: number, m: number) => d >= 1 && d <= 31 && m >= 1 && m <= 12;

/**
 * Recognise a transaction date at the start of a line. `allowCompact` enables ddmmyy (Alliance),
 * which is only safe in the leftmost date column.
 */
export function parseDateToken(raw: string, allowCompact = false): DateToken | null {
  const s = raw.trim();
  const match = (re: RegExp) => {
    const m = re.exec(s);
    return m ? (i: number) => m[i] ?? "" : null;
  };
  const make = (d: number, mo: number | undefined, year: number | null): DateToken | null =>
    mo !== undefined && valid(d, mo) ? { day: d, month: mo, year } : null;
  let g: ((i: number) => string) | null;
  if ((g = match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) return make(+g(1), +g(2), fullYear(g(3)));
  if ((g = match(/^(\d{1,2})[\s-]?([A-Za-z]{3,4})[\s-]?(\d{2}|\d{4})?$/)))
    return make(+g(1), MONTHS[g(2).toLowerCase()], g(3) ? fullYear(g(3)) : null);
  if ((g = match(/^([A-Za-z]{3,4})[\s-]?(\d{1,2})(?:,?\s*(\d{4}))?$/)))
    return make(+g(2), MONTHS[g(1).toLowerCase()], g(3) ? +g(3) : null);
  if ((g = match(/^(\d{1,2})\/(\d{1,2})$/))) return make(+g(1), +g(2), null);
  if (allowCompact && (g = match(/^(\d{2})(\d{2})(\d{2})$/))) return make(+g(1), +g(2), 2000 + +g(3));
  return null;
}

export const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
