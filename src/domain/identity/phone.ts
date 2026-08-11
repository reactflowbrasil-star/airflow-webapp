/**
 * Normalização de telefone brasileiro para E.164 (§6).
 *
 * Existe porque o mesmo número chega de cinco formas — `(11) 98877-1200`,
 * `11988771200`, `+55 11 98877 1200` — e todas precisam virar a mesma chave.
 * Sem isso, `phone @unique` não impede a mesma pessoa de criar duas contas, e
 * o código de verificação iria para um número que não bate com o cadastrado.
 *
 * Módulo puro: sem I/O, testável isoladamente.
 */

import { DomainError } from "@/domain/shared/errors";

/** Celulares brasileiros: 11 dígitos com DDD, o nono sempre 9. */
const CELULAR_BR = /^([1-9][0-9])(9[0-9]{8})$/;

export interface TelefoneNormalizado {
  /** Formato E.164, pronto para o provedor: +5511988771200 */
  readonly e164: string;
  /** Para exibir ao usuário: (11) 98877-1200 */
  readonly formatado: string;
  /** Só os dois últimos dígitos aparecem em tela de confirmação. */
  readonly mascarado: string;
}

/**
 * Converte entrada livre em E.164, ou lança.
 *
 * Aceita apenas celular brasileiro: WhatsApp não entrega em fixo, e aceitar
 * um número que nunca vai receber o código só produziria cadastros travados.
 */
export function normalizarTelefone(entrada: string): TelefoneNormalizado {
  const digitos = entrada.replace(/\D/g, "");

  // Tolera o 55 na frente, com ou sem o + que já foi removido acima.
  const semPais = digitos.startsWith("55") && digitos.length > 11
    ? digitos.slice(2)
    : digitos;

  const match = CELULAR_BR.exec(semPais);
  if (!match) {
    throw new DomainError(
      "INVALID_PHONE",
      "Informe um celular válido com DDD, por exemplo (11) 98877-1200",
    );
  }

  const [, ddd, numero] = match;
  return Object.freeze({
    e164: `+55${ddd}${numero}`,
    formatado: `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`,
    mascarado: `(${ddd}) *****-**${numero.slice(-2)}`,
  });
}

/** Versão que não lança — para filtros e validação opcional. */
export function tentarNormalizarTelefone(
  entrada: string,
): TelefoneNormalizado | null {
  try {
    return normalizarTelefone(entrada);
  } catch {
    return null;
  }
}
