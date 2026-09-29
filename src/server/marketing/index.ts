/**
 * Registro do provedor de imagens do estúdio de marketing.
 *
 * Com `HF_KEY` (ou `HF_CREDENTIALS`) no formato `KEY_ID:KEY_SECRET`, fala com
 * o Higgsfield; sem ela, cai no sandbox — o painel continua utilizável em
 * desenvolvimento e o aviso no log (e na própria tela) deixa explícito que
 * nenhuma imagem está sendo gerada de verdade.
 */

import { logger } from "@/server/observability/logger";

import {
  HiggsfieldImagemProvider,
  lerCredencialHiggsfield,
  type CredencialHiggsfield,
} from "./higgsfield-provider";
import type { ImagemMarketingProvider } from "./image-provider";
import { SandboxImagemProvider } from "./sandbox-provider";

export * from "./image-provider";

let instancia: ImagemMarketingProvider | null = null;

export function getImagemMarketingProvider(): ImagemMarketingProvider {
  if (instancia) return instancia;

  const credencial = lerCredencialHiggsfield();
  if (credencial.estado === "ok") {
    instancia = new HiggsfieldImagemProvider(credencial.autorizacao);
    return instancia;
  }

  logger.warn(
    credencial.estado === "invalida"
      ? "HF_KEY/HF_CREDENTIALS fora do formato KEY_ID:KEY_SECRET — estúdio de marketing em sandbox"
      : "HF_KEY ausente — estúdio de marketing em sandbox, nenhuma imagem é gerada de verdade",
    {},
  );
  instancia = new SandboxImagemProvider();
  return instancia;
}

/** Para a tela explicar por que está em sandbox — nunca expõe o valor. */
export function estadoCredencialHiggsfield(): CredencialHiggsfield["estado"] {
  return lerCredencialHiggsfield().estado;
}

/** Só para teste: descarta a instância memoizada. */
export function resetImagemMarketingProvider(): void {
  instancia = null;
}
