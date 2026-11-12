import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { detectWorkbook, type WorkbookDetection } from "./office/adapters/registry";
import { NOT_IN_OFFICE, waitForOffice, type HostInfo } from "./office/host";
import { OfficeWorkbookPort } from "./office/office-port";
import type { WorkbookPort } from "./office/workbook-port";
import { loadAccessKey, saveAccessKey, clearAccessKey } from "./services/access-key";

export const PRODUCTION_ADAPTER_ENABLED = import.meta.env.VITE_ENABLE_PRODUCTION_ADAPTER === "true";

interface AppState {
  host: HostInfo;
  hostReady: boolean;
  port: WorkbookPort | null;
  workbook: WorkbookDetection | null;
  redetect: () => Promise<void>;
  accessKey: string | null;
  setAccessKey: (k: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HostInfo>(NOT_IN_OFFICE);
  const [hostReady, setHostReady] = useState(false);
  const [workbook, setWorkbook] = useState<WorkbookDetection | null>(null);
  const [accessKey, setKey] = useState<string | null>(() => loadAccessKey());

  const port = useMemo<WorkbookPort | null>(() => (host.isExcel && host.readApiSupported ? new OfficeWorkbookPort() : null), [host]);

  const redetect = async () => {
    try {
      setWorkbook(await detectWorkbook(port, PRODUCTION_ADAPTER_ENABLED));
    } catch {
      setWorkbook({ adapter: null, detection: { status: "not_detected", version: null, message: "Workbook tidak dapat dibaca." } });
    }
  };

  useEffect(() => {
    void waitForOffice().then((h) => {
      setHost(h);
      setHostReady(true);
    });
  }, []);

  useEffect(() => {
    if (hostReady) void redetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostReady, port]);

  const setAccessKey = (k: string | null) => {
    if (k) saveAccessKey(k);
    else clearAccessKey();
    setKey(k);
  };

  return <Ctx.Provider value={{ host, hostReady, port, workbook, redetect, accessKey, setAccessKey }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
