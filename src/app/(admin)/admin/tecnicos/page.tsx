import type { Metadata } from "next";

import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState, Rating } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Aprovar técnicos" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "success" | "warning" | "danger" }> = {
  INCOMPLETO: { rotulo: "Cadastro incompleto", tom: "neutral" },
  AGUARDANDO_ANALISE: { rotulo: "Aguardando análise", tom: "warning" },
  APROVADO: { rotulo: "Aprovado", tom: "success" },
  REJEITADO: { rotulo: "Rejeitado", tom: "danger" },
  SUSPENSO: { rotulo: "Suspenso", tom: "warning" },
  BLOQUEADO: { rotulo: "Bloqueado", tom: "danger" },
};

const TIPO_DOC: Record<string, string> = {
  RG: "RG",
  CNH: "CNH",
  CPF: "CPF",
  CNPJ: "CNPJ",
  COMPROVANTE_ENDERECO: "Comprovante de endereço",
  CERTIFICADO_TECNICO: "Certificado técnico",
  SELFIE: "Selfie",
  OUTRO: "Outro",
};

interface Props {
  searchParams: Promise<{ status?: string }>;
}

/**
 * Fila de análise de cadastro (§8).
 *
 * A aprovação é o que libera o profissional a receber solicitações e, depois,
 * dinheiro — por isso a tela mostra documentos e dados fiscais lado a lado com
 * a decisão, em vez de só um botão.
 */
