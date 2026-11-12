/**
 * Akaun Simple 2026 (v2.26.02) production adapter – READ ONLY.
 *
 * Status: mapping derived from the real v2.26.02 template, but NOT yet
 * verified against a workbook containing real transactions. It is therefore
 * disabled unless the build sets VITE_ENABLE_PRODUCTION_ADAPTER=true
 * (pilot testing on a COPY of a workbook only).
 */
import type { RawTransaction } from "@akaun/shared";
import { colToIndex, indexToCol } from "../../address";
import type { WorkbookPort } from "../../workbook-port";
import { AdapterReadError, type AdapterDetection, type AdapterReadResult, type WorkbookAdapter } from "../types";
import { AS_V2, AS_V2_SUPPORTED_VERSIONS, normLabel } from "./layout";

export class AkaunSimpleV2Adapter implements WorkbookAdapter {
  readonly id = "akaun-simple-v2";
  readonly version = "2.26.02";
  readonly kind = "workbook" as const;
  readonly label = "Akaun Simple 2026 (v2.26.02)";

  constructor(private readonly productionEnabled: boolean) {}

  async detect(port: WorkbookPort | null): Promise<AdapterDetection> {
    if (!port) return { status: "not_detected", version: null, message: "Tiada workbook." };
    const names = new Set((await port.getSheets()).map((s) => s.name));
    if (!AS_V2.requiredSheets.every((s) => names.has(s))) {
      return { status: "not_detected", version: null, message: "Workbook ini tidak dikenali sebagai Akaun Simple." };
    }
    const [[rawVersion]] = (await port.readValues(AS_V2.version.sheet, AS_V2.version.cell)) as [[unknown]];
    const version = String(rawVersion ?? "").trim();
    if (!(AS_V2_SUPPORTED_VERSIONS as readonly string[]).includes(version)) {
      return {
        status: "unsupported_version",
        version: version || null,
        message: `Versi Akaun Simple "${version || "tidak diketahui"}" belum disokong. Versi disokong: ${AS_V2_SUPPORTED_VERSIONS.join(", ")}.`,
      };
    }
    const headerProblem = await this.verifyHeaders(port);
    if (headerProblem) {
      return { status: "unsupported_version", version, message: `Struktur workbook berbeza daripada jangkaan (${headerProblem}). Data tidak dibaca.` };
    }
    if (!this.productionEnabled) {
      return {
        status: "disabled",
        version,
        message: `Akaun Simple ${version} dikesan. Pembacaan data sebenar belum diaktifkan sehingga pemetaan disahkan dengan data sebenar. Gunakan mod demo buat masa ini.`,
      };
    }
    return { status: "supported", version, message: `Akaun Simple ${version} dikesan.` };
  }

  /** Returns a short problem description, or null when every expected label matches. */
  private async verifyHeaders(port: WorkbookPort): Promise<string | null> {
    const checks: { sheet: string; row: number; headers: Record<string, string>; lastCol: string }[] = [
      { sheet: AS_V2.deposits.sheet, row: AS_V2.deposits.headerRow, headers: AS_V2.deposits.headers, lastCol: AS_V2.deposits.lastCol },
      { sheet: AS_V2.payments.sheet, row: AS_V2.payments.headerRow, headers: AS_V2.payments.headers, lastCol: AS_V2.payments.lastCol },
    ];
    for (const c of checks) {
      const [row] = await port.readValues(c.sheet, `A${c.row}:${c.lastCol}${c.row}`);
      for (const [col, expected] of Object.entries(c.headers)) {
        const actual = row?.[colToIndex(col) - 1];
        if (normLabel(actual) !== normLabel(expected)) return `${c.sheet}!${col}${c.row}`;
      }
    }
    const [[label]] = (await port.readValues(AS_V2.business.sheet, AS_V2.business.openingBalanceLabel.cell)) as [[unknown]];
    if (normLabel(label) !== normLabel(AS_V2.business.openingBalanceLabel.text)) return `Utama!${AS_V2.business.openingBalanceLabel.cell}`;
    return null;
  }

  private async findTotalRow(port: WorkbookPort, sheet: string, labelCol: string, firstRow: number): Promise<number> {
    const values = await port.readValues(sheet, `${labelCol}${firstRow}:${labelCol}${AS_V2.maxScanRow}`);
    const idx = values.findIndex((r) => normLabel(r[0]) === "total");
    if (idx < 0) throw new AdapterReadError(`Baris "Total" tidak ditemui dalam sheet ${sheet}.`);
    return firstRow + idx;
  }

