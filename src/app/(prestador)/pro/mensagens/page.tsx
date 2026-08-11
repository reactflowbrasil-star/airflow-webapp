import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { carregarConversa, marcarComoLidas } from "@/server/services/message-service";
import { Card, EmptyState } from "@/ui";
import { Chat, type ConversaItem, type MensagemItem, type TipoMensagem } from "@/ui/chat";

export const metadata: Metadata = { title: "Mensagens" };

interface Props {
  searchParams: Promise<{ c?: string }>;
}

function previa(conteudo: string | null, tipo: string): string {
  if (!conteudo) return tipo === "IMAGE" ? "Imagem" : "Anexo";
  return conteudo.replace(/\s+/g, " ").slice(0, 90);
}

export default async function MensagensPrestadorPage({ searchParams }: Props) {
  const session = await requireProvider();
  const { c } = await searchParams;

  const conversas = await prisma.conversation.findMany({
    where: { providerId: session.providerProfileId, archived: false },
    orderBy: { lastMessageAt: "desc" },
    include: {
      customer: { include: { user: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { readAt: null, NOT: { senderId: session.userId } } },
        },
      },
    },
  });

  const selecionada = c
    ? conversas.find((conversa) => conversa.id === c)
    : conversas[0];

  let mensagens: MensagemItem[] = [];
  if (selecionada) {
    const fio = await carregarConversa(selecionada.id, {
      userId: session.userId,
      papel: "PRESTADOR",
    });
    mensagens = fio.map((mensagem) => ({
      ...mensagem,
      tipo: mensagem.tipo as TipoMensagem,
    }));

    await marcarComoLidas(selecionada.id, session.userId);
  }

  const lista: ConversaItem[] = conversas.map((conversa) => ({
    id: conversa.id,
    nome: conversa.customer.user.name,
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
            title="Nenhuma conversa ainda"
            description="Cada solicitação em que você propõe um valor abre uma conversa aqui, com o histórico da negociação, do pagamento e do atendimento."
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
      tituloAtivo={selecionada?.customer.user.name ?? null}
      // O prestador não tem tela de detalhe da solicitação: a negociação dele
      // acontece no card de lead, em /pro/solicitacoes.
      rotas={{ lista: "/pro/mensagens", proposta: null }}
    />
  );
}
