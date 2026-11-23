import { describe, expect, it } from "vitest";
import { buildLines, parseAmountToken, parseBankStatement, parseDateToken, shortDescription, type PdfTextItem } from "@akaun/shared";

/**
 * All fixtures here are synthetic. They imitate the layouts seen in real Malaysian statements
 * (positions, date styles, wrapped descriptions) without containing any real customer data.
 */
type Cell = [text: string, x: number];
function page(n: number, rows: Cell[][], charW = 5): PdfTextItem[] {
  return rows.flatMap((cells, i) => cells.map(([str, x]) => ({ page: n, str, x, y: 800 - i * 12, w: str.length * charW })));
}

describe("parseAmountToken", () => {
  it.each([
    ["1,234.56", 123456, null],
    ["1234.56", 123456, null],
    [".50", 50, null],
    ["216.70-", 21670, "neg"],
    ["2,582.69 CR", 258269, "pos"],
    ["12.00 DR", 1200, "neg"],
    ["- MYR 100.00", 10000, "neg"],
    ["+ MYR 1,500.00", 150000, "pos"],
    ["(45.10)", 4510, "neg"],
  ])("%s", (raw, sen, sign) => {
    expect(parseAmountToken(raw)).toEqual({ sen, sign });
  });

  it.each(["2023", "5196032163838358", "12.5", "1,23.00", "abc", "RM", "(1.00"])("rejects %s", (raw) => {
    expect(parseAmountToken(raw)).toBeNull();
  });
});

describe("parseDateToken", () => {
  it.each([
    ["01/02/23", { day: 1, month: 2, year: 2023 }],
    ["19/03/2023", { day: 19, month: 3, year: 2023 }],
    ["05-05-2025", { day: 5, month: 5, year: 2025 }],
    ["29-Dec-2022", { day: 29, month: 12, year: 2022 }],
    ["01FEB", { day: 1, month: 2, year: null }],
    ["01 May", { day: 1, month: 5, year: null }],
    ["Jul 07", { day: 7, month: 7, year: null }],
    ["03/03", { day: 3, month: 3, year: null }],
  ])("%s", (raw, expected) => {
    expect(parseDateToken(raw)).toEqual(expected);
  });

  it("only accepts ddmmyy when the profile allows it", () => {
    expect(parseDateToken("030317")).toBeNull();
    expect(parseDateToken("030317", true)).toEqual({ day: 3, month: 3, year: 2017 });
  });

  it.each(["32/01/23", "01/13/23", "704747800000501", "Total"])("rejects %s", (raw) => {
    expect(parseDateToken(raw, true)).toBeNull();
  });
});

describe("shortDescription", () => {
  it.each([
    ["DR MYDEBIT 625843 550989XXXXXX4807 DREAMIAL HOLDINGS S5 090323 KLANG 000000003580", "DR MYDEBIT DREAMIAL HOLDINGS S5 KLANG"],
    ["FPX PAYMENT FR A/ 20230201M0000061861* SHOPEE PAY 2302011448243324", "FPX PAYMENT FR A/ SHOPEE PAY"],
    ["Reference Number: 579040443 MB DuitNow (ACC NO) Fund Transfer", "MB DuitNow (ACC NO) Fund Transfer"],
    ["04572 SALES DEBIT", "SALES DEBIT"],
    ["SERVICE CHARGE", "SERVICE CHARGE"],
  ])("%s", (full, short) => {
    expect(shortDescription(full)).toBe(short);
  });

  it("never exceeds the template's Butiran width and cuts at a word boundary", () => {
    const s = shortDescription("INSTANT TRANSFER TO ACCOUNT HOLDER WITH A VERY LONG COMPANY NAME SDN BHD");
    expect(s.length).toBeLessThanOrEqual(43);
    expect("INSTANT TRANSFER TO ACCOUNT HOLDER WITH A VERY LONG COMPANY NAME SDN BHD".startsWith(s)).toBe(true);
    expect(s.endsWith(" ")).toBe(false);
  });

  it("falls back to a truncated first token when everything looks like a reference", () => {
    expect(shortDescription("20230201M0000061861")).toBe("20230201M0000061861");
  });
});

describe("buildLines", () => {
  it("joins characters placed separately and drops duplicated text", () => {
    const items: PdfTextItem[] = [
      { page: 1, str: "5", x: 100, y: 500, w: 5 },
      { page: 1, str: ",", x: 105, y: 500, w: 2 },
      { page: 1, str: "560", x: 107, y: 500.5, w: 15 },
      { page: 1, str: ".", x: 122, y: 500, w: 2 },
      { page: 1, str: "21", x: 124, y: 500, w: 10 },
      { page: 1, str: "SALE", x: 20, y: 500, w: 20 },
      { page: 1, str: "SALE", x: 20, y: 500, w: 20 },
    ];
    const [line] = buildLines(items);
    expect(line.tokens.map((t) => t.text)).toEqual(["SALE", "5,560.21"]);
  });
});