  async read(port: WorkbookPort | null): Promise<AdapterReadResult> {
    const detection = await this.detect(port);
    if (detection.status !== "supported" || !port) throw new AdapterReadError(detection.message);

    const tx: RawTransaction[] = [];

    // ---- Deposits (cash/bank receipts) ----
    const dep = AS_V2.deposits;
    const depTotalRow = await this.findTotalRow(port, dep.sheet, dep.totalLabelCol, dep.firstDataRow);
    const depExpected = (await port.readValues(dep.sheet, `${dep.totalCol}${depTotalRow}`))[0]?.[0];
    if (depTotalRow > dep.firstDataRow) {
      const rows = await port.readValues(dep.sheet, `A${dep.firstDataRow}:${dep.lastCol}${depTotalRow - 1}`);
      rows.forEach((row, i) => {
        const r = dep.firstDataRow + i;
        const date = row[colToIndex(dep.dateCol) - 1];
        const desc = row[colToIndex(dep.descCol) - 1];
        let any = false;
        for (const { col, group } of dep.categories) {
          const v = row[colToIndex(col) - 1];
          if (v === "" || v === null || v === undefined || v === 0) continue;
          any = true;
          tx.push({ sourceRef: `${dep.sheet}!${col}${r}`, date, amount: v, direction: "inflow", category: dep.headers[col]!, categoryGroup: group, description: str(desc) });
        }
        if (!any && (date !== "" || str(desc))) {
          tx.push({ sourceRef: `${dep.sheet}!A${r}`, date, amount: null, direction: "inflow", category: "—", description: str(desc) });
        }
      });
    }

    // ---- Payments (cash/bank payments) ----
    const pay = AS_V2.payments;
    const payTotalRow = await this.findTotalRow(port, pay.sheet, pay.totalLabelCol, pay.firstDataRow);
    const payExpected = (await port.readValues(pay.sheet, `${pay.totalCol}${payTotalRow}`))[0]?.[0];
    if (payTotalRow > pay.firstDataRow) {
      const [groupRow] = await port.readValues(pay.sheet, `A${pay.groupRow}:${pay.lastCol}${pay.groupRow}`);
      const firstCat = colToIndex(pay.firstCategoryCol);
      const lastCat = colToIndex(pay.lastCol);
      // Group headers are merged cells: only the left-most cell holds the text, so forward-fill.
      const groups: string[] = [];
      let current = "";
      for (let c = firstCat; c <= lastCat; c++) {
        const g = str(groupRow?.[c - 1]);
        if (g) current = g;
        groups[c] = current;
      }
      const rows = await port.readValues(pay.sheet, `A${pay.firstDataRow}:${pay.lastCol}${payTotalRow - 1}`);
      rows.forEach((row, i) => {
        const r = pay.firstDataRow + i;
        const date = row[colToIndex(pay.dateCol) - 1];
        const desc = row[colToIndex(pay.descCol) - 1];
        let any = false;
        for (let c = firstCat; c <= lastCat; c++) {
          const v = row[c - 1];
          if (v === "" || v === null || v === undefined || v === 0) continue;
          any = true;
          const col = indexToCol(c);
          tx.push({
            sourceRef: `${pay.sheet}!${col}${r}`,
            date,
            amount: v,
            direction: "outflow",
            category: pay.headers[col]!,
            categoryGroup: groups[c] || null,
            description: str(desc),
          });
        }
        if (!any && (date !== "" || str(desc))) {
          tx.push({ sourceRef: `${pay.sheet}!B${r}`, date, amount: null, direction: "outflow", category: "—", description: str(desc) });
        }
      });
    }

    const [[businessName]] = (await port.readValues(AS_V2.business.sheet, AS_V2.business.name)) as [[unknown]];
    const [[opening]] = (await port.readValues(AS_V2.business.sheet, AS_V2.business.openingBalance)) as [[unknown]];

    return {
      source: { kind: "workbook", adapterId: this.id, adapterVersion: this.version },
      sourceLabel: `${this.label} – Deposits & Payments`,
      businessName: str(businessName) || null,
      transactions: tx,
      // An empty "Baki Mula" cell means the opening balance is unknown, not zero.
      openingBalance: opening === "" ? null : opening,
      expectedTotals: { inflow: num(depExpected), outflow: num(payExpected) },
    };
  }
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
