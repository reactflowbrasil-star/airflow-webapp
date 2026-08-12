import Link from "next/link";
import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { ButtonLink, Card, EmptyState, Icon, IconBox } from "@/ui";
import { LeadCard, type Lead } from "@/ui/lead-card";
import { ProviderDispatchAlerts } from "@/ui/provider-dispatch-alerts";

export const metadata: Metadata = { title: "Sua operação" };

const EQUIPAMENTO: Record<string, string> = {
  SPLIT: "Split",
  INVERTER: "Inverter",
  JANELA: "Janela",
  CASSETE: "Cassete",
  PISO_TETO: "Piso-teto",
  MULTI_SPLIT: "Multi Split",
  OUTRO: "Outro",
};

/**
 * Datas de corte das consultas. Fora do componente porque instanciar Date no
 * corpo do render é chamada impura — a regra existe para o resultado não
 * variar entre renderizações da mesma árvore.
 */
function janelasDeTempo() {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  return {
    inicioDoDia,
    fimDoDia: new Date(inicioDoDia.getTime() + 24 * 3_600_000),
    seteDiasAtras: new Date(inicioDoDia.getTime() - 7 * 24 * 3_600_000),
  };
}

export default async function PainelPrestadorPage() {
  const session = await requireProvider();
  const providerId = session.providerProfileId;

  const { inicioDoDia, fimDoDia, seteDiasAtras } = janelasDeTempo();

  const [
    perfil,
    saldo,
    solicitacoes,
    agendaHoje,
    concluidosSemana,
    hojeCount,
    naoLidas,
    proximos,
  ] = await Promise.all([
      prisma.providerProfile.findUniqueOrThrow({
        where: { id: providerId },
        select: {
          displayName: true,
          ratingAverage: true,
          ratingCount: true,
          acceptanceRate: true,
          completedServices: true,
          cityId: true,
          baseLatitude: true,
          baseLongitude: true,
        },
      }),
      prisma.providerBalance.findUnique({ where: { providerId } }),
      // Solicitações compatíveis: abertas/em negociação onde este prestador
      // já foi acionado ou que estão abertas na sua cidade.
      prisma.serviceRequest.findMany({
        where: {
          deletedAt: null,
          status: { in: ["ABERTA", "EM_NEGOCIACAO"] },
          proposals: { some: { providerId } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          category: { select: { name: true } },
          address: {
            select: {
              neighborhood: true,
              cityName: true,
              latitude: true,
              longitude: true,
            },
          },
          proposals: { orderBy: { version: "desc" }, take: 1 },
        },
      }),
      prisma.appointment.findMany({
        where: {
          providerId,
          scheduledAt: { gte: inicioDoDia, lt: fimDoDia },
          status: { notIn: ["CANCELADO"] },
        },
        orderBy: { scheduledAt: "asc" },
        include: {
          order: {
            include: {
              request: {
                include: {
                  category: { select: { name: true } },
                  address: { select: { neighborhood: true } },
                },
              },
            },
          },
        },
      }),
      prisma.marketplaceOrder.count({
        where: {
          providerId,
          status: { in: ["CONCLUIDA", "LIQUIDADA"] },
          completedAt: { gte: seteDiasAtras },
        },
      }),
      prisma.proposal.count({
        where: { providerId, createdAt: { gte: inicioDoDia } },
      }),
      // Não lidas do outro lado da conversa — mesmo critério da lista de
      // mensagens, para o contador bater com o que aparece lá.
      prisma.message.count({
        where: {
          readAt: null,
          NOT: { senderId: session.userId },
          conversation: { providerId, archived: false },
        },
      }),
      // Próximos atendimentos a partir de amanhã — o hoje fica no aside.
      prisma.appointment.findMany({
        where: {
          providerId,
          scheduledAt: { gte: fimDoDia },
          status: { notIn: ["CANCELADO"] },
        },
        orderBy: { scheduledAt: "asc" },
        take: 3,
        include: {
          order: {
            include: {
              request: {
                include: {
                  category: { select: { name: true } },
                  address: { select: { neighborhood: true } },
                },
              },
            },
          },
        },
      }),
    ]);

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
      // Só age quem recebeu a última palavra do outro lado (§14)
      aguardandoMinhaResposta: ultima?.author === "CLIENTE",
      endereco: {
        latitude: s.address.latitude,
        longitude: s.address.longitude,
        rotulo: `${s.address.neighborhood}, ${s.address.cityName}`,
      },
      origem: {
        latitude: perfil.baseLatitude,
        longitude: perfil.baseLongitude,
      },
    };
  });

  const taxaAceite = Math.round(perfil.acceptanceRate * 100);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Painel do prestador</p>
        <h1 className="mt-2.5 text-[clamp(26px,3.6vw,38px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Sua operação hoje
        </h1>
      </div>

      {/* KPIs */}
      <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Kpi
          icone="tray-arrow-down"
          rotulo="Solicitações hoje"
          valor={String(hojeCount)}
        />
        <Kpi
          icone="trend-up"
          rotulo="Taxa de aceite"
          valor={`${taxaAceite}%`}
        />
        <Kpi
          icone="calendar-check"
          rotulo="Serviços na semana"
          valor={String(concluidosSemana)}
        />
        <Kpi
          icone="star"
          rotulo="Nota média"
          valor={
            perfil.ratingCount > 0
              ? perfil.ratingAverage.toFixed(1).replace(".", ",")
              : "—"
          }
        />
      </dl>

      {naoLidas > 0 && (
        <Link href="/pro/mensagens" className="block">
          <Card className="accent-soft flex items-center justify-between gap-3 border p-4 transition-colors hover:border-[var(--accent)]">
            <p className="text-sm font-semibold">
              {naoLidas} {naoLidas === 1 ? "mensagem nova" : "mensagens novas"} esperando
              resposta
            </p>
            <span className="shrink-0 text-sm font-semibold text-[var(--accent-text)]">
              Abrir conversas →
            </span>
          </Card>
        </Link>
      )}

      {/* Novos pedidos da fila de alerta — tempo real com som, quando houver */}
      <ProviderDispatchAlerts />

      <div className="flex flex-wrap gap-6">
        {/* Solicitações compatíveis */}
        <section className="min-w-0 flex-[1_1_440px]">
          <h2 className="mb-3.5 text-lg font-bold tracking-[-0.02em]">
            Solicitações compatíveis
          </h2>

          {leads.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhuma solicitação no momento"
                description="Quando um cliente da sua região pedir um serviço das suas especialidades, ele aparece aqui para você aceitar ou propor um valor."
                action={
                  <ButtonLink href="/pro/perfil" variant="secondary">
                    Revisar minhas especialidades
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {leads.map((lead) => (
                <li key={lead.requestId}>
                  <LeadCard lead={lead} providerId={providerId} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Aside: agenda + saldo */}
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 lg:max-w-[360px]">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
              <Icon name="calendar-dots" className="text-[var(--accent-text)] text-lg" />
              Agenda de hoje
            </h2>

            {agendaHoje.length === 0 ? (
              <p className="text-muted mt-3 text-sm">
                Nenhum atendimento agendado para hoje.
              </p>
            ) : (
              <ul className="mt-3.5 flex flex-col gap-2">
                {agendaHoje.map((item) => (
                  <li
                    key={item.id}
                    className="surface-muted flex items-center gap-3 rounded-[14px] px-3.5 py-3"
                  >
                    <span className="num shrink-0 font-bold text-[var(--accent-text)]">
                      {item.scheduledAt.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-semibold">
                        {item.order.request.category.name}
                      </span>
                      <span className="text-muted block truncate text-xs">
                        {item.order.request.address.neighborhood}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {proximos.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-[0.8125rem] font-bold">Próximos</h3>
                <ul className="flex flex-col gap-2">
                  {proximos.map((item) => (
                    <li
                      key={item.id}
                      className="surface-muted flex items-center gap-3 rounded-[14px] px-3.5 py-3"
                    >
                      <span className="num shrink-0 font-bold text-[var(--accent-text)]">
                        {item.scheduledAt.toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-semibold">
                          {item.order.request.category.name}
                        </span>
                        <span className="text-muted block truncate text-xs">
                          {item.order.request.address.neighborhood}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {/* Saldo — a UI apenas representa o estado financeiro do servidor */}
          <Card className="accent-soft border p-5">
            <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
              <Icon name="receipt" className="text-[var(--accent-text)] text-lg" />
              Saldo
            </h2>

            <dl className="mt-4 flex flex-col gap-3">
              <div>
                <dt className="eyebrow">Disponível para saque</dt>
                <dd className="num mt-1 text-[1.75rem] leading-none font-extrabold text-[var(--accent-text)]">
                  {formatBRL(money(saldo?.availableCents ?? 0))}
                </dd>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <dt className="eyebrow">Retido</dt>
                  <dd className="num mt-1 font-bold">
                    {formatBRL(money(saldo?.pendingCents ?? 0))}
                  </dd>
                </div>
                {(saldo?.blockedCents ?? 0) > 0 && (
                  <div>
                    <dt className="eyebrow">Bloqueado</dt>
                    <dd className="num mt-1 font-bold text-[var(--warn-text)]">
                      {formatBRL(money(saldo!.blockedCents))}
                    </dd>
                  </div>
                )}
                {(saldo?.inTransitCents ?? 0) > 0 && (
                  <div>
                    <dt className="eyebrow">Em repasse</dt>
                    <dd className="num mt-1 font-bold">
                      {formatBRL(money(saldo!.inTransitCents))}
                    </dd>
                  </div>
                )}
              </div>
            </dl>

            <p className="text-muted mt-3 text-xs leading-relaxed">
              O valor retido é liberado após a conclusão confirmada e o período de
              segurança sem contestação.
            </p>

            <ButtonLink href="/pro/financeiro" fullWidth className="mt-4">
              Solicitar repasse
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  icone,
  rotulo,
  valor,
}: {
  icone: string;
  rotulo: string;
  valor: string;
}) {
  return (
    <Card className="min-w-0 p-5">
      <IconBox name={icone} size={42} />
      <dd className="num mt-3.5 text-[1.75rem] leading-none font-extrabold">{valor}</dd>
      <dt className="text-muted mt-1.5 text-[0.8125rem]">{rotulo}</dt>
    </Card>
  );
}
