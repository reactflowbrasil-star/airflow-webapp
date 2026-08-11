/**
 * Verificação de telefone por WhatsApp contra PostgreSQL real (§6).
 *
 * O foco aqui é o que protege a conta: o código não pode estar legível no
 * banco, não pode ser adivinhado por força bruta, não pode servir duas vezes e
 * não pode revelar quais telefones já têm cadastro.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db/prisma";
import { resetWhatsAppProvider } from "@/server/messaging/whatsapp";
import {
  MAX_TENTATIVAS,
  confirmarCodigo,
  situacaoVerificacao,
  solicitarCodigo,
} from "@/server/services/verification-service";
import { resetDatabase } from "./helpers";

const CID = "test-verificacao";
const TELEFONE = "11988771200";

/**
 * O serviço nunca devolve o código em claro — por desenho. Para testar a
 * confirmação, o teste precisa dele, então o extraímos do envio interceptado.
 * É a única forma honesta: ler do banco não daria, porque lá só existe o hash.
 */
let ultimoTexto = "";

vi.mock("@/server/messaging/whatsapp", async (original) => {
  const modulo = await original<typeof import("@/server/messaging/whatsapp")>();
  return {
    ...modulo,
    getWhatsAppProvider: () => ({
      nome: "teste",
      enviar: async (m: { texto: string }) => {
        ultimoTexto = m.texto;
        return { aceito: true, externalId: "teste-1" };
      },
    }),
  };
});

function codigoEnviado(): string {
  const match = /\b(\d{6})\b/.exec(ultimoTexto);
  if (!match) throw new Error("nenhum código no texto enviado");
  return match[1];
}

async function criarUsuario(email = "novo@teste.local") {
  return prisma.user.create({
    data: {
      email,
      name: "Novo Usuário",
      passwordHash: "x",
      role: "CUSTOMER",
      status: "PENDING_VERIFICATION",
      customerProfile: { create: {} },
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  resetWhatsAppProvider();
  ultimoTexto = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("emissão do código", () => {
  it("guarda hash, nunca o código em claro", async () => {
    const usuario = await criarUsuario();
    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });

    const registro = await prisma.phoneVerification.findFirstOrThrow({
      where: { userId: usuario.id },
    });
    const codigo = codigoEnviado();

    expect(registro.codeHash).not.toBe(codigo);
    expect(registro.codeHash).toMatch(/^\$2[aby]\$/);
    // A linha inteira serializada não pode conter o código em lugar nenhum.
    expect(JSON.stringify(registro)).not.toContain(codigo);
  });

  it("normaliza o telefone antes de gravar", async () => {
    const usuario = await criarUsuario();
    await solicitarCodigo({
      userId: usuario.id,
      telefone: "(11) 98877-1200",
      correlationId: CID,
    });

    const registro = await prisma.phoneVerification.findFirstOrThrow({
      where: { userId: usuario.id },
    });
    expect(registro.phone).toBe("+5511988771200");
  });

  it("devolve o telefone mascarado, não o número inteiro", async () => {
    const usuario = await criarUsuario();
    const r = await solicitarCodigo({
      userId: usuario.id,
      telefone: TELEFONE,
      correlationId: CID,
    });

    expect(r.telefoneMascarado).not.toContain("8877");
    expect(r.telefoneMascarado).toContain("00");
  });

  it("recusa telefone já verificado por outra conta", async () => {
    const dono = await criarUsuario("dono@teste.local");
    await prisma.user.update({
      where: { id: dono.id },
      data: { phone: "+5511988771200", phoneVerifiedAt: new Date() },
    });

    const outro = await criarUsuario("outro@teste.local");
    await expect(
      solicitarCodigo({ userId: outro.id, telefone: TELEFONE, correlationId: CID }),
    ).rejects.toThrow(/outra conta/i);
  });

  it("invalida o código anterior ao emitir um novo", async () => {
    const usuario = await criarUsuario();
    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });
    const primeiro = codigoEnviado();

    // Contorna a janela de reenvio empurrando o registro para o passado.
    await prisma.phoneVerification.updateMany({
      where: { userId: usuario.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });
    const segundo = codigoEnviado();
    expect(segundo).not.toBe(primeiro);

    // O primeiro não vale mais.
    await expect(
      confirmarCodigo({ userId: usuario.id, codigo: primeiro, correlationId: CID }),
    ).rejects.toThrow(/inválido|expirado/i);

    // O segundo vale.
    await expect(
      confirmarCodigo({ userId: usuario.id, codigo: segundo, correlationId: CID }),
    ).resolves.toBeDefined();
  });

  it("barra reenvio imediato", async () => {
    const usuario = await criarUsuario();
    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });

    await expect(
      solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID }),
    ).rejects.toThrow(/aguarde/i);
  });

  it("barra o número usado como canal de spam", async () => {
    const usuario = await criarUsuario();
    for (let i = 0; i < 5; i += 1) {
      await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });
      await prisma.phoneVerification.updateMany({
        where: { userId: usuario.id },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });
    }

    await expect(
      solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID }),
    ).rejects.toThrow(/muitos códigos/i);
  });
});

