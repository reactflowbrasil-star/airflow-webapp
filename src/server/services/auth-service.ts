import { DomainError } from "@/domain/shared/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { SessionPayload } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const TERMS_VERSION = "2026-08-11";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function registerUser(
  input: RegisterInput,
  correlationId: string,
): Promise<SessionPayload> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Mensagem genérica: não confirmamos existência de conta para terceiros.
    throw new DomainError("EMAIL_UNAVAILABLE", "Não foi possível criar a conta com este e-mail");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        marketingConsent: input.marketingConsent,
      },
    });

    if (input.role === "CUSTOMER") {
      await tx.customerProfile.create({ data: { userId: created.id } });
    } else {
      // Slug único mesmo com nomes repetidos
      const base = slugify(input.name) || "tecnico";
      const suffix = created.id.slice(-6);
      await tx.providerProfile.create({
        data: {
          userId: created.id,
          slug: `${base}-${suffix}`,
          displayName: input.name,
          status: "INCOMPLETO",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: created.id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: created.id,
        newValue: { email: created.email, role: created.role },
        correlationId,
      },
    });

    return created;
  });

  logger.info("Usuário registrado", { correlationId, userId: user.id, role: user.role });
  return buildSessionPayload(user.id);
}

export async function authenticateUser(
  input: LoginInput,
  correlationId: string,
): Promise<SessionPayload> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Comparação em ambos os caminhos: evita distinguir "e-mail inexistente"
  // de "senha errada" pelo tempo de resposta.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await verifyPassword(input.password, hash);

  if (!user || !valid) {
    logger.warn("Tentativa de login inválida", { correlationId, email: input.email });
    throw new DomainError("INVALID_CREDENTIALS", "E-mail ou senha incorretos");
  }
  if (user.status === "BLOCKED" || user.status === "SUSPENDED") {
    throw new DomainError("ACCOUNT_UNAVAILABLE", "Conta indisponível. Fale com o suporte.");
  }
  if (user.deletedAt) {
    throw new DomainError("INVALID_CREDENTIALS", "E-mail ou senha incorretos");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info("Login efetuado", { correlationId, userId: user.id });
  return buildSessionPayload(user.id);
}

/** Monta o payload da sessão com os ids de perfil, evitando SELECTs nos guards. */
async function buildSessionPayload(userId: string): Promise<SessionPayload> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      customerProfile: { select: { id: true } },
      providerProfile: { select: { id: true } },
    },
  });

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    customerProfileId: user.customerProfile?.id,
    providerProfileId: user.providerProfile?.id,
  };
}
