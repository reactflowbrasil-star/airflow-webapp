import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, EmptyState } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";
import { NovaRegraForm } from "@/ui/commission-rule-form";

export const metadata: Metadata = { title: "Comissões" };

const ESCOPO: Record<string, string> = {
  PROVIDER: "Profissional",
  PROMOTIONAL: "Promocional",
  CAMPAIGN: "Campanha",
  CITY: "Cidade",
  CATEGORY: "Categoria",
  PLAN: "Plano",
  GLOBAL: "Global",
};

/**
 * Regras de comissão (§19, §20).
 *
 * Nada é editado no lugar: snapshots já congelados apontam para a regra que
 * valia no aceite e precisam continuar legíveis. Mudar a comissão é criar uma
 * versão nova e desativar a anterior — é o que os botões fazem.
 */
export default async function AdminComissoesPage() {
  const [regras, cidades, categorias] = await Promise.all([
    prisma.commissionRule.findMany({
      orderBy: [{ active: "desc" }, { priority: "desc" }, { validFrom: "desc" }],
      take: 60,
    }),
    prisma.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ativas = regras.filter((r) => r.active);
  const temGlobal = ativas.some((r) => r.scope === "GLOBAL");

  return (
    <div>
      <AdminHeader
        eyebrow="Financeiro"
        titulo="Regras de comissão"
        descricao="A regra vigente é resolvida no momento do aceite e congelada na ordem. Alterar comissão é criar versão nova — o histórico não muda."
      />

      {!temGlobal && (
        <Card className="border-danger-500 mb-5 border-2 p-5">
          <p className="text-danger-700 font-bold">
            Nenhuma regra GLOBAL ativa
          </p>
          <p className="text-secondary mt-1 text-sm">
            Sem ela, nenhuma proposta pode ser aceita: o sistema recusa fechar
            uma ordem sem regra aplicável. Crie uma abaixo.
          </p>
        </Card>
      )}

      <Card className="mb-6 p-5">
        <h2 className="mb-3.5 font-bold tracking-[-0.02em]">Nova regra</h2>
        <NovaRegraForm
          cidades={cidades.map((c) => ({ id: c.id, nome: `${c.name}/${c.state}` }))}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.name }))}
        />
      </Card>

      <AdminTable
        colunas={["Nome", "Escopo", "Percentual", "Fixo", "Mín/Máx", "Versão", "Vigência", "Ações"]}
        vazio={
          regras.length === 0 ? (
            <EmptyState
              title="Nenhuma regra cadastrada"
              description="Crie ao menos a regra global para permitir o aceite de propostas."
            />
          ) : undefined
        }
      >
        {regras.map((r) => (
          <Linha key={r.id}>
            <Celula>
              <span className="font-medium">{r.name}</span>
            </Celula>
            <Celula>
              <Badge tone={r.scope === "GLOBAL" ? "brand" : "neutral"}>
                {ESCOPO[r.scope] ?? r.scope}
              </Badge>
            </Celula>
            <Celula numerica className="font-semibold">
              {(r.percentBps / 100).toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}
              %
            </Celula>
            <Celula numerica>
              {r.fixedFeeCents > 0 ? formatBRL(money(r.fixedFeeCents)) : "—"}
            </Celula>
            <Celula numerica className="text-muted text-xs">
              {r.minCommissionCents ? formatBRL(money(r.minCommissionCents)) : "—"} /{" "}
              {r.maxCommissionCents ? formatBRL(money(r.maxCommissionCents)) : "—"}
            </Celula>
            <Celula numerica>v{r.version}</Celula>
            <Celula className="text-muted text-xs">
              {r.active ? (
                <Badge tone="success">ativa</Badge>
              ) : (
                <Badge tone="neutral">inativa</Badge>
              )}
              <span className="num mt-1 block">
                desde {r.validFrom.toLocaleDateString("pt-BR")}
              </span>
            </Celula>
            <Celula>
              {r.active && (
                <AdminAction
                  endpoint={`/api/admin/comissoes/${r.id}`}
                  metodo="DELETE"
                  rotulo="Desativar"
                  variante="danger"
                  exigeMotivo={false}
                  confirmacao="Ordens já fechadas mantêm o snapshot desta regra. Só afeta aceites futuros."
                />
              )}
            </Celula>
          </Linha>
        ))}
      </AdminTable>
    </div>
  );
}
