import { NextResponse } from "next/server";
import { z } from "zod";

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

const documentSchema = z.object({
  action: z.literal("ADD_DOCUMENT"),
  type: z.enum([
    "RG", "CNH", "CPF", "CNPJ", "COMPROVANTE_ENDERECO",
    "CERTIFICADO_TECNICO", "SELFIE", "OUTRO",
  ]),
  fileUrl: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Use um link HTTPS privado",
  }),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.coerce.number().int().positive().max(10 * 1024 * 1024),
});

const bodySchema = z.discriminatedUnion("action", [
  profileSchema,
  documentSchema,
  z.object({ action: z.literal("SUBMIT") }),
]);

export const POST = withApiHandler<[Request]>(async ({ correlationId }, request) => {
  const session = await requireProvider();
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
  if (body.action === "ADD_DOCUMENT") {
    const document = await addProviderDocument(session.providerProfileId, {
      type: body.type,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return NextResponse.json({ document }, { status: 201 });
  }

  const provider = await submitProviderOnboarding(
    session.providerProfileId,
    session.userId,
    correlationId,
  );
  return NextResponse.json({ provider });
});
