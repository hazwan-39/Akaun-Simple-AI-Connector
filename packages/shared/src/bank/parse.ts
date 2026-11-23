import { buildLines } from "./lines.js";
import { detectBank, type BankProfile } from "./profiles.js";
import { isoDate, parseAmountToken, parseDateToken, type AmountToken, type DateToken } from "./tokens.js";
import type {
  BankParseIssue,
  BankParseResult,
  Direction,
  Line,
  ParsedTransaction,
  PdfTextItem,
  Token,
} from "./types.js";

/**
 * Deterministic bank-statement parser (no AI).
 *
 * Works on positioned text from text-based PDFs. Malaysian statements print, per transaction, a date
 * at the left, an amount, and usually a running balance at the right. Direction (money in / out) is
 * taken from the change in running balance when it is printed, so the parser does not depend on each
 * bank's column names. Column headers and printed signs are only fallbacks.
 */

type Role = "balance" | "debit" | "credit" | "amount" | "other";
interface Column {
  role: Role | null;
  x: number;
}

const OPENING_RE =
  /(\bB\/F\b|\bBEGINNING\s*BALANCE|\bOPENING\s*BALANCE|\bBAKI\s*(MULA|AWAL|PEMBUKAAN|HADAPAN|DIBAWA)\b|\bBROUGHT\s*FORWARD|\bBALANCE\s*FROM\s*(LAST|PREVIOUS)\s*STATEMENT)/i;
const CLOSING_RE =
  /(\bC\/F\b|\bCLOSING\s*BALANCE|\bENDING\s*BALANCE|\bBAKI\s*(PENUTUP|PENUTUPAN|AKHIR)\b|\bCARRIED\s*FORWARD)/i;
const TOTAL_RE = /\b(TOTAL|JUMLAH)\b.*\b(DEBIT|CREDIT|KREDIT|WITHDRAWAL|DEPOSIT)S?\b/i;
const CREDIT_CARD_RE = /minimum\s*payment|bayaran\s*minimum|payment\s*due\s*date|credit\s*limit|had\s*kredit/i;

const ROLE_WORDS: [Role, RegExp][] = [
  ["balance", /^(balance|baki|saldo)$/i],
  ["debit", /^(debit|debits|withdrawal|withdrawals|pengeluaran|dr)$/i],
  ["credit", /^(credit|credits|kredit|deposit|deposits|simpanan|cr)$/i],
  ["amount", /^(amount|amaun|mutation)$/i],
  ["other", /^(tax|cukai|cheque|cek|ref|rujukan|serial)$/i],
];

function headerColumns(line: Line): Column[] | null {
  // A header row holds labels only; a row with an amount or a date is data.
  if (line.tokens.some((t) => /\d/.test(t.text) && (parseAmountToken(t.text) || /\d{2}[/-]\d{2}/.test(t.text)))) return null;
  const cols: Column[] = [];
  for (const t of line.tokens) {
    const words = t.text.split(/[\s/().]+/).filter(Boolean);
    const role = ROLE_WORDS.find(([, re]) => words.some((w) => re.test(w)))?.[0] ?? null;
    cols.push({ role, x: t.x });
  }
  const roleTokens = cols.filter((c) => c.role);
  const roles = new Set(roleTokens.map((c) => c.role));
  // Needs a balance column and at least one debit/credit column (a lone "Amount" column is a
  // rewards or summary table, not the transaction table).
  const ok = roles.has("balance") && (roles.has("debit") || roles.has("credit")) && roleTokens.length >= 3;
  return ok ? cols.sort((a, b) => a.x - b.x) : null;
}

/** Amounts are right-aligned under their header: the column is the last header starting left of the amount's end. */
function roleAt(cols: Column[] | null, t: Token): Role | null {
  if (!cols) return null;
  let role: Role | null = null;
  for (const c of cols) if (c.x <= t.xEnd - 1) role = c.role;
  return role;
}

interface LeadingDate {
  date: DateToken;
  x: number;
  /** Tokens after the date (a glued "19/03/2023 I-PAYMENT" token is split). */
  rest: Token[];
}

