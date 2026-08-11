/**
 * Logs estruturados em JSON com correlationId (§59).
 *
 * Toda operação financeira propaga o mesmo correlationId, de modo que
 * um lançamento no ledger possa ser rastreado até a requisição HTTP
 * que o originou (§70).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Em teste, só erros aparecem — logs de fluxo afogariam a saída do runner e
 * escondem a falha real. `LOG_LEVEL` sobrescreve quando se quer depurar.
 */
function resolveMinLevel(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_RANK) return LEVEL_RANK[configured];
  return process.env.NODE_ENV === "test" ? LEVEL_RANK.error : LEVEL_RANK.debug;
}

const MIN_LEVEL = resolveMinLevel();

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  orderId?: string;
  paymentId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_RANK[level] < MIN_LEVEL) return;

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
