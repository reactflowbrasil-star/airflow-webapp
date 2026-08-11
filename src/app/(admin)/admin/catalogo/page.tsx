import type { Metadata } from "next";

import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { Badge, EmptyState } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Catálogo" };

/**
 * Categorias e cidades.
 *
 * Desativar não apaga: solicitações antigas continuam apontando para a
 * categoria, e histórico não se reescreve. Uma categoria inativa some da
 * busca e do catálogo público, e nada mais.
 */
export default async function AdminCatalogoPage() {
  const [categorias, cidades] = await Promise.all([
    prisma.serviceCategory.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { serviceRequests: true, providerServices: true } } },
    }),
    prisma.city.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { providers: true, addresses: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        eyebrow="Plataforma"
        titulo="Catálogo"
        descricao="Categorias de serviço e cidades atendidas. Desativar remove das buscas sem apagar o histórico."
      />

      <section>
        <h2 className="mb-3 text-lg font-bold tracking-[-0.02em]">
          Categorias{" "}
          <span className="text-muted num text-sm">({categorias.length})</span>
        </h2>
        <AdminTable
          colunas={["Nome", "Slug", "Preço de referência", "Solicitações", "Técnicos", "Status", "Ações"]}
          vazio={
            categorias.length === 0 ? (
              <EmptyState title="Nenhuma categoria" description="Rode o seed do catálogo." />
            ) : undefined
          }
        >
          {categorias.map((c) => (
            <Linha key={c.id}>
              <Celula className="font-medium">{c.name}</Celula>
              <Celula className="text-muted num text-xs">{c.slug}</Celula>
              <Celula numerica>
                {c.basePriceCents ? formatBRL(money(c.basePriceCents)) : "—"}
              </Celula>
              <Celula numerica>{c._count.serviceRequests}</Celula>
              <Celula numerica>{c._count.providerServices}</Celula>
              <Celula>
                <Badge tone={c.active ? "success" : "neutral"}>
                  {c.active ? "Ativa" : "Inativa"}
                </Badge>
              </Celula>
              <Celula>
                <AdminAction
                  endpoint={`/api/admin/catalogo/categorias/${c.id}`}
                  metodo="PATCH"
                  payload={{ ativa: !c.active }}
                  rotulo={c.active ? "Desativar" : "Ativar"}
                  variante={c.active ? "danger" : "primary"}
                  exigeMotivo={false}
                />
              </Celula>
            </Linha>
          ))}
        </AdminTable>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold tracking-[-0.02em]">
          Cidades <span className="text-muted num text-sm">({cidades.length})</span>
        </h2>
        <AdminTable
          colunas={["Cidade", "UF", "Técnicos", "Endereços", "Status", "Ações"]}
          vazio={
            cidades.length === 0 ? (
              <EmptyState title="Nenhuma cidade" description="Rode o seed do catálogo." />
            ) : undefined
          }
        >
          {cidades.map((c) => (
            <Linha key={c.id}>
              <Celula className="font-medium">{c.name}</Celula>
              <Celula>{c.state}</Celula>
              <Celula numerica>{c._count.providers}</Celula>
              <Celula numerica>{c._count.addresses}</Celula>
              <Celula>
                <Badge tone={c.active ? "success" : "neutral"}>
                  {c.active ? "Ativa" : "Inativa"}
                </Badge>
              </Celula>
              <Celula>
                <AdminAction
                  endpoint={`/api/admin/catalogo/cidades/${c.id}`}
                  metodo="PATCH"
                  payload={{ ativa: !c.active }}
                  rotulo={c.active ? "Desativar" : "Ativar"}
                  variante={c.active ? "danger" : "primary"}
                  exigeMotivo={false}
                />
              </Celula>
            </Linha>
          ))}
        </AdminTable>
      </section>
    </div>
  );
}
