import { z } from "zod";
import { CashFlowSummarySchema } from "./cashflow-summary.js";
import { CashFlowInsightsSchema } from "./insights.js";

export const API_VERSION_PREFIX = "/api/v1";

export const GenerateInsightsRequestSchema = z
  .object({
    summary: CashFlowSummarySchema,
    /** Client-generated id for log correlation only. */
    clientRequestId: z.string().uuid().optional(),
  })
  .strict();
export type GenerateInsightsRequest = z.infer<typeof GenerateInsightsRequestSchema>;

export const InsightsMetaSchema = z.object({
  skillId: z.string(),
  skillVersion: z.string(),
  provider: z.enum(["openai", "anthropic", "mock"]),
  model: z.string(),
  generatedAt: z.string(),
  mock: z.boolean(),
  /** Amounts quoted by the AI that could not be matched to the validated summary. */
  unverifiedAmounts: z.array(z.string()),
});
export type InsightsMeta = z.infer<typeof InsightsMetaSchema>;

export const GenerateInsightsResponseSchema = z.object({
  insights: CashFlowInsightsSchema,
  meta: InsightsMetaSchema,
});
export type GenerateInsightsResponse = z.infer<typeof GenerateInsightsResponseSchema>;

export const ApiErrorCodes = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "INVALID_REQUEST",
  "INCONSISTENT_SUMMARY",
  "PAYLOAD_TOO_LARGE",
  "AI_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_RESPONSE",
  "AI_REFUSED",
  "NOT_FOUND",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof ApiErrorCodes)[number];

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; requestId?: string };
}

/** Bahasa Melayu messages shown to the user for each API error. */
export const API_ERROR_MESSAGES_MS: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "Kod akses tidak sah atau tiada. Sila masukkan kod akses pilot anda.",
  FORBIDDEN: "Akses tidak dibenarkan untuk kemahiran ini.",
  RATE_LIMITED: "Terlalu banyak permintaan. Sila cuba lagi sebentar.",
  QUOTA_EXCEEDED: "Had penggunaan harian anda telah dicapai. Sila cuba esok.",
  INVALID_REQUEST: "Data yang dihantar tidak sah.",
  INCONSISTENT_SUMMARY: "Angka ringkasan tidak konsisten dan ditolak oleh pelayan.",
  PAYLOAD_TOO_LARGE: "Data terlalu besar untuk dihantar.",
  AI_TIMEOUT: "Perkhidmatan AI mengambil masa terlalu lama. Sila cuba lagi.",
  AI_PROVIDER_ERROR: "Perkhidmatan AI tidak dapat dihubungi buat masa ini.",
  AI_INVALID_RESPONSE: "Jawapan AI tidak lulus pengesahan dan tidak dipaparkan.",
  AI_REFUSED: "Perkhidmatan AI menolak permintaan ini.",
  NOT_FOUND: "Laluan tidak ditemui.",
  INTERNAL_ERROR: "Ralat dalaman pelayan.",
};
