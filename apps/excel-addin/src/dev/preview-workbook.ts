/**
 * DEVELOPMENT ONLY: an in-memory, empty Akaun Simple v2.26.02 layout so the bank-import flow can be
 * tried in a normal browser (outside Excel). Contains no customer data. Never used inside Excel.
 */
import { AS_V2 } from "../office/adapters/akaun-simple-v2/layout";
import { InMemoryWorkbookPort } from "../office/memory-port";

export function buildPreviewWorkbook(): InMemoryWorkbookPort {
  const port = new InMemoryWorkbookPort();
  const header = (row: number, headers: Record<string, string>) => Object.fromEntries(Object.entries(headers).map(([c, v]) => [`${c}${row}`, v]));

  const dep = AS_V2.deposits;
  const depCells: Record<string, unknown> = { A1: 0, A2: 0, A3: "Cash & Bank Deposits", A4: "Tahun 2026", ...header(dep.headerRow, dep.headers) };
  for (let r = dep.firstDataRow; r <= 365; r++) depCells[`C${r}`] = `=SUM(D${r}:G${r})`;
  depCells.B366 = "Total";
  depCells.C366 = "=SUM(C6:C365)";

  const pay = AS_V2.payments;
  const payCells: Record<string, unknown> = { A1: 0, A2: 0, A3: "Cash & Bank Payments", A4: "Tahun 2026", ...header(pay.headerRow, pay.headers) };
  for (let r = pay.firstDataRow; r <= 364; r++) payCells[`D${r}`] = `=SUM(E${r}:AO${r})`;
  payCells.C365 = "Total";
  payCells.D365 = "=SUM(D6:D364)";

  port
    .addSheet("Cash Flow", { protected: true })
    .addSheet(dep.sheet, { cells: depCells, protected: true })
    .addSheet(pay.sheet, { cells: payCells, protected: true })
    .addSheet("Utama", { cells: { [AS_V2.version.cell]: "v2.26.02", D10: "Baki Mula", F5: "Contoh Enterprise" }, protected: true });
  return port;
}
