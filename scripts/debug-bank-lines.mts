// Debug helper: print rebuilt lines (with token x / xEnd) for one local sample PDF, lines [from, to).
//   npx tsx scripts/debug-bank-lines.mts "<file.pdf>" <from> <to>
// Output contains statement text: run locally only, never paste it anywhere.
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildLines, type PdfTextItem } from "../packages/shared/src/bank/index.js";

const [file, from = "0", to = "40"] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
const items: PdfTextItem[] = [];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  for (const it of tc.items) if ("str" in it) items.push({ page: p, str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
}
buildLines(items)
  .slice(+from, +to)
  .forEach((l, i) => console.log(+from + i, `p${l.page}`, l.tokens.map((t) => `[${t.text}|${Math.round(t.x)}-${Math.round(t.xEnd)}]`).join(" ")));
