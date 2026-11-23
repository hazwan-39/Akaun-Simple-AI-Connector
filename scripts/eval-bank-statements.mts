// Runs the deterministic bank-statement parser over a local folder of sample PDFs and prints a
// summary table. Sample statements contain personal data: keep them OUTSIDE the repo, never commit
// them, and never send them anywhere. This script only reads files and prints counts.
//
//   npx tsx scripts/eval-bank-statements.mts "<folder>" [--dump <outDir>]
//
// --dump writes the parsed result per file as JSON to <outDir> for debugging (use a scratch folder).
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseBankStatement, type PdfTextItem } from "../packages/shared/src/bank/index.js";

const [folder, flag, dumpDir] = process.argv.slice(2);
if (!folder) {
  console.error("usage: eval-bank-statements.mts <folder> [--dump <outDir>]");
  process.exit(2);
}
if (flag === "--dump") mkdirSync(dumpDir, { recursive: true });

export async function pdfItems(data: Uint8Array): Promise<PdfTextItem[]> {
  const doc = await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const items: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      items.push({ page: p, str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
  }
  return items;
}

const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.pdf$/i.test(n)) files.push(p);
  }
};
walk(folder);

const rows = [];
for (const f of files.sort()) {
  const rel = relative(folder, f);
  const items = await pdfItems(new Uint8Array(readFileSync(f)));
  const r = parseBankStatement(items);
  if (flag === "--dump") writeFileSync(join(dumpDir, rel.replace(/[\\/]/g, "__") + ".json"), JSON.stringify(r, null, 1));
  rows.push({
    folder: rel.split(/[\\/]/)[0],
    file: basename(f).slice(0, 14),
    detected: r.bank,
    kind: r.kind,
    txns: r.transactions.length,
    checked: r.checks.balanceChecked,
    mismatch: r.checks.balanceMismatches,
    closing: r.checks.closingMatches === null ? "-" : r.checks.closingMatches ? "ok" : "BEZA",
    reconciled: r.reconciled ? "YA" : "tidak",
    issues: [...new Set(r.issues.map((i) => i.code))].join(","),
  });
}
console.table(rows);
const ok = rows.filter((r) => r.reconciled === "YA").length;
console.log(`reconciled ${ok}/${rows.length}`);
