/**
 * DEMO ADAPTER – sample data only.
 *
 * Never reads the open workbook. Everything it returns is labelled as demo
 * (source.kind = "demo"), and the UI and generated worksheet show a DEMO
 * banner. Kept in its own folder so it cannot be mistaken for a production
 * adapter.
 */
import type { RawTransaction } from "@akaun/shared";
import type { AdapterDetection, AdapterReadResult, WorkbookAdapter } from "../types";

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const SALES = [18_450, 16_200, 21_380, 19_900, 23_150, 14_870, 17_640, 22_300, 20_150, 24_600];
const SUPPLIER = [7_800, 6_950, 9_200, 8_400, 10_100, 6_300, 7_450, 9_800, 8_900, 11_200];
const MARKETING = [600, 450, 1_200, 800, 1_500, 300, 500, 1_800, 900, 2_100];

export function buildDemoTransactions(): RawTransaction[] {
  const tx: RawTransaction[] = [];
  let n = 0;
  const add = (
    month: string,
    day: number,
    direction: RawTransaction["direction"],
    category: string,
    group: string,
    amount: number,
    description: string,
    kind: RawTransaction["kind"] = "cash",
  ) => {
    n += 1;
    tx.push({ sourceRef: `DEMO!${n}`, date: `${month}-${String(day).padStart(2, "0")}`, amount, direction, category, categoryGroup: group, description, kind });
  };

  MONTHS.forEach((m, i) => {
    // Sales received in two batches per month
    add(m, 10, "inflow", "Pendapatan / Revenue", "Operasi", Math.round(SALES[i]! * 0.55 * 100) / 100, "Jualan tunai");
    add(m, 25, "inflow", "Pendapatan / Revenue", "Operasi", Math.round(SALES[i]! * 0.45 * 100) / 100, "Bayaran pelanggan");
    add(m, 1, "outflow", "Sewa", "PERBELANJAAN PENTADBIRAN", 2_500, "Sewa kedai");
    add(m, 28, "outflow", "Gaji / EPF / SOCSO", "PERBELANJAAN PENTADBIRAN", 6_200, "Gaji pekerja");
    add(m, 15, "outflow", "Bil Utiliti", "PERBELANJAAN PENTADBIRAN", 380 + (i % 3) * 45, "Bil elektrik & air");
    add(m, 16, "outflow", "Bil Telefon & Internet", "PERBELANJAAN PENTADBIRAN", 189, "Internet kedai");
    add(m, 12, "outflow", "Bayaran Kepada Pembekal", "KOS JUALAN", SUPPLIER[i]!, "Stok pembekal");
    add(m, 20, "outflow", "Pemasaran", "PEMBAIKAN & PENYELENGGARAAN", MARKETING[i]!, "Iklan media sosial");
    add(m, 22, "outflow", "Petrol, Parking & Tol", "PERBELANJAAN PERJALANAN", 260 + (i % 4) * 30, "Penghantaran");
    add(m, 27, "outflow", "Caj Bank", "CAJ KEWANGAN", 12, "Caj perkhidmatan bank");
  });

  // Edge cases the engine must handle correctly:
  add("2026-01", 5, "inflow", "Modal Pemilik & Rakan Kongsi", "Pembiayaan", 10_000, "Suntikan modal pemilik");
  add("2026-06", 3, "inflow", "Pinjaman", "Pembiayaan", 15_000, "Pinjaman mikro");
  add("2026-06", 18, "outflow", "Kelengkapan Komputer", "ASET BUKAN SEMASA", 4_800, "Komputer riba baharu");
  add("2026-04", 9, "inflow", "Refunds", "Operasi", -150, "Pembetulan refund pelanggan");
  add("2026-08", 12, "outflow", "Bayaran Kepada Pembekal", "KOS JUALAN", 9_800, "Stok pembekal"); // looks duplicated
  add("2026-05", 2, "inflow", "Pindahan Dalaman", "Pindahan", 5_000, "Pindahan bank ke tunai", "internal_transfer");
  add("2026-05", 2, "outflow", "Pindahan Dalaman", "Pindahan", 5_000, "Pindahan bank ke tunai", "internal_transfer");
  add("2026-10", 31, "outflow", "Susut Nilai", "Bukan Tunai", 400, "Susut nilai peralatan", "non_cash");
  add("2026-07", 99 as number, "outflow", "Lain-lain Perbelanjaan", "PERBELANJAAN PENTADBIRAN", 75, "Tarikh salah taip"); // invalid date
  return tx;
}

export const DEMO_OPENING_BALANCE = 12_500;

export class DemoAdapter implements WorkbookAdapter {
  readonly id = "demo";
  readonly version = "1.0.0";
  readonly kind = "demo" as const;
  readonly label = "Data Demo (contoh)";

  async detect(): Promise<AdapterDetection> {
    return { status: "supported", version: this.version, message: "Data demo tersedia. Ia bukan data workbook anda." };
  }

  async read(): Promise<AdapterReadResult> {
    const transactions = buildDemoTransactions();
    return {
      source: { kind: "demo", adapterId: this.id, adapterVersion: this.version },
      sourceLabel: "DATA DEMO",
      businessName: "Kedai Contoh Sdn. Bhd. (DEMO)",
      transactions,
      openingBalance: DEMO_OPENING_BALANCE,
    };
  }
}
