/**
 * Núcleo genérico das máquinas de estado (§52).
 *
 * Uma transição não declarada lança InvalidTransitionError — não existe
 * caminho alternativo pela UI ou por update direto no banco via aplicação.
 */

import { InvalidTransitionError } from "../shared/errors";

export interface StateMachine<S extends string> {
  readonly name: string;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  canTransition(from: S, to: S): boolean;
  /** Valida e devolve o estado destino; lança se a transição for ilegal. */
  transition(from: S, to: S): S;
  isTerminal(state: S): boolean;
}

export function defineStateMachine<S extends string>(
  name: string,
  transitions: Readonly<Record<S, readonly S[]>>,
): StateMachine<S> {
  return {
    name,
    transitions,
    canTransition(from: S, to: S): boolean {
      const allowed = transitions[from];
      return allowed !== undefined && allowed.includes(to);
    },
    transition(from: S, to: S): S {
      if (!this.canTransition(from, to)) {
        throw new InvalidTransitionError(name, from, to);
      }
      return to;
    },
    isTerminal(state: S): boolean {
      const allowed = transitions[state];
      return allowed === undefined || allowed.length === 0;
    },
  };
}