export default async function AdminTecnicosPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const filtro = status ?? "AGUARDANDO_ANALISE";

  const prestadores = await prisma.providerProfile.findMany({
    where: filtro === "TODOS" ? { deletedAt: null } : { status: filtro as never, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      user: { select: { name: true, email: true, phone: true, phoneVerifiedAt: true } },
      city: { select: { name: true, state: true } },
      documents: { select: { id: true, type: true, status: true, fileName: true, fileUrl: true } },
      verification: { select: { reviewedAt: true, rejectionReason: true } },
      _count: { select: { services: true, portfolio: true } },
    },
  });

  const contagens = await prisma.providerProfile.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: true,
  });
  const porStatus = Object.fromEntries(contagens.map((c) => [c.status, c._count]));

  return (
    <div>
      <AdminHeader
        eyebrow="Operação"
        titulo="Aprovar técnicos"
        descricao="Analise documentos e dados fiscais antes de liberar o profissional a receber solicitações e repasses."
      />

      <nav aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-2">
        {[
          ["AGUARDANDO_ANALISE", "Aguardando análise"],
          ["APROVADO", "Aprovados"],
          ["REJEITADO", "Rejeitados"],
          ["SUSPENSO", "Suspensos"],
          ["TODOS", "Todos"],
        ].map(([valor, rotulo]) => (
          <a
            key={valor}
            href={`/admin/tecnicos?status=${valor}`}
            aria-current={filtro === valor ? "true" : undefined}
            className={`rounded-(--radius-pill) border px-3.5 py-1.5 text-[0.8125rem] transition-colors ${
              filtro === valor
                ? "accent-soft border-[var(--accent)] font-semibold text-[var(--accent-text)]"
                : "surface-card text-secondary hover:border-[var(--accent-border)]"
            }`}
          >
            {rotulo}
            {porStatus[valor] !== undefined && (
              <span className="num text-muted ml-1.5">{porStatus[valor]}</span>
            )}
          </a>
        ))}
      </nav>

      {prestadores.length === 0 ? (
        <Card>
          <EmptyState
            title="Nada nesta fila"
            description="Nenhum cadastro com este status no momento."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {prestadores.map((p) => {
            const meta = STATUS[p.status] ?? { rotulo: p.status, tom: "neutral" as const };
            const podeDecidir = p.status === "AGUARDANDO_ANALISE";
            const docsAprovados = p.documents.filter((d) => d.status === "APROVADO").length;

            return (
              <li key={p.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="font-bold tracking-[-0.02em]">{p.displayName}</h2>
                        <Badge tone={meta.tom}>{meta.rotulo}</Badge>
                        {p.user.phoneVerifiedAt ? (
                          <Badge tone="success">Telefone verificado</Badge>
                        ) : (
                          <Badge tone="warning">Telefone não verificado</Badge>
                        )}
                      </div>
                      <p className="text-secondary mt-1 text-sm">
                        {p.user.name} · {p.user.email}
                      </p>
                      <p className="text-muted mt-0.5 text-xs">
                        {p.personType === "PJ"
                          ? `CNPJ ${p.cnpj ?? "não informado"}`
                          : `CPF ${p.cpf ?? "não informado"}`}
                        {p.city && ` · ${p.city.name}/${p.city.state}`}
                        {p.neighborhood && ` · ${p.neighborhood}`}
                      </p>
                    </div>

                    {p.ratingCount > 0 && (
                      <Rating value={p.ratingAverage} count={p.ratingCount} />
                    )}
                  </div>

                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    <Dado rotulo="Etapa do onboarding" valor={`${p.onboardingStep}/11`} />
                    <Dado
                      rotulo="Documentos"
                      valor={`${docsAprovados}/${p.documents.length} aprovados`}
                    />
                    <Dado rotulo="Serviços" valor={String(p._count.services)} />
                    <Dado rotulo="Portfólio" valor={String(p._count.portfolio)} />
                    <Dado
                      rotulo="Experiência"
                      valor={p.yearsOfExperience ? `${p.yearsOfExperience} anos` : "—"}
                    />
                  </dl>

                  {p.documents.length > 0 && (
                    <ul className="mt-3.5 flex flex-wrap gap-2">
                      {p.documents.map((d) => (
                        <li key={d.id}>
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" title={d.fileName}>
                            <Badge
                              tone={
                                d.status === "APROVADO"
                                  ? "success"
                                  : d.status === "REJEITADO"
                                    ? "danger"
                                    : "neutral"
                              }
                            >
                              {TIPO_DOC[d.type] ?? d.type}
                            </Badge>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {p.verification?.rejectionReason && (
                    <p className="text-secondary mt-3 text-sm">
                      <span className="font-semibold">Motivo registrado:</span>{" "}
                      {p.verification.rejectionReason}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-start gap-2">
                    {podeDecidir && (
                      <>
                        <AdminAction
                          endpoint={`/api/admin/tecnicos/${p.id}`}
                          payload={{ decisao: "APROVADO" }}
                          rotulo="Aprovar"
                          icone="check-circle"
                          variante="primary"
                        />
                        <AdminAction
                          endpoint={`/api/admin/tecnicos/${p.id}`}
                          payload={{ decisao: "REJEITADO" }}
                          rotulo="Rejeitar"
                          icone="x-circle"
                          variante="danger"
                          confirmacao="O profissional recebe o motivo e precisa corrigir o cadastro para tentar de novo."
                        />
                      </>
                    )}
                    {p.status === "APROVADO" && (
                      <AdminAction
                        endpoint={`/api/admin/tecnicos/${p.id}`}
                        payload={{ novoStatus: "SUSPENSO" }}
                        rotulo="Suspender"
                        icone="pause-circle"
                        variante="danger"
                        confirmacao="O profissional deixa de aparecer nas buscas e de receber solicitações. Serviços em andamento não são cancelados."
                      />
                    )}
                    {p.status === "SUSPENSO" && (
                      <AdminAction
                        endpoint={`/api/admin/tecnicos/${p.id}`}
                        payload={{ novoStatus: "APROVADO" }}
                        rotulo="Reativar"
                        icone="play-circle"
                        variante="primary"
                      />
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="eyebrow">{rotulo}</dt>
      <dd className="num mt-0.5 font-semibold">{valor}</dd>
    </div>
  );
}
