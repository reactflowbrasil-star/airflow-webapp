import type { Metadata } from "next";

import { ButtonLink, Card } from "@/ui";
import { Prose } from "@/ui/prose";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "Do orçamento ao pagamento: entenda como contratar um técnico de ar-condicionado pela AirFlow com segurança.",
  alternates: { canonical: "/como-funciona" },
};

const PASSOS_CLIENTE = [
  {
    titulo: "Descreva o que você precisa",
    texto:
      "Escolha o serviço, informe o tipo e a quantidade de aparelhos, descreva o problema e diga quanto pretende pagar. Leva menos de dois minutos.",
  },
  {
    titulo: "Receba propostas e negocie",
    texto:
      "Técnicos verificados da sua região respondem. Cada proposta mostra autor, valor e horário, e você pode fazer contrapropostas até chegar a um acordo.",
  },
  {
    titulo: "Pague com o valor retido",
    texto:
      "Depois do acordo, você paga pela plataforma. O dinheiro fica retido — o técnico ainda não recebe nada nesse momento.",
  },
  {
    titulo: "Acompanhe a execução",
    texto:
      "Agendamento confirmado, técnico a caminho, serviço em andamento e concluído: cada etapa aparece na linha do tempo do seu pedido.",
  },
  {
    titulo: "Confirme e avalie",
    texto:
      "Concluído o serviço, começa o período de segurança. Passado esse prazo sem contestação, o valor é liberado ao técnico e você avalia o atendimento.",
  },
];

const PASSOS_PRESTADOR = [
  {
    titulo: "Cadastre-se e envie seus documentos",
    texto:
      "Informe seus dados, especialidades, área de atendimento e preços de referência. A verificação analisa documentação e experiência.",
  },
  {
    titulo: "Receba solicitações compatíveis",
    texto:
      "Você recebe apenas pedidos dentro da sua área de atendimento e das suas especialidades.",
  },
  {
    titulo: "Negocie e execute",
    texto:
      "Aceite, recuse ou contraproponha. Com o pagamento confirmado, o serviço é autorizado e você agenda com o cliente.",
  },
  {
    titulo: "Receba o repasse",
    texto:
      "Concluído o serviço e vencido o período de segurança, o valor líquido fica disponível para saque. A comissão incide apenas sobre serviços concluídos.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <Prose
      titulo="Como funciona"
      intro="A AirFlow controla todo o ciclo dentro da plataforma: da descoberta do profissional ao repasse do pagamento."
      chips={[
        { href: "/como-funciona", rotulo: "Como funciona", ativo: true },
        { href: "/seguranca", rotulo: "Segurança", ativo: false },
      ]}
    >
      <p>
        Isso existe por um motivo: quando o combinado acontece por fora, ninguém tem
        garantia nenhuma.
      </p>

      <h2>Para quem precisa de um técnico</h2>
      <ol className="flex flex-col gap-3">
        {PASSOS_CLIENTE.map((passo, i) => (
          <li key={passo.titulo}>
            <Card className="p-4">
              <div className="flex gap-3">
                <span className="bg-grad num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{passo.titulo}</h3>
                  <p className="text-secondary mt-1 text-sm leading-relaxed">
                    {passo.texto}
                  </p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-2">
        <ButtonLink href="/tecnicos" size="lg">
          Encontrar técnico
        </ButtonLink>
      </div>

      <h2>Para quem presta serviço</h2>
      <ol className="flex flex-col gap-3">
        {PASSOS_PRESTADOR.map((passo, i) => (
          <li key={passo.titulo}>
            <Card className="p-4">
              <div className="flex gap-3">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-text)] text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{passo.titulo}</h3>
                  <p className="text-secondary mt-1 text-sm leading-relaxed">
                    {passo.texto}
                  </p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-2">
        <ButtonLink href="/seja-prestador" size="lg" variant="secondary">
          Quero ser prestador
        </ButtonLink>
      </div>

      <h2>Quanto custa</h2>
      <p>
        Para o cliente, buscar profissionais e receber propostas é <strong>gratuito</strong>.
        A plataforma cobra uma comissão do prestador apenas sobre serviços efetivamente
        concluídos — se o serviço não acontece, não há cobrança.
      </p>
    </Prose>
  );
}
