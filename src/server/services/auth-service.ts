import { normalizarTelefone } from "@/domain/identity/phone";
import { DomainError } from "@/domain/shared/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { SessionPayload } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const TERMS_VERSION = "2026-08-11";

/**
 * Hash que nenhuma senha confere (bcrypt de payload inválido). Contas criadas
 * via Google não têm senha; o campo é obrigatório no schema, e este valor
 * garante que a autenticação por senha nunca aceite essas contas. Mesmo
 * padrão do hash usado em `authenticateUser` para não vazar existência.
 */
const HASH_GOOGLE_IMPOSIVEL =
  "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";

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

  // Lança se o formato não for celular brasileiro — antes de criar qualquer
  // coisa, para não deixar conta órfã que nunca receberá o código.
  const telefone = normalizarTelefone(input.phone);

  // Telefone já VERIFICADO por outra conta bloqueia; telefone apenas digitado
  // num cadastro abandonado, não — senão um erro de digitação alheio
  // impediria o dono real de se cadastrar.
  const telefoneEmUso = await prisma.user.findFirst({
    where: { phone: telefone.e164, phoneVerifiedAt: { not: null } },
    select: { id: true },
  });
  if (telefoneEmUso) {
    throw new DomainError(
      "PHONE_UNAVAILABLE",
      "Não foi possível criar a conta com este telefone",
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: telefone.e164,
        passwordHash,
        role: input.role,
        // A conta nasce pendente: só a confirmação do código no WhatsApp a
        // ativa. Guardas de rota tratam PENDING_VERIFICATION.
        status: "PENDING_VERIFICATION",
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
        newValue: { email: created.email, role: created.role, status: created.status },
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

/**
 * Login/cadastro via Google (§6).
 *
 * O e-mail é a chave de vínculo — o Google já comprovou a posse dele
 * (`email_verified` é exigido na validação das claims). Uma conta criada por
 * telefone que segue PENDING_VERIFICATION é ativada aqui: quem controla o
 * e-mail controla a identidade, e o Google provou esse controle. Contas
 * BLOCKED/SUSPENDED são recusadas como no login por senha.
 *
 * Sem e-mail cadastrado, cria uma conta de cliente ativa. Google não entrega
 * telefone, e o celular é o canal de negociação do prestador — então contas
 * Google são de cliente; quem quer oferecer serviço usa o cadastro completo.
 */
export async function authenticateWithGoogle(
  input: { email: string; name: string },
  correlationId: string,
): Promise<SessionPayload> {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    if (user.status === "BLOCKED" || user.status === "SUSPENDED") {
      throw new DomainError(
        "ACCOUNT_UNAVAILABLE",
        "Conta indisponível. Fale com o suporte.",
      );
    }
    if (user.deletedAt) {
      throw new DomainError(
        "GOOGLE_LOGIN_DENIED",
        "Não foi possível entrar com o Google",
      );
    }

    const dados: { status?: "ACTIVE"; emailVerifiedAt: Date; lastLoginAt: Date } = {
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      lastLoginAt: new Date(),
    };
    if (user.status === "PENDING_VERIFICATION") {
      dados.status = "ACTIVE";
    }
    await prisma.user.update({ where: { id: user.id }, data: dados });

    logger.info("Login Google — conta vinculada", {
      correlationId,
      userId: user.id,
    });
    return buildSessionPayload(user.id);
  }

  const criado = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email,
        // Google não entrega senha: hash que nenhuma senha confere. O dono
        // segue autenticando pelo Google; a senha existe só para satisfazer
        // o schema e nunca aceita login por senha.
        passwordHash: HASH_GOOGLE_IMPOSIVEL,
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });
    await tx.customerProfile.create({ data: { userId: created.id } });
    await tx.auditLog.create({
      data: {
        userId: created.id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: created.id,
        newValue: {
          email: created.email,
          role: created.role,
          status: created.status,
          origin: "GOOGLE",
        },
        correlationId,
      },
    });
    return created;
  });

  logger.info("Conta criada via Google", { correlationId, userId: criado.id });
  return buildSessionPayload(criado.id);
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
    status: user.status,
    role: user.role,
    customerProfileId: user.customerProfile?.id,
    providerProfileId: user.providerProfile?.id,
  };
}
