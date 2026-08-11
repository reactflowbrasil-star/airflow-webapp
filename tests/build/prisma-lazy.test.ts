/**
 * O build de produção não pode exigir banco.
 *
 * Regressão real: o cliente Prisma era construído no topo do módulo, e como o
 * `next build` importa todo route handler para coletar metadados, a imagem
 * Docker só compilava se recebesse `DATABASE_URL` — a credencial de produção
 * virava dependência de compilação. O deploy quebrava com "Failed to collect
 * page data" numa rota que nem seria executada ali.
 *
 * Estes testes fixam as duas metades do contrato: importar não conecta, usar
 * conecta.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_ORIGINAL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (URL_ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = URL_ORIGINAL;
});

describe("cliente Prisma", () => {
  it("importa sem DATABASE_URL — é o que o build faz", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("@/server/db/prisma")).resolves.toBeDefined();
  });

  it("só reclama de DATABASE_URL quando alguém vai usar de fato", async () => {
    delete process.env.DATABASE_URL;
    const { prisma } = await import("@/server/db/prisma");

    // O acesso à propriedade é o que dispara a construção do client.
    expect(() => prisma.user).toThrow(/DATABASE_URL/);
  });

  it("expõe a API do client quando a URL existe", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/db";
    const { prisma } = await import("@/server/db/prisma");

    // Sem abrir conexão: só confere que o Proxy entrega os membros esperados.
    expect(typeof prisma.$transaction).toBe("function");
    expect(prisma.user).toBeDefined();
    expect("serviceRequest" in prisma).toBe(true);
  });
});

describe("leitura tolerante de pré-renderização", () => {
  it("devolve a reserva quando a consulta falha", async () => {
    const { consultaTolerante } = await import("@/server/db/prerender");

    const resultado = await consultaTolerante(
      "teste",
      () => Promise.reject(new Error("Can't reach database server")),
      ["reserva"],
    );

    expect(resultado).toEqual(["reserva"]);
  });

  it("devolve o valor real quando a consulta funciona", async () => {
    const { consultaTolerante } = await import("@/server/db/prerender");

    const resultado = await consultaTolerante("teste", () => Promise.resolve(["real"]), []);

    expect(resultado).toEqual(["real"]);
  });
});