function leadingDate(line: Line, profile: BankProfile): LeadingDate | null {
  const [a, b] = line.tokens;
  if (!a) return null;
  const one = parseDateToken(a.text, profile.compactDate);
  if (one) return { date: one, x: a.x, rest: line.tokens.slice(1) };
  if (b && /^\d{1,2}$/.test(a.text)) {
    const two = parseDateToken(`${a.text} ${b.text}`);
    if (two) return { date: two, x: a.x, rest: line.tokens.slice(2) };
  }
  const sp = a.text.indexOf(" ");
  if (sp > 0) {
    const head = parseDateToken(a.text.slice(0, sp), profile.compactDate);
    if (head) {
      const remainder: Token = { text: a.text.slice(sp + 1).trim(), x: a.x + 1, xEnd: a.xEnd };
      return { date: head, x: a.x, rest: [remainder, ...line.tokens.slice(1)] };
    }
  }
  return null;
}

const amountsOf = (tokens: Token[]) =>
  tokens.flatMap((tok) => {
    const amt = parseAmountToken(tok.text);
    return amt ? [{ tok, amt }] : [];
  });

const signed = (a: AmountToken) => (a.sign === "neg" ? -a.sen : a.sen);

/** Latest full date printed near the top of the statement (statement date / period end). */
function anchorDate(lines: Line[]): { year: number; month: number } | null {
  let best: { year: number; month: number; key: number } | null = null;
  const consider = (d: DateToken | null) => {
    if (!d?.year || d.year < 2000 || d.year > 2100) return;
    const key = d.year * 100 + d.month;
    if (!best || key > best.key) best = { year: d.year, month: d.month, key };
  };
  for (const l of lines.slice(0, 60)) {
    for (const part of l.text.split(/\s+[-–]\s+|\s+|:/)) consider(parseDateToken(part));
    for (const m of l.text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,4})\s+(\d{4}|\d{2})\b/g)) consider(parseDateToken(`${m[1]} ${m[2]} ${m[3]}`));
    for (const m of l.text.matchAll(/\b([A-Za-z]{3,4})\s+(\d{1,2}),\s*(\d{4})\b/g)) consider(parseDateToken(`${m[1]} ${m[2]}, ${m[3]}`));
  }
  return best;
}

interface Raw {
  line: Line;
  lineIdx: number;
  date: DateToken;
  descTokens: Token[];
  amountSen: number;
  dirHint: Direction | null;
  hintSource: "sign" | "column" | null;
  balanceSen: number | null;
  extra: string[];
}

