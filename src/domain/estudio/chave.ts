/**
 * Regras da chave de API colada no "Connect API key" — domínio puro.
 */

import { DomainError } from "../shared/errors";

/** A chave copiada de open.higgsfield.ai tem ~100 caracteres; o teto evita cookie gigante. */
export const CHAVE_MAX = 512;

/**
 * Normaliza a chave exatamente como foi copiada.
 *
 * Não exige nem monta ":" — o formato do SDK é key-id:key-secret, mas a tela
 * pede a chave inteira num campo só e ela vai como está em
 * `Authorization: Key <chave>`. Só tira espaço das pontas. Qualquer caractere
 * fora do ASCII visível é recusado: espaço no meio, quebra de linha ou byte de
 * controle virariam injeção de header.
 */
export function normalizarChaveApi(valor: unknown): string {
  const chave = typeof valor === "string" ? valor.trim() : "";
  if (!chave) {
    throw new DomainError("CHAVE_INVALIDA", "Cole a chave de API.");
  }
  if (/^key\s/i.test(chave)) {
    throw new DomainError(
      "CHAVE_INVALIDA",
      "Cole só a chave, sem o prefixo “Key” — ele é acrescentado pelo servidor.",
    );
  }
  if (chave.length > CHAVE_MAX || /[^\x21-\x7E]/.test(chave)) {
    throw new DomainError(
      "CHAVE_INVALIDA",
      "Cole a chave exatamente como copiada de open.higgsfield.ai, sem espaços nem quebras de linha.",
    );
  }
  return chave;
}
