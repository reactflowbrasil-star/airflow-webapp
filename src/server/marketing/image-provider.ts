/**
 * Contrato do provedor de imagens do estúdio de marketing.
 *
 * Mesma disciplina do PSP, do WhatsApp e da biometria: o serviço só conhece
 * esta interface, nunca o SDK do fornecedor. Trocar o Higgsfield por outro
 * gerador é implementar isto e registrar em `index.ts`.
 */

import { DomainError } from "@/domain/shared/errors";
import type { GeracaoImagem, PaginaPresets } from "@/lib/marketing-image";
import type { PedidoImagemMarketing } from "@/lib/validation/marketing";

export interface ImagemMarketingProvider {
  readonly id: string;
  /** Exibido no painel: o operador precisa saber se está gastando crédito. */
  readonly modo: "sandbox" | "real";
  /** Modelo no provedor, registrado na auditoria de cada pedido. */
  readonly modelo: string;
  /** Enfileira a geração e devolve o id para acompanhar — não espera a imagem. */
  gerar(pedido: PedidoImagemMarketing, correlationId: string): Promise<GeracaoImagem>;
  consultar(requestId: string, correlationId: string): Promise<GeracaoImagem>;
  listarPresets(cursor: string | undefined, correlationId: string): Promise<PaginaPresets>;
}

export type CodigoErroImagem =
  | "MARKETING_CREDENCIAIS_RECUSADAS"
  | "MARKETING_SEM_CREDITOS"
  | "MARKETING_PEDIDO_RECUSADO"
  | "MARKETING_GERACAO_NAO_ENCONTRADA"
  | "MARKETING_LIMITE_PROVEDOR"
  | "MARKETING_PROVEDOR_INDISPONIVEL";

/**
 * Erro do provedor já traduzido para o operador. É `DomainError` para chegar
 * ao painel como 422 com código estável e mensagem em português — a
 * mensagem nunca carrega a credencial nem o corpo cru da resposta.
 */
export class ImagemMarketingError extends DomainError {
  constructor(code: CodigoErroImagem, message: string) {
    super(code, message);
    this.name = "ImagemMarketingError";
  }
}
