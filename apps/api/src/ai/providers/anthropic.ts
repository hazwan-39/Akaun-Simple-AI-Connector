import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, parseJsonOutput, type AIProvider, type FinancialInsightsRequest, type ProviderResult } from "../types.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Enable server-side refusal fallback (beta `server-side-fallback-2026-07-01`). */
  serverFallback: boolean;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Anthropic adapter – Messages API with `output_config.format` JSON-schema
 * structured output. Thinking is left at the model default (adaptive);
 * depth/cost is controlled with `output_config.effort`.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicProviderOptions, client?: Anthropic) {
    this.model = opts.model;
    this.client = client ?? new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async generateFinancialInsights(req: FinancialInsightsRequest): Promise<ProviderResult> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: this.opts.maxOutputTokens,
          system: req.instructions,
          messages: [{ role: "user", content: req.financialSummary }],
          output_config: {
            effort: this.opts.effort,
            format: { type: "json_schema", schema: req.responseSchema.schema },
          },
          ...(this.opts.serverFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw mapAnthropicError(err);
    }

    // Always check stop_reason before reading content.
    if (message.stop_reason === "refusal") throw new ProviderError("refused", this.name, "model refused");
    if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
      throw new ProviderError("truncated", this.name, `stop_reason ${message.stop_reason}`);
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new ProviderError("invalid_json", this.name, "empty output");
    return { output: parseJsonOutput(text, this.name), model: message.model };
  }
}

function mapAnthropicError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("timeout", "anthropic", "request timed out or aborted");
  }
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("rate_limited", "anthropic", "429 from provider");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "anthropic", "provider rejected credentials");
  }
  if (err instanceof Anthropic.APIError) return new ProviderError("upstream", "anthropic", `status ${err.status ?? "n/a"}`);
  return new ProviderError("upstream", "anthropic", err instanceof Error ? err.name : "unknown error");
}
