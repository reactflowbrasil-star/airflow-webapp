/**
 * Saldos segregados do prestador (§22): pending / available / blocked / inTransit.
 *
 * Domínio puro: cada função recebe o saldo atual e devolve o novo saldo,
 * validando que nenhuma categoria fique negativa. A persistência com lock
 * otimista (campo version) fica em src/server.
 */

import { FinancialInvariantError } from "../shared/errors";

export interface ProviderBalanceState {
  readonly pendingCents: number;
  readonly availableCents: number;
  readonly blockedCents: number;
  readonly inTransitCents: number;
}

export const EMPTY_BALANCE: ProviderBalanceState = Object.freeze({
  pendingCents: 0,
  availableCents: 0,
  blockedCents: 0,
  inTransitCents: 0,
});

function assertNonNegative(state: ProviderBalanceState, operation: string): ProviderBalanceState {
  for (const [key, value] of Object.entries(state)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new FinancialInvariantError(
        "BALANCE_NEGATIVE",
        `Operação "${operation}" deixaria ${key} negativo (${value})`,
        { operation, state: { ...state } },
      );
    }
  }
  return Object.freeze(state);
}

function assertPositiveAmount(amountCents: number, operation: string): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new FinancialInvariantError(
      "BALANCE_INVALID_AMOUNT",
      `Operação "${operation}" com valor inválido: ${amountCents}`,
    );
  }
}

/** Serviço liquidado → líquido entra como pendente (janela de segurança, §29). */
export function creditPending(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "creditPending");
  return assertNonNegative(
    { ...state, pendingCents: state.pendingCents + amountCents },
    "creditPending",
  );
}

/** Janela de segurança vencida sem disputa → pendente vira disponível. */
export function releasePendingToAvailable(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "releasePendingToAvailable");
  return assertNonNegative(
    {
      ...state,
      pendingCents: state.pendingCents - amountCents,
      availableCents: state.availableCents + amountCents,
    },
    "releasePendingToAvailable",
  );
}

/** Disputa aberta (§33) → valor sai de pendente/disponível para bloqueado. */
export function blockForDispute(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "blockForDispute");
  // Bloqueia primeiro do pendente; o restante sai do disponível.
  const fromPending = Math.min(state.pendingCents, amountCents);
  const fromAvailable = amountCents - fromPending;
  return assertNonNegative(
    {
      ...state,
      pendingCents: state.pendingCents - fromPending,
      availableCents: state.availableCents - fromAvailable,
      blockedCents: state.blockedCents + amountCents,
    },
    "blockForDispute",
  );
}

/** Disputa resolvida a favor do prestador → bloqueado volta a disponível. */
export function unblockToAvailable(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "unblockToAvailable");
  return assertNonNegative(
    {
      ...state,
      blockedCents: state.blockedCents - amountCents,
      availableCents: state.availableCents + amountCents,
    },
    "unblockToAvailable",
  );
}

/** Disputa resolvida a favor do cliente → bloqueado sai definitivamente (estorno). */
export function forfeitBlocked(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "forfeitBlocked");
  return assertNonNegative(
    { ...state, blockedCents: state.blockedCents - amountCents },
    "forfeitBlocked",
  );
}

/** Repasse solicitado → disponível vai para "em repasse". */
export function moveToTransit(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "moveToTransit");
  return assertNonNegative(
    {
      ...state,
      availableCents: state.availableCents - amountCents,
      inTransitCents: state.inTransitCents + amountCents,
    },
    "moveToTransit",
  );
}

/** Repasse confirmado pelo PSP → sai de "em repasse". */
export function settleTransit(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "settleTransit");
  return assertNonNegative(
    { ...state, inTransitCents: state.inTransitCents - amountCents },
    "settleTransit",
  );
}

/** Repasse falhou → valor volta de "em repasse" para disponível. */
export function returnTransitToAvailable(
  state: ProviderBalanceState,
  amountCents: number,
): ProviderBalanceState {
  assertPositiveAmount(amountCents, "returnTransitToAvailable");
  return assertNonNegative(
    {
      ...state,
      inTransitCents: state.inTransitCents - amountCents,
      availableCents: state.availableCents + amountCents,
    },
    "returnTransitToAvailable",
  );
}

export function totalCents(state: ProviderBalanceState): number {
  return (
    state.pendingCents + state.availableCents + state.blockedCents + state.inTransitCents
  );
}
