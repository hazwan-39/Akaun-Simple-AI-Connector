import {
  BANK_CATEGORY_INTERNAL,
  BANK_LEDGER_SHEET,
  BANK_LISTS_SHEET,
  BANK_TRANSFER_SHEET,
  bankOwnershipToken,
  OWNERSHIP_PROPERTY_KEY,
  type BankParseResult,
  type ParsedTransaction,
} from "@akaun/shared";
import { describe, expect, it } from "vitest";
import { WriteGuardError, guardPlan } from "../../apps/excel-addin/src/office/dashboard/guard";
import { isoToSerial } from "../../apps/excel-addin/src/skills/bankimport/ledger";
import {
  confirmTransfer,
  importStatement,
  ledgerSummary,
  prepareTransfer,
  readCategoryLists,
} from "../../apps/excel-addin/src/skills/bankimport/service";
import { inspectBankSheets } from "../../apps/excel-addin/src/skills/bankimport/sheets";
import { TransferBlockedError } from "../../apps/excel-addin/src/skills/bankimport/transfer";
import { buildAkaunSimpleV2, ORIGINAL_SHEETS } from "../fixtures/akaun-simple-v2";

/** Synthetic reconciled statement (no real customer data). */
function statement(txns: Omit<ParsedTransaction, "seq" | "page" | "directionSource">[], openingSen = 100000): BankParseResult {
  let bal = openingSen;
  const transactions = txns.map((t, seq) => {
    bal += t.direction === "in" ? t.amountSen : -t.amountSen;
    return { ...t, seq, page: 1, directionSource: "balance" as const, balanceSen: t.balanceSen ?? bal };
  });
  const inSen = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountSen, 0);
  const outSen = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountSen, 0);
  return {
    bank: "MAYBANK",
    kind: "account",
    openingSen,
    closingSen: bal,
    transactions,
    totals: { inSen, outSen },
    checks: { balanceChecked: transactions.length, balanceMismatches: 0, closingMatches: true },
    issues: [],
    reconciled: true,
  };
}

const SAMPLE = statement([
  { date: "2026-03-02", description: "DUITNOW QR SALE", amountSen: 25000, direction: "in", balanceSen: null },
  { date: "2026-03-03", description: "-TNB BILL PAYMENT", amountSen: 12345, direction: "out", balanceSen: null },
  { date: "2026-03-05", description: "IBG FROM CUSTOMER", amountSen: 150000, direction: "in", balanceSen: null },
  { date: "2026-03-06", description: "TRANSFER TO OWN SAVINGS", amountSen: 50000, direction: "out", balanceSen: null },
  { date: "2026-03-09", description: "SERVICE CHARGE", amountSen: 50, direction: "out", balanceSen: null },
]);

/** The real template keeps the workbook's SUM formula in every data row of the total column. */
function workbook() {
  const port = buildAkaunSimpleV2({ depositCapacity: 20, paymentCapacity: 20 });
  for (let r = 6; r < 26; r++) {
    port.sheet("Deposits")!.cells.set(`C${r}`, `=SUM(D${r}:G${r})`);
    port.sheet("Payments")!.cells.set(`D${r}`, `=SUM(E${r}:AO${r})`);
  }
  return port;
}

const opts = { writeApiSupported: true, userConfirmedCreate: true };
const setCategory = (port: ReturnType<typeof workbook>, row: number, category: string) => port.sheet(BANK_LEDGER_SHEET)!.cells.set(`H${row}`, category);

