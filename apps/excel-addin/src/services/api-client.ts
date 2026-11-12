import {
  API_ERROR_MESSAGES_MS,
  GenerateInsightsResponseSchema,
  type ApiErrorCode,
  type CashFlowSummary,
  type GenerateInsightsResponse,
} from "@akaun/shared";

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode | "NETWORK" | "BAD_RESPONSE",
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const CLIENT_TIMEOUT_MS = 180_000;

/** Calls POST /api/v1/skills/CASH_FLOW_001/insights. Sends aggregates only. */
export async function requestCashFlowInsights(summary: CashFlowSummary, accessKey: string): Promise<GenerateInsightsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/skills/${summary.skill.id}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessKey}` },
      body: JSON.stringify({ summary, clientRequestId: crypto.randomUUID() }),
      signal: controller.signal,
      credentials: "omit",
    });
  } catch {
    throw new ApiClientError("NETWORK", "Tidak dapat menghubungi pelayan Akaun Simple AI. Semak sambungan internet anda.");
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: ApiErrorCode; requestId?: string } } | null)?.error;
    const code = err?.code && err.code in API_ERROR_MESSAGES_MS ? err.code : "INTERNAL_ERROR";
    throw new ApiClientError(code, API_ERROR_MESSAGES_MS[code], err?.requestId);
  }
  // Validate again on the client: never render an unvalidated AI response.
  const parsed = GenerateInsightsResponseSchema.safeParse(body);
  if (!parsed.success) throw new ApiClientError("BAD_RESPONSE", "Jawapan pelayan tidak sah dan tidak dipaparkan.");
  return parsed.data;
}
