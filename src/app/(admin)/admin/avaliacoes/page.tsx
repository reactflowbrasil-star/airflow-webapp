import type { Metadata } from "next";

import { prisma } from "@/server/db/prisma";
import { Card, EmptyState, Rating } from "@/ui";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Avaliações" };

/**
 * Avaliações publicadas.
 *
 * Só quem contratou pelo AirFlow avalia — a nota vem sempre atrelada a uma
 * ordem concluída, o que é o que impede avaliação comprada.
 */
export default async function AdminAvaliacoesPage() {
  const [avaliacoes, media] = await Promise.all([
    prisma.review.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { include: { user: { select: { name: true } } } },
        provider: { select: { displayName: true } },
        order: { select: { reference: true } },
      },
    }),
    prisma.review.aggregate({ where: { deletedAt: null }, _avg: { rating: true }, _count: true }),
  ]);

  return (
    <div>
      <AdminHeader
        eyebrow="Operação"
        titulo="Avaliações"
        descricao="Notas dadas por clientes após a conclusão. Cada uma está ligada a uma ordem — não existe avaliação sem serviço contratado."
      />

      {media._count > 0 && (
        <Card className="accent-soft mb-5 flex flex-wrap items-center gap-6 border p-5">
          <div>
            <p className="eyebrow">Nota média</p>
            <div className="mt-1.5">
              <Rating value={media._avg.rating ?? 0} count={media._count} />
            </div>
          </div>
        </Card>
      )}

      <AdminTable
        colunas={["Técnico", "Cliente", "Nota", "Comentário", "Pedido", "Data"]}
        vazio={
          avaliacoes.length === 0 ? (
            <EmptyState
              title="Nenhuma avaliação"
              description="Nenhum serviço foi avaliado até agora."
            />
          ) : undefined
        }
      >
        {avaliacoes.map((a) => (
          <Linha key={a.id}>
            <Celula className="font-medium">{a.provider.displayName}</Celula>
            <Celula className="text-secondary">{a.customer.user.name}</Celula>
            <Celula>
              <Rating value={a.rating} />
            </Celula>
            <Celula className="text-secondary max-w-md text-sm">
              {a.comment ?? <span className="text-muted">sem comentário</span>}
            </Celula>
            <Celula className="num text-muted text-xs">{a.order?.reference ?? "—"}</Celula>
            <Celula numerica className="text-muted text-xs">
              {a.createdAt.toLocaleDateString("pt-BR")}
            </Celula>
          </Linha>
        ))}
      </AdminTable>
    </div>
  );
}
