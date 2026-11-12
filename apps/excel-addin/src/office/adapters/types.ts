import type { DataSourceInfo, ExpectedTotals, RawTransaction } from "@akaun/shared";
import type { WorkbookPort } from "../workbook-port";

export type DetectionStatus = "supported" | "disabled" | "unsupported_version" | "not_detected";

export interface AdapterDetection {
  status: DetectionStatus;
  /** Workbook version string read from the workbook, when known. */
  version: string | null;
  /** Bahasa Melayu explanation for the UI. */
  message: string;
}

export interface AdapterReadResult {
  source: DataSourceInfo;
  sourceLabel: string;
  businessName: string | null;
  transactions: RawTransaction[];
  openingBalance: unknown;
  expectedTotals?: ExpectedTotals;
}

/**
 * A workbook adapter knows how to locate and read cash data for ONE workbook
 * layout/version. Adapters are READ-ONLY: they receive a port but must only
 * call getSheets/readValues.
 */
export interface WorkbookAdapter {
  readonly id: string;
  readonly version: string;
  readonly kind: "demo" | "workbook";
  readonly label: string;
  detect(port: WorkbookPort | null): Promise<AdapterDetection>;
  read(port: WorkbookPort | null): Promise<AdapterReadResult>;
}

export class AdapterReadError extends Error {
  constructor(message: string) {
    super(message);
  }
}
