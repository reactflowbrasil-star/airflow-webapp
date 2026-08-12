import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Avatar, Badge, Card, Icon } from "@/ui";

export const metadata: Metadata = {
  title: "Meu perfil",
  description: "Seus dados, endereços e preferências na AirFlow.",
};

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
    <div className="flex max-w-[720px] flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Conta</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Meu perfil
        </h1>
      </div>

      <Card className="accent-soft flex items-center gap-4 border p-6">
        <Avatar name={usuario.name} size={64} />
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-[-0.03em]">{usuario.name}</p>
          <p className="text-muted mt-0.5 text-[0.8125rem]">
            Cliente desde {usuario.createdAt.toLocaleDateString("pt-BR")}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="user-circle" className="text-[var(--accent-text)] text-lg" />
          Dados da conta
        </h2>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          <Campo rotulo="Nome">{usuario.name}</Campo>
          <Campo rotulo="E-mail">{usuario.email}</Campo>
          {usuario.phone && <Campo rotulo="Telefone">{usuario.phone}</Campo>}
          <Campo rotulo="Cliente desde">
            {usuario.createdAt.toLocaleDateString("pt-BR")}
          </Campo>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="map-pin" className="text-[var(--accent-text)] text-lg" />
          Endereços
        </h2>
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
                className="surface-muted flex items-start justify-between gap-3 rounded-[14px] p-3.5 text-sm"
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
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="lock-key" className="text-[var(--accent-text)] text-lg" />
          Privacidade
        </h2>
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
