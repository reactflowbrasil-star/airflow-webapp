import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { DomainError } from "@/domain/shared/errors";
import { parseJsonBody, withApiHandler } from "@/lib/api";
import { requireProvider } from "@/server/auth/rbac";
import {
  addProviderDocument,
  submitProviderOnboarding,
  updateProviderOnboardingProfile,
} from "@/server/services/provider-onboarding-service";

const profileSchema = z.object({
  action: z.literal("UPDATE_PROFILE"),
  personType: z.enum(["PF", "PJ"]),
  taxId: z.string().min(11).max(20),
  companyName: z.string().max(160).optional(),
  yearsOfExperience: z.coerce.number().int().min(1).max(70),
  neighborhood: z.string().trim().min(2).max(100),
  serviceRadiusKm: z.coerce.number().int().min(1).max(200),
});
const documentTypeSchema = z.enum([
  "RG",
  "CNH",
  "CPF",
  "CNPJ",
  "COMPROVANTE_ENDERECO",
  "CERTIFICADO_TECNICO",
  "SELFIE",
  "OUTRO",
]);

const bodySchema = z.discriminatedUnion("action", [
  profileSchema,
  z.object({ action: z.literal("SUBMIT") }),
]);

const TIPOS_MIME_PERMITIDOS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

function sanitizarNomeArquivo(nome: string) {
  return nome.replace(/[\\/]/g, "_").trim().slice(0, 180) || "documento";
}

async function carregarDocumentoUpload(request: Request) {
  const formData = await request.formData();
  if (formData.get("action") !== "ADD_DOCUMENT") {
    throw new DomainError("INVALID_ACTION", "Ação inválida para envio de documento");
  }

  const type = documentTypeSchema.parse(formData.get("type"));
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new DomainError("MISSING_FILE", "Selecione um arquivo para enviar");
  }
  if (file.size <= 0) {
    throw new DomainError("EMPTY_FILE", "O arquivo selecionado está vazio");
  }
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new DomainError("FILE_TOO_LARGE", "O arquivo deve ter no máximo 10 MB");
  }
  if (!TIPOS_MIME_PERMITIDOS.has(file.type)) {
    throw new DomainError(
      "INVALID_FILE_TYPE",
      "Use uma imagem JPG, PNG ou WEBP",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileUrl = `data:${file.type};base64,${bytes.toString("base64")}`;

  return {
    type,
    fileUrl,
    fileName: sanitizarNomeArquivo(file.name),
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireProvider();
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const document = await carregarDocumentoUpload(request);
    const saved = await addProviderDocument(session.providerProfileId, document);
    return NextResponse.json({ document: saved }, { status: 201 });
  }

  const body = await parseJsonBody(request, bodySchema);

  if (body.action === "UPDATE_PROFILE") {
    const provider = await updateProviderOnboardingProfile(session.providerProfileId, {
      personType: body.personType,
      taxId: body.taxId,
      companyName: body.companyName,
      yearsOfExperience: body.yearsOfExperience,
      neighborhood: body.neighborhood,
      serviceRadiusKm: body.serviceRadiusKm,
    });
    return NextResponse.json({ provider });
  }

  const provider = await submitProviderOnboarding(
    session.providerProfileId,
    session.userId,
    correlationId,
  );
  return NextResponse.json({ provider });
});
