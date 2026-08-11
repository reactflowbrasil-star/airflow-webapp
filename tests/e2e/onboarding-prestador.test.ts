import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  addProviderDocument,
  submitProviderOnboarding,
  updateProviderOnboardingProfile,
} from "@/server/services/provider-onboarding-service";
import { criarCenarioBase, resetDatabase, type Cenario } from "./helpers";

const CID = "test-onboarding-prestador";
let cenario: Cenario;

beforeEach(async () => {
  await resetDatabase();
  cenario = await criarCenarioBase();
  await prisma.providerProfile.update({
    where: { id: cenario.providerProfileId },
    data: { status: "INCOMPLETO", verified: false, onboardingStep: 0 },
  });
});

afterAll(async () => prisma.$disconnect());

async function addDocument(type: "RG" | "CPF" | "COMPROVANTE_ENDERECO" | "CERTIFICADO_TECNICO" | "SELFIE") {
  return addProviderDocument(cenario.providerProfileId, {
    type,
    fileUrl: `https://arquivos.teste.local/${type.toLowerCase()}.pdf`,
    fileName: `${type.toLowerCase()}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1024,
  });
}

describe("onboarding documental do prestador", () => {
  it("exige checklist completo antes de enviar para análise", async () => {
    await updateProviderOnboardingProfile(cenario.providerProfileId, {
      personType: "PF",
      taxId: "12345678901",
      yearsOfExperience: 5,
      neighborhood: "Vila Mariana",
      serviceRadiusKm: 25,
    });
    await addDocument("RG");

    await expect(
      submitProviderOnboarding(cenario.providerProfileId, cenario.providerUserId, CID),
    ).rejects.toThrow(/documentos obrigatórios/i);
    expect(
      (await prisma.providerProfile.findUniqueOrThrow({
        where: { id: cenario.providerProfileId },
      })).status,
    ).toBe("INCOMPLETO");
  });

  it("envia cadastro completo, registra verificação e auditoria", async () => {
    await updateProviderOnboardingProfile(cenario.providerProfileId, {
      personType: "PF",
      taxId: "12345678901",
      yearsOfExperience: 5,
      neighborhood: "Vila Mariana",
      serviceRadiusKm: 25,
    });
    for (const type of ["RG", "CPF", "COMPROVANTE_ENDERECO", "CERTIFICADO_TECNICO", "SELFIE"] as const) {
      await addDocument(type);
    }

    const provider = await submitProviderOnboarding(
      cenario.providerProfileId,
      cenario.providerUserId,
      CID,
    );
    expect(provider.status).toBe("AGUARDANDO_ANALISE");
    expect(provider.onboardingStep).toBe(11);

    const verification = await prisma.providerVerification.findUniqueOrThrow({
      where: { providerId: cenario.providerProfileId },
    });
    expect(verification.submittedAt).not.toBeNull();
    expect(verification.reviewedAt).toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "PROVIDER_ONBOARDING_SUBMITTED",
        entityId: cenario.providerProfileId,
      },
    });
    expect(audit.userId).toBe(cenario.providerUserId);
    expect(audit.correlationId).toBe(CID);
  });
});
