import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { ButtonLink, Card, EmptyState } from "@/ui";
import { LeadCard, type Lead } from "@/ui/lead-card";

export const metadata: Metadata = { title: "Solicitações" };

const EQUIPAMENTO: Record<string, string> = {
  SPLIT: "Split",
  INVERTER: "Inverter",
  JANELA: "Janela",
  CASSETE: "Cassete",
  PISO_TETO: "Piso-teto",
  MULTI_SPLIT: "Multi Split",
  OUTRO: "Outro",
};

export default async function SolicitacoesPrestadorPage() {
  const session = await requireProvider();
  const providerId = session.providerProfileId;

  const solicitacoes = await prisma.serviceRequest.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ABERTA", "EM_NEGOCIACAO"] },
      proposals: { some: { providerId } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true } },
      address: { select: { neighborhood: true, cityName: true } },
      proposals: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  const leads: Lead[] = solicitacoes.map((s) => {
    const ultima = s.proposals[0];
    return {
      requestId: s.id,
      categoria: s.category.name,
      bairro: s.address.neighborhood,
      cidade: s.address.cityName,
      urgencia: s.urgency,
      equipamento: `${s.quantity}× ${EQUIPAMENTO[s.equipmentType] ?? s.equipmentType}`,
      descricao: s.description,
      valorPropostoCents: s.proposedPriceCents,
      criadoEm: s.createdAt.toISOString(),
      minhaUltimaPropostaCents:
        ultima?.author === "PRESTADOR" ? ultima.amountCents : null,
      aguardandoMinhaResposta: ultima?.author === "CLIENTE",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Negociação</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Solicitações
        </h1>
      </div>

      {leads.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma solicitação aberta"
            description="Assim que um cliente pedir um serviço compatível com suas especialidades e área de atendimento, ele aparece aqui."
            action={<ButtonLink href="/pro">Voltar à visão geral</ButtonLink>}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          {leads.map((lead) => (
            <li key={lead.requestId} className="min-w-0">
              <LeadCard lead={lead} providerId={providerId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
