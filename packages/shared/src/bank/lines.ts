import type { Line, PdfTextItem, Token } from "./types.js";

/** Items whose baselines differ by less than this are on the same line. */
const SAME_LINE_TOLERANCE = 2.5;
/** Items closer than this are one token (handles PDFs that place every character separately). */
const JOIN_GAP = 1.6;

/**
 * Rebuild visual lines from positioned PDF text: group by page and baseline, sort left to right,
 * glue fragments that touch, and drop exact duplicates (some PDFs draw text twice).
 */
export function buildLines(items: PdfTextItem[]): Line[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    (byPage.get(it.page) ?? byPage.set(it.page, []).get(it.page)!).push(it);
  }
  const lines: Line[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = byPage.get(page)!.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of pageItems) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.y - it.y) < SAME_LINE_TOLERANCE) g.items.push(it);
      else groups.push({ y: it.y, items: [it] });
    }
    for (const { y, items: g } of groups) {
      const seen = new Set<string>();
      const sorted = g
        .slice()
        .sort((a, b) => a.x - b.x)
        .filter((it) => {
          const k = `${Math.round(it.x)}|${it.str}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      const tokens: Token[] = [];
      for (const it of sorted) {
        const text = it.str.replace(/\s+/g, " ");
        const last = tokens[tokens.length - 1];
        if (last && it.x - last.xEnd < JOIN_GAP && it.x >= last.x) {
          last.text += text;
          last.xEnd = Math.max(last.xEnd, it.x + it.w);
        } else {
          tokens.push({ text, x: it.x, xEnd: it.x + it.w });
        }
      }
      for (const t of tokens) t.text = t.text.trim();
      const clean = tokens.filter((t) => t.text);
      if (!clean.length) continue;
      lines.push({ page, y, tokens: clean, text: clean.map((t) => t.text).join(" ") });
    }
  }
  return lines;
}
