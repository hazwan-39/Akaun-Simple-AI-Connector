/**
 * Provider-neutral AI interface. Providers know nothing about Akaun Simple or
 * cash flow: they receive instructions, a data block and a JSON schema, and
 * return parsed (but NOT yet validated) JSON. Validation happens in the skill
 * layer, so every provider is held to the same contract.
 */
export type ProviderName = "openai" | "anthropic" | "mock";

export interface FinancialInsightsRequest {
  /** Developer-controlled instructions (system prompt). */
  instructions: string;
  /** The validated financial summary, rendered as delimited untrusted data. */
  financialSummary: string;
  responseSchema: { name: string; schema: Record<string, unknown> };
  signal: AbortSignal;
}

export interface ProviderResult {
  /** Parsed JSON from the model. Untrusted until schema-validated. */
  output: unknown;
  /** Model id that actually served the request. */
  model: string;
}

export interface AIProvider {
  readonly name: ProviderName;
  readonly model: string;
  generateFinancialInsights(req: FinancialInsightsRequest): Promise<ProviderResult>;
}

export type ProviderErrorKind = "timeout" | "refused" | "invalid_json" | "truncated" | "rate_limited" | "auth" | "upstream";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: ProviderName,
    detail: string,
  ) {
    super(`${provider}:${kind}: ${detail}`);
  }
}

export function parseJsonOutput(text: string, provider: ProviderName): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("invalid_json", provider, "model output is not valid JSON");
  }
}
