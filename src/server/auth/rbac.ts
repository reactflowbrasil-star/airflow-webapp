/**
 * RBAC real, verificado no servidor (§5).
 *
 * Esconder botão no frontend não é controle de acesso. Toda rota protegida
 * passa por `requireRole`; todo recurso de terceiro passa por `assertOwnership`.
 */

import { getSession, type SessionPayload, type UserRole } from "./session";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Autenticação necessária") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Exige sessão válida. Lança 401 se não houver. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** Exige um dos papéis informados. ADMIN não recebe passe livre implícito. */
export async function requireRole(
  ...roles: readonly UserRole[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(
      `Papel ${session.role} não autorizado para esta operação`,
    );
  }
  return session;
}

export async function requireCustomer(): Promise<
  SessionPayload & { customerProfileId: string }
> {
  const session = await requireRole("CUSTOMER");
  if (!session.customerProfileId) {
    throw new ForbiddenError("Perfil de cliente não encontrado na sessão");
  }
  return session as SessionPayload & { customerProfileId: string };
}

export async function requireProvider(): Promise<
  SessionPayload & { providerProfileId: string }
> {
  const session = await requireRole("PROVIDER");
  if (!session.providerProfileId) {
    throw new ForbiddenError("Perfil de prestador não encontrado na sessão");
  }
  return session as SessionPayload & { providerProfileId: string };
}

export async function requireAdmin(): Promise<SessionPayload> {
  return requireRole("ADMIN");
}

/**
 * Segunda camada de autorização: o recurso pertence a quem pediu?
 * Sem isso, ter o papel CUSTOMER permitiria ler a ordem de qualquer cliente (IDOR).
 */
export function assertOwnership(
  resourceOwnerId: string | null | undefined,
  requesterId: string,
  resourceLabel = "recurso",
): void {
  if (!resourceOwnerId || resourceOwnerId !== requesterId) {
    throw new ForbiddenError(`Acesso negado ao ${resourceLabel}`);
  }
}

/** Admin pode ler recursos de terceiros, mas a leitura fica auditada (§44). */
export function assertOwnershipOrAdmin(
  resourceOwnerId: string | null | undefined,
  session: SessionPayload,
  resourceLabel = "recurso",
): void {
  if (session.role === "ADMIN") return;
  const requesterId =
    session.role === "CUSTOMER" ? session.customerProfileId : session.providerProfileId;
  assertOwnership(resourceOwnerId, requesterId ?? "", resourceLabel);
}
