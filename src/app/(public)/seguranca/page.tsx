import type { Metadata } from "next";

import { ButtonLink, Card } from "@/ui";
import { Prose } from "@/ui/prose";

export const metadata: Metadata = {
  title: "Segurança",
  description:
    "Pagamento retido até a conclusão, técnicos verificados e mediação de disputas: como a AirFlow protege quem contrata e quem executa.",
  alternates: { canonical: "/seguranca" },
};

export default function SegurancaPage() {
  return (
    <Prose titulo="Como protegemos seu pagamento">
      <p>
        O maior risco em contratar um serviço técnico é o descompasso entre pagar e
        receber o trabalho feito. A plataforma resolve isso ficando no meio: o dinheiro
        sai da sua conta, mas <strong>não chega ao técnico</strong> até o serviço estar
        concluído.
      </p>

      <h2>O caminho do dinheiro</h2>
      <Card className="p-5">
        <ol className="flex flex-col gap-3 text-sm">
          {[
            ["Você paga", "O valor é debitado e fica retido na plataforma."],
            [
              "O serviço é autorizado",
              "Só depois da confirmação do pagamento o técnico pode agendar e executar.",
            ],
            [
              "O serviço é concluído",
              "A conclusão inicia um período de segurança antes de qualquer liberação.",
            ],
            [
              "Sem contestação, o valor é liberado",
              "Passado o prazo, o valor líquido fica disponível ao técnico.",
            ],
            [
              "O repasse é processado",
              "O técnico solicita o saque e recebe na conta cadastrada.",
            ],
          ].map(([titulo, texto], i) => (
            <li key={titulo} className="flex gap-3">
              <span className="bg-brand-600 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <strong>{titulo}</strong>
                <span className="text-secondary block">{texto}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <h2>Se algo der errado</h2>
      <p>
        Antes da liberação, você pode abrir uma disputa. O valor correspondente fica{" "}
        <strong>bloqueado</strong> enquanto a mediação analisa as evidências das duas
        partes — fotos, mensagens trocadas e o histórico do pedido, tudo registrado na
        plataforma.
      </p>
      <p>Motivos comuns de disputa:</p>
      <ul>
        <li>O técnico não compareceu</li>
        <li>O serviço foi executado parcialmente</li>
        <li>O equipamento foi danificado durante o atendimento</li>
        <li>O valor cobrado divergiu do acordado</li>
        <li>Problema de qualidade na execução</li>
      </ul>

      <h2>Técnicos verificados</h2>
      <p>
        O selo de verificação indica que o profissional teve documentos de
        identificação, dados fiscais e comprovação de experiência analisados antes de
        poder receber solicitações. A reputação exibida não é uma média simples de
        estrelas: considera também volume de serviços concluídos, cancelamentos e
        disputas.
      </p>

      <h2>Seus dados de pagamento</h2>
      <p>
        <strong>Nunca armazenamos o número completo do seu cartão nem o CVV.</strong> Os
        dados trafegam apenas no ambiente tokenizado do provedor de pagamento, que é
        certificado para isso. A plataforma guarda somente a referência da transação.
      </p>

      <h2>Por que combinar por fora é arriscado</h2>
      <p>
        Fechar por fora elimina exatamente aquilo que protege os dois lados: a retenção
        do valor, o registro do que foi acordado, a mediação em caso de problema e o
        histórico que sustenta a reputação. Sem isso, resta a palavra de um contra a do
        outro.
      </p>

      <div className="mt-2">
        <ButtonLink href="/tecnicos" size="lg">
          Encontrar técnico
        </ButtonLink>
      </div>
    </Prose>
  );
}
