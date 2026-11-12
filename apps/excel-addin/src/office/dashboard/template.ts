/**
 * Fixed, developer-controlled dashboard template for `AI Cash Flow` and its
 * supporting data sheet `_AI_CF_DATA`. Produces a declarative WritePlan.
 *
 * mode "create": full layout (formats, merges, widths) + content + charts
 * mode "update": clears and rewrites content slots only, re-points charts;
 *                the user's formatting/layout changes are preserved.
 */
import {
  AI_DASHBOARD_SHEET as D,
  AI_DATA_SHEET as S,
  CASH_FLOW_SKILL_ID,
  CASH_FLOW_SKILL_VERSION,
  MAX_PERIOD_MONTHS,
  monthLabelMs,
  sanitizeCellText,
  type CashFlowInsights,
  type DataIssue,
  type DataStatus,
  type InsightsMeta,
  type MonthlyFigure,
  type ReconciliationCheck,
} from "@akaun/shared";
import type { CellStyle, CellValue, WriteOp, WritePlan } from "./plan";

export interface DashboardModel {
  businessName: string | null;
  period: { start: string; end: string };
  updatedAt: Date;
  status: DataStatus;
  sourceLabel: string;
  monthly: MonthlyFigure[];
  openingBalance: number | null;
  insights: CashFlowInsights | null;
  meta: InsightsMeta | null;
  issues: DataIssue[];
  reconciliation: ReconciliationCheck[];
}

// ---- Layout constants -----------------------------------------------------------------
const DATA_HEADER_ROW = 4;
const DATA_FIRST_ROW = 5;
const DATA_LAST_ROW = DATA_FIRST_ROW + MAX_PERIOD_MONTHS - 1; // 28

const SECTION = {
  summary: { header: 27, first: 28, last: 32 },
  trends: { header: 34, first: 35, slots: 6 },
  risks: { header: 42, first: 43, slots: 5 },
  expenses: { header: 49, first: 50, slots: 5 },
  actions: { header: 56, first: 57, slots: 6 },
  quality: { header: 64, first: 65, slots: 12 },
  disclaimer: 78,
  footer: 80,
} as const;

const KPI_COLS: [string, string][] = [
  ["B", "C"],
  ["D", "E"],
  ["F", "G"],
  ["H", "I"],
  ["J", "K"],
];

const COLORS = {
  brand: "#0F5C4D",
  brandLight: "#E6F2EF",
  header: "#1F2937",
  muted: "#6B7280",
  demo: "#B45309",
  border: "#D1D5DB",
};

const STATUS_LABEL: Record<DataStatus, string> = {
  confirmed: "Disahkan – sepadan dengan jumlah workbook",
  unreconciled: "BELUM DISAHKAN – semak amaran kualiti data",
  demo: "DATA DEMO – bukan data sebenar",
  insufficient: "Data tidak mencukupi",
};

const t = (v: unknown, max?: number) => sanitizeCellText(v, max);
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

class PlanBuilder {
  readonly ops: WriteOp[] = [];
  values(sheet: string, address: string, values: CellValue[][]) {
    this.ops.push({ op: "values", sheet, address, values });
  }
  one(sheet: string, address: string, v: CellValue) {
    this.values(sheet, address, [[v]]);
  }
  formula(sheet: string, address: string, f: string) {
    this.ops.push({ op: "formulas", sheet, address, formulas: [[f]] });
  }
  style(sheet: string, address: string, style: CellStyle) {
    this.ops.push({ op: "format", sheet, address, style });
  }
  merge(sheet: string, address: string) {
    this.ops.push({ op: "merge", sheet, address });
  }
  clear(sheet: string, address: string) {
    this.ops.push({ op: "clear", sheet, address });
  }
}

