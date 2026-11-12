/**
 * Minimal structured JSON logger.
 *
 * PRIVACY RULE: never pass request bodies, financial figures, AI prompts or AI
 * responses to the logger. Log only identifiers, status codes, timings and
 * error classes. `redact` strips common sensitive keys defensively.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = /authorization|api[-_]?key|token|summary|insights|prompt|body|amount|inflow|outflow|balance/i;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: Level = "info", sink: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): Logger {
  const log = (lvl: Level) => (msg: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    sink(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...redact(fields) }));
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
