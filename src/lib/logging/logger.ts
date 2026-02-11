import crypto from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  // Keep it JSON so logs are parseable in production (Railway, etc.)
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](JSON.stringify(payload));
}

export function withLogContext(base: LogFields) {
  return {
    debug: (msg: string, fields: LogFields = {}) => log("debug", msg, { ...base, ...fields }),
    info: (msg: string, fields: LogFields = {}) => log("info", msg, { ...base, ...fields }),
    warn: (msg: string, fields: LogFields = {}) => log("warn", msg, { ...base, ...fields }),
    error: (msg: string, fields: LogFields = {}) => log("error", msg, { ...base, ...fields }),
  };
}


