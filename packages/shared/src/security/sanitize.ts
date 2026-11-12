/**
 * Formula-injection protection for any text written into Excel cells.
 *
 * Excel interprets a value beginning with = + - @ (and, via DDE, tab / CR)
 * as a formula. All untrusted text (AI output, workbook labels) must pass
 * through `sanitizeCellText` before it is written. The leading apostrophe is
 * Excel's own "store as text" prefix and is not displayed.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r＝＋－＠]/;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export const MAX_CELL_TEXT = 2000;

export function sanitizeCellText(input: unknown, maxLength = MAX_CELL_TEXT): string {
  if (input === null || input === undefined) return "";
  let s = String(input).replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n");
  if (s.length > maxLength) s = `${s.slice(0, maxLength - 1)}…`;
  const trimmedStart = s.replace(/^\s+/, "");
  if (FORMULA_TRIGGER.test(trimmedStart) || FORMULA_TRIGGER.test(s)) s = `'${s}`;
  return s;
}

/** True when a string would be interpreted by Excel as a formula/DDE trigger. */
export const isFormulaLike = (s: string): boolean => FORMULA_TRIGGER.test(s) || FORMULA_TRIGGER.test(s.replace(/^\s+/, ""));

/** Strips anything that looks like an instruction delimiter before data is embedded in a prompt. */
export function sanitizePromptLabel(input: string, maxLength = 80): string {
  return input
    .replace(CONTROL_CHARS, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>{}`]/g, "")
    .slice(0, maxLength)
    .trim();
}