describe("parseBankStatement", () => {
  it("parses a headerless statement and takes direction from the running balance", () => {
    const items = page(1, [
      [["Malayan Banking Berhad", 40]],
      [["STATEMENT DATE : 28/02/23", 300]],
      [["BEGINNING BALANCE", 88], ["1,000.00", 450]],
      [["01/02/23", 43], ["SALE QR PAYMENT", 88], ["250.00+", 370], ["1,250.00", 450]],
      [["CUSTOMER A", 95]],
      [["03/02/23", 43], ["FPX PAYMENT", 88], ["99.90-", 370], ["1,150.10", 450]],
      [["SUPPLIER B", 95]],
      [["ENDING BALANCE", 88], ["1,150.10", 450]],
    ]);
    const r = parseBankStatement(items);
    expect(r.bank).toBe("MAYBANK");
    expect(r.openingSen).toBe(100000);
    expect(r.closingSen).toBe(115010);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]).toMatchObject({ date: "2023-02-01", amountSen: 25000, direction: "in", directionSource: "balance", description: "SALE QR PAYMENT CUSTOMER A" });
    expect(r.transactions[1]).toMatchObject({ date: "2023-02-03", amountSen: 9990, direction: "out" });
    expect(r.totals).toEqual({ inSen: 25000, outSen: 9990 });
    expect(r.reconciled).toBe(true);
  });

  it("handles headers, yearless dates, same-day rows without a date and carried-forward pages", () => {
    const header: Cell[] = [["DATE", 57], ["TRANSACTION", 92], ["DEBIT", 320], ["CREDIT", 405], ["BALANCE", 497]];
    const items = [
      ...page(1, [
        [["PUBLIC BANK BERHAD", 40]],
        [["Statement Date", 373], ["03 Apr 2023", 476]],
        header,
        [["03/03", 57], ["Balance From Last Statement", 92], ["600.00", 497]],
        [["05/03", 57], ["CASH DEPOSIT", 92], ["400.00", 400], ["1,000.00", 497]],
        [["BANK FEE", 92], ["1.00", 335], ["999.00", 497]],
        [["Balance C/F", 92], ["999.00", 497]],
      ]),
      ...page(2, [
        header,
        [["05/03", 57], ["Balance B/F", 92], ["999.00", 497]],
        [["31/03", 57], ["TRANSFER OUT", 92], ["99.00", 325], ["900.00", 497]],
        [["Balance C/F", 92], ["900.00", 497]],
        [["Total Debits", 320], ["100.00", 490]],
      ]),
    ];
    const r = parseBankStatement(items);
    expect(r.bank).toBe("PUBLIC_BANK");
    expect(r.openingSen).toBe(60000);
    expect(r.closingSen).toBe(90000);
    expect(r.transactions.map((t) => [t.date, t.amountSen, t.direction])).toEqual([
      ["2023-03-05", 40000, "in"],
      ["2023-03-05", 100, "out"],
      ["2023-03-31", 9900, "out"],
    ]);
    expect(r.reconciled).toBe(true);
  });

  it("puts December transactions in the previous year for a January statement", () => {
    const items = page(1, [
      [["RHB Bank Berhad", 40]],
      [["Statement Period", 306], ["16 Dec 23 – 15 Jan 24", 465]],
      [["Date", 54], ["Description", 90], ["Debit", 328], ["Credit", 418], ["Balance", 495]],
      [["16 Dec", 46], ["B/F BALANCE", 83], ["100.00", 528]],
      [["20 Dec", 46], ["DUITNOW CR", 83], ["50.00", 458], ["150.00", 528]],
      [["02 Jan", 46], ["ATM WDL", 83], ["20.00", 385], ["130.00", 528]],
    ]);
    const r = parseBankStatement(items);
    expect(r.transactions.map((t) => t.date)).toEqual(["2023-12-20", "2024-01-02"]);
    expect(r.reconciled).toBe(true);
  });

  it("reads descriptions printed above the dated line (BSN layout)", () => {
    const items = page(1, [
      [["BANK SIMPANAN NASIONAL", 40]],
      [["Tarikh Penyata 29/02/2020", 300]],
      [["Baki Hadapan", 87], ["612.37", 552]],
      [["MYDEBIT PURCHASE", 87]],
      [["01FEB", 44], ["09680", 362], ["216.70-", 467], ["395.67", 552]],
      [["GIRO TRANSFER IN", 87]],
      [["02FEB", 44], ["05782", 362], ["4.33", 472], ["400.00", 552]],
    ]);
    const r = parseBankStatement(items);
    expect(r.bank).toBe("BSN");
    expect(r.transactions.map((t) => [t.date, t.direction, t.description])).toEqual([
      ["2020-02-01", "out", "MYDEBIT PURCHASE 09680"],
      ["2020-02-02", "in", "GIRO TRANSFER IN 05782"],
    ]);
    expect(r.reconciled).toBe(true);
  });

  it("does not mistake an opening-balance row with 'CR' for a header (compact ddmmyy dates)", () => {
    const items = page(1, [
      [["Alliance Bank Malaysia Berhad", 40]],
      [["Statement Date", 352], [": 31/03/2017", 466]],
      [["Date", 63], ["Transaction Details", 161], ["Debit", 372], ["Credit", 435], ["Balance", 503]],
      [["010317", 59], ["BEGINNING BALANCE", 101], ["582.69 CR", 519]],
      [["030317", 59], ["IBFT TRANSFER IN", 101], ["2,000.00", 444], ["2,582.69 CR", 512]],
      [["040317", 59], ["SERVICE CHARGE", 101], ["0.50", 380], ["2,582.19 CR", 512]],
    ]);
    const r = parseBankStatement(items);
    expect(r.openingSen).toBe(58269);
    expect(r.transactions.map((t) => [t.amountSen, t.direction])).toEqual([
      [200000, "in"],
      [50, "out"],
    ]);
    expect(r.reconciled).toBe(true);
  });

  it("ignores a date printed inside a wrapped description", () => {
    const items = page(1, [
      [["CIMB Bank Berhad", 40]],
      [["Statement Date 18/06/2023", 300]],
      [["Date", 50], ["Description", 137], ["Withdrawal", 316], ["Deposits", 381], ["Tax", 447], ["Balance", 502]],
      [["OPENING BALANCE", 81], ["156.82", 527]],
      [["20/03/2023 POS DEBIT", 37], ["40.00", 344], ["116.82", 531]],
      [["19/03/2023 SHOP 4784", 81]],
      [["23/03/2023 DUITNOW TO ACCOUNT", 37], ["56.00", 344], ["60.82", 531]],
    ]);
    const r = parseBankStatement(items);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].description).toBe("POS DEBIT 19/03/2023 SHOP 4784");
    expect(r.reconciled).toBe(true);
  });

  it("flags a printed balance that does not follow from the amounts", () => {
    const items = page(1, [
      [["Malayan Banking Berhad", 40]],
      [["STATEMENT DATE : 28/02/23", 300]],
      [["BEGINNING BALANCE", 88], ["1,000.00", 450]],
      [["01/02/23", 43], ["SALE", 88], ["250.00+", 370], ["1,250.00", 450]],
      [["02/02/23", 43], ["PAYMENT", 88], ["50.00-", 370], ["1,150.00", 450]],
    ]);
    const r = parseBankStatement(items);
    expect(r.issues.map((i) => i.code)).toContain("RUNNING_BALANCE_MISMATCH");
    expect(r.reconciled).toBe(false);
  });

  it("refuses credit-card statements and foreign banks with a similar name", () => {
    const card = parseBankStatement(page(1, [[["AFFIN BANK", 40]], [["Minimum Payment Due", 40], ["50.00", 400]]]));
    expect(card.kind).toBe("credit_card");
    expect(card.reconciled).toBe(false);
    const foreign = parseBankStatement(page(1, [[["BANK RAKYAT INDONESIA", 40]], [["SALDO AWAL", 118], ["1,779.00", 662]]]));
    expect(foreign.kind).toBe("unsupported");
  });

  it("never guesses the year when the statement period is missing", () => {
    const items = page(1, [
      [["RHB Bank Berhad", 40]],
      [["Date", 54], ["Description", 90], ["Debit", 328], ["Credit", 418], ["Balance", 495]],
      [["01 May", 46], ["B/F BALANCE", 83], ["100.00", 528]],
      [["02 May", 46], ["ATM WDL", 83], ["20.00", 385], ["80.00", 528]],
    ]);
    const r = parseBankStatement(items);
    expect(r.issues.map((i) => i.code)).toContain("YEAR_UNKNOWN");
    expect(r.reconciled).toBe(false);
  });

  it("orders newest-first exports without balances but does not reconcile them", () => {
    const items = page(1, [
      [["Bank Islam Malaysia Berhad", 40]],
      [["Date", 50], ["Description", 136], ["Amount", 455]],
      [["29-Dec-2022", 50], ["ATM CASH WDRWL", 136], ["- MYR 100.00", 455]],
      [["22-Dec-2022", 50], ["ATM CASH DEPOSIT", 136], ["+ MYR 500.00", 455]],
    ]);
    const r = parseBankStatement(items);
    expect(r.transactions.map((t) => [t.date, t.direction])).toEqual([
      ["2022-12-22", "in"],
      ["2022-12-29", "out"],
    ]);
    expect(r.issues.map((i) => i.code)).toContain("NO_RUNNING_BALANCE");
    expect(r.reconciled).toBe(false);
  });
});