describe("bank import: Buku Bank", () => {
  it("requires confirmation before creating its sheets and never touches original sheets", async () => {
    const port = workbook();
    const before = Object.fromEntries(ORIGINAL_SHEETS.map((s) => [s, port.snapshot(s)]));
    await expect(importStatement(port, SAMPLE, "Maybank 5123", { ...opts, userConfirmedCreate: false })).rejects.toThrow(/confirmation/);
    expect(port.sheet(BANK_LEDGER_SHEET)).toBeUndefined();

    const r = await importStatement(port, SAMPLE, "Maybank 5123", opts);
    expect(r).toMatchObject({ added: 5, duplicates: 0, firstRow: 2, lastRow: 6, createdSheets: true });
    for (const s of ORIGINAL_SHEETS) expect(port.snapshot(s)).toBe(before[s]);
    expect(new Set(port.writeLog)).toEqual(new Set([BANK_LEDGER_SHEET, BANK_TRANSFER_SHEET, BANK_LISTS_SHEET]));
    expect(port.sheet(BANK_LISTS_SHEET)!.visibility).toBe("Hidden");
    expect(port.sheet(BANK_LEDGER_SHEET)!.props.get(OWNERSHIP_PROPERTY_KEY)).toBe(bankOwnershipToken("ledger"));
  });

  it("writes one row per transaction with real dates, sanitised text and a category dropdown", async () => {
    const port = workbook();
    await importStatement(port, SAMPLE, "Maybank 5123", opts);
    const ledger = port.sheet(BANK_LEDGER_SHEET)!.cells;
    expect(ledger.get("B2")).toBe(isoToSerial("2026-03-02"));
    expect(ledger.get("D2")).toBe(250);
    expect(ledger.get("E3")).toBe(123.45);
    expect(ledger.get("C3")).toBe("-TNB BILL PAYMENT"); // stored as text (apostrophe prefix), never as a formula
    expect(ledger.get("K2")).toBe("Baru");
    const source = [...port.validations.entries()].find(([k]) => k.startsWith(`${BANK_LEDGER_SHEET}!H2`))?.[1];
    expect(source).toMatch(/^=IF\(\$D2<>"",'_AI_BANK_LISTS'!\$A\$1:\$A\$6,'_AI_BANK_LISTS'!\$B\$1:\$B\$39\)$/);
    expect(port.sheet(BANK_LISTS_SHEET)!.cells.get("A1")).toBe("Pendapatan / Revenue");
    expect(port.sheet(BANK_LISTS_SHEET)!.cells.get("A5")).toBe(BANK_CATEGORY_INTERNAL);
  });

  it("reads category lists from the workbook's own headers", async () => {
    const lists = await readCategoryLists(workbook());
    expect(lists.deposits).toEqual(["Pendapatan / Revenue", "Modal Pemilik & Rakan Kongsi", "Refunds", "Pinjaman"]);
    expect(lists.payments).toHaveLength(37);
    expect(lists.payments).toContain("Intengible Asset"); // missing from the VBA form's dropdown
  });

  it("skips transactions already imported (overlapping statements)", async () => {
    const port = workbook();
    await importStatement(port, SAMPLE, "Maybank 5123", opts);
    const again = await importStatement(port, SAMPLE, "Maybank 5123", opts);
    expect(again).toMatchObject({ added: 0, duplicates: 5 });
    const otherAccount = await importStatement(port, SAMPLE, "CIMB 0001", opts);
    expect(otherAccount.added).toBe(5);
  });

  it("refuses a statement that did not reconcile", async () => {
    const port = workbook();
    await expect(importStatement(port, { ...SAMPLE, reconciled: false }, "Maybank", opts)).rejects.toThrow(/belum disahkan/);
    expect(port.sheet(BANK_LEDGER_SHEET)?.cells.get("A2")).toBeUndefined();
  });

  it("refuses to adopt a user sheet that happens to be called Buku Bank", async () => {
    const port = workbook();
    port.addSheet("buku bank", { cells: { A1: "mine" } });
    expect((await inspectBankSheets(port, true)).blockedReason).toBe("SHEET_NAME_TAKEN");
    await expect(importStatement(port, SAMPLE, "Maybank", opts)).rejects.toThrow(/bukan dicipta/);
    expect(port.sheet("buku bank")!.cells.get("A1")).toBe("mine");
  });
});

