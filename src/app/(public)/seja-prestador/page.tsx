import type { Metadata } from "next";

import { calculateCommission } from "@/domain/financial/commission";
import { formatBRL, money } from "@/domain/shared/money";
import { prisma } from "@/server/db/prisma";
import { ButtonLink, Card, Icon, IconBox } from "@/ui";

export const metadata: Metadata = {
  title: "Seja um técnico parceiro",
  description:
    "Receba solicitações de clientes da sua região, negocie o valor e receba com garantia. Sem mensalidade: a AirFlow só ganha quando você ganha.",
  alternates: { canonical: "/seja-prestador" },
};

const VANTAGENS = [
  {
    icone: "tray-arrow-down",
    titulo: "Clientes que já querem contratar",
    texto:
      "Quem chega até você já descreveu o problema, informou o endereço e propôs um valor. Você responde aceitando ou fazendo a sua contraproposta.",
  },
  {
    icone: "shield-check",
    titulo: "Pagamento garantido antes de você ir",
    texto:
      "O cliente paga antes do atendimento e o valor fica retido na plataforma. Você só se desloca depois que o dinheiro entrou.",
  },
  {
    icone: "percent",
    titulo: "Sem mensalidade",
    texto:
      "Não há taxa fixa nem plano. A comissão sai de cada serviço concluído, e o valor exato aparece no pedido antes de você aceitar.",
  },
  {
    icone: "chats-circle",
    titulo: "Tudo num canal só",
    texto:
      "Negociação, agendamento, andamento e comprovantes ficam no chat do pedido — é o histórico que protege você numa contestação.",
  },
];

const ETAPAS = [
  {
    titulo: "Crie sua conta",
    texto: "Dados básicos, área de atendimento e as especialidades que você atende.",
  },
  {
    titulo: "Envie seus documentos",
    texto:
      "Identidade, comprovante de endereço e certificados técnicos. A análise é feita por uma pessoa do time.",
  },
  {
    titulo: "Monte seu perfil",
    texto:
      "Fotos de trabalhos anteriores, preços de referência por serviço e sua janela de disponibilidade.",
  },
  {
    titulo: "Comece a receber",
    texto:
      "Perfil aprovado, você passa a aparecer nas buscas e a receber solicitações compatíveis.",
  },
];

/** Valor do exemplo. Só o bruto é escolhido aqui — o resto sai da regra. */
const EXEMPLO_BRUTO_CENTS = 28_000;

export const revalidate = 3600;

/**
 * O exemplo de repasse sai da regra de comissão vigente, não de um número
 * escrito à mão: se um admin mudar a comissão global, esta página passaria a
 * prometer um valor que o produto não entrega (§19, §20).
 */
async function exemploDeRepasse() {
  const regra = await prisma.commissionRule.findFirst({
    where: { scope: "GLOBAL", active: true },
    orderBy: [{ priority: "desc" }, { validFrom: "desc" }],
  });
  if (!regra) return null;

  const resultado = calculateCommission(
    { ...regra, scope: "GLOBAL" as const },
    money(EXEMPLO_BRUTO_CENTS),
  );
  return {
    bruto: formatBRL(money(EXEMPLO_BRUTO_CENTS)),
    liquido: formatBRL(resultado.providerNetAmount),
    percentual: (regra.percentBps / 100).toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    }),
  };
}

export default async function SejaPrestadorPage() {
  const exemplo = await exemploDeRepasse();

  return (
    <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-center gap-10">
        <div className="min-w-0 flex-[1_1_420px]">
          <p className="eyebrow text-[var(--accent-text)]">Para técnicos</p>
          <h1 className="mt-2.5 text-[clamp(28px,4.6vw,48px)] leading-[1.03] font-extrabold tracking-[-0.04em]">
            Trabalhe com quem{" "}
            <span className="text-[var(--accent-text)]">já quer contratar</span>
          </h1>
          <p className="text-secondary mt-4 max-w-xl leading-relaxed">
            A AirFlow conecta você a clientes da sua região que já descreveram o
            serviço e propuseram um valor. Você negocia, executa e recebe com o
            pagamento retido desde o começo.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/cadastrar?tipo=prestador" size="lg">
              Quero ser parceiro
            </ButtonLink>
            <ButtonLink href="/como-funciona" variant="secondary" size="lg">
              Como funciona
            </ButtonLink>
          </div>
        </div>

        {exemplo && (
          <Card className="accent-soft min-w-0 flex-[1_1_300px] border p-7">
            <p className="eyebrow">Quanto fica com você</p>
            <p className="text-secondary mt-3 text-sm leading-relaxed">
              Num serviço de{" "}
              <span className="num font-bold">{exemplo.bruto}</span> com a comissão
              padrão de <span className="num font-bold">{exemplo.percentual}%</span>,
              o repasse é de:
            </p>
            <p className="num mt-3 text-[2.25rem] leading-none font-extrabold text-[var(--accent-text)]">
              {exemplo.liquido}
            </p>
            <p className="text-muted mt-3 text-xs leading-relaxed">
              O valor exato da comissão é congelado no momento do aceite e aparece
              no pedido — mudanças futuras na regra não afetam serviços já fechados.
            </p>
          </Card>
        )}
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-[-0.03em]">
          Por que trabalhar pela AirFlow
        </h2>
        <ul className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(270px,1fr))]">
          {VANTAGENS.map((vantagem) => (
            <li key={vantagem.titulo} className="min-w-0">
              <Card className="h-full p-6">
                <IconBox name={vantagem.icone} size={46} />
                <h3 className="mt-4 font-bold tracking-[-0.02em]">
                  {vantagem.titulo}
                </h3>
                <p className="text-secondary mt-2 text-sm leading-relaxed">
                  {vantagem.texto}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-[-0.03em]">
          Como entrar
        </h2>
        <ol className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {ETAPAS.map((etapa, i) => (
            <li key={etapa.titulo} className="min-w-0">
              <Card className="h-full p-6">
                <span className="bg-grad num inline-flex h-9 w-9 items-center justify-center rounded-[12px] font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-3.5 font-bold tracking-[-0.02em]">
                  {etapa.titulo}
                </h3>
                <p className="text-secondary mt-2 text-sm leading-relaxed">
                  {etapa.texto}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="accent-soft mt-12 flex flex-wrap items-center justify-between gap-4 rounded-(--radius-hero) border p-7">
        <p className="flex min-w-0 items-center gap-3 font-semibold">
          <Icon name="wrench" className="text-2xl text-[var(--accent-text)]" />
          Cadastro gratuito e sem compromisso.
        </p>
        <ButtonLink href="/cadastrar?tipo=prestador" size="lg">
          Criar conta de técnico
        </ButtonLink>
      </div>
    </main>
  );
}
