import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, Card } from "@/ui";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const session = await requireCustomer();

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    include: {
      addresses: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Meu perfil</h1>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Dados da conta</h2>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          <Campo rotulo="Nome">{usuario.name}</Campo>
          <Campo rotulo="E-mail">{usuario.email}</Campo>
          {usuario.phone && <Campo rotulo="Telefone">{usuario.phone}</Campo>}
          <Campo rotulo="Cliente desde">
            {usuario.createdAt.toLocaleDateString("pt-BR")}
          </Campo>
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Endereços</h2>
        {usuario.addresses.length === 0 ? (
          <p className="text-muted mt-2 text-sm">
            Você ainda não cadastrou endereços. O primeiro é criado ao solicitar um
            serviço.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {usuario.addresses.map((endereco) => (
              <li
                key={endereco.id}
                className="bg-[var(--surface-muted)] flex items-start justify-between gap-3 rounded-(--radius-field) p-3 text-sm"
              >
                <span>
                  <span className="font-medium">{endereco.label}</span>
                  <br />
                  <span className="text-secondary">
                    {endereco.street}, {endereco.number}
                    {endereco.complement ? ` — ${endereco.complement}` : ""}
                    <br />
                    {endereco.neighborhood}, {endereco.cityName}/{endereco.state}
                  </span>
                </span>
                {endereco.isDefault && <Badge tone="brand">Padrão</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* LGPD (§58) */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Privacidade</h2>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          <Campo rotulo="Termos aceitos em">
            {usuario.termsAcceptedAt
              ? `${usuario.termsAcceptedAt.toLocaleDateString("pt-BR")} (versão ${usuario.termsVersion})`
              : "Não registrado"}
          </Campo>
          <Campo rotulo="Comunicações de marketing">
            {usuario.marketingConsent ? "Autorizadas" : "Não autorizadas"}
          </Campo>
        </dl>
        <p className="text-muted mt-3 text-xs leading-relaxed">
          Você pode solicitar a exportação ou a exclusão dos seus dados a qualquer
          momento pelo suporte. Registros financeiros são preservados pelo prazo
          exigido por lei.
        </p>
      </Card>
    </div>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-secondary">{rotulo}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
