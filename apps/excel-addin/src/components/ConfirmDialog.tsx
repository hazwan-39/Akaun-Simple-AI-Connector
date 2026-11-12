import type { ReactNode } from "react";

export function ConfirmDialog(props: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className="dialog">
        <h3 id="dlg-title">{props.title}</h3>
        <div className="dialog-body">{props.children}</div>
        <div className="row-btns">
          <button className="btn" onClick={props.onCancel}>
            Batal
          </button>
          <button className="btn btn-primary" onClick={props.onConfirm} autoFocus>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
