import { useState } from "react";
import { useApp } from "../app-context";
import { isPlausibleAccessKey } from "../services/access-key";

export function AccessKeyPanel({ onClose }: { onClose: () => void }) {
  const { accessKey, setAccessKey } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!isPlausibleAccessKey(value)) {
      setError("Format kod akses tidak sah.");
      return;
    }
    setAccessKey(value.trim());
    onClose();
  };

  return (
    <section className="card">
      <h2 className="section-title">Kod Akses Pilot</h2>
      <p className="muted">
        Kod akses diberikan oleh pasukan Akaun Simple untuk program pilot. Ia disimpan dalam add-in sahaja, bukan dalam workbook anda.
      </p>
      {accessKey ? (
        <p>
          Status: <strong>kod akses tersimpan</strong> (…{accessKey.slice(-4)})
        </p>
      ) : (
        <p>Status: tiada kod akses.</p>
      )}
      <label className="field">
        <span>Kod akses baharu</span>
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row-btns">
        {accessKey && (
          <button className="btn" onClick={() => setAccessKey(null)}>
            Padam kod
          </button>
        )}
        <button className="btn" onClick={onClose}>
          Tutup
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!value}>
          Simpan
        </button>
      </div>
    </section>
  );
}
