import type { DocumentType, PersonType } from "@/generated/prisma/client";

import { providerMachine } from "@/domain/state-machines";
import { DomainError } from "@/domain/shared/errors";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

const DOCUMENTOS_COMUNS: DocumentType[] = [
  "COMPROVANTE_ENDERECO",
  "CERTIFICADO_TECNICO",
  "SELFIE",
];

export function documentosObrigatorios(personType: PersonType): DocumentType[] {
  return [personType === "PF" ? "CPF" : "CNPJ", "RG", ...DOCUMENTOS_COMUNS];
}

export interface ProviderOnboardingProfileInput {
  personType: PersonType;
  taxId: string;
  companyName?: string;
  yearsOfExperience: number;
  neighborhood: string;
  serviceRadiusKm: number;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export async function updateProviderOnboardingProfile(
  providerId: string,
  input: ProviderOnboardingProfileInput,
) {
  const taxId = digits(input.taxId);
  if (input.personType === "PF" && taxId.length !== 11) {
    throw new DomainError("INVALID_CPF", "CPF deve conter 11 dígitos");
  }
  if (input.personType === "PJ" && taxId.length !== 14) {
    throw new DomainError("INVALID_CNPJ", "CNPJ deve conter 14 dígitos");
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.providerProfile.findUniqueOrThrow({
      where: { id: providerId },
      select: { status: true },
    });
    if (!["INCOMPLETO", "REJEITADO"].includes(current.status)) {
      throw new DomainError(
        "ONBOARDING_LOCKED",
        "O cadastro não pode ser alterado enquanto está em análise ou aprovado",
      );
    }
    if (current.status === "REJEITADO") {
      providerMachine.transition(current.status, "INCOMPLETO");
    }

    return tx.providerProfile.update({
      where: { id: providerId },
      data: {
        personType: input.personType,
        cpf: input.personType === "PF" ? taxId : null,
        cnpj: input.personType === "PJ" ? taxId : null,
        companyName: input.personType === "PJ" ? input.companyName?.trim() : null,
        yearsOfExperience: input.yearsOfExperience,
        neighborhood: input.neighborhood.trim(),
        serviceRadiusKm: input.serviceRadiusKm,
        onboardingStep: 8,
        status: "INCOMPLETO",
        verified: false,
      },
    });
  });
}

export interface ProviderDocumentInput {
  type: DocumentType;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function addProviderDocument(
  providerId: string,
  input: ProviderDocumentInput,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.providerProfile.findUniqueOrThrow({
      where: { id: providerId },
      select: { status: true },
    });
    if (!["INCOMPLETO", "REJEITADO"].includes(current.status)) {
      throw new DomainError(
        "ONBOARDING_LOCKED",
        "Documentos não podem ser alterados enquanto o cadastro está em análise ou aprovado",
      );
    }
    if (current.status === "REJEITADO") {
      providerMachine.transition(current.status, "INCOMPLETO");
      await tx.providerProfile.update({
        where: { id: providerId },
        data: { status: "INCOMPLETO", verified: false },
      });
    }

    const document = await tx.providerDocument.create({
      data: { providerId, ...input },
    });
    await tx.providerProfile.update({
      where: { id: providerId },
      data: { onboardingStep: 10 },
    });
    return document;
  });
}

export async function submitProviderOnboarding(
  providerId: string,
  userId: string,
  correlationId: string,
) {
  return prisma.$transaction(async (tx) => {
    const provider = await tx.providerProfile.findUniqueOrThrow({
      where: { id: providerId },
      include: { documents: { orderBy: { createdAt: "desc" } } },
    });
    if (provider.status !== "INCOMPLETO") {
      throw new DomainError(
        "ONBOARDING_NOT_EDITABLE",
        `Cadastro em ${provider.status} não pode ser enviado para análise`,
      );
    }
    if (
      !provider.yearsOfExperience ||
      !provider.neighborhood ||
      (provider.personType === "PF" ? !provider.cpf : !provider.cnpj)
    ) {
      throw new DomainError(
        "PROFILE_INCOMPLETE",
        "Complete os dados profissionais e fiscais antes de enviar",
      );
    }

    const latestByType = new Map<DocumentType, (typeof provider.documents)[number]>();
    for (const document of provider.documents) {
      if (!latestByType.has(document.type)) latestByType.set(document.type, document);
    }
    const missing = documentosObrigatorios(provider.personType).filter(
      (type) => {
        const document = latestByType.get(type);
        return !document || document.status === "REJEITADO";
      },
    );
    if (missing.length > 0) {
      throw new DomainError("DOCUMENTS_MISSING", "Envie todos os documentos obrigatórios", {
        missing,
      });
    }

    providerMachine.transition(provider.status, "AGUARDANDO_ANALISE");
    const submittedAt = new Date();
    const updated = await tx.providerProfile.update({
      where: { id: providerId },
      data: { status: "AGUARDANDO_ANALISE", onboardingStep: 11, verified: false },
    });
    await tx.providerVerification.upsert({
      where: { providerId },
      create: { providerId, status: "AGUARDANDO_ANALISE", submittedAt },
      update: {
        status: "AGUARDANDO_ANALISE",
        submittedAt,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "PROVIDER_ONBOARDING_SUBMITTED",
        entityType: "ProviderProfile",
        entityId: providerId,
        previousValue: { status: provider.status },
        newValue: { status: "AGUARDANDO_ANALISE", submittedAt: submittedAt.toISOString() },
        correlationId,
      },
    });

    logger.info("Onboarding de prestador enviado para análise", {
      correlationId,
      providerId,
      documents: latestByType.size,
    });
    return updated;
  });
}
