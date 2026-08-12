/**
 * Validação facial do prestador contra PostgreSQL real (§8).
 *
 * O que protege o fluxo: a selfie só é aceita se passar nas regras de domínio;
 * a sessão facial é assinada e ligada ao prestador (não dá para validar com a
 * sessão de outro); o documento SELFIE vira APROVADO e `verified` sobe na
 * mesma transação; rejeição do provedor não grava nada além de auditoria.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  iniciarSessaoFacial,
  validarSelfieFacial,
} from "@/server/services/facial-verification-service";
import { resetDatabase } from "./helpers";

const CID = "test-facial";

function selfieValida(): string {
  const base64 = "A".repeat(Math.ceil((300_000 * 4) / 3));
  return `data:image/jpeg;base64,${base64}`;
}

function selfieInvalida(): string {
  return "data:image/gif;base64,AAAA";
}

let userId: string;
let providerId: string;

beforeAll(async () => {
  await resetDatabase();
  const user = await prisma.user.create({
    data: {
      email: "facial@teste.local",
      name: "Técnico Facial",
      passwordHash: "x",
      role: "PROVIDER",
      status: "ACTIVE",
      providerProfile: {
        create: {
          slug: "facial-teste",
          displayName: "Técnico Facial",
          status: "APROVADO",
          verified: false,
        },
      },
    },
    include: { providerProfile: true },
  });
  userId = user.id;
  providerId = user.providerProfile!.id;
});

afterAll(async () => {
  await prisma.providerProfile.deleteMany({ where: { id: providerId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("validação facial", () => {
  it("cria sessão e aprova selfie válida — SELFIE APROVADO + verified", async () => {
    const { sessaoId } = await iniciarSessaoFacial(providerId);
    expect(sessaoId).toContain("sbx_facial_");

    const resultado = await validarSelfieFacial(
      providerId,
      sessaoId,
      selfieValida(),
      CID,
    );
    expect(resultado.aprovado).toBe(true);
    expect(resultado.modo).toBe("sandbox");

    const documento = await prisma.providerDocument.findFirst({
      where: { providerId, type: "SELFIE" },
    });
    expect(documento?.status).toBe("APROVADO");
    expect(documento?.reviewedBy).toBe("sistema-biometria");

    const perfil = await prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    expect(perfil?.verified).toBe(true);

    const auditoria = await prisma.auditLog.findFirst({
      where: { action: "FACIAL_VERIFIED", entityId: providerId },
    });
    expect(auditoria).not.toBeNull();
  });

  it("rejeita selfie fora das regras de domínio sem tocar o provedor", async () => {
    const { sessaoId } = await iniciarSessaoFacial(providerId);

    await expect(
      validarSelfieFacial(providerId, sessaoId, selfieInvalida(), CID),
    ).rejects.toMatchObject({ code: "SELFIE_INVALID" });
  });

  it("sessão alheia é recusada — o provedor exige sessão própria", async () => {
    const { sessaoId } = await iniciarSessaoFacial(providerId);

    await expect(
      validarSelfieFacial(
        "provider-alheio",
        sessaoId,
        selfieValida(),
        CID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SESSION" });
  });
});
