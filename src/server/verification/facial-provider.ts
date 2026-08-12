/**
 * Contrato do provedor de biometria facial — a fronteira de I/O do §8.
 *
 * O serviço de domínio só conhece este contrato; nunca o SDK do provedor.
 * Adicionar um provedor real (Unico, Onfido, FaceTec…) é implementar esta
 * interface e registrá-la em `index.ts` — nenhum serviço muda.
 */

export interface ValidarSelfieInput {
  /** Identificador da sessão criada no provedor (ou no sandbox). */
  sessaoId: string;
  /** Selfie em data URL, já validada pelas regras de `src/domain`. */
  selfieDataUrl: string;
  /** Prestador autenticado — o provedor rejeita sessão de outro. */
  providerProfileId: string;
}

export interface ResultadoBiometria {
  aprovado: boolean;
  /** Motivo legível quando reprovado (liveness, rosto não detectado…). */
  motivo?: string;
  /** Confiança da face (0–1), quando o provedor informa. */
  score?: number;
}

export interface FacialProvider {
  readonly id: string;
  /** `sandbox` ou `unico` — exibido na UI para o prestador saber o modo. */
  readonly modo: "sandbox" | "real";
  /**
   * Abre uma sessão de validação no provedor. No sandbox devolve uma sessão
   * local; num provedor real, a sessão identifica o fluxo hosteado (ou o
   * token do SDK embarcado).
   */
  criarSessao(input: { providerProfileId: string; displayName: string }): Promise<{
    sessaoId: string;
  }>;
  /** Envia a selfie para liveness + verificação facial. */
  validarSelfie(input: ValidarSelfieInput): Promise<ResultadoBiometria>;
}

export class FacialProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FacialProviderError";
  }
}
