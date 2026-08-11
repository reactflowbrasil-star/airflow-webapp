import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { DomainError } from "@/domain/shared/errors";
import {
  ForbiddenError,
  PendingVerificationError,
  UnauthorizedError,
} from "@/server/auth/rbac";
import { logger, newCorrelationId } from "@/server/observability/logger";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Converte exceções em respostas HTTP sem vazar stack trace ou detalhe
 * interno para o cliente. Erros inesperados viram 500 genérico e log completo.
 */
export function handleApiError(error: unknown, correlationId: string): NextResponse {
  if (error instanceof ZodError) {
    return apiError(422, "VALIDATION_ERROR", "Dados inválidos", error.issues);
  }
  if (error instanceof UnauthorizedError) {
    return apiError(401, "UNAUTHORIZED", error.message);
  }
  if (error instanceof PendingVerificationError) {
    // Código próprio para o cliente saber que deve mandar o usuário à tela de
    // verificação, em vez de mostrar "acesso negado".
    return apiError(403, "PENDING_VERIFICATION", error.message);
  }
  if (error instanceof ForbiddenError) {
    return apiError(403, "FORBIDDEN", error.message);
  }
  if (error instanceof DomainError) {
    logger.warn("Regra de domínio violada", {
      correlationId,
      code: error.code,
      details: error.details,
    });
    return apiError(422, error.code, error.message);
  }

  logger.error("Erro não tratado", {
    correlationId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return apiError(500, "INTERNAL_ERROR", "Erro interno. Tente novamente.");
}

/**
 * Envolve um handler com correlationId e tratamento de erro padronizado.
 *
 * Variádico porque o Next invoca route handlers como `(request)` ou
 * `(request, { params })` conforme a rota tenha ou não segmento dinâmico —
 * uma assinatura de aridade fixa quebra a validação de tipos do build.
 */
export function withApiHandler<A extends unknown[]>(
  handler: (ctx: { correlationId: string }, ...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A): Promise<NextResponse> => {
    const correlationId = newCorrelationId();
    try {
      const response = await handler({ correlationId }, ...args);
      response.headers.set("x-correlation-id", correlationId);
      return response;
    } catch (error) {
      const response = handleApiError(error, correlationId);
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }
  };
}

/** Validação server-side obrigatória (§57) — nunca confiar no frontend. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DomainError("INVALID_JSON", "Corpo da requisição não é JSON válido");
  }
  return schema.parse(raw);
}
