/**
 * Ciclo de vida de uma geração do Estúdio — domínio puro (§52).
 *
 * Quem manda na fila é a Higgsfield; a máquina local só garante que o que já
 * se sabe não retroceda (um PROCESSANDO não volta a NA_FILA) e que estado
 * terminal seja terminal. Os três estados locais — ENVIANDO, RECUSADA e
 * INDETERMINADA — existem porque o envio pode falhar de dois jeitos muito
 * diferentes: recusado (nada foi criado, pode corrigir e reenviar) ou sem
 * resposta (pode ter sido criado; reenviar às cegas pode cobrar duas vezes).
 */

import { defineStateMachine } from "../state-machines/machine";

export type StatusGeracao =
  | "ENVIANDO"
  | "NA_FILA"
  | "PROCESSANDO"
  | "CONCLUIDA"
  | "FALHOU"
  | "BLOQUEADA"
  | "CANCELADA"
  | "RECUSADA"
  | "INDETERMINADA";

export const geracaoMachine = defineStateMachine<StatusGeracao>("GeracaoMidia", {
  ENVIANDO: [
    "NA_FILA",
    "PROCESSANDO",
    "CONCLUIDA",
    "FALHOU",
    "BLOQUEADA",
    "CANCELADA",
    "RECUSADA",
    "INDETERMINADA",
  ],
  NA_FILA: ["PROCESSANDO", "CONCLUIDA", "FALHOU", "BLOQUEADA", "CANCELADA"],
  PROCESSANDO: ["CONCLUIDA", "FALHOU", "BLOQUEADA", "CANCELADA"],
  CONCLUIDA: [],
  FALHOU: [],
  BLOQUEADA: [],
  CANCELADA: [],
  RECUSADA: [],
  INDETERMINADA: [],
});

/** Estados da API → estado local. `nsfw` é bloqueio de moderação. */
const DA_PLATAFORMA: Readonly<Record<string, StatusGeracao>> = {
  queued: "NA_FILA",
  in_progress: "PROCESSANDO",
  completed: "CONCLUIDA",
  failed: "FALHOU",
  nsfw: "BLOQUEADA",
  canceled: "CANCELADA",
};

export function statusDaPlataforma(status: string): StatusGeracao | null {
  return Object.hasOwn(DA_PLATAFORMA, status) ? DA_PLATAFORMA[status] : null;
}

/**
 * Próximo estado local a partir do que a plataforma respondeu.
 *
 * Estado desconhecido, repetido ou que a máquina não aceita mantém o atual:
 * a resposta de um poll atrasado não pode desfazer o que um poll anterior já
 * registrou.
 */
export function proximoStatus(atual: StatusGeracao, daPlataforma: string): StatusGeracao {
  const alvo = statusDaPlataforma(daPlataforma);
  if (!alvo || alvo === atual || !geracaoMachine.canTransition(atual, alvo)) return atual;
  return alvo;
}

export function ehTerminal(status: StatusGeracao): boolean {
  return geracaoMachine.isTerminal(status);
}

/**
 * Cancelar só enquanto está na fila: a plataforma não interrompe geração em
 * andamento (README do SDK oficial e template: "in_progress — cannot cancel").
 */
export function podeCancelar(status: StatusGeracao): boolean {
  return status === "NA_FILA";
}

/**
 * Linha em ENVIANDO há mais que isto ficou órfã — o processo caiu com o POST
 * em voo. O timeout do envio é bem menor, então não há corrida com um envio
 * legítimo; a linha vira INDETERMINADA, nunca é reenviada.
 */
export const ENVIO_ORFAO_MS = 2 * 60_000;

export function envioOrfao(status: StatusGeracao, criadoEm: Date, agora: Date): boolean {
  return status === "ENVIANDO" && agora.getTime() - criadoEm.getTime() > ENVIO_ORFAO_MS;
}

export const ROTULO_STATUS: Readonly<
  Record<StatusGeracao, { rotulo: string; tom: "neutral" | "brand" | "success" | "warning" | "danger" }>
> = {
  ENVIANDO: { rotulo: "Enviando", tom: "neutral" },
  NA_FILA: { rotulo: "Na fila", tom: "brand" },
  PROCESSANDO: { rotulo: "Gerando", tom: "brand" },
  CONCLUIDA: { rotulo: "Concluída", tom: "success" },
  FALHOU: { rotulo: "Falhou", tom: "danger" },
  BLOQUEADA: { rotulo: "Bloqueada pela moderação", tom: "danger" },
  CANCELADA: { rotulo: "Cancelada", tom: "warning" },
  RECUSADA: { rotulo: "Recusada", tom: "danger" },
  INDETERMINADA: { rotulo: "Sem confirmação", tom: "warning" },
};
