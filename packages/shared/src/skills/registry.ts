import { CASH_FLOW_SKILL_ID, CASH_FLOW_SKILL_VERSION } from "../constants.js";

/**
 * AI Skill registry. Only CASH_FLOW_001 is implemented in Phase 1; the others
 * are UI placeholders and have no backend route.
 */
export interface SkillDefinition {
  id: string;
  version: string;
  nameMs: string;
  nameEn: string;
  descriptionMs: string;
  status: "enabled" | "coming_soon";
}

export const SKILLS: readonly SkillDefinition[] = [
  {
    id: CASH_FLOW_SKILL_ID,
    version: CASH_FLOW_SKILL_VERSION,
    nameMs: "Cash Flow Intelligence",
    nameEn: "Cash Flow Intelligence",
    descriptionMs: "Analisis aliran masuk & keluar tunai, trend bulanan dan cadangan tindakan.",
    status: "enabled",
  },
  { id: "PROFIT_001", version: "0.0.0", nameMs: "Profit Analysis", nameEn: "Profit Analysis", descriptionMs: "Analisis untung rugi.", status: "coming_soon" },
  { id: "EXPENSE_001", version: "0.0.0", nameMs: "Expense Intelligence", nameEn: "Expense Intelligence", descriptionMs: "Analisis corak perbelanjaan.", status: "coming_soon" },
  { id: "TAX_001", version: "0.0.0", nameMs: "Tax Assistant", nameEn: "Tax Assistant", descriptionMs: "Bantuan anggaran cukai.", status: "coming_soon" },
  { id: "HEALTH_001", version: "0.0.0", nameMs: "Financial Health", nameEn: "Financial Health", descriptionMs: "Skor kesihatan kewangan.", status: "coming_soon" },
];

export const getSkill = (id: string) => SKILLS.find((s) => s.id === id);
