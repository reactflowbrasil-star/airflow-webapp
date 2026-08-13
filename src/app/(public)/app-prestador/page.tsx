import type { Metadata } from "next";

import { Card, Icon, IconBox } from "@/ui";
import { PageHero } from "@/ui/page-hero";
import { ProviderAppInstall } from "@/ui/provider-app-install";

export const metadata: Metadata = {
  title: "App do prestador",
  description:
    "Baixe o AirFlow Pro, o app instalável para técnicos receberem alertas de serviços próximos, negociar pedidos e acompanhar agenda e financeiro.",
  alternates: { canonical: "/app-prestador" },
};

const recursos = [
  {
    icon: "bell-ringing",
    title: "Alerta sonoro de pedido",
    description:
      "Receba pedidos próximos em tela cheia no painel e entre na negociação antes da concorrência.",
  },
  {
    icon: "chats-circle",
    title: "Negociação protegida",
    description:
      "Aceite, negocie ou dispense sem expor WhatsApp pessoal nem dados de contato.",
  },
  {
    icon: "receipt",
    title: "Agenda e financeiro",
    description:
      "Acompanhe serviços autorizados, conclusão, saldo e repasses em uma área só.",
  },
] as const;

export default function AppPrestadorPage() {
  return (
    <main id="conteudo" className="flex-1">
      <section className="px-5 pt-10">
        <div className="mx-auto max-w-6xl">
          <PageHero
            eyebrow="AirFlow Pro"
            titulo="O app exclusivo do prestador de"
            destaque="ar-condicionado"
            subtitulo="Instale no celular para receber alertas de serviços próximos, abrir negociações rapidamente e gerenciar sua operação direto do painel profissional."
            lado={
              <div className="surface-card relative mx-auto w-full max-w-[430px] rounded-[44px] p-4 shadow-(--shadow-float)">
                <div className="rounded-[34px] bg-[var(--bg)] p-4">
                  <div className="surface-glass rounded-[26px] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="eyebrow">Alerta em tempo real</p>
                        <h2 className="mt-1 font-extrabold">Pedido próximo</h2>
                      </div>
                      <span className="grid h-11 w-11 animate-pulse place-items-center rounded-full bg-[var(--accent-soft)] text-2xl text-[var(--accent-text)]">
                        <Icon name="bell-ringing" />
                      </span>
                    </div>
                    <div className="mt-5 rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
                      <p className="text-sm font-semibold">Limpeza de ar-condicionado</p>
                      <p className="text-muted mt-1 text-xs">Centro · 2,4 km aprox.</p>
                      <p className="num mt-3 text-3xl font-extrabold text-[var(--accent-text)]">
                        R$ 280,00
                      </p>
                      <div className="bg-grad mt-4 rounded-full px-4 py-3 text-center text-sm font-bold text-white">
                        Aceitar para negociar
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div className="max-w-sm">
              <ProviderAppInstall />
            </div>
            <p className="text-muted mt-4 text-sm">
              Funciona como PWA: não precisa de loja de aplicativos. No Android,
              use o botão acima; no iPhone, adicione à Tela de Início pelo menu
              de compartilhamento.
            </p>
          </PageHero>
        </div>
      </section>

      <section className="px-5 pb-16">
        <div className="mx-auto grid max-w-6xl gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {recursos.map((recurso) => (
            <Card key={recurso.title}>
              <IconBox name={recurso.icon} />
              <h2 className="mt-4 text-lg font-bold tracking-[-0.02em]">
                {recurso.title}
              </h2>
              <p className="text-secondary mt-2 text-sm leading-relaxed">
                {recurso.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
