/**
 * Instrumentação do funil (§60).
 *
 * O modelo `AnalyticsEvent` existe no schema desde o início, mas nada escrevia
 * nele — o funil do CORE-PROMPT (visitou_home → ... → avaliou) ficava só no
 * papel. Este serviço grava cada marco com uma regra dura: **falha de
 * analytics nunca atrapalha o fluxo de negócio**. Um erro aqui não pode
 * derrubar um checkout nem reverter uma transação, então o `try/catch` engole
 * e loga.
 *
 * `registrarEvento` aceita o `prisma` global ou uma transação (`tx`): dentro
 * de um `$transaction`, o evento sai junto com a mudança de estado — ou os
 * dois acontecem, ou nenhum — que é a mesma disciplina do outbox do n8n.
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

type Db = Prisma.TransactionClient | typeof prisma;

export interface EventoFunil {
  /** Nome estável do marco, em snake_case (§60). Nunca renomear. */
  readonly nome: string;
  /**
   * Payload mínimo e sem PII: ids, valores em centavos e enums bastam para
   * calcular conversão. Telefone, e-mail e textos livres não entram aqui.
   */
  readonly propriedades?: Record<string, unknown>;
}

/**
 * Prepara o payload para o campo Json do banco: descarta `undefined` (que o
 * JSON não carrega) e converte `Date` para ISO. Função pura — testável sem
 * banco.
 */
export function serializarPropriedades(
  propriedades: Record<string, unknown> = {},
): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(propriedades)) {
    if (valor === undefined) continue;
    limpo[chave] = valor instanceof Date ? valor.toISOString() : valor;
  }
  return limpo;
}

/** Grava um marco do funil. Best-effort: falha loga e segue. */
export async function registrarEvento(
  db: Db,
  evento: EventoFunil,
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        name: evento.nome,
        properties: serializarPropriedades(
          evento.propriedades,
        ) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.warn("Analytics: falha ao registrar marco — ignorada", {
      nome: evento.nome,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