describe("bank import: transfer to Deposits / Payments", () => {
  async function categorised() {
    const port = workbook();
    await importStatement(port, SAMPLE, "Maybank 5123", opts);
    setCategory(port, 2, "Pendapatan / Revenue");
    setCategory(port, 3, "Bil Utiliti");
    setCategory(port, 4, "Pendapatan / Revenue");
    setCategory(port, 5, BANK_CATEGORY_INTERNAL);
    setCategory(port, 6, "Caj Bank");
    return port;
  }

  it("builds a Deposits block at COUNTA(A)+1 carrying the template SUM formula, then verifies the paste", async () => {
    const port = await categorised();
    const before = port.snapshot("Deposits");
    const prep = await prepareTransfer(port, "deposits");
    expect(port.snapshot("Deposits")).toBe(before); // preparing never writes the target
    expect(prep).toMatchObject({ count: 2, blockAddress: "A5:G6", pasteAt: "Deposits!A6" });
    expect(port.selection).toEqual({ sheet: BANK_TRANSFER_SHEET, address: "A5:G6" });
    const t = port.sheet(BANK_TRANSFER_SHEET)!.cells;
    expect([t.get("A5"), t.get("B5"), t.get("C5"), t.get("D5"), t.get("E5")]).toEqual([isoToSerial("2026-03-02"), "DUITNOW QR SALE", "=SUM(D5:G5)", 250, undefined]);

    port.pasteFormulas(BANK_TRANSFER_SHEET, "A5:G6", "Deposits", "A6");
    expect(port.sheet("Deposits")!.cells.get("C6")).toBe("=SUM(D6:G6)"); // Excel shifts the template formula to the target row
    expect(port.sheet("Deposits")!.cells.get("C7")).toBe("=SUM(D7:G7)");
    const done = await confirmTransfer(port);
    expect(done).toEqual({ ok: true, moved: 2, sheet: "Deposits" });
    const ledger = port.sheet(BANK_LEDGER_SHEET)!.cells;
    expect([ledger.get("K2"), ledger.get("L2")]).toEqual(["Dipindah", "Deposits!6"]);
    expect([ledger.get("K4"), ledger.get("L4")]).toEqual(["Dipindah", "Deposits!7"]);
    expect(ledger.get("K5")).toBe("Baru"); // Pindahan Dalaman is never moved
    expect((await ledgerSummary(port, true)).readyIn).toBe(0);
  });

  it("transfers the short Butiran (column N), keeps the full text in Buku Bank, and respects user edits", async () => {
    const port = workbook();
    const long = statement([
      { date: "2026-03-02", description: "DUITNOW QR SALE 20260302M0000061861 CUSTOMER WITH A VERY LONG NAME SDN BHD 2603021448243324", amountSen: 25000, direction: "in", balanceSen: null },
      { date: "2026-03-03", description: "IBG CREDIT 20260303ABCDE12345 ANOTHER CUSTOMER", amountSen: 1000, direction: "in", balanceSen: null },
    ]);
    await importStatement(port, long, "Maybank", opts);
    const L = port.sheet(BANK_LEDGER_SHEET)!.cells;
    expect(L.get("C2")).toContain("2603021448243324"); // full description kept
    expect(L.get("N2")).toBe("DUITNOW QR SALE CUSTOMER WITH A VERY LONG");
    expect(String(L.get("N2")).length).toBeLessThanOrEqual(43);
    L.set("N3", "Jualan pelanggan B"); // user edit wins
    setCategory(port, 2, "Pendapatan / Revenue");
    setCategory(port, 3, "Pendapatan / Revenue");
    await prepareTransfer(port, "deposits");
    const t = port.sheet(BANK_TRANSFER_SHEET)!.cells;
    expect([t.get("B5"), t.get("B6")]).toEqual(["DUITNOW QR SALE CUSTOMER WITH A VERY LONG", "Jualan pelanggan B"]);
    port.pasteFormulas(BANK_TRANSFER_SHEET, "A5:G6", "Deposits", "A6");
    expect(await confirmTransfer(port)).toMatchObject({ ok: true, moved: 2 });
  });

  it("fills Payments column A with the form's =ROW()-5 so the VBA form does not overwrite the rows", async () => {
    const port = await categorised();
    const prep = await prepareTransfer(port, "payments");
    expect(prep).toMatchObject({ count: 2, pasteAt: "Payments!A6", blockAddress: "A5:AO6" });
    const t = port.sheet(BANK_TRANSFER_SHEET)!.cells;
    expect([t.get("A5"), t.get("A6")]).toEqual(["=ROW()-5", "=ROW()-5"]);
    expect([t.get("D5"), t.get("D6")]).toEqual(["=SUM(E5:AO5)", "=SUM(E6:AO6)"]);
    expect(t.get("M5")).toBe(123.45); // Bil Utiliti
    expect(t.get("AC6")).toBe(0.5); // Caj Bank
    port.pasteFormulas(BANK_TRANSFER_SHEET, "A5:AO6", "Payments", "A6");
    expect((await port.readValues("Payments", "A6:A7")).flat()).toEqual([1, 2]);
    expect(await confirmTransfer(port)).toEqual({ ok: true, moved: 2, sheet: "Payments" });
  });

  it("rejects a Values paste: the total becomes a fixed number instead of the template formula", async () => {
    const port = await categorised();
    await prepareTransfer(port, "deposits");
    port.pasteFormulas(BANK_TRANSFER_SHEET, "A5:G6", "Deposits", "A6");
    const dep = port.sheet("Deposits")!.cells;
    dep.set("C6", 250); // what Paste Values leaves: right number, formula gone
    const r = await confirmTransfer(port);
    expect(r.ok).toBe(false);
    if (!r.ok && "diffs" in r) expect(r.diffs).toEqual([{ row: 6, col: "C", expected: "=SUM(D6:G6)", actual: 250 }]);
    expect(port.sheet(BANK_LEDGER_SHEET)!.cells.get("K2")).toBe("Baru");
  });

  it("does not mark anything when the paste is wrong (formula wiped, wrong column)", async () => {
    const port = await categorised();
    await prepareTransfer(port, "deposits");
    port.pasteFormulas(BANK_TRANSFER_SHEET, "A5:G6", "Deposits", "A6");
    const dep = port.sheet("Deposits")!.cells;
    dep.delete("C6"); // the problem seen in real Excel with Values + Skip blanks
    dep.set("E7", dep.get("D7")!);
    dep.delete("D7");
    const r = await confirmTransfer(port);
    expect(r.ok).toBe(false);
    if (!r.ok && "diffs" in r) expect(r.diffs.map((d) => `${d.col}${d.row}`)).toEqual(expect.arrayContaining(["C6", "D7", "E7"]));
    expect(port.sheet(BANK_LEDGER_SHEET)!.cells.get("K2")).toBe("Baru");
  });

  it("starts after rows entered by the VBA form and refuses when column A has a gap", async () => {
    const port = await categorised();
    const dep = port.sheet("Deposits")!.cells;
    dep.set("A6", isoToSerial("2026-02-01"));
    dep.set("B6", "Manual entry");
    dep.set("D6", 10);
    expect((await prepareTransfer(port, "deposits")).pasteAt).toBe("Deposits!A7");

    dep.set("B9", "row with no date"); // a gap: COUNTA(A) would point above it
    await expect(prepareTransfer(port, "deposits")).rejects.toBeInstanceOf(TransferBlockedError);
  });

  it("refuses a block larger than the free rows before Total", async () => {
    const port = workbook();
    const many = statement(
      Array.from({ length: 25 }, (_, i) => ({ date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`, description: `SALE ${i}`, amountSen: 1000 + i, direction: "in" as const, balanceSen: null })),
    );
    await importStatement(port, many, "Maybank", opts);
    for (let r = 2; r <= 26; r++) setCategory(port, r, "Pendapatan / Revenue");
    await expect(prepareTransfer(port, "deposits")).rejects.toThrow(/baris kosong/);
  });
});

describe("write guard: bank sheets", () => {
  it("rejects writes to Deposits even if the plan is built by bank code", () => {
    expect(() => guardPlan({ ops: [{ op: "values", sheet: "Deposits", address: "A6", values: [[1]] }] }, [BANK_LEDGER_SHEET, "Deposits"])).toThrow(WriteGuardError);
  });
  it("rejects a dropdown sourced from a non-owned sheet", () => {
    expect(() =>
      guardPlan({ ops: [{ op: "validationList", sheet: BANK_LEDGER_SHEET, address: "H2:H10", source: "=Mapping!$A$1:$A$4" }] }, [BANK_LEDGER_SHEET, BANK_LISTS_SHEET]),
    ).toThrow(/non-owned/);
  });
});
