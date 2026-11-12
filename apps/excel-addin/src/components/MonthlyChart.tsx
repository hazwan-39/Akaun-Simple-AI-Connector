import { formatRM, monthLabelMs, type MonthlyFigure } from "@akaun/shared";

/** Dependency-free SVG bar chart sized for the narrow task pane. */
export function MonthlyChart({ data }: { data: MonthlyFigure[] }) {
  if (data.length === 0) return null;
  const W = 300;
  const H = 150;
  const pad = { l: 4, r: 4, t: 8, b: 22 };
  const max = Math.max(1, ...data.flatMap((d) => [d.inflow, d.outflow]));
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(2, Math.min(12, slot / 2 - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, v) / max);
  const base = H - pad.b;
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Carta aliran tunai bulanan">
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="axis" />
        {data.map((d, i) => {
          const x = pad.l + slot * i + slot / 2;
          return (
            <g key={d.month}>
              <title>{`${monthLabelMs(d.month)}: masuk ${formatRM(d.inflow)}, keluar ${formatRM(d.outflow)}, bersih ${formatRM(d.net)}`}</title>
              <rect x={x - bw - 1} y={y(d.inflow)} width={bw} height={base - y(d.inflow)} className="bar-in" rx={1.5} />
              <rect x={x + 1} y={y(d.outflow)} width={bw} height={base - y(d.outflow)} className="bar-out" rx={1.5} />
              {i % labelEvery === 0 && (
                <text x={x} y={H - 7} className="tick">
                  {monthLabelMs(d.month).replace(" 20", " '")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span className="sw sw-in" /> Masuk <span className="sw sw-out" /> Keluar
      </figcaption>
    </figure>
  );
}
