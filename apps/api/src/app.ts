import { randomUUID } from "node:crypto";
import { SKILLS } from "@akaun/shared";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AIProvider } from "./ai/types.js";
import type { AppConfig } from "./config.js";
import { insightsController } from "./controllers/insights.controller.js";
import { AppError } from "./errors.js";
import type { Logger } from "./logger.js";
import { requirePilotKey } from "./security/auth.js";
import { DailyQuota } from "./security/quota.js";

export const APP_VERSION = "1.0.0";

export interface AppDeps {
  config: AppConfig;
  provider: AIProvider;
  logger: Logger;
  quota?: DailyQuota;
}

export function createApp({ config, provider, logger, quota }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));

  // Request id + access log (no bodies, no financial data).
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const started = Date.now();
    res.on("finish", () => {
      logger.info("http", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
        key: req.pilotKeyLabel ?? null,
      });
    });
    next();
  });

  // Restricted CORS: only the configured add-in origins.
  const allowed = new Set(config.corsOrigins);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
      exposedHeaders: ["X-Request-Id", "X-Quota-Remaining"],
      maxAge: 600,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "akaun-simple-ai-api", version: APP_VERSION, time: new Date().toISOString() });
  });

  const api = express.Router();
  // Coarse per-IP limiter before authentication (protects the auth check itself).
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
    }),
  );
  // Authenticate before parsing any body.
  api.use(requirePilotKey(config.pilotKeys));
  api.use(express.json({ limit: config.bodyLimit, strict: true, type: "application/json" }));
  api.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => req.pilotKeyLabel ?? req.ip ?? "anon",
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
    }),
  );

  api.get("/skills", (_req, res) => {
    res.json({ skills: SKILLS.map(({ id, version, nameMs, descriptionMs, status }) => ({ id, version, nameMs, descriptionMs, status })) });
  });

  api.post(
    "/skills/:skillId/insights",
    insightsController({
      provider,
      logger,
      timeoutMs: config.ai.timeoutMs,
      invalidOutputRetries: config.ai.invalidOutputRetries,
      quota: quota ?? new DailyQuota(config.dailyQuotaPerKey),
    }),
  );

  app.use("/api/v1", api);

  app.use((_req, _res, next) => next(new AppError("NOT_FOUND")));

  // Secure error handler: generic messages only, details stay in logs.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let appErr: AppError;
    if (err instanceof AppError) appErr = err;
    else if (isBodyParserError(err) && err.type === "entity.too.large") appErr = new AppError("PAYLOAD_TOO_LARGE");
    else if (isBodyParserError(err)) appErr = new AppError("INVALID_REQUEST", err.type);
    else appErr = new AppError("INTERNAL_ERROR", err instanceof Error ? err.name : "unknown");

    const fields = { requestId: req.requestId, code: appErr.code, detail: appErr.internalDetail };
    if (appErr.status >= 500) logger.error("request_failed", fields);
    else logger.warn("request_rejected", fields);

    res.status(appErr.status).json({ error: { code: appErr.code, message: appErr.message, requestId: req.requestId } });
  });

  return app;
}

function isBodyParserError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && typeof (err as { type: unknown }).type === "string";
}
