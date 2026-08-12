import type { Metadata } from "next";

import type { $Enums } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireAdmin } from "@/server/auth/rbac";
import { Badge, EmptyState, Input } from "@/ui";
import { AdminAction } from "@/ui/admin-action";
import { AdminHeader, AdminTable, Celula, Linha } from "@/ui/admin-table";

export const metadata: Metadata = { title: "Usuários" };

const STATUS: Record<string, { rotulo: string; tom: "neutral" | "success" | "warning" | "danger" }> = {
  PENDING_VERIFICATION: { rotulo: "Pendente", tom: "warning" },
  ACTIVE: { rotulo: "Ativa", tom: "success" },
  SUSPENDED: { rotulo: "Suspensa", tom: "warning" },
  BLOCKED: { rotulo: "Bloqueada", tom: "danger" },
};

const PAPEL: Record<string, string> = {
  CUSTOMER: "Cliente",
  PROVIDER: "Técnico",
  ADMIN: "Admin",
};

interface Props {
  searchParams: Promise<{ q?: string; papel?: string }>;
}

export default async function AdminUsuariosPage({ searchParams }: Props) {
  const session = await requireAdmin();
  const { q, papel } = await searchParams;
  const busca = q?.trim();

  const usuarios = await prisma.user.findMany({
    where: {
      ...(papel && Object.keys(PAPEL).includes(papel)
        ? { role: papel as $Enums.UserRole }
        : {}),
      ...(busca
        ? {
            OR: [
              { name: { contains: busca, mode: "insensitive" as const } },
              { email: { contains: busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phoneVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return (
    <div>
      <AdminHeader
        eyebrow="Operação"
        titulo="Usuários"
        descricao="Contas da plataforma. Suspender bloqueia o acesso imediatamente; serviços em andamento não são cancelados por aqui."
      />

      <form className="mb-5 flex flex-wrap gap-3" action="/admin/usuarios">
        <label htmlFor="q" className="sr-only">
          Buscar por nome ou e-mail
        </label>
        <Input
          id="q"
          name="q"
          defaultValue={busca}
          placeholder="Buscar por nome ou e-mail"
          className="max-w-xs"
        />
        <label htmlFor="papel" className="sr-only">
          Papel
        </label>
        <select
          id="papel"
          name="papel"
          defaultValue={papel ?? "TODOS"}
          className="surface-card h-12 rounded-(--radius-field) px-4 text-[0.9375rem] outline-none"
        >
          <option value="TODOS">Todos os papéis</option>
          <option value="CUSTOMER">Clientes</option>
          <option value="PROVIDER">Técnicos</option>
          <option value="ADMIN">Admins</option>
        </select>
        <button
          type="submit"
          className="bg-grad h-12 rounded-(--radius-pill) px-6 text-[0.9375rem] font-semibold text-white"
        >
          Buscar
        </button>
      </form>

      <AdminTable
        colunas={["Nome", "E-mail", "Papel", "Status", "Cadastro", "Último acesso", "Ações"]}
        vazio={
          usuarios.length === 0 ? (
            <EmptyState
              title="Nenhum usuário encontrado"
              description="Ajuste a busca ou o filtro de papel."
            />
          ) : undefined
        }
      >
        {usuarios.map((u) => {
          const meta = STATUS[u.status] ?? { rotulo: u.status, tom: "neutral" as const };
          // Um admin não age sobre a própria conta: seria a forma mais fácil de
          // deixar a plataforma sem operador.
          const euMesmo = u.id === session.userId;

          return (
            <Linha key={u.id}>
              <Celula>
                <span className="font-medium">{u.name}</span>
                {!u.phoneVerifiedAt && (
                  <span className="text-muted ml-2 text-xs">sem telefone verificado</span>
                )}
              </Celula>
              <Celula className="text-secondary">{u.email}</Celula>
              <Celula>{PAPEL[u.role] ?? u.role}</Celula>
              <Celula>
                <Badge tone={meta.tom}>{meta.rotulo}</Badge>
              </Celula>
              <Celula numerica className="text-muted text-xs">
                {u.createdAt.toLocaleDateString("pt-BR")}
              </Celula>
              <Celula numerica className="text-muted text-xs">
                {u.lastLoginAt?.toLocaleDateString("pt-BR") ?? "—"}
              </Celula>
              <Celula>
                {euMesmo ? (
                  <span className="text-muted text-xs">sua conta</span>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    {u.status === "ACTIVE" || u.status === "PENDING_VERIFICATION" ? (
                      <AdminAction
                        endpoint={`/api/admin/usuarios/${u.id}`}
                        payload={{ novoStatus: "SUSPENDED" }}
                        rotulo="Suspender"
                        variante="danger"
                        confirmacao="A pessoa perde o acesso no próximo login e não consegue mais operar."
                      />
                    ) : (
                      <AdminAction
                        endpoint={`/api/admin/usuarios/${u.id}`}
                        payload={{ novoStatus: "ACTIVE" }}
                        rotulo="Reativar"
                        variante="primary"
                      />
                    )}
                  </div>
                )}
              </Celula>
            </Linha>
          );
        })}
      </AdminTable>

      <p className="text-muted mt-3 text-xs">
        Mostrando até 100 registros mais recentes.
        {usuarios.length === 100 && " Refine a busca para ver outros."}
      </p>
    </div>
  );
}
