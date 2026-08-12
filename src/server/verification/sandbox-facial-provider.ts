/**
 * Provedor de biometria facial para desenvolvimento e testes.
 *
 * NÃO é um mock de conveniência: implementa a interface real, valida a
 * selfie pelas regras de domínio e simula o ciclo liveness + face-match com
 * resultado determinístico e auditável (log). A captura da câmera no
 * navegador é real — o que é simulado é a análise biométrica em si.
 *
 * Em produção, `FACIAL_BIOMETRIA_PROVIDER=unico` troca este adapter por um
 * que fala com o provedor real (ver unico-facial-provider.ts).
 *
 * Regra do sandbox: imagem válida (formato + tamanho) dentro do limite é
 * aprovada; fora do limite é rejeitada com o motivo. Nada de "aprovar por
 * acidente" uma selfie inválida — o pipeline de estado é exercitado de
 * verdade pelos dois caminhos.
 */

import { motivoRejeicao, selfieAceita } from "@/domain/verification/facial";
import { logger } from "@/server/observability/logger";
import {
  FacialProviderError,
  type FacialProvider,
  type ResultadoBiometria,
} from "./facial-provider";

export class SandboxFacialProvider implements FacialProvider {
  readonly id = "sandbox";
  readonly modo = "sandbox" as const;

  async criarSessao(input: { providerProfileId: string; displayName: string }) {
    const sessaoId = `sbx_facial_${input.providerProfileId}_${Date.now()}`;
    logger.info("Sessão de biometria facial criada (sandbox)", {
      providerProfileId: input.providerProfileId,
      sessaoId,
    });
    return { sessaoId };
  }

  async validarSelfie(input: {
    sessaoId: string;
    selfieDataUrl: string;
    providerProfileId: string;
  }): Promise<ResultadoBiometria> {
    const PREFIXO = "sbx_facial_";
    if (!input.sessaoId.startsWith(PREFIXO)) {
      throw new FacialProviderError("INVALID_SESSION", "Sessão de biometria inválida");
    }

    // A sessão nasce ligada ao prestador que a abriu (`criarSessao`); validar
    // com a sessão de outro é recusado — espelha o vínculo que o provedor real
    // mantém no servidor dele.
    const dono = input.sessaoId.slice(PREFIXO.length).split("_")[0];
    if (dono !== input.providerProfileId) {
      throw new FacialProviderError(
        "SESSION_PROVIDER_MISMATCH",
        "Sessão de biometria de outro prestador",
      );
    }

    // A selfie já passou pelas regras de domínio na rota; validar de novo aqui
    // mantém o adapter autossuficiente (mesma disciplina do PSP sandbox).
    if (!selfieAceita(input.selfieDataUrl)) {
      return {
        aprovado: false,
        motivo: motivoRejeicao(input.selfieDataUrl) ?? "Imagem inválida",
      };
    }

    // Simulação determinística da análise (liveness + face match).
    logger.info("Biometria facial simulada — aprovada (sandbox)", {
      sessaoId: input.sessaoId,
    });
    return { aprovado: true, score: 0.99 };
  }
}
