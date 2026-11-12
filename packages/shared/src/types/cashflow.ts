import type { DataIssueCode } from "../calculations/issues.js";

export type TxDirection = "inflow" | "outflow";

/**
 * cash              – a genuine cash/bank receipt or payment
 * internal_transfer – movement between the business's own cash/bank accounts (excluded)
 * non_cash          – accounting entry with no cash movement, e.g. depreciation (excluded)
 */
export type TxKind = "cash" | "internal_transfer" | "non_cash";

/** A transaction exactly as an adapter read it. Values are untrusted and unnormalised. */
export interface RawTransaction {
  /** Unique, stable reference to the source location, e.g. "Deposits!D12". */
  sourceRef: string;
  date: unknown;
  amount: unknown;
  direction: TxDirection;
  category: string;
  categoryGroup?: string | null;
  /** Local only – never sent to the API. Used for duplicate detection. */
  description?: string | null;
  kind?: TxKind;
}

export interface NormalizedTransaction {
  sourceRef: string;
  /** ISO date yyyy-mm-dd */
  date: string;
  /** yyyy-mm */
  month: string;
  /** Amount in sen (integer). May be negative (reversal). */
  amountSen: number;
  direction: TxDirection;
  category: string;
  categoryGroup: string | null;
  description: string | null;
  kind: TxKind;
}

export type IssueSeverity = "info" | "warning" | "error";

export interface DataIssue {
  code: DataIssueCode;
  severity: IssueSeverity;
  /** Bahasa Melayu, user-facing. */
  message: string;
  count: number;
  /** Local only – first few source references for the user to inspect. */
  sourceRefs: string[];
}

export interface ReconciliationCheck {
  id: string;
  /** Bahasa Melayu label */
  label: string;
  expected: number | null;
  actual: number;
  difference: number | null;
  passed: boolean;
}

export interface PeriodSelection {
  /** yyyy-mm inclusive */
  start: string;
  /** yyyy-mm inclusive */
  end: string;
}

export interface MonthlyFigure {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CategoryFigure {
  direction: TxDirection;
  group: string | null;
  name: string;
  amount: number;
}

export type DataStatus = "confirmed" | "unreconciled" | "demo" | "insufficient";

export interface DataSourceInfo {
  kind: "demo" | "workbook";
  adapterId: string;
  adapterVersion: string;
}
