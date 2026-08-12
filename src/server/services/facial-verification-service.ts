/**
 * Validação facial do prestador (§8) — nível VERIFICADO com biometria.
 *
 * Fluxo: o prestador abre uma sessão (cookie assinado de 10 min), captura a
 * selfie no navegador (câmera real) e o backend envia ao provedor de
 * biometria. Aprovada, grava um documento SELFIE APROVADO (o tipo já existe
 * no schema — sem migration) e eleva `ProviderProfile.verified` para true.
 * O selo VERIFICADO com biometria é derivado da existência desse documento.
 *
 * O provedor real (Unico) é um adapter selecionado por env; o default é
 * sandbox (liveness simulada, captura real).
 */

import { DomainError } from "@/domain/shared/errors";
import {
  mapResultadoBiometria,
  motivoRejeicao,
  selfieAceita,
} from "@/domain/verification/facial";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";
import { registrarEvento } from "@/server/services/analytics-service";
import { getFacialProvider } from "@/server/verification";
import { FacialProviderError } from "@/server/verification/facial-provider";

/** Códigos do provedor que indicam sessão alheia/inválida, não falha do serviço. */
const CODIGOS_SESSAO_INVALIDA = new Set(["INVALID_SESSION", "SESSION_PROVIDER_MISMATCH"]);

export interface IniciarFacialResult {
  sessaoId: string;
  modo: "sandbox" | "real";
}

/** Abre a sessão de biometria no provedor configurado. */
export async function iniciarSessaoFacial(
  providerProfileId: string,
): Promise<IniciarFacialResult> {
  const provider = getFacialProvider();
  const perfil = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: providerProfileId },
    select: { displayName: true },
  });
  const { sessaoId } = await provider.criarSessao({
    providerProfileId,
    displayName: perfil.displayName,
  });
  return { sessaoId, modo: provider.modo };
}

export interface ValidarSelfieResult {
  aprovado: boolean;
  motivo: string | null;
  modo: "sandbox" | "real";
}

/**
 * Envia a selfie ao provedor e, aprovada, grava o documento SELFIE APROVADO
 * e eleva `verified` — tudo na mesma transação.
 */
export async function validarSelfieFacial(
  providerProfileId: string,
  sessaoId: string,
  selfieDataUrl: string,
  correlationId: string,
): Promise<ValidarSelfieResult> {
  // Regras de domínio primeiro: não alimenta o provedor com lixo.
  if (!selfieAceita(selfieDataUrl)) {
    throw new DomainError("SELFIE_INVALID", motivoRejeicao(selfieDataUrl) ?? "Imagem inválida");
  }

  const provider = getFacialProvider();
  let resultado;
  try {
    resultado = await provider.validarSelfie({ sessaoId, selfieDataUrl, providerProfileId });
  } catch (error) {
    // Sessão alheia é recusa de segurança, não indisponibilidade: o erro do
    // provedor é mapeado para um DomainError distinto, sem vazar detalhe.
    if (error instanceof FacialProviderError && CODIGOS_SESSAO_INVALIDA.has(error.code)) {
      throw new DomainError(
        "INVALID_SESSION",
        "Sessão de biometria inválida ou de outro prestador",
      );
    }
    logger.warn("Provedor de biometria falhou", {
      correlationId,
      providerId: provider.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DomainError(
      "FACIAL_PROVIDER_UNAVAILABLE",
      "Não foi possível analisar a selfie agora. Tente novamente em instantes.",
    );
  }

  const { estado, motivo } = mapResultadoBiometria(resultado);

  if (estado === "REPROVADA") {
    await prisma.auditLog.create({
      data: {
        action: "FACIAL_REJECTED",
        entityType: "ProviderProfile",
        entityId: providerProfileId,
        reason: motivo ?? undefined,
      },
    });
    logger.info("Biometria facial reprovada", {
      correlationId,
      providerProfileId,
      motivo,
    });
    return { aprovado: false, motivo, modo: provider.modo };
  }

  await prisma.$transaction(async (tx) => {
    const existente = await tx.providerDocument.findFirst({
      where: { providerId: providerProfileId, type: "SELFIE" },
      select: { id: true },
    });

    const documento = existente
      ? await tx.providerDocument.update({
          where: { id: existente.id },
          data: {
            status: "APROVADO",
            fileUrl: selfieDataUrl,
            fileName: "biometria-facial",
            mimeType: selfieDataUrl.split(";")[0].replace("data:", ""),
            sizeBytes: Math.ceil(
              ((selfieDataUrl.split(",")[1]?.length ?? 0) * 3) / 4,
            ),
            reviewedAt: new Date(),
            reviewedBy: "sistema-biometria",
            rejectionReason: null,
          },
        })
      : await tx.providerDocument.create({
          data: {
            providerId: providerProfileId,
            type: "SELFIE",
            status: "APROVADO",
            fileUrl: selfieDataUrl,
            fileName: "biometria-facial",
            mimeType: selfieDataUrl.split(";")[0].replace("data:", ""),
            sizeBytes: Math.ceil(
              ((selfieDataUrl.split(",")[1]?.length ?? 0) * 3) / 4,
            ),
            reviewedAt: new Date(),
            reviewedBy: "sistema-biometria",
          },
        });

    await tx.providerProfile.update({
      where: { id: providerProfileId },
      data: { verified: true },
    });

    await tx.auditLog.create({
      data: {
        action: "FACIAL_VERIFIED",
        entityType: "ProviderProfile",
        entityId: providerProfileId,
        newValue: {
          documentId: documento.id,
          providerId: provider.id,
          score: resultado.score ?? null,
        },
      },
    });

    // Marco do onboarding: biometria aprovada (§60 — nome livre).
    await registrarEvento(tx, {
      nome: "facial_aprovado",
      propriedades: { providerId: providerProfileId },
    });
  });

  logger.info("Biometria facial aprovada — prestador VERIFICADO", {
    correlationId,
    providerProfileId,
    providerId: provider.id,
    score: resultado.score ?? null,
  });

  return { aprovado: true, motivo: null, modo: provider.modo };
}
