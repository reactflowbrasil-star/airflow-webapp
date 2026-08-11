import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, Icon, Rating } from "@/ui";
import { ProviderOnboarding } from "@/ui/provider-onboarding";
import { ProviderCatalogManager } from "@/ui/provider-catalog-manager";

export const metadata: Metadata = { title: "Meu perfil profissional" };

const STATUS_PERFIL: Record<
  string,
  { rotulo: string; tom: "success" | "warning" | "danger" | "neutral" }
> = {
  INCOMPLETO: { rotulo: "Cadastro incompleto", tom: "warning" },
  AGUARDANDO_ANALISE: { rotulo: "Em análise", tom: "warning" },
  APROVADO: { rotulo: "Aprovado", tom: "success" },
  REJEITADO: { rotulo: "Rejeitado", tom: "danger" },
  SUSPENSO: { rotulo: "Suspenso", tom: "danger" },
  BLOQUEADO: { rotulo: "Bloqueado", tom: "danger" },
};

export default async function PerfilPrestadorPage() {
  const session = await requireProvider();

  const [perfil, categorias] = await Promise.all([
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: session.providerProfileId },
      include: {
        user: { select: { name: true, email: true, createdAt: true } },
        city: { select: { name: true, state: true } },
        services: {
          where: { deletedAt: null },
          orderBy: { fromPriceCents: "asc" },
          include: { category: { select: { name: true } } },
        },
        documents: { orderBy: { createdAt: "desc" } },
        verification: { select: { rejectionReason: true } },
        portfolio: { where: { deletedAt: null }, orderBy: { position: "asc" } },
      },
    }),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const estado = STATUS_PERFIL[perfil.status] ?? {
    rotulo: perfil.status,
    tom: "neutral" as const,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Conta</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Meu perfil profissional
        </h1>
      </div>

      <Card className="accent-soft border p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="bg-grad grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white">
              {perfil.displayName.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-[-0.03em]">
                {perfil.displayName}
              </h2>
              <p className="text-muted mt-0.5 text-[0.8125rem]">
                {[perfil.neighborhood, perfil.city?.name].filter(Boolean).join(", ") ||
                  "Região não informada"}
              </p>
            </div>
          </div>
          <Badge tone={estado.tom}>{estado.rotulo}</Badge>
        </div>

        <dl className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
          <div>
            <dt className="eyebrow">Avaliação</dt>
            <dd className="mt-1">
              {perfil.ratingCount > 0 ? (
                <Rating value={perfil.ratingAverage} count={perfil.ratingCount} />
              ) : (
                <span className="text-muted text-sm">Sem avaliações</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Serviços concluídos</dt>
            <dd className="num mt-1 font-bold">{perfil.completedServices}</dd>
          </div>
          <div>
            <dt className="eyebrow">Raio de atendimento</dt>
            <dd className="num mt-1 font-bold">{perfil.serviceRadiusKm} km</dd>
          </div>
          {perfil.yearsOfExperience !== null && (
            <div>
              <dt className="eyebrow">Experiência</dt>
              <dd className="num mt-1 font-bold">{perfil.yearsOfExperience} anos</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="user-circle" className="text-[var(--accent-text)] text-lg" />
          Dados da conta
        </h2>
        <dl className="mt-4 flex flex-col gap-2.5 text-sm">
          <Linha rotulo="Nome">{perfil.user.name}</Linha>
          <Linha rotulo="E-mail">{perfil.user.email}</Linha>
          <Linha rotulo="Tipo">{perfil.personType === "PF" ? "Pessoa física" : "Pessoa jurídica"}</Linha>
          <Linha rotulo="Prestador desde">
            {perfil.user.createdAt.toLocaleDateString("pt-BR")}
          </Linha>
        </dl>
      </Card>

      <Card className="p-6">
        <ProviderCatalogManager
          categories={categorias}
          services={perfil.services.map((service) => ({
            id: service.id,
            categoryId: service.categoryId,
            categoryName: service.category.name,
            fromPriceCents: service.fromPriceCents,
            description: service.description,
            active: service.active,
          }))}
          portfolio={perfil.portfolio.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            imageUrl: item.imageUrl,
          }))}
        />
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="seal-check" className="text-[var(--accent-text)] text-lg" />
          Verificação
        </h2>
        <p className="text-secondary mt-3 text-sm leading-relaxed">
          {perfil.verified
            ? "Seu perfil está verificado: documentos, dados fiscais e experiência foram analisados."
            : "Envie seus documentos para obter o selo de verificação. Perfis verificados recebem mais solicitações."}
        </p>
        {!perfil.verified && (
          <div className="mt-5 border-t border-[var(--surface-border)] pt-5">
            <ProviderOnboarding
              status={perfil.status}
              personType={perfil.personType}
              taxId={perfil.personType === "PF" ? perfil.cpf ?? "" : perfil.cnpj ?? ""}
              companyName={perfil.companyName ?? ""}
              yearsOfExperience={perfil.yearsOfExperience}
              neighborhood={perfil.neighborhood ?? ""}
              serviceRadiusKm={perfil.serviceRadiusKm}
              documents={perfil.documents.map((document) => ({
                id: document.id,
                type: document.type,
                status: document.status,
                fileName: document.fileName,
                rejectionReason: document.rejectionReason,
              }))}
              rejectionReason={perfil.verification?.rejectionReason ?? null}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-secondary">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
