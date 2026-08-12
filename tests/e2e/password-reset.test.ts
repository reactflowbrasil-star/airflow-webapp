/**
 * Recuperação de senha via código no WhatsApp (§6) contra PostgreSQL real.
 *
 * O que este fluxo protege: quem não tem acesso ao WhatsApp verificado da
 * conta não troca a senha dela; a resposta do pedido não revela se o e-mail
 * existe (anti-oráculo); o código é de uso único e não sobrevive à troca; e
 * sessões emitidas antes da troca são revogadas.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/server/db/prisma";
import { resetWhatsAppProvider } from "@/server/messaging/whatsapp";
import {
  redefinirSenha,
  solicitarRecuperacaoSenha,
} from "@/server/services/password-reset-service";
import { verifyPassword } from "@/server/auth/password";
import {
  createSessionToken,
  sessaoRevogadaPorTrocaDeSenha,
} from "@/server/auth/session";
import { resetDatabase } from "./helpers";

const CID = "test-reset-senha";
const EMAIL = "esqueci@teste.local";
const TELEFONE = "11988771200";

/**
 * O serviço nunca devolve o código em claro — por desenho. Para testar a
 * confirmação, o teste precisa dele, então o extraímos do envio interceptado.
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

async function criarUsuarioAtivo() {
  return prisma.user.create({
    data: {
      email: EMAIL,
      name: "Usuário Esqueci",
      passwordHash: "hash-antigo",
      role: "CUSTOMER",
      status: "ACTIVE",
      phone: `+${TELEFONE}`,
      phoneVerifiedAt: new Date(),
      customerProfile: { create: {} },
    },
  });
}

async function comCodigo() {
  await criarUsuarioAtivo();
  await solicitarRecuperacaoSenha({ email: EMAIL, correlationId: CID });
  return codigoEnviado();
}

beforeEach(async () => {
  await resetDatabase();
  resetWhatsAppProvider();
  ultimoTexto = "";
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("solicitação do código", () => {
  it("envia código para o telefone verificado da conta", async () => {
    await criarUsuarioAtivo();

    const r = await solicitarRecuperacaoSenha({
      email: EMAIL,
      correlationId: CID,
    });
    expect(r).toEqual({ ok: true });

    const registro = await prisma.phoneVerification.findFirstOrThrow({
      where: { user: { email: EMAIL } },
    });
    expect(registro.purpose).toBe("RESET_SENHA");
    expect(registro.phone).toBe(`+${TELEFONE}`);
    expect(registro.codeHash).not.toBe(codigoEnviado());
  });

  it("responde igual para e-mail inexistente — não vira oráculo", async () => {
    const r = await solicitarRecuperacaoSenha({
      email: "ninguem@teste.local",
      correlationId: CID,
    });
    expect(r).toEqual({ ok: true });
  });

  it("responde igual para conta sem telefone verificado", async () => {
    await prisma.user.create({
      data: {
        email: "sem-telefone@teste.local",
        name: "Sem Telefone",
        passwordHash: "x",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    const r = await solicitarRecuperacaoSenha({
      email: "sem-telefone@teste.local",
      correlationId: CID,
    });
    expect(r).toEqual({ ok: true });

    // Nada foi emitido — a resposta mentiu a favor do sigilo.
    const registros = await prisma.phoneVerification.count();
    expect(registros).toBe(0);
  });

  it("não emite código com propósito errado (CADASTRO) para e-mail inexistente", async () => {
    // Garante que o caminho inexistente não toca o provedor.
    await solicitarRecuperacaoSenha({ email: "ninguem@teste.local", correlationId: CID });
    expect(ultimoTexto).toBe("");
  });
});

describe("redefinição da senha", () => {
  it("troca o hash da senha e registra passwordChangedAt", async () => {
    const usuario = await criarUsuarioAtivo();
    const codigo = await comCodigo();

    await redefinirSenha({
      email: EMAIL,
      codigo,
      novaSenha: "NovaSenha123",
      correlationId: CID,
    });

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(depois.passwordHash).not.toBe("hash-antigo");
    expect(depois.passwordChangedAt).not.toBeNull();
    expect(await verifyPassword("NovaSenha123", depois.passwordHash)).toBe(true);
  });

  it("rejeita código errado com mensagem genérica", async () => {
    await criarUsuarioAtivo();
    await solicitarRecuperacaoSenha({ email: EMAIL, correlationId: CID });

    await expect(
      redefinirSenha({
        email: EMAIL,
        codigo: "000000",
        novaSenha: "NovaSenha123",
        correlationId: CID,
      }),
    ).rejects.toThrow(/inválido ou expirado/i);
  });

  it("rejeita e-mail inexistente com a mesma mensagem genérica", async () => {
    await expect(
      redefinirSenha({
        email: "ninguem@teste.local",
        codigo: "123456",
        novaSenha: "NovaSenha123",
        correlationId: CID,
      }),
    ).rejects.toThrow(/inválido ou expirado/i);
  });

  it("o código é de uso único — segunda tentativa com o mesmo código falha", async () => {
    await criarUsuarioAtivo();
    const codigo = await comCodigo();

    await redefinirSenha({
      email: EMAIL,
      codigo,
      novaSenha: "NovaSenha123",
      correlationId: CID,
    });

    await expect(
      redefinirSenha({
        email: EMAIL,
        codigo,
        novaSenha: "OutraSenha456",
        correlationId: CID,
      }),
    ).rejects.toThrow(/inválido ou expirado/i);
  });

  it("deixa rastro em auditoria sem senha nem código", async () => {
    const usuario = await criarUsuarioAtivo();
    const codigo = await comCodigo();

    await redefinirSenha({
      email: EMAIL,
      codigo,
      novaSenha: "NovaSenha123",
      correlationId: CID,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { userId: usuario.id, action: "PASSWORD_RESET" },
    });
    expect(JSON.stringify(audit)).not.toContain(codigo);
    expect(JSON.stringify(audit)).not.toContain("NovaSenha123");
    expect(JSON.stringify(audit)).not.toContain("hash-antigo");
  });
});

describe("revogação de sessões após a troca", () => {
  it("sessão emitida antes de passwordChangedAt é recusada", async () => {
    const usuario = await criarUsuarioAtivo();

    // Sessão emitida ANTES da troca — um token já distribuído a outro device.
    const tokenAntigo = await createSessionToken({
      userId: usuario.id,
      email: usuario.email,
      role: "CUSTOMER",
      status: "ACTIVE",
      customerProfileId: "x",
    });
    const verificado = await import("@/server/auth/session").then((m) =>
      m.verifySessionToken(tokenAntigo),
    );
    const iat = verificado?.iat;
    expect(iat).toBeTypeOf("number");

    const codigo = await comCodigo();
    await redefinirSenha({
      email: EMAIL,
      codigo,
      novaSenha: "NovaSenha123",
      correlationId: CID,
    });

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });

    // A regra pura que o getSession usa: token anterior à troca está morto.
    expect(
      sessaoRevogadaPorTrocaDeSenha(iat, depois.passwordChangedAt),
    ).toBe(true);
  });

  it("sessão emitida depois da troca segue válida", async () => {
    const usuario = await criarUsuarioAtivo();
    const codigo = await comCodigo();
    await redefinirSenha({
      email: EMAIL,
      codigo,
      novaSenha: "NovaSenha123",
      correlationId: CID,
    });

    const tokenNovo = await createSessionToken({
      userId: usuario.id,
      email: usuario.email,
      role: "CUSTOMER",
      status: "ACTIVE",
      customerProfileId: "x",
    });
    const verificado = await import("@/server/auth/session").then((m) =>
      m.verifySessionToken(tokenNovo),
    );
    const iat = verificado?.iat;
    expect(iat).toBeTypeOf("number");

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(sessaoRevogadaPorTrocaDeSenha(iat, depois.passwordChangedAt)).toBe(false);
  });
});
