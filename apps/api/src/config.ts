import { z } from "zod";

/**
 * All runtime configuration comes from environment variables (see .env.example).
 * The process refuses to start with an unsafe or incomplete production config.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  CORS_ALLOWED_ORIGINS: z.string().default("https://localhost:3000"),

  /** Comma-separated `label:sha256hex` pairs. Generate with `npm run keygen`. */
  PILOT_ACCESS_KEYS: z.string().default(""),
  /** Per-key successful AI generations allowed per UTC day. */
  DAILY_QUOTA_PER_KEY: z.coerce.number().int().min(1).max(10_000).default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  REQUEST_BODY_LIMIT: z.string().default("64kb"),

  AI_PROVIDER: z.enum(["openai", "anthropic", "mock"]).default("mock"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(90_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(64_000).default(8_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  /** Extra attempts when the model returns JSON that fails schema validation. */
  AI_INVALID_OUTPUT_RETRIES: z.coerce.number().int().min(0).max(2).default(1),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  /** Server-side refusal fallback (beta). Set to false to disable. */
  ANTHROPIC_SERVER_FALLBACK: z
    .string()
    .optional()
    .transform((v) => v !== "false"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ALLOW_MOCK_IN_PRODUCTION: bool,
});

export type AppConfig = ReturnType<typeof loadConfig>;

export interface PilotKey {
  label: string;
  sha256: Buffer;
}

export function parsePilotKeys(raw: string): PilotKey[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(":");
      const label = entry.slice(0, idx).trim();
      const hex = entry.slice(idx + 1).trim().toLowerCase();
      if (idx <= 0 || !/^[a-z0-9_.-]{1,40}$/i.test(label) || !/^[0-9a-f]{64}$/.test(hex)) {
        throw new Error(`PILOT_ACCESS_KEYS entry is invalid (expected label:sha256hex): "${entry.slice(0, 12)}…"`);
      }
      return { label, sha256: Buffer.from(hex, "hex") };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  const pilotKeys = parsePilotKeys(e.PILOT_ACCESS_KEYS);
  const corsOrigins = e.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

  if (e.NODE_ENV === "production") {
    if (e.AI_PROVIDER === "mock" && !e.ALLOW_MOCK_IN_PRODUCTION) {
      throw new Error("AI_PROVIDER=mock is not allowed in production.");
    }
    if (pilotKeys.length === 0) throw new Error("PILOT_ACCESS_KEYS must be set in production.");
    if (corsOrigins.some((o) => o === "*" || !o.startsWith("https://"))) {
      throw new Error("CORS_ALLOWED_ORIGINS must list explicit https:// origins in production.");
    }
  }
  if (e.AI_PROVIDER === "openai" && !e.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
  if (e.AI_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic.");
  }

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    trustProxy: e.TRUST_PROXY,
    corsOrigins,
    pilotKeys,
    dailyQuotaPerKey: e.DAILY_QUOTA_PER_KEY,
    rateLimit: { windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX },
    bodyLimit: e.REQUEST_BODY_LIMIT,
    logLevel: e.LOG_LEVEL,
    ai: {
      provider: e.AI_PROVIDER,
      timeoutMs: e.AI_REQUEST_TIMEOUT_MS,
      maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
      maxRetries: e.AI_MAX_RETRIES,
      invalidOutputRetries: e.AI_INVALID_OUTPUT_RETRIES,
      openai: { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL },
      anthropic: {
        apiKey: e.ANTHROPIC_API_KEY,
        model: e.ANTHROPIC_MODEL,
        effort: e.ANTHROPIC_EFFORT,
        serverFallback: e.ANTHROPIC_SERVER_FALLBACK,
      },
    },
  };
}
