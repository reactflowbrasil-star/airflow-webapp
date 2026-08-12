/**
 * Validação facial do prestador — domínio puro, zero I/O (§8).
 *
 * O nível de confiabilidade VERIFICADO por biometria é representado por um
 * documento SELFIE aprovado no schema (tipo já existente, sem migration) +
 * `ProviderProfile.verified = true`. Este módulo concentra as regras puras:
 * a máquina de estados da sessão, as regras de aceite da imagem e a tradução
 * do resultado do provedor de biometria para o domínio.
 *
 * O provedor real (ex.: Unico) é um adapter em src/server — o domínio não
 * conhece SDK; ele só conhece o contrato de resultado.
 */

export type EstadoValidacaoFacial =
  | "NAO_INICIADA"
  | "SESSAO_CRIADA"
  | "APROVADA"
  | "REPROVADA";

export const facialMachine = {
  NAO_INICIADA: ["SESSAO_CRIADA"],
  SESSAO_CRIADA: ["APROVADA", "REPROVADA"],
  APROVADA: [],
  REPROVADA: ["SESSAO_CRIADA"],
} as const;

export function podeTransitar(
  atual: EstadoValidacaoFacial,
  proximo: EstadoValidacaoFacial,
): boolean {
  return facialMachine[atual].includes(proximo as never);
}

export interface ResultadoBiometria {
  aprovado: boolean;
  /** Motivo legível quando reprovado (anti-fraude, liveness, sem rosto...). */
  motivo?: string;
  /** Confiança da face (0–1), quando o provedor informa. */
  score?: number;
}

/** Regras de aceite da selfie enviada pelo navegador (data URL). */
export const LIMITE_SELFIE_BYTES = 1_500_000;
export const FORMATOS_SELFIE = /^data:image\/(png|jpeg|jpg|webp);base64,/;

export function selfieAceita(dataUrl: string): boolean {
  if (!FORMATOS_SELFIE.test(dataUrl)) return false;
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4) <= LIMITE_SELFIE_BYTES;
}

export function motivoRejeicao(dataUrl: string): string | null {
  if (!FORMATOS_SELFIE.test(dataUrl)) {
    return "Formato de imagem inválido (use JPG, PNG ou WebP)";
  }
  if (!selfieAceita(dataUrl)) {
    return "Imagem muito grande (máx. 1,5 MB)";
  }
  return null;
}

/**
 * Traduz o resultado do provedor para o domínio. O provedor pode devolver
 * `aprovado` ou `motivo`; o domínio normaliza para a resposta da API.
 */
export function mapResultadoBiometria(resultado: ResultadoBiometria): {
  estado: EstadoValidacaoFacial;
  motivo: string | null;
} {
  return resultado.aprovado
    ? { estado: "APROVADA", motivo: null }
    : {
        estado: "REPROVADA",
        motivo: resultado.motivo ?? "Não foi possível confirmar sua identidade",
      };
}
