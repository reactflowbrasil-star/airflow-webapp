/**
 * Logs estruturados em JSON com correlationId (§59).
 *
 * Toda operação financeira propaga o mesmo correlationId, de modo que
 * um lançamento no ledger possa ser rastreado até a requisição HTTP
 * que o originou (§70).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  orderId?: string;
  paymentId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
