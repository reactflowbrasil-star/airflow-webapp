/**
 * Adapter do provedor real de biometria — Unico (antiga idwall).
 *
 * Por que Unico: padrão de mercado brasileiro para prova de vida facial
 * (LGPD, usado por bancos e fintechs), com liveness anti-fraude e
 * correspondência facial contra documento. O fluxo integrado aqui é o
 * "Acesso Biométrico" web: o prestador captura a selfie no navegador e o
 * backend envia à API da Unico para análise.
 *
 * ⚠️ CONTRATO PENDENTE DE VALIDAÇÃO: os endpoints abaixo seguem o padrão
 * documentado publicamente pela Unico (idCloud/acesso), mas o contrato exato
 * (rotas, nomes de campos, autenticação) deve ser conferido na documentação
 * da conta antes de ativar em produção. Até lá, o produto roda em sandbox —
 * a interface `FacialProvider` não muda quando o contrato for ajustado.
 *
 * Variáveis de ambiente:
 *   FACIAL_BIOMETRIA_PROVIDER=unico
 *   UNICO_CLIENT_ID        — identificador da aplicação (público)
 *   UNICO_CLIENT_SECRET    — segredo (apenas no ambiente seguro)
 *   UNICO_API_URL          — base da API (default: https://api.acesso.io)
 */

import {
  FacialProviderError,
  type FacialProvider,
  type ResultadoBiometria,
} from "./facial-provider";

interface UnicoConfig {
  clientId: string;
  clientSecret: string;
  apiUrl: string;
}

function config(): UnicoConfig {
  const clientId = process.env.UNICO_CLIENT_ID;
  const clientSecret = process.env.UNICO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "UNICO_CLIENT_ID/UNICO_CLIENT_SECRET ausentes. Configure as credenciais " +
        "da Unico ou volte para FACIAL_BIOMETRIA_PROVIDER=sandbox.",
    );
  }
  return {
    clientId,
    clientSecret,
    apiUrl: process.env.UNICO_API_URL ?? "https://api.acesso.io",
  };
}

export class UnicoFacialProvider implements FacialProvider {
  readonly id = "unico";
  readonly modo = "real" as const;

  async criarSessao(
    input: { providerProfileId: string; displayName: string },
  ): Promise<{ sessaoId: string }> {
    void input;
    const cfg = config();
    // TODO(contrato): chamar o endpoint de criação de sessão/consentimento da
    // Unico com o token de acesso (client_credentials) e devolver o id da
    // sessão — conferir contrato na documentação da conta antes de ativar.
    void cfg;
    throw new FacialProviderError(
      "UNICO_CONTRACT_PENDING",
      "O adapter Unico aguarda validação do contrato da API. Use sandbox enquanto isso.",
    );
  }

  async validarSelfie(
    input: {
      sessaoId: string;
      selfieDataUrl: string;
      providerProfileId: string;
    },
  ): Promise<ResultadoBiometria> {
    void input;
    const cfg = config();
    // TODO(contrato): enviar a selfie (ou o id do arquivo carregado) para o
    // endpoint de análise da Unico e traduzir a resposta para ResultadoBiometria
    // (aprovado/motivo/score). Conferir campos na documentação da conta.
    void cfg;
    throw new FacialProviderError(
      "UNICO_CONTRACT_PENDING",
      "O adapter Unico aguarda validação do contrato da API. Use sandbox enquanto isso.",
    );
  }
}
