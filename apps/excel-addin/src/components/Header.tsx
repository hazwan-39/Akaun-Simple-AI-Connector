import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@akaun/shared";
import { useApp } from "../app-context";

export function Header({ onSettings }: { onSettings: () => void }) {
  const { host, hostReady, workbook } = useApp();

  let tone: "ok" | "warn" | "off" = "off";
  let text = "Menyambung…";
  if (hostReady) {
    if (!host.isExcel) {
      text = "Tidak berjalan dalam Excel (pratonton pelayar)";
    } else if (!host.readApiSupported) {
      tone = "warn";
      text = "Versi Excel tidak disokong (perlu ExcelApi 1.7+)";
    } else if (workbook?.detection.status === "supported") {
      tone = "ok";
      text = `Disambung: ${workbook.adapter?.label}`;
    } else if (workbook?.detection.status === "disabled") {
      tone = "warn";
      text = `Dikesan: Akaun Simple ${workbook.detection.version} (pemetaan belum disahkan)`;
    } else if (workbook?.detection.status === "unsupported_version") {
      tone = "warn";
      text = "Akaun Simple: versi/struktur tidak disokong";
    } else {
      tone = "warn";
      text = "Excel disambung · workbook Akaun Simple tidak dikesan";
    }
  }

  return (
    <header className="header">
      <div className="brand">
        <div className="logo" aria-hidden>
          AS
        </div>
        <div>
          <div className="product">{PRODUCT_NAME}</div>
          <div className="subtitle">{PRODUCT_SUBTITLE}</div>
        </div>
        <button className="icon-btn" onClick={onSettings} title="Tetapan kod akses" aria-label="Tetapan">
          ⚙
        </button>
      </div>
      <div className={`conn conn-${tone}`} role="status">
        <span className="dot" aria-hidden />
        {text}
      </div>
    </header>
  );
}
