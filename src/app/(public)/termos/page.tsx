import type { Metadata } from "next";

import { Alert } from "@/ui";
import { Prose } from "@/ui/prose";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Termos de uso da plataforma AirFlow — direitos e deveres de clientes e prestadores.",
  alternates: { canonical: "/termos" },
};

export default function TermosPage() {
  return (
    <Prose eyebrow="Legal" titulo="Termos de uso" atualizadoEm="11 de agosto de 2026">
      <Alert tone="warning" title="Documento preliminar">
        Esta é uma minuta redigida junto com o produto para descrever com fidelidade
        como a plataforma funciona. <strong>Ela precisa de revisão jurídica antes de
        qualquer operação comercial real</strong> — não constitui aconselhamento legal.
      </Alert>

      <h2>1. Sobre a plataforma</h2>
      <p>
        A AirFlow é um marketplace que conecta clientes que precisam de serviços de
        climatização a prestadores independentes. A plataforma <strong>não executa os
        serviços</strong> e não é empregadora dos profissionais cadastrados: atua como
        intermediária da contratação, do pagamento e do repasse.
      </p>

      <h2>2. Cadastro</h2>
      <p>
        O cadastro exige informações verdadeiras e atualizadas. Cada pessoa responde
        pelas ações realizadas com suas credenciais. Prestadores passam por análise
        documental antes de receber solicitações, e a aprovação pode ser revista a
        qualquer momento em caso de irregularidade.
      </p>

      <h2>3. Contratação e valores</h2>
      <p>
        O cliente propõe um valor; o prestador pode aceitar, recusar ou apresentar
        contraproposta. <strong>Uma vez aceito, o valor fica registrado e não pode ser
        alterado informalmente</strong>. Mudanças de escopo exigem novo acordo dentro
        da plataforma.
      </p>
      <p>
        Combinar pagamento por fora da plataforma retira as garantias descritas nestes
        termos e pode levar ao encerramento das contas envolvidas.
      </p>

      <h2>4. Pagamento e retenção</h2>
      <p>
        O pagamento é feito à plataforma e fica <strong>retido</strong> até a conclusão
        do serviço. Após a conclusão confirmada e o decurso do período de segurança sem
        contestação, o valor líquido é liberado ao prestador.
      </p>

      <h2>5. Comissão</h2>
      <p>
        A plataforma retém uma comissão sobre serviços efetivamente concluídos. O
        percentual aplicável é apresentado ao prestador antes do aceite e{" "}
        <strong>fica congelado naquela contratação</strong> — alterações posteriores na
        política de comissão não afetam contratos já firmados.
      </p>

      <h2>6. Cancelamento</h2>
      <p>
        Cancelamentos antes do início do serviço geram estorno conforme a política
        vigente. Cancelamentos após o deslocamento ou início da execução podem gerar
        cobrança proporcional ao trabalho já realizado.
      </p>

      <h2>7. Disputas</h2>
      <p>
        O cliente pode abrir disputa antes da liberação do pagamento. Durante a análise,
        o valor correspondente fica bloqueado. Ambas as partes podem apresentar
        evidências, e a decisão da mediação define o destino do valor retido.
      </p>

      <h2>8. Avaliações</h2>
      <p>
        Somente clientes com serviço efetivamente contratado e concluído podem avaliar.
        Avaliações com conteúdo ofensivo, falso ou sem relação com o serviço podem ser
        removidas.
      </p>

      <h2>9. Responsabilidades</h2>
      <p>
        O prestador responde pela qualidade técnica, pela segurança da execução e pelos
        danos causados durante o atendimento. O cliente responde por prestar informações
        corretas e garantir acesso ao local no horário combinado.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Estes termos podem ser atualizados. Mudanças relevantes são comunicadas com
        antecedência, e o aceite fica registrado com data e versão.
      </p>
    </Prose>
  );
}
