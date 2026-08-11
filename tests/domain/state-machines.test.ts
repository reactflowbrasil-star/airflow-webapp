import { describe, expect, it } from "vitest";

import {
  appointmentMachine,
  disputeMachine,
  nextNegotiationActor,
  orderMachine,
  paymentMachine,
  payoutMachine,
  proposalMachine,
  providerMachine,
  refundMachine,
  serviceRequestMachine,
} from "@/domain/state-machines";
import { InvalidTransitionError } from "@/domain/shared/errors";

describe("Máquinas de estado — transições válidas (§52)", () => {
  it("prestador percorre o onboarding até aprovação (§8)", () => {
    let s = providerMachine.transition("INCOMPLETO", "AGUARDANDO_ANALISE");
    s = providerMachine.transition(s, "APROVADO");
    expect(s).toBe("APROVADO");
  });

  it("ordem percorre o ciclo completo do §69", () => {
    let s = orderMachine.transition("CRIADA", "AGUARDANDO_PAGAMENTO");
    s = orderMachine.transition(s, "PAGA");
    s = orderMachine.transition(s, "AUTORIZADA");
    s = orderMachine.transition(s, "EM_EXECUCAO");
    s = orderMachine.transition(s, "CONCLUIDA");
    s = orderMachine.transition(s, "LIQUIDADA");
    expect(s).toBe("LIQUIDADA");
  });

  it("pagamento vai de criado a pago", () => {
    let s = paymentMachine.transition("CREATED", "PENDING");
    s = paymentMachine.transition(s, "PROCESSING");
    s = paymentMachine.transition(s, "PAID");
    expect(s).toBe("PAID");
  });

  it("agendamento acompanha a execução (§34)", () => {
    let s = appointmentMachine.transition("AGUARDANDO", "CONFIRMADO");
    s = appointmentMachine.transition(s, "A_CAMINHO");
    s = appointmentMachine.transition(s, "EM_ANDAMENTO");
    s = appointmentMachine.transition(s, "CONCLUIDO");
    expect(s).toBe("CONCLUIDO");
  });

  it("repasse falho pode ser retentado (§28)", () => {
    let s = payoutMachine.transition("REQUESTED", "PROCESSING");
    s = payoutMachine.transition(s, "FAILED");
    s = payoutMachine.transition(s, "REQUESTED");
    expect(s).toBe("REQUESTED");
  });
});

describe("Máquinas de estado — transições recusadas", () => {
  it("prestador não pula a análise", () => {
    expect(() => providerMachine.transition("INCOMPLETO", "APROVADO")).toThrow(
      InvalidTransitionError,
    );
  });

  it("ordem não é concluída sem pagamento", () => {
    expect(() => orderMachine.transition("AGUARDANDO_PAGAMENTO", "CONCLUIDA")).toThrow(
      InvalidTransitionError,
    );
  });

  it("ordem não é liquidada antes de concluída", () => {
    expect(() => orderMachine.transition("EM_EXECUCAO", "LIQUIDADA")).toThrow(
      InvalidTransitionError,
    );
  });

  it("pagamento falho não vira pago diretamente", () => {
    expect(() => paymentMachine.transition("FAILED", "PAID")).toThrow(
      InvalidTransitionError,
    );
  });

  it("pagamento cancelado é terminal", () => {
    expect(paymentMachine.isTerminal("CANCELED")).toBe(true);
    expect(() => paymentMachine.transition("CANCELED", "PENDING")).toThrow(
      InvalidTransitionError,
    );
  });

  it("proposta aceita não pode ser alterada (§14)", () => {
    expect(proposalMachine.isTerminal("ACEITA")).toBe(true);
    expect(() => proposalMachine.transition("ACEITA", "CONTRAPROPOSTA")).toThrow(
      InvalidTransitionError,
    );
    expect(() => proposalMachine.transition("ACEITA", "RECUSADA")).toThrow(
      InvalidTransitionError,
    );
  });

  it("solicitação contratada não volta a aberta", () => {
    expect(() => serviceRequestMachine.transition("CONTRATADA", "ABERTA")).toThrow(
      InvalidTransitionError,
    );
  });

  it("disputa resolvida é terminal", () => {
    expect(disputeMachine.isTerminal("RESOLVIDA_CLIENTE")).toBe(true);
    expect(() => disputeMachine.transition("RESOLVIDA_CLIENTE", "EM_ANALISE")).toThrow(
      InvalidTransitionError,
    );
  });

  it("estorno concluído é terminal", () => {
    expect(refundMachine.isTerminal("CONCLUIDO")).toBe(true);
  });

  it("repasse pago é terminal — não há pagar duas vezes", () => {
    expect(payoutMachine.isTerminal("PAID")).toBe(true);
    expect(() => payoutMachine.transition("PAID", "PROCESSING")).toThrow(
      InvalidTransitionError,
    );
  });
});

describe("Máquinas de estado — canTransition não lança", () => {
  it("responde booleano em vez de erro", () => {
    expect(orderMachine.canTransition("CRIADA", "PAGA")).toBe(false);
    expect(orderMachine.canTransition("CRIADA", "AGUARDANDO_PAGAMENTO")).toBe(true);
  });
});

describe("Negociação — alternância de turnos (§14)", () => {
  it("depois do cliente, é a vez do prestador", () => {
    expect(nextNegotiationActor("CLIENTE")).toBe("PRESTADOR");
    expect(nextNegotiationActor("PRESTADOR")).toBe("CLIENTE");
  });
});
