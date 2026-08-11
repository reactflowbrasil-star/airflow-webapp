import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { ButtonLink, Card, EmptyState } from "@/ui";

export const metadata: Metadata = { title: "Mensagens" };

export default async function MensagensPage() {
  const session = await requireCustomer();

  const conversas = await prisma.conversation.findMany({
    where: { customerId: session.customerProfileId, archived: false },
    orderBy: { lastMessageAt: "desc" },
    include: {
      provider: { select: { displayName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Mensagens</h1>

      {conversas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma conversa ainda"
            description="Ao solicitar um serviço, você conversa com o técnico direto por aqui — propostas, agendamento e andamento ficam no mesmo lugar."
            action={<ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversas.map((conversa) => (
            <li key={conversa.id}>
              <Card className="p-4">
                <p className="font-medium">{conversa.provider.displayName}</p>
                {conversa.messages[0] && (
                  <p className="text-secondary mt-1 line-clamp-1 text-sm">
                    {conversa.messages[0].content}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