describe("confirmação", () => {
  async function comCodigo() {
    const usuario = await criarUsuario();
    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });
    return { usuario, codigo: codigoEnviado() };
  }

  it("ativa a conta e grava o telefone verificado", async () => {
    const { usuario, codigo } = await comCodigo();

    await confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID });

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(depois.status).toBe("ACTIVE");
    expect(depois.phoneVerifiedAt).not.toBeNull();
    expect(depois.phone).toBe("+5511988771200");
  });

  it("deixa rastro em auditoria", async () => {
    const { usuario, codigo } = await comCodigo();
    await confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PHONE_VERIFIED", entityId: usuario.id },
    });
    // O rastro não pode conter o código.
    expect(JSON.stringify(log)).not.toContain(codigo);
  });

  it("serve uma única vez", async () => {
    const { usuario, codigo } = await comCodigo();
    await confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID });

    await expect(
      confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID }),
    ).rejects.toThrow(/inválido|expirado/i);
  });

  it("bloqueia após o limite de tentativas", async () => {
    const { usuario, codigo } = await comCodigo();
    const errado = codigo === "000000" ? "111111" : "000000";

    for (let i = 0; i < MAX_TENTATIVAS; i += 1) {
      await expect(
        confirmarCodigo({ userId: usuario.id, codigo: errado, correlationId: CID }),
      ).rejects.toThrow();
    }

    // Depois do limite nem o código CERTO passa — é o que impede força bruta.
    await expect(
      confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID }),
    ).rejects.toThrow(/muitas tentativas/i);

    const usuarioDepois = await prisma.user.findUniqueOrThrow({
      where: { id: usuario.id },
    });
    expect(usuarioDepois.status).toBe("PENDING_VERIFICATION");
  });

  it("recusa código expirado", async () => {
    const { usuario, codigo } = await comCodigo();
    await prisma.phoneVerification.updateMany({
      where: { userId: usuario.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      confirmarCodigo({ userId: usuario.id, codigo, correlationId: CID }),
    ).rejects.toThrow(/inválido|expirado/i);
  });

  it("dá a mesma mensagem para código errado, expirado e inexistente", async () => {
    const { usuario, codigo } = await comCodigo();
    const semCodigo = await criarUsuario("sem@teste.local");

    const errado = await confirmarCodigo({
      userId: usuario.id,
      codigo: codigo === "000000" ? "111111" : "000000",
      correlationId: CID,
    }).catch((e: Error) => e.message);

    const inexistente = await confirmarCodigo({
      userId: semCodigo.id,
      codigo: "123456",
      correlationId: CID,
    }).catch((e: Error) => e.message);

    expect(errado).toBe(inexistente);
  });
});

describe("situação", () => {
  it("descreve o pendente sem expor o número nem o código", async () => {
    const usuario = await criarUsuario();
    await solicitarCodigo({ userId: usuario.id, telefone: TELEFONE, correlationId: CID });

    const s = await situacaoVerificacao(usuario.id);

    expect(s.verificado).toBe(false);
    expect(s.pendente?.tentativasRestantes).toBe(MAX_TENTATIVAS);
    expect(s.pendente?.telefoneMascarado).not.toContain("8877");
    expect(JSON.stringify(s)).not.toContain(codigoEnviado());
  });
});
