/* global Office */
/** Host + API capability detection. */
export interface HostInfo {
  inOffice: boolean;
  isExcel: boolean;
  platform: string;
  /** Office build version string where available. */
  version: string | null;
  readApiSupported: boolean; // ExcelApi 1.7
  writeApiSupported: boolean; // ExcelApi 1.12
}

export const NOT_IN_OFFICE: HostInfo = {
  inOffice: false,
  isExcel: false,
  platform: "browser",
  version: null,
  readApiSupported: false,
  writeApiSupported: false,
};

export function waitForOffice(timeoutMs = 4000): Promise<HostInfo> {
  return new Promise((resolve) => {
    if (typeof Office === "undefined" || !Office.onReady) return resolve(NOT_IN_OFFICE);
    const timer = setTimeout(() => resolve(NOT_IN_OFFICE), timeoutMs);
    Office.onReady((info) => {
      clearTimeout(timer);
      if (info.host !== Office.HostType.Excel) return resolve({ ...NOT_IN_OFFICE, inOffice: Boolean(info.host) });
      const req = Office.context.requirements;
      resolve({
        inOffice: true,
        isExcel: true,
        platform: String(info.platform ?? Office.context.platform ?? "unknown"),
        version: Office.context.diagnostics?.version ?? null,
        readApiSupported: req.isSetSupported("ExcelApi", "1.7"),
        writeApiSupported: req.isSetSupported("ExcelApi", "1.12") && req.isSetSupported("ExcelApi", "1.8"),
      });
    });
  });
}
