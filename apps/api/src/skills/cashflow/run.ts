import {
  CASH_FLOW_INSIGHTS_JSON_SCHEMA,
  CASH_FLOW_SKILL_ID,
  CASH_FLOW_SKILL_VERSION,
  CashFlowInsightsSchema,
  verifySummaryArithmetic,
  type CashFlowSummary,
  type GenerateInsightsResponse,
} from "@akaun/shared";
import { AppError } from "../../errors.js";
import type { Logger } from "../../logger.js";
import { ProviderError, type AIProvider } from "../../ai/types.js";
import { findUnverifiedAmounts } from "../../validation/amount-guard.js";
import { CASH_FLOW_INSTRUCTIONS, CASH_FLOW_PROMPT_VERSION, renderSummaryForPrompt } from "./prompt.js";

export interface SkillDeps {
  provider: AIProvider;
  timeoutMs: number;
  invalidOutputRetries: number;
  logger: Logger;
}

/**
 * CASH_FLOW_001 pipeline:
 *  1. re-verify the summary's arithmetic (never trust client maths blindly)
 *  2. call the provider with fixed instructions + delimited data
 *  3. validate the structured output against the strict schema (retry on invalid)
 *  4. flag any quoted amount that is not in the validated data
 */
export async function runCashFlowSkill(
  deps: SkillDeps,
  summary: CashFlowSummary,
  ctx: { requestId: string },
): Promise<GenerateInsightsResponse> {
  const problems = verifySummaryArithmetic(summary);
  if (problems.length > 0) throw new AppError("INCONSISTENT_SUMMARY", problems.join("; "));

  const request = {
    instructions: CASH_FLOW_INSTRUCTIONS,
    financialSummary: renderSummaryForPrompt(summary),
    responseSchema: { name: "cash_flow_insights", schema: CASH_FLOW_INSIGHTS_JSON_SCHEMA as unknown as Record<string, unknown> },
  };

  const attempts = 1 + deps.invalidOutputRetries;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    const started = Date.now();
    try {
      const result = await deps.provider.generateFinancialInsights({ ...request, signal: controller.signal });
      const parsed = CashFlowInsightsSchema.safeParse(result.output);
      if (!parsed.success) {
        deps.logger.warn("ai_output_schema_invalid", {
          requestId: ctx.requestId,
          attempt,
          provider: deps.provider.name,
          issuePaths: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")),
        });
        if (attempt < attempts) continue;
        throw new AppError("AI_INVALID_RESPONSE", "schema validation failed");
      }
      deps.logger.info("ai_generation_ok", {
        requestId: ctx.requestId,
        provider: deps.provider.name,
        model: result.model,
        promptVersion: CASH_FLOW_PROMPT_VERSION,
        attempt,
        ms: Date.now() - started,
      });
      return {
        insights: parsed.data,
        meta: {
          skillId: CASH_FLOW_SKILL_ID,
          skillVersion: CASH_FLOW_SKILL_VERSION,
          provider: deps.provider.name,
          model: result.model,
          generatedAt: new Date().toISOString(),
          mock: deps.provider.name === "mock",
          unverifiedAmounts: findUnverifiedAmounts(parsed.data, summary),
        },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof ProviderError) {
        deps.logger.warn("ai_provider_error", { requestId: ctx.requestId, provider: err.provider, kind: err.kind, attempt });
        if ((err.kind === "invalid_json" || err.kind === "truncated") && attempt < attempts) continue;
        throw new AppError(mapKind(err.kind), err.message);
      }
      throw new AppError("AI_PROVIDER_ERROR", err instanceof Error ? err.name : "unknown");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError("AI_INVALID_RESPONSE", "exhausted attempts");
}

function mapKind(kind: ProviderError["kind"]) {
  switch (kind) {
    case "timeout":
      return "AI_TIMEOUT" as const;
    case "refused":
      return "AI_REFUSED" as const;
    case "invalid_json":
    case "truncated":
      return "AI_INVALID_RESPONSE" as const;
    default:
      return "AI_PROVIDER_ERROR" as const;
  }
}
