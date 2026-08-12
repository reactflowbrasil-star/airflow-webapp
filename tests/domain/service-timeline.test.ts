import { describe, expect, it } from "vitest";

import {
  montarTimelineServico,
  type TimelineInput,
} from "@/lib/service-timeline";

const BASE: TimelineInput = {
  aceiteEm: new Date("2026-08-01T10:00:00Z"),
  pagoEm: null,
  agendadoEm: null,
  enRouteEm: null,
  chegouEm: null,
  iniciadoEm: null,
  concluidoEm: null,
  liberadoEm: null,
  statusOrdem: "AGUARDANDO_PAGAMENTO",
  statusAgendamento: "AGUARDANDO",
  temAvaliacao: false,
  pagamentoPendente: true,
  confirmacaoPendente: false,
};

function estados(etapas: { estado: string }[]): string[] {
  return etapas.map((etapa) => etapa.estado);
}

describe("montarTimelineServico", () => {
  it("ordem aguardando pagamento: aceite concluído e pagamento atual", () => {
    const etapas = montarTimelineServico(BASE);
    expect(etapas).toHaveLength(9);
    expect(etapas[0]).toMatchObject({ chave: "aceite", estado: "concluida" });
    expect(etapas[1]).toMatchObject({ chave: "pagamento", estado: "atual" });
    // Apenas uma etapa atual por vez.
    expect(estados(etapas).filter((e) => e === "atual")).toHaveLength(1);
  });

  it("pago e agendado: pagamento e agendamento concluídos, a caminho pendente", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      statusOrdem: "AUTORIZADA",
      statusAgendamento: "CONFIRMADO",
      pagamentoPendente: false,
    });
    expect(etapas[1].estado).toBe("concluida");
    expect(etapas[2].estado).toBe("concluida");
    expect(etapas[3].estado).toBe("pendente");
  });

  it("a caminho: etapa atual enquanto não chega nem inicia", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      statusOrdem: "EM_EXECUCAO",
      statusAgendamento: "A_CAMINHO",
      pagamentoPendente: false,
    });
    expect(etapas[3].estado).toBe("concluida");
    expect(etapas[4]).toMatchObject({ chave: "chegou", estado: "atual" });
    expect(estados(etapas).filter((e) => e === "atual")).toHaveLength(1);
  });

  it("chegou ao local mantém a etapa até o início do serviço", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      statusOrdem: "EM_EXECUCAO",
      statusAgendamento: "A_CAMINHO",
      pagamentoPendente: false,
    });
    expect(etapas[4]).toMatchObject({ chave: "chegou", estado: "concluida" });
    expect(etapas[5]).toMatchObject({ chave: "iniciado", estado: "atual" });
  });

  it("em andamento com data de início: etapa atual com a data", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      iniciadoEm: new Date("2026-08-03T13:30:00Z"),
      statusOrdem: "EM_EXECUCAO",
      statusAgendamento: "EM_ANDAMENTO",
      pagamentoPendente: false,
    });
    expect(etapas[5]).toMatchObject({
      chave: "iniciado",
      estado: "atual",
      quando: "2026-08-03T13:30:00.000Z",
    });
  });

  it("conclusão pedida aguardando cliente: etapa conclusão atual", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      iniciadoEm: new Date("2026-08-03T13:30:00Z"),
      statusOrdem: "EM_EXECUCAO",
      statusAgendamento: "CONCLUIDO",
      confirmacaoPendente: true,
      pagamentoPendente: false,
    });
    expect(etapas[6]).toMatchObject({ chave: "conclusao", estado: "atual" });
  });

  it("concluído sem liberar: repasse atual, avaliação atual após concluído", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      iniciadoEm: new Date("2026-08-03T13:30:00Z"),
      concluidoEm: new Date("2026-08-03T16:00:00Z"),
      statusOrdem: "CONCLUIDA",
      statusAgendamento: "CONCLUIDO",
      confirmacaoPendente: false,
      pagamentoPendente: false,
    });
    // A primeira "atual" (repasse) prevalece; avaliação fica pendente.
    expect(etapas[7]).toMatchObject({ chave: "liberacao", estado: "atual" });
    expect(etapas[8]).toMatchObject({ chave: "avaliacao", estado: "pendente" });
    expect(estados(etapas).filter((e) => e === "atual")).toHaveLength(1);
  });

  it("liquidado: avaliação fica atual até existir, sem fotos nem comentário", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      iniciadoEm: new Date("2026-08-03T13:30:00Z"),
      concluidoEm: new Date("2026-08-03T16:00:00Z"),
      liberadoEm: new Date("2026-08-05T16:00:00Z"),
      statusOrdem: "LIQUIDADA",
      statusAgendamento: "CONCLUIDO",
      pagamentoPendente: false,
    });
    expect(etapas[7]).toMatchObject({ chave: "liberacao", estado: "concluida" });
    expect(etapas[8]).toMatchObject({ chave: "avaliacao", estado: "atual" });
  });

  it("avaliado: todas as etapas concluídas", () => {
    const etapas = montarTimelineServico({
      ...BASE,
      pagoEm: new Date("2026-08-01T11:00:00Z"),
      agendadoEm: new Date("2026-08-03T09:00:00Z"),
      enRouteEm: new Date("2026-08-03T13:00:00Z"),
      chegouEm: new Date("2026-08-03T13:25:00Z"),
      iniciadoEm: new Date("2026-08-03T13:30:00Z"),
      concluidoEm: new Date("2026-08-03T16:00:00Z"),
      liberadoEm: new Date("2026-08-05T16:00:00Z"),
      statusOrdem: "LIQUIDADA",
      statusAgendamento: "CONCLUIDO",
      temAvaliacao: true,
      pagamentoPendente: false,
    });
    expect(estados(etapas).every((e) => e === "concluida")).toBe(true);
  });
});
