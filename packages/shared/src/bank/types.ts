/** A positioned piece of text from a PDF page (pdf.js `getTextContent()` item, normalised). */
export interface PdfTextItem {
  page: number;
  str: string;
  /** Left edge, PDF points. */
  x: number;
  /** Baseline, PDF points (larger = higher on the page). */
  y: number;
  /** Width, PDF points. */
  w: number;
}

export interface Token {
  text: string;
  x: number;
  xEnd: number;
}

export interface Line {
  page: number;
  y: number;
  tokens: Token[];
  text: string;
}

export type BankId =
  | "MAYBANK"
  | "CIMB"
  | "PUBLIC_BANK"
  | "RHB"
  | "HONG_LEONG"
  | "AMBANK"
  | "BANK_ISLAM"
  | "BANK_MUAMALAT"
  | "BANK_RAKYAT"
  | "BSN"
  | "ALLIANCE"
  | "AFFIN"
  | "UNKNOWN";

export type StatementKind = "account" | "credit_card" | "unsupported";

export type Direction = "in" | "out";

export interface ParsedTransaction {
  /** 0-based order as printed. */
  seq: number;
  page: number;
  /** ISO yyyy-mm-dd */
  date: string;
  description: string;
  amountSen: number;
  direction: Direction;
  /** Running balance printed by the bank, if any (sen, negative = overdrawn). */
  balanceSen: number | null;
  /** How the direction was decided. */
  directionSource: "balance" | "sign" | "column";
}

export type BankParseIssueCode =
  | "NO_TRANSACTIONS"
  | "NO_OPENING_BALANCE"
  | "NO_CLOSING_BALANCE"
  | "RUNNING_BALANCE_MISMATCH"
  | "CLOSING_BALANCE_MISMATCH"
  | "DIRECTION_UNKNOWN"
  | "NO_RUNNING_BALANCE"
  | "UNSUPPORTED_STATEMENT"
  | "UNKNOWN_BANK"
  /** A date was printed without a year and the statement period could not be found. */
  | "YEAR_UNKNOWN";

export interface BankParseIssue {
  code: BankParseIssueCode;
  /** Transaction seq the issue refers to, if any. */
  seq?: number;
  detail?: string;
}

export interface BankParseResult {
  bank: BankId;
  kind: StatementKind;
  openingSen: number | null;
  closingSen: number | null;
  transactions: ParsedTransaction[];
  totals: { inSen: number; outSen: number };
  checks: {
    /** Transactions whose printed balance was checked against the running total. */
    balanceChecked: number;
    balanceMismatches: number;
    /** opening + in − out === printed closing balance */
    closingMatches: boolean | null;
  };
  issues: BankParseIssue[];
  /** True only when every check that could run passed and nothing blocks import. */
  reconciled: boolean;
}
