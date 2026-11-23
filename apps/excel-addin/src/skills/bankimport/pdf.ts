/**
 * Reads a statement PDF entirely inside the task pane (pdf.js). Nothing is uploaded.
 * The worker is bundled with the add-in, so no third-party CDN is contacted.
 */
import type { PdfTextItem } from "@akaun/shared";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

export class PdfReadError extends Error {}

export async function readPdfItems(file: File): Promise<PdfTextItem[]> {
  if (file.size > MAX_PDF_BYTES) throw new PdfReadError("Fail terlalu besar (had 10 MB).");
  const data = new Uint8Array(await file.arrayBuffer());
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new PdfReadError("PDF ini dilindungi kata laluan. Buka dan simpan semula tanpa kata laluan, kemudian cuba lagi.");
    }
    throw new PdfReadError("Fail ini tidak dapat dibaca sebagai PDF.");
  }
  if (doc.numPages > MAX_PDF_PAGES) throw new PdfReadError(`PDF terlalu panjang (had ${MAX_PDF_PAGES} muka surat).`);
  const items: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      items.push({ page: p, str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width });
    }
  }
  await doc.destroy();
  if (!items.some((i) => i.str.trim())) throw new PdfReadError("PDF ini tiada teks (mungkin imbasan). Muat turun e-statement asal dari bank.");
  return items;
}
