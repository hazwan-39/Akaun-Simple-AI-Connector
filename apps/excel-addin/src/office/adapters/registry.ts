import type { WorkbookPort } from "../workbook-port";
import { AkaunSimpleV2Adapter } from "./akaun-simple-v2/adapter";
import { DemoAdapter } from "./demo/demo-adapter";
import type { AdapterDetection, WorkbookAdapter } from "./types";

export interface WorkbookDetection {
  /** Production adapter that matched the workbook (may be disabled). */
  adapter: WorkbookAdapter | null;
  detection: AdapterDetection;
}

export function productionAdapters(productionEnabled: boolean): WorkbookAdapter[] {
  return [new AkaunSimpleV2Adapter(productionEnabled)];
}

export const demoAdapter = new DemoAdapter();

/** Finds the first production adapter that recognises the open workbook. Read-only. */
export async function detectWorkbook(port: WorkbookPort | null, productionEnabled: boolean): Promise<WorkbookDetection> {
  let last: AdapterDetection = { status: "not_detected", version: null, message: "Workbook Akaun Simple tidak dikesan." };
  if (!port) return { adapter: null, detection: last };
  for (const adapter of productionAdapters(productionEnabled)) {
    try {
      const d = await adapter.detect(port);
      if (d.status !== "not_detected") return { adapter, detection: d };
      last = d;
    } catch {
      // A read failure during detection means "not this layout"; never fatal.
    }
  }
  return { adapter: null, detection: last };
}
