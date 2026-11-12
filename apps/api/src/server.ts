import { createApp } from "./app.js";
import { createProvider } from "./ai/factory.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const provider = createProvider(config);
const app = createApp({ config, provider, logger });

// Bind to localhost only; Nginx terminates HTTPS and reverse-proxies /api/.
const server = app.listen(config.port, config.host, () => {
  logger.info("server_started", {
    host: config.host,
    port: config.port,
    env: config.env,
    provider: provider.name,
    model: provider.model,
    pilotKeys: config.pilotKeys.length,
  });
});
server.requestTimeout = config.ai.timeoutMs * (config.ai.invalidOutputRetries + 1) + 15_000;

const shutdown = (signal: string) => {
  logger.info("server_stopping", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
