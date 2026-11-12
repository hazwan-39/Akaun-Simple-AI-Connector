import type { CashFlowInsights } from "@akaun/shared";

export const validInsights = (): CashFlowInsights => ({
  executiveSummary: "Aliran tunai perniagaan positif bagi tempoh ini.",
  trends: [{ title: "Jualan meningkat", detail: "Jualan lebih tinggi pada suku kedua.", basis: "fakta" }],
  risks: [{ title: "Bulan negatif", detail: "Jun mencatat aliran keluar lebih tinggi.", severity: "sederhana" }],
  expenseObservations: [{ title: "Pembekal", detail: "Bayaran pembekal ialah kos terbesar." }],
  recommendedActions: [{ action: "Simpan rizab tunai", rationale: "Untuk menampung bulan yang lemah.", priority: "tinggi" }],
  dataLimitations: [],
});