export function buildDashboardPlan(model: DashboardModel, mode: "create" | "update"): WritePlan {
  const p = new PlanBuilder();
  const create = mode === "create";
  const months = model.monthly.slice(-MAX_PERIOD_MONTHS);
  const lastDataRow = DATA_FIRST_ROW + Math.max(months.length, 1) - 1;

  // ===================== _AI_CF_DATA (supporting data) ===============================
  if (create) {
    p.ops.push({ op: "columnWidth", sheet: S, column: "A", width: 90 });
    for (const c of ["B", "C", "D", "G", "J"]) p.ops.push({ op: "columnWidth", sheet: S, column: c, width: 85 });
    p.ops.push({ op: "columnWidth", sheet: S, column: "F", width: 110 });
    p.style(S, "A4:D4", { bold: true, fill: COLORS.brandLight });
    p.style(S, "I4:J4", { bold: true, fill: COLORS.brandLight });
    p.style(S, `B${DATA_FIRST_ROW}:D${DATA_LAST_ROW}`, { numberFormat: "#,##0.00" });
    p.style(S, `J${DATA_FIRST_ROW}:J${DATA_LAST_ROW}`, { numberFormat: "#,##0.00" });
    p.style(S, "G4:G8", { numberFormat: "#,##0.00" });
    p.style(S, "A1", { bold: true });
  }
  p.clear(S, `A${DATA_FIRST_ROW}:D${DATA_LAST_ROW}`);
  p.clear(S, `I${DATA_FIRST_ROW}:J${DATA_LAST_ROW}`);
  p.one(S, "A1", t(`AKAUN SIMPLE AI · ${CASH_FLOW_SKILL_ID} · data sokongan`));
  p.one(S, "A2", t("Sheet ini diurus oleh Akaun Simple AI. Jangan ubah – kandungan ditulis semula setiap kali kemas kini."));
  p.values(S, "A4:D4", [["Bulan", "Aliran Masuk", "Aliran Keluar", "Aliran Bersih"]]);
  p.values(S, "I4:J4", [["Bulan", "Aliran Bersih"]]);
  if (months.length > 0) {
    p.values(
      S,
      `A${DATA_FIRST_ROW}:C${lastDataRow}`,
      months.map((m) => [t(monthLabelMs(m.month)), m.inflow, m.outflow]),
    );
    p.ops.push({
      op: "formulas",
      sheet: S,
      address: `D${DATA_FIRST_ROW}:D${lastDataRow}`,
      formulas: months.map((_, i) => [`=B${DATA_FIRST_ROW + i}-C${DATA_FIRST_ROW + i}`]),
    });
    p.ops.push({
      op: "formulas",
      sheet: S,
      address: `I${DATA_FIRST_ROW}:J${lastDataRow}`,
      formulas: months.map((_, i) => [`=A${DATA_FIRST_ROW + i}`, `=D${DATA_FIRST_ROW + i}`]),
    });
  }
  p.values(S, "F4:F8", [["Baki Tunai Awal"], ["Baki Tunai Akhir"], ["Jumlah Masuk"], ["Jumlah Keluar"], ["Aliran Bersih"]]);
  p.one(S, "G4", model.openingBalance ?? t("Tiada data"));
  if (model.openingBalance === null) p.one(S, "G5", t("Tiada data"));
  else p.formula(S, "G5", `=G4+SUM(D${DATA_FIRST_ROW}:D${DATA_LAST_ROW})`);
  p.formula(S, "G6", `=SUM(B${DATA_FIRST_ROW}:B${DATA_LAST_ROW})`);
  p.formula(S, "G7", `=SUM(C${DATA_FIRST_ROW}:C${DATA_LAST_ROW})`);
  p.formula(S, "G8", "=G6-G7");

  // ===================== AI Cash Flow (dashboard) =====================================
  if (create) {
    p.ops.push({ op: "columnWidth", sheet: D, column: "A", width: 12 });
    for (const c of ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]) {
      p.ops.push({ op: "columnWidth", sheet: D, column: c, width: 64 });
    }
    p.merge(D, "B1:M1");
    p.style(D, "B1:M1", { bold: true, fontSize: 18, fontColor: "#FFFFFF", fill: COLORS.brand, vAlign: "Center" });
    p.ops.push({ op: "rowHeight", sheet: D, address: "B1", height: 34 });
    for (const r of [2, 3, 4, 5]) p.merge(D, `B${r}:M${r}`);
    p.style(D, "B2:M4", { fontColor: COLORS.header });
    p.style(D, "B5:M5", { bold: true });

    KPI_COLS.forEach(([a, b]) => {
      p.merge(D, `${a}7:${b}7`);
      p.merge(D, `${a}8:${b}8`);
      p.style(D, `${a}7:${b}7`, { bold: true, fontColor: COLORS.muted, fontSize: 9, fill: COLORS.brandLight, hAlign: "Center" });
      p.style(D, `${a}8:${b}8`, { bold: true, fontSize: 14, numberFormat: "#,##0.00", hAlign: "Center", borderBottom: COLORS.brand });
    });
    p.ops.push({ op: "rowHeight", sheet: D, address: "B8", height: 26 });

    const headers: [number, string][] = [
      [SECTION.summary.header, "Ringkasan Eksekutif"],
      [SECTION.trends.header, "Trend & Penemuan Utama"],
      [SECTION.risks.header, "Risiko Aliran Tunai"],
      [SECTION.expenses.header, "Pemerhatian Perbelanjaan"],
      [SECTION.actions.header, "Cadangan Tindakan"],
      [SECTION.quality.header, "Kualiti Data & Penyesuaian"],
    ];
    for (const [row] of headers) {
      p.merge(D, `B${row}:M${row}`);
      p.style(D, `B${row}:M${row}`, { bold: true, fontSize: 12, fontColor: COLORS.brand, borderBottom: COLORS.brand });
    }
    p.merge(D, `B${SECTION.summary.first}:M${SECTION.summary.last}`);
    p.style(D, `B${SECTION.summary.first}:M${SECTION.summary.last}`, { wrap: true, vAlign: "Top" });
    for (const s of [SECTION.trends, SECTION.risks, SECTION.expenses, SECTION.actions, SECTION.quality]) {
      for (let i = 0; i < s.slots; i++) {
        const r = s.first + i;
        p.merge(D, `B${r}:M${r}`);
      }
      p.style(D, `B${s.first}:M${s.first + s.slots - 1}`, { wrap: true, vAlign: "Top" });
      p.ops.push({ op: "rowHeight", sheet: D, address: `B${s.first}:B${s.first + s.slots - 1}`, height: 32 });
    }
    p.merge(D, `B${SECTION.disclaimer}:M${SECTION.disclaimer + 1}`);
    p.style(D, `B${SECTION.disclaimer}:M${SECTION.disclaimer + 1}`, { italic: true, fontSize: 9, fontColor: COLORS.muted, wrap: true, vAlign: "Top" });
    p.merge(D, `B${SECTION.footer}:M${SECTION.footer}`);
    p.style(D, `B${SECTION.footer}:M${SECTION.footer}`, { fontSize: 8, fontColor: COLORS.muted });
  }

  // --- header ---
  p.one(D, "B1", t("Akaun Simple AI · Cash Flow Intelligence"));
  p.one(D, "B2", t(`Perniagaan: ${model.businessName?.trim() || "—"}`, 200));
  p.one(D, "B3", t(`Tempoh laporan: ${monthLabelMs(model.period.start)} – ${monthLabelMs(model.period.end)}`));
  p.one(D, "B4", t(`Kemas kini terakhir: ${fmtDate(model.updatedAt)} · Sumber: ${model.sourceLabel}`, 300));
  p.one(D, "B5", t(`Status data: ${STATUS_LABEL[model.status]}`));
  p.style(D, "B5:M5", { fontColor: model.status === "confirmed" ? COLORS.brand : COLORS.demo });

  // --- KPI (formulas into the data sheet so figures stay traceable) ---
  const kpiLabels = ["Aliran Masuk Tunai (RM)", "Aliran Keluar Tunai (RM)", "Aliran Tunai Bersih (RM)", "Baki Tunai Awal (RM)", "Baki Tunai Akhir (RM)"];
  const kpiFormulas = ["='_AI_CF_DATA'!G6", "='_AI_CF_DATA'!G7", "='_AI_CF_DATA'!G8", "='_AI_CF_DATA'!G4", "='_AI_CF_DATA'!G5"];
  KPI_COLS.forEach(([a], i) => {
    p.one(D, `${a}7`, t(kpiLabels[i]));
    p.formula(D, `${a}8`, kpiFormulas[i]!);
  });

  // --- charts (native Excel charts sourced from _AI_CF_DATA) ---
  p.ops.push({
    op: "chart",
    sheet: D,
    name: "AS_AI_CF_InOut",
    chartType: "ColumnClustered",
    sourceSheet: S,
    sourceAddress: `A${DATA_HEADER_ROW}:C${lastDataRow}`,
    title: "Aliran Masuk vs Aliran Keluar Bulanan",
    topLeft: "B10",
    bottomRight: "G25",
  });
  p.ops.push({
    op: "chart",
    sheet: D,
    name: "AS_AI_CF_Net",
    chartType: "Line",
    sourceSheet: S,
    sourceAddress: `I${DATA_HEADER_ROW}:J${lastDataRow}`,
    title: "Aliran Tunai Bersih Bulanan",
    topLeft: "H10",
    bottomRight: "M25",
  });

  // --- AI sections: clear slots, then write ---
  const ins = model.insights;
  p.clear(D, `B${SECTION.summary.first}:M${SECTION.summary.last}`);
  p.one(
    D,
    `B${SECTION.summary.first}`,
    t(ins ? ins.executiveSummary : "Insight AI tidak tersedia untuk kemas kini ini. Angka di atas dikira terus daripada data workbook."),
  );

  writeSlots(p, SECTION.trends, ins?.trends.map((x) => `• ${x.title} — ${x.detail} [${x.basis}]`) ?? []);
  writeSlots(p, SECTION.risks, ins?.risks.map((x) => `• [${x.severity.toUpperCase()}] ${x.title} — ${x.detail}`) ?? []);
  writeSlots(p, SECTION.expenses, ins?.expenseObservations.map((x) => `• ${x.title} — ${x.detail}`) ?? []);
  writeSlots(p, SECTION.actions, ins?.recommendedActions.map((x, i) => `${i + 1}. [${x.priority}] ${x.action} — ${x.rationale}`) ?? []);

  const quality: string[] = [
    ...model.reconciliation.map((r) => `${r.passed ? "✔" : "✖"} ${r.label}${r.passed ? "" : ` (beza RM ${r.difference?.toFixed(2)})`}`),
    ...model.issues.map((i) => `${i.severity === "error" ? "✖" : i.severity === "warning" ? "⚠" : "ℹ"} ${i.message}`),
    ...(ins?.dataLimitations.map((d) => `ℹ ${d}`) ?? []),
    ...(model.meta && model.meta.unverifiedAmounts.length > 0
      ? [`⚠ Angka dalam teks AI yang tidak dapat disahkan: ${model.meta.unverifiedAmounts.join(", ")}`]
      : []),
  ];
  writeSlots(p, SECTION.quality, quality.length > 0 ? quality : ["✔ Tiada isu kualiti data dikesan."]);

  p.one(
    D,
    `B${SECTION.disclaimer}`,
    t(
      "Angka kewangan dikira secara deterministik daripada data workbook (bukan oleh AI). Teks insight dijana oleh AI dan mungkin tidak tepat; " +
        "ia bukan nasihat kewangan, cukai atau perundangan profesional. Sheet asal Akaun Simple tidak diubah.",
      600,
    ),
  );
  const ai = model.meta ? `${model.meta.provider}/${model.meta.model}${model.meta.mock ? " (MOCK)" : ""}` : "tiada";
  p.one(D, `B${SECTION.footer}`, t(`Dijana oleh Akaun Simple AI · ${CASH_FLOW_SKILL_ID} v${CASH_FLOW_SKILL_VERSION} · AI: ${ai}`, 300));

  if (create) p.ops.push({ op: "activate", sheet: D });
  return { ops: p.ops };
}

function writeSlots(p: PlanBuilder, section: { first: number; slots: number }, lines: string[]) {
  const last = section.first + section.slots - 1;
  p.clear(D, `B${section.first}:M${last}`);
  const shown = lines.slice(0, section.slots);
  if (lines.length > section.slots) {
    shown[section.slots - 1] = `${shown[section.slots - 1]} (+${lines.length - section.slots} lagi dalam panel tugas)`;
  }
  if (shown.length === 0) shown.push("—");
  shown.forEach((line, i) => p.one(D, `B${section.first + i}`, t(line, 1000)));
}
