import { notFound } from "next/navigation";

import type { SessionPayload } from "./session";

/**
 * Guards de autorização para Server Components (páginas).
 *
 * Diferem dos guards de API de propósito: numa página, lançar ForbiddenError
 * vira uma tela de erro 500 — o que é errado em dois sentidos. Primeiro, um
 * IDOR tentado apareceria no monitoramento como falha do servidor em vez de
 * acesso negado. Segundo, um 403 confirma que o recurso existe, permitindo
 * enumerar ids alheios.
 *
 * Por isso aqui respondemos 404: para quem não é dono, o recurso simplesmente
 * não existe.
 */

export function assertOwnershipOrNotFound(
  resourceOwnerId: string | null | undefined,
  requesterId: string | null | undefined,
): void {
  if (!resourceOwnerId || !requesterId || resourceOwnerId !== requesterId) {
    notFound();
  }
}

/** Admin enxerga recursos de terceiros; os demais só os próprios. */
export function assertOwnershipOrAdminOrNotFound(
  resourceOwnerId: string | null | undefined,
  session: SessionPayload,
): void {
  if (session.role === "ADMIN") return;
  const requesterId =
    session.role === "CUSTOMER" ? session.customerProfileId : session.providerProfileId;
  assertOwnershipOrNotFound(resourceOwnerId, requesterId);
}