export function parseBankStatement(items: PdfTextItem[]): BankParseResult {
  const lines = buildLines(items);
  const { profile, foreign } = detectBank(lines);
  const issues: BankParseIssue[] = [];
  const allText = lines.map((l) => l.text).join("\n");

  const empty = (kind: BankParseResult["kind"]): BankParseResult => ({
    bank: profile.id,
    kind,
    openingSen: null,
    closingSen: null,
    transactions: [],
    totals: { inSen: 0, outSen: 0 },
    checks: { balanceChecked: 0, balanceMismatches: 0, closingMatches: null },
    issues,
    reconciled: false,
  });

  if (foreign) {
    issues.push({ code: "UNSUPPORTED_STATEMENT", detail: "Penyata bank luar Malaysia" });
    return empty("unsupported");
  }
  if (CREDIT_CARD_RE.test(allText)) {
    issues.push({ code: "UNSUPPORTED_STATEMENT", detail: "Penyata kad kredit" });
    return empty("credit_card");
  }
  if (profile.id === "UNKNOWN") issues.push({ code: "UNKNOWN_BANK" });

  const anchor = anchorDate(lines);
  const headers = lines.map(headerColumns);
  const docHasHeader = headers.some(Boolean);

  // The date column: the most common left position of dated lines that carry an amount.
  const xs = new Map<number, number>();
  lines.forEach((l) => {
    const d = leadingDate(l, profile);
    if (d && amountsOf(d.rest).length) xs.set(Math.round(d.x / 4), (xs.get(Math.round(d.x / 4)) ?? 0) + 1);
  });
  const dateBucket = [...xs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dateX = dateBucket === undefined ? null : dateBucket * 4;

  let columns: Column[] | null = null;
  let openingSen: number | null = null;
  let closingSen: number | null = null;
  let lastDate: DateToken | null = null;
  const raws: Raw[] = [];
  const structural = new Set<number>();

  lines.forEach((line, i) => {
    if (headers[i]) {
      columns = headers[i];
      structural.add(i);
      return;
    }
    const cols: Column[] | null = columns;
    const amts = amountsOf(line.tokens);
    const balanceOf = () => {
      const byRole = amts.filter((a) => roleAt(cols, a.tok) === "balance");
      const pick = byRole[byRole.length - 1] ?? amts[amts.length - 1];
      return pick ? signed(pick.amt) : null;
    };

    if (TOTAL_RE.test(line.text)) {
      structural.add(i);
      return;
    }
    if (OPENING_RE.test(line.text) && amts.length) {
      if (openingSen === null) openingSen = balanceOf();
      const d = leadingDate(line, profile);
      if (d) lastDate = d.date;
      structural.add(i);
      return;
    }
    if (CLOSING_RE.test(line.text) && amts.length) {
      closingSen = balanceOf();
      structural.add(i);
      return;
    }
    if (docHasHeader && !cols) return; // before the transaction table (summaries, cheque lists, rewards)

    let dl = leadingDate(line, profile);
    if (dl && dateX !== null && Math.abs(dl.x - dateX) > 6) dl = null; // a date inside the description
    const rest = dl ? dl.rest : line.tokens;
    const restAmts = amountsOf(rest);
    if (!restAmts.length) return;

    let balanceTok: (typeof restAmts)[number] | null = null;
    const txnToks: { tok: Token; amt: AmountToken; role: Role | null }[] = [];
    for (const a of restAmts) {
      const role = roleAt(cols, a.tok);
      if (role === "balance") balanceTok = a;
      else if (role !== "other") txnToks.push({ ...a, role });
    }
    const lastAmt = restAmts[restAmts.length - 1];
    if (!cols && !balanceTok && restAmts.length >= 2 && lastAmt) {
      balanceTok = lastAmt;
      const k = txnToks.findIndex((t) => t.tok === lastAmt.tok);
      if (k >= 0) txnToks.splice(k, 1);
    }
    const t = txnToks.find((x) => x.amt.sen > 0);
    if (!t) return; // balance-only line

    let date: DateToken;
    const firstX = line.tokens[0]?.x ?? 0;
    if (dl) date = dl.date;
    else if (balanceTok && lastDate && (dateX === null || firstX > dateX + 10)) date = lastDate; // same-day row without its own date
    else return;
    lastDate = date;

    let dirHint: Direction | null = null;
    let hintSource: Raw["hintSource"] = null;
    if (t.amt.sign) {
      dirHint = t.amt.sign === "neg" ? "out" : "in";
      hintSource = "sign";
    } else if (t.role === "debit") {
      dirHint = "out";
      hintSource = "column";
    } else if (t.role === "credit") {
      dirHint = "in";
      hintSource = "column";
    }
    const firstAmtX = restAmts[0]?.tok.x ?? Infinity;
    raws.push({
      line,
      lineIdx: i,
      date,
      descTokens: rest.filter((tk) => tk.x < firstAmtX && !parseAmountToken(tk.text)),
      amountSen: t.amt.sen,
      dirHint,
      hintSource,
      balanceSen: balanceTok ? signed(balanceTok.amt) : null,
      extra: [],
    });
  });

  // Descriptions wrapped onto neighbouring lines without a date or amount.
  const rawIdx = new Set(raws.map((r) => r.lineIdx));
  raws.forEach((r, k) => {
    const below = profile.descriptionPosition === "below";
    const step = below ? 1 : -1;
    const stop = below ? (raws[k + 1]?.lineIdx ?? lines.length) : (raws[k - 1]?.lineIdx ?? -1);
    for (let j = r.lineIdx + step; j !== stop && r.extra.length < 3; j += step) {
      const l = lines[j];
      if (!l || l.page !== r.line.page || structural.has(j) || rawIdx.has(j)) break;
      if (amountsOf(l.tokens).length) break;
      if (dateX !== null && (l.tokens[0]?.x ?? 0) < dateX + 10) break;
      r.extra.push(l.text);
    }
    if (!below) r.extra.reverse();
  });

  // Some exports list newest first; without balances, put them in date order.
  const keyOf = (d: DateToken) => (d.year ?? 0) * 10000 + d.month * 100 + d.day;
  const firstRaw = raws[0];
  const lastRaw = raws[raws.length - 1];
  if (firstRaw && lastRaw && raws.every((r) => r.balanceSen === null) && keyOf(firstRaw.date) > keyOf(lastRaw.date)) {
    raws.reverse();
  }

  const transactions: ParsedTransaction[] = [];
  let running: number | null = openingSen;
  let balanceChecked = 0;
  let balanceMismatches = 0;
  const anyBalance = raws.some((r) => r.balanceSen !== null);

  raws.forEach((r, seq) => {
    let year = r.date.year;
    if (year === null) {
      if (anchor) year = r.date.month > anchor.month ? anchor.year - 1 : anchor.year;
      else {
        // Never guess the year: a wrong year silently moves the transaction to another period.
        if (!issues.some((x) => x.code === "YEAR_UNKNOWN")) issues.push({ code: "YEAR_UNKNOWN" });
        year = 1900;
      }
    }
    let direction: Direction | null = r.dirHint;
    let source: ParsedTransaction["directionSource"] = r.hintSource ?? "column";
    if (r.balanceSen !== null && running !== null) {
      const delta = r.balanceSen - running;
      if (delta === r.amountSen) {
        direction = "in";
        source = "balance";
      } else if (delta === -r.amountSen) {
        direction = "out";
        source = "balance";
      }
      balanceChecked++;
      if (Math.abs(delta) !== r.amountSen || (r.dirHint && r.dirHint !== direction)) {
        balanceMismatches++;
        issues.push({ code: "RUNNING_BALANCE_MISMATCH", seq, detail: `delta ${delta} amount ${r.amountSen}` });
      }
    }
    if (!direction) {
      issues.push({ code: "DIRECTION_UNKNOWN", seq });
      direction = "out";
    }
    if (r.balanceSen !== null) running = r.balanceSen;
    else if (running !== null) running += direction === "in" ? r.amountSen : -r.amountSen;

    transactions.push({
      seq,
      page: r.line.page,
      date: isoDate(year, r.date.month, r.date.day),
      description: (profile.descriptionPosition === "above"
        ? [...r.extra, r.descTokens.map((t) => t.text).join(" ")]
        : [r.descTokens.map((t) => t.text).join(" "), ...r.extra]
      )
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
      amountSen: r.amountSen,
      direction,
      balanceSen: r.balanceSen,
      directionSource: source,
    });
  });

  // No printed opening balance: derive it from the first printed running balance.
  const first = transactions[0];
  if (openingSen === null && first) {
    if (first.balanceSen !== null && first.directionSource !== "column") {
      openingSen = first.balanceSen - (first.direction === "in" ? first.amountSen : -first.amountSen);
    } else issues.push({ code: "NO_OPENING_BALANCE" });
  }

  const inSen = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountSen, 0);
  const outSen = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountSen, 0);
  if (closingSen === null) {
    closingSen = [...transactions].reverse().find((t) => t.balanceSen !== null)?.balanceSen ?? null;
    if (closingSen === null) issues.push({ code: "NO_CLOSING_BALANCE" });
  }
  let closingMatches: boolean | null = null;
  if (openingSen !== null && closingSen !== null) {
    closingMatches = openingSen + inSen - outSen === closingSen;
    if (!closingMatches) issues.push({ code: "CLOSING_BALANCE_MISMATCH", detail: `${openingSen + inSen - outSen} vs ${closingSen}` });
  }
  if (!transactions.length) issues.push({ code: "NO_TRANSACTIONS" });
  if (transactions.length && !anyBalance) issues.push({ code: "NO_RUNNING_BALANCE" });

  const blocking = issues.some((i) =>
    ["NO_TRANSACTIONS", "RUNNING_BALANCE_MISMATCH", "CLOSING_BALANCE_MISMATCH", "DIRECTION_UNKNOWN", "UNSUPPORTED_STATEMENT", "YEAR_UNKNOWN"].includes(i.code),
  );
  return {
    bank: profile.id,
    kind: "account",
    openingSen,
    closingSen,
    transactions,
    totals: { inSen, outSen },
    checks: { balanceChecked, balanceMismatches, closingMatches },
    issues,
    reconciled: !blocking && closingMatches === true && anyBalance,
  };
}
