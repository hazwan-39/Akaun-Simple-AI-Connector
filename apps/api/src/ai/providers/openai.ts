import OpenAI from "openai";
import { ProviderError, parseJsonOutput, type AIProvider, type FinancialInsightsRequest, type ProviderResult } from "../types.js";

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
}

/** OpenAI adapter – Responses API with strict JSON-schema structured output. */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly opts: OpenAIProviderOptions, client?: OpenAI) {
    this.model = opts.model;
    this.client = client ?? new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async generateFinancialInsights(req: FinancialInsightsRequest): Promise<ProviderResult> {
    let response: OpenAI.Responses.Response;
    try {
      response = await this.client.responses.create(
        {
          model: this.model,
          instructions: req.instructions,
          input: [{ role: "user", content: req.financialSummary }],
          max_output_tokens: this.opts.maxOutputTokens,
          store: false,
          text: {
            format: { type: "json_schema", name: req.responseSchema.name, schema: req.responseSchema.schema, strict: true },
          },
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw mapOpenAIError(err);
    }

    if (response.status === "incomplete") {
      throw new ProviderError("truncated", this.name, `incomplete: ${response.incomplete_details?.reason ?? "unknown"}`);
    }
    for (const item of response.output ?? []) {
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "refusal") throw new ProviderError("refused", this.name, "model refused");
        }
      }
    }
    const text = response.output_text ?? "";
    if (!text) throw new ProviderError("invalid_json", this.name, "empty output");
    return { output: parseJsonOutput(text, this.name), model: response.model ?? this.model };
  }
}

function mapOpenAIError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIUserAbortError) {
    return new ProviderError("timeout", "openai", "request timed out or aborted");
  }
  if (err instanceof OpenAI.RateLimitError) return new ProviderError("rate_limited", "openai", "429 from provider");
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new ProviderError("auth", "openai", "provider rejected credentials");
  }
  if (err instanceof OpenAI.APIError) return new ProviderError("upstream", "openai", `status ${err.status ?? "n/a"}`);
  return new ProviderError("upstream", "openai", err instanceof Error ? err.name : "unknown error");
}
