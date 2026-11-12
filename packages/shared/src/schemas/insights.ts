import { z } from "zod";

/**
 * Structured AI output for CASH_FLOW_001. Every provider response is validated
 * against this schema before it reaches the user. Anything that fails is
 * rejected – never partially displayed.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // Reject markup/script and control characters outright.
    .refine((s) => !/<\s*\/?\s*(script|iframe|object|embed|style)\b/i.test(s), "Kandungan tidak dibenarkan")
    .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), "Aksara kawalan tidak dibenarkan");

export const CashFlowInsightsSchema = z
  .object({
    executiveSummary: text(1500),
    trends: z
      .array(z.object({ title: text(160), detail: text(700), basis: z.enum(["fakta", "anggaran"]) }).strict())
      .min(1)
      .max(6),
    risks: z
      .array(z.object({ title: text(160), detail: text(700), severity: z.enum(["rendah", "sederhana", "tinggi"]) }).strict())
      .max(5),
    expenseObservations: z.array(z.object({ title: text(160), detail: text(700) }).strict()).max(5),
    recommendedActions: z
      .array(z.object({ action: text(240), rationale: text(600), priority: z.enum(["tinggi", "sederhana", "rendah"]) }).strict())
      .min(1)
      .max(6),
    dataLimitations: z.array(text(400)).max(6),
  })
  .strict();

export type CashFlowInsights = z.infer<typeof CashFlowInsightsSchema>;

/**
 * Provider-facing JSON Schema. Deliberately limited to keywords that both
 * OpenAI strict structured outputs and Anthropic structured outputs accept
 * (type / properties / required / enum / items / additionalProperties).
 * Length and count limits are enforced afterwards by CashFlowInsightsSchema.
 */
export const CASH_FLOW_INSIGHTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["executiveSummary", "trends", "risks", "expenseObservations", "recommendedActions", "dataLimitations"],
  properties: {
    executiveSummary: { type: "string", description: "Ringkasan eksekutif aliran tunai, 3-5 ayat, Bahasa Melayu." },
    trends: {
      type: "array",
      description: "1-6 trend kewangan yang signifikan.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "basis"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          basis: { type: "string", enum: ["fakta", "anggaran"] },
        },
      },
    },
    risks: {
      type: "array",
      description: "0-5 risiko aliran tunai.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "severity"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["rendah", "sederhana", "tinggi"] },
        },
      },
    },
    expenseObservations: {
      type: "array",
      description: "0-5 pemerhatian perbelanjaan.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
    },
    recommendedActions: {
      type: "array",
      description: "1-6 tindakan praktikal yang disyorkan.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "rationale", "priority"],
        properties: {
          action: { type: "string" },
          rationale: { type: "string" },
          priority: { type: "string", enum: ["tinggi", "sederhana", "rendah"] },
        },
      },
    },
    dataLimitations: { type: "array", description: "0-6 had data yang perlu pengguna tahu.", items: { type: "string" } },
  },
} as const;
