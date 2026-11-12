import { describe, expect, it } from "vitest";
import { calculateCashFlow } from "@akaun/shared";
import { AkaunSimpleV2Adapter } from "../../apps/excel-addin/src/office/adapters/akaun-simple-v2/adapter";
import { detectWorkbook } from "../../apps/excel-addin/src/office/adapters/registry";
import { InMemoryWorkbookPort } from "../../apps/excel-addin/src/office/memory-port";
import { buildAkaunSimpleV2, ORIGINAL_SHEETS, serial } from "../fixtures/akaun-simple-v2";

const sampleWorkbook = () =>
  buildAkaunSimpleV2({
    openingBalance: 3000,
    deposits: [
      { date: serial("2026-01-10"), desc: "Jualan", revenue: 5000 },
      { date: serial("2026-01-15"), desc: "Modal", capital: 2000 },
      { date: serial("2026-02-03"), desc: "Jualan & refund", revenue: 1200.5, refunds: 99.5 },
      { date: serial("2026-02-20"), desc: "Pinjaman bank", loan: 10000 },
      { date: serial("2026-02-21"), desc: "Tiada jumlah" },
    ],
    payments: [
      { date: serial("2026-01-12"), desc: "Sewa", amounts: { AB: 1500 } },
      { date: serial("2026-01-30"), desc: "Gaji & EPF", amounts: { E: 3200, M: 210.4 } },
      { date: serial("2026-02-14"), desc: "Stok", amounts: { AE: 2750 } },
      { date: "31/02/2026", desc: "Tarikh salah", amounts: { AC: 12 } },
    ],
  });

describe("Akaun Simple v2.26.02 adapter", () => {
  it("is detected but DISABLED unless production mapping is explicitly enabled", async () => {
    const d = await detectWorkbook(sampleWorkbook(), false);
    expect(d.detection.status).toBe("disabled");
    expect(d.detection.version).toBe("v2.26.02");
    await expect(new AkaunSimpleV2Adapter(false).read(sampleWorkbook())).rejects.toThrow(/belum diaktifkan/);
  });

  it("rejects unsupported versions", async () => {
    const d = await detectWorkbook(buildAkaunSimpleV2({ version: "v2.25.01" }), true);
    expect(d.detection.status).toBe("unsupported_version");
  });

  it("refuses to read when a header label differs (layout drift)", async () => {
    const port = sampleWorkbook();
    port.sheet("Payments")!.cells.set("AB5", "Sewa Kedai");
    const d = await new AkaunSimpleV2Adapter(true).detect(port);
    expect(d.status).toBe("unsupported_version");
    expect(d.message).toContain("Payments!AB5");
  });

  it("does not detect non-Akaun Simple workbooks", async () => {
    const port = new InMemoryWorkbookPort().addSheet("Sheet1");
    expect((await detectWorkbook(port, true)).detection.status).toBe("not_detected");
  });

  it("reads transactions, categories, opening balance and reconciles with workbook totals", async () => {
    const port = sampleWorkbook();
    const read = await new AkaunSimpleV2Adapter(true).read(port);
    expect(read.source).toEqual({ kind: "workbook", adapterId: "akaun-simple-v2", adapterVersion: "2.26.02" });
    expect(read.businessName).toBe("Syarikat Ujian");
    expect(read.expectedTotals).toEqual({ inflow: 18300, outflow: 7672.4 });

    const r = calculateCashFlow({ ...read, source: read.source });
    expect(r.summary.totals).toMatchObject({ inflow: 18300, outflow: 7660.4 });
    // Reconciliation compares everything read (including the row with a bad date) to the workbook totals.
    expect(r.reconciliation.every((c) => c.passed)).toBe(true);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["INVALID_DATE", "MISSING_AMOUNT"]));
    expect(r.summary.balances.opening).toBe(3000);
    expect(r.summary.balances.closing).toBe(3000 + 18300 - 7660.4);
    const rental = r.summary.categories.find((c) => c.name === "Sewa");
    expect(rental).toMatchObject({ direction: "outflow", group: "PEMBAIKAN & PENYELENGGARAAN", amount: 1500 });
    expect(r.summary.categories.find((c) => c.name === "Pinjaman")).toMatchObject({ group: "Pembiayaan", amount: 10000 });
  });

  it("detects a reconciliation mismatch with the workbook's own totals", async () => {
    const port = buildAkaunSimpleV2({
      deposits: [{ date: serial("2026-01-10"), revenue: 100 }],
      payments: [],
      depositTotalOverride: 150,
    });
    const read = await new AkaunSimpleV2Adapter(true).read(port);
    const r = calculateCashFlow(read);
    expect(r.status).toBe("unreconciled");
  });

  it("follows the Total row when users insert extra rows", async () => {
    const port = buildAkaunSimpleV2({ deposits: [{ date: serial("2026-03-01"), revenue: 10 }], depositCapacity: 400 });
    const read = await new AkaunSimpleV2Adapter(true).read(port);
    expect(read.expectedTotals?.inflow).toBe(10);
  });

  it("treats an empty opening balance as unknown, not zero", async () => {
    const read = await new AkaunSimpleV2Adapter(true).read(buildAkaunSimpleV2({ openingBalance: "", deposits: [{ date: serial("2026-03-01"), revenue: 10 }] }));
    expect(calculateCashFlow(read).summary.balances.opening).toBeNull();
  });

  it("is read-only: never writes to any sheet", async () => {
    const port = sampleWorkbook();
    const before = ORIGINAL_SHEETS.map((s) => port.snapshot(s));
    await new AkaunSimpleV2Adapter(true).read(port);
    expect(port.writeLog).toEqual([]);
    expect(ORIGINAL_SHEETS.map((s) => port.snapshot(s))).toEqual(before);
  });
});
