/**
 * Timeline de acompanhamento do serviço — pura, testável sem banco.
 *
 * O cliente acompanha a jornada do atendimento (a caminho → chegou → em
 * andamento → concluído → repasse → avaliação). As etapas são derivadas do
 * estado real da ordem/agendamento/pagamento no servidor: a UI representa,
 * não decide. A única exceção é o marco "Chegou ao local" — não existe status
 * no schema para ele, então ele é marcado por uma mensagem de sistema com
 * `metadata.kind === "provider_arrived"` (registrada pelo prestador).
 */

export interface TimelineInput {
  /** Aceite da proposta (criação da ordem). */
  aceiteEm: Date;
  /** Confirmação do pagamento (escrow). */
  pagoEm: Date | null;
  agendadoEm: Date | null;
  /** `appointment.enRouteAt` — início do deslocamento. */
  enRouteEm: Date | null;
  /** Mensagem "chegou ao local" registrada pelo prestador. */
  chegouEm: Date | null;
  iniciadoEm: Date | null;
  /** Confirmação da conclusão pelo cliente (`order.completedAt`). */
  concluidoEm: Date | null;
  /** Fim da janela de segurança (`order.releasedAt`). */
  liberadoEm: Date | null;
  statusOrdem: string;
  statusAgendamento: string;
  temAvaliacao: boolean;
  /** Ordem aguardando o pagamento do cliente. */
  pagamentoPendente: boolean;
  /** Prestador pediu conclusão e o cliente ainda não confirmou. */
  confirmacaoPendente: boolean;
}

export type EstadoEtapa = "concluida" | "atual" | "pendente";

export interface EtapaTimeline {
  chave: string;
  rotulo: string;
  estado: EstadoEtapa;
  /** ISO da data em que a etapa aconteceu. */
  quando?: string;
}

function iso(data: Date | null | undefined): string | undefined {
  return data ? data.toISOString() : undefined;
}

/**
 * Deriva as etapas da jornada. Regra de "atual": a primeira etapa ainda não
 * concluída que já tem progresso real (timestamp ou estado); as seguintes
 * ficam pendentes.
 */
export function montarTimelineServico(input: TimelineInput): EtapaTimeline[] {
  const etapas: EtapaTimeline[] = [
    { chave: "aceite", rotulo: "Proposta aceita", estado: "concluida", quando: iso(input.aceiteEm) },
    {
      chave: "pagamento",
      rotulo: "Pagamento retido",
      estado: input.pagoEm
        ? "concluida"
        : input.pagamentoPendente
          ? "atual"
          : "pendente",
      quando: iso(input.pagoEm),
    },
    {
      chave: "agendamento",
      rotulo: "Atendimento agendado",
      estado: input.agendadoEm
        ? "concluida"
        : input.pagoEm
          ? "atual"
          : "pendente",
      quando: iso(input.agendadoEm),
    },
    {
      chave: "a-caminho",
      rotulo: "Profissional a caminho",
      estado:
        input.enRouteEm || input.iniciadoEm
          ? "concluida"
          : input.statusAgendamento === "A_CAMINHO"
            ? "atual"
            : "pendente",
      quando: iso(input.enRouteEm ?? input.iniciadoEm),
    },
    {
      chave: "chegou",
      rotulo: "Chegou ao local",
      estado: input.chegouEm
        ? "concluida"
        : input.statusAgendamento === "A_CAMINHO"
          ? "atual"
          : "pendente",
      quando: iso(input.chegouEm),
    },
    {
      chave: "iniciado",
      rotulo: "Serviço em andamento",
      // A etapa é "atual" enquanto o serviço roda (ou o profissional já
      // chegou e está prestes a começar); só vira concluída na conclusão.
      estado: input.concluidoEm
        ? "concluida"
        : input.statusAgendamento === "EM_ANDAMENTO" ||
            (input.statusAgendamento === "A_CAMINHO" && input.chegouEm)
          ? "atual"
          : "pendente",
      quando: iso(input.iniciadoEm),
    },
    {
      chave: "conclusao",
      rotulo: "Conclusão confirmada",
      estado: input.concluidoEm
        ? "concluida"
        : input.confirmacaoPendente
          ? "atual"
          : "pendente",
      quando: iso(input.concluidoEm),
    },
    {
      chave: "liberacao",
      rotulo: "Repasse ao profissional",
      estado: input.liberadoEm
        ? "concluida"
        : input.statusOrdem === "CONCLUIDA"
          ? "atual"
          : "pendente",
      quando: iso(input.liberadoEm),
    },
    {
      chave: "avaliacao",
      rotulo: "Sua avaliação",
      estado: input.temAvaliacao
        ? "concluida"
        : input.concluidoEm || input.statusOrdem === "LIQUIDADA"
          ? "atual"
          : "pendente",
      quando: undefined,
    },
  ];

  // Garante no máximo uma etapa "atual": depois da primeira atual, as
  // seguintes que também estivessem marcadas como atuais viram pendentes.
  let jaTemAtual = false;
  for (const etapa of etapas) {
    if (etapa.estado === "atual") {
      if (jaTemAtual) etapa.estado = "pendente";
      jaTemAtual = true;
    }
  }

  return etapas;
}
