import type { Metadata } from "next";

import { Alert } from "@/ui";
import { Prose } from "@/ui/prose";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Como a AirFlow coleta, usa e protege seus dados pessoais, conforme a LGPD.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <Prose eyebrow="Legal" titulo="Política de privacidade" atualizadoEm="11 de agosto de 2026">
      <Alert tone="warning" title="Documento preliminar">
        Minuta redigida junto com o produto para descrever com fidelidade o tratamento
        de dados implementado. <strong>Precisa de revisão jurídica antes de qualquer
        operação comercial real</strong>.
      </Alert>

      <h2>Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, telefone e senha (armazenada apenas
          como hash criptográfico — nunca em texto legível).
        </li>
        <li>
          <strong>Endereços:</strong> necessários para localizar prestadores próximos e
          para a execução do serviço.
        </li>
        <li>
          <strong>Solicitações:</strong> descrição do problema, fotos enviadas e dados
          do equipamento.
        </li>
        <li>
          <strong>Prestadores:</strong> CPF ou CNPJ, documentos de identificação e
          certificados, usados exclusivamente na verificação.
        </li>
        <li>
          <strong>Transações:</strong> valores, status e referências do provedor de
          pagamento. <strong>Não armazenamos número completo de cartão nem CVV</strong>{" "}
          — esses dados trafegam apenas no ambiente tokenizado do provedor.
        </li>
        <li>
          <strong>Uso:</strong> eventos de navegação para medir a jornada e melhorar o
          produto.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <p>
        Para operar a contratação: conectar você a profissionais adequados, processar
        pagamentos, apurar comissões e repasses, mediar disputas, prevenir fraudes e
        cumprir obrigações legais e fiscais.
      </p>

      <h2>Minimização</h2>
      <p>
        Coletamos apenas o necessário para cada finalidade. A localização exata do
        prestador nunca é exposta publicamente: mostramos região e uma{" "}
        <strong>distância aproximada e arredondada</strong>, justamente para impedir
        que o endereço seja deduzido.
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Compartilhamos dados apenas com quem é indispensável à operação — provedor de
        pagamento, serviços de comunicação e infraestrutura — e com autoridades quando
        houver obrigação legal. <strong>Não vendemos dados pessoais.</strong>
      </p>
      <p>
        Ao contratar um serviço, o prestador recebe os dados necessários ao atendimento
        (nome, contato e endereço). Antes da contratação, ele vê apenas a descrição do
        problema e a região.
      </p>

      <h2>Retenção</h2>
      <p>
        Mantemos os dados enquanto a conta existir. Após o encerramento, dados de
        cadastro são eliminados ou anonimizados, exceto{" "}
        <strong>registros financeiros e fiscais</strong>, preservados pelo prazo
        exigido em lei.
      </p>

      <h2>Seus direitos</h2>
      <ul>
        <li>Confirmar a existência de tratamento e acessar seus dados</li>
        <li>Corrigir dados incompletos ou desatualizados</li>
        <li>Solicitar anonimização, bloqueio ou eliminação</li>
        <li>Solicitar a portabilidade dos dados</li>
        <li>Revogar consentimentos, como o de comunicações de marketing</li>
      </ul>
      <p>
        Os pedidos podem ser feitos pelo suporte e são respondidos nos prazos da LGPD.
      </p>

      <h2>Segurança</h2>
      <p>
        Senhas protegidas por hash com fator de custo elevado, sessões em cookie
        <code> httpOnly</code>, comunicação cifrada, controle de acesso por papel e
        auditoria de operações críticas — especialmente as financeiras.
      </p>
    </Prose>
  );
}
