/**
 * Erros de domínio — sempre com código estável para tratamento programático,
 * logging estruturado e mapeamento para respostas HTTP na borda.
 */

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Transição de estado não permitida pela máquina (§52). */
export class InvalidTransitionError extends DomainError {
  constructor(machine: string, from: string, to: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Transição inválida em ${machine}: ${from} → ${to}`,
      { machine, from, to },
    );
    this.name = "InvalidTransitionError";
  }
}

/** Violação de invariante financeira — nunca deve acontecer em produção. */
export class FinancialInvariantError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "FinancialInvariantError";
  }
}
