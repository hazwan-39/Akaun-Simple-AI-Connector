import type { AppConfig } from "../config.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { MockProvider } from "./providers/mock.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { AIProvider } from "./types.js";

/** Builds the configured default provider. API keys stay server-side. */
export function createProvider(config: AppConfig): AIProvider {
  const { ai } = config;
  switch (ai.provider) {
    case "openai":
      return new OpenAIProvider({
        apiKey: ai.openai.apiKey!,
        model: ai.openai.model,
        timeoutMs: ai.timeoutMs,
        maxRetries: ai.maxRetries,
        maxOutputTokens: ai.maxOutputTokens,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: ai.anthropic.apiKey!,
        model: ai.anthropic.model,
        effort: ai.anthropic.effort,
        serverFallback: ai.anthropic.serverFallback,
        timeoutMs: ai.timeoutMs,
        maxRetries: ai.maxRetries,
        maxOutputTokens: ai.maxOutputTokens,
      });
    case "mock":
      return new MockProvider();
  }
}
