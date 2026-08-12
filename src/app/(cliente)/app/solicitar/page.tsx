import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { RequestWizard } from "@/ui/request-wizard";

export const metadata: Metadata = {
  title: "Solicitar serviço",
  description:
    "Descreva o problema do seu ar-condicionado e receba propostas de técnicos verificados da sua região.",
};

export default async function SolicitarPage({
  searchParams,
}: {
  searchParams: Promise<{ tecnico?: string; servico?: string }>;
}) {
  const session = await requireCustomer();
  const { tecnico: slugTecnico, servico } = await searchParams;

  const [categorias, enderecos, tecnico] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      select: { id: true, name: true, slug: true, basePriceCents: true },
    }),
    prisma.address.findMany({
      where: { userId: session.userId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        label: true,
        street: true,
        number: true,
        neighborhood: true,
        cityName: true,
        state: true,
      },
    }),
    slugTecnico
      ? prisma.providerProfile.findFirst({
          where: { slug: slugTecnico, status: "APROVADO", deletedAt: null },
          select: { id: true, displayName: true, slug: true },
        })
      : null,
  ]);

  const categoriaInicial = servico
    ? categorias.find((c) => c.slug === servico)?.id
    : undefined;

  return (
    <>
      <h1 className="mb-6 text-xl font-bold tracking-tight sm:text-2xl">
        Solicitar serviço
      </h1>
      <RequestWizard
        categorias={categorias}
        enderecos={enderecos}
        tecnico={tecnico}
        categoriaInicial={categoriaInicial}
      />
    </>
  );
}
