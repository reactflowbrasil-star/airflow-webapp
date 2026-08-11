import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { carregarConversa, marcarComoLidas } from "@/server/services/message-service";
import { ButtonLink, Card, EmptyState } from "@/ui";
import { Chat, type ConversaItem, type MensagemItem, type TipoMensagem } from "@/ui/chat";

export const metadata: Metadata = { title: "Mensagens" };

interface Props {
  searchParams: Promise<{ c?: string }>;
}

/** Prévia da lista: o texto cru truncado, sem quebra de linha. */
function previa(conteudo: string | null, tipo: string): string {
  if (!conteudo) return tipo === "IMAGE" ? "Imagem" : "Anexo";
  return conteudo.replace(/\s+/g, " ").slice(0, 90);
}

export default async function MensagensPage({ searchParams }: Props) {
  const session = await requireCustomer();
  const { c } = await searchParams;

  const conversas = await prisma.conversation.findMany({
    where: { customerId: session.customerProfileId, archived: false },
    orderBy: { lastMessageAt: "desc" },
    include: {
      provider: { select: { displayName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { readAt: null, NOT: { senderId: session.userId } } },
        },
      },
    },
  });

  // Sem `?c=`, abre a mais recente: chegar em "Mensagens" e ver a lista morta
  // ao lado de um painel vazio não ajuda ninguém.
  const selecionada = c
    ? conversas.find((conversa) => conversa.id === c)
    : conversas[0];

  let mensagens: MensagemItem[] = [];
  if (selecionada) {
    // A leitura é do próprio recurso: `selecionada` saiu de uma consulta já
    // filtrada pelo customerId da sessão, então um id alheio simplesmente não
    // aparece aqui — não há como abrir a conversa de outro cliente.
    const fio = await carregarConversa(selecionada.id, {
      userId: session.userId,
      papel: "CLIENTE",
    });
    mensagens = fio.map((mensagem) => ({
      ...mensagem,
      tipo: mensagem.tipo as TipoMensagem,
    }));

    await marcarComoLidas(selecionada.id, session.userId);
  }

  const lista: ConversaItem[] = conversas.map((conversa) => ({
    id: conversa.id,
    nome: conversa.provider.displayName,
    previa: conversa.messages[0]
      ? previa(conversa.messages[0].content, conversa.messages[0].type)
      : "Conversa iniciada",
    quando: conversa.lastMessageAt?.toISOString() ?? null,
    naoLidas: conversa.id === selecionada?.id ? 0 : conversa._count.messages,
    requestId: conversa.requestId,
  }));

  if (conversas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Comunicação</p>
          <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            Mensagens
          </h1>
        </div>
        <Card>
          <EmptyState
            icon={undefined}
            title="Nenhuma conversa ainda"
            description="Ao solicitar um serviço, você conversa com o técnico direto por aqui — propostas, pagamento, agendamento e andamento ficam no mesmo lugar."
            action={<ButtonLink href="/app/solicitar">Solicitar serviço</ButtonLink>}
          />
        </Card>
      </div>
    );
  }

  return (
    <Chat
      conversas={lista}
      ativa={selecionada?.id ?? null}
      mensagens={mensagens}
      tituloAtivo={selecionada?.provider.displayName ?? null}
      rotas={{
        lista: "/app/mensagens",
        proposta: selecionada?.requestId
          ? `/app/solicitacoes/${selecionada.requestId}`
          : null,
      }}
    />
  );
}
