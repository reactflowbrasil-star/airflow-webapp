/**
 * Guarda contra troca de dados de contato no chat (§9, §15).
 *
 * A plataforma é o único canal: telefone, e-mail, WhatsApp e perfis pessoais
 * nunca podem trafegar entre cliente e prestador. Se pudessem, as duas partes
 * sairiam da plataforma — e junto com elas iriam a custódia do pagamento, o
 * histórico da negociação e qualquer possibilidade de mediar uma disputa.
 *
 * A decisão aqui é redigir, não bloquear: uma mensagem recusada some e o
 * usuário reescreve com o número disfarçado ("nove-nove-oito-sete..."). Uma
 * mensagem entregue com o trecho mascarado mostra às duas partes que o canal
 * está sendo observado, sem perder o resto do que foi dito.
 *
 * Módulo puro: sem I/O, sem dependência de framework — testável isoladamente.
 */

/** Marcador que substitui o trecho suprimido. */
export const REDACTED = "[contato removido]";

interface Padrao {
  readonly nome: string;
  readonly regex: RegExp;
}

/**
 * Dígitos separados por qualquer coisa que não seja dígito ainda são um
 * telefone. `(11) 9 8877-1200`, `11988771200` e `11.9.8877.1200` caem todos
 * aqui; um CEP de 8 dígitos ou um valor em reais, não.
 */
const TELEFONE = /(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}/g;

/** Sequências longas de dígitos escritos por extenso, comuns em contorno. */
const DIGITOS_POR_EXTENSO =
  /\b(?:zero|um|dois|tres|três|quatro|cinco|seis|sete|oito|nove|meia)\b(?:[\s,.-]+\b(?:zero|um|dois|tres|três|quatro|cinco|seis|sete|oito|nove|meia)\b){5,}/gi;

const PADROES: readonly Padrao[] = [
  { nome: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  {
    nome: "url",
    regex: /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|br|me|io)(?:\/\S*)?/gi,
  },
  // "chama no zap 11988771200", "meu whats", "telegram @fulano"
  {
    nome: "canal-externo",
    regex:
      /\b(?:whats?app|whats|zap|zapzap|telegram|signal|instagram|insta|facebook|face|messenger|tiktok|linkedin)\b[\s:@-]*\S*/gi,
  },
  { nome: "arroba", regex: /(?<![\w.+-])@[a-z0-9._]{3,}/gi },
  { nome: "telefone", regex: TELEFONE },
  { nome: "digitos-por-extenso", regex: DIGITOS_POR_EXTENSO },
];

export interface ResultadoGuarda {
  /** Texto pronto para persistir, já com os trechos sensíveis mascarados. */
  readonly texto: string;
  /** `true` quando algo foi suprimido — o cliente avisa o autor. */
  readonly redigido: boolean;
  /** Nomes dos padrões acionados, para auditoria. Nunca o conteúdo em si. */
  readonly padroes: readonly string[];
}

/**
 * Mascara dados de contato num texto livre.
 *
 * O resultado nunca contém o dado original, e `padroes` guarda só o rótulo do
 * que foi encontrado — registrar o trecho suprimido derrotaria o propósito e
 * ainda vazaria o dado para os logs.
 */
export function redigirContato(texto: string): ResultadoGuarda {
  const acionados = new Set<string>();
  let resultado = texto;

  for (const { nome, regex } of PADROES) {
    // Regex global carrega lastIndex entre chamadas; uma cópia por execução
    // evita que a segunda mensagem comece a busca no meio da string.
    const local = new RegExp(regex.source, regex.flags);
    resultado = resultado.replace(local, (trecho) => {
      // Um "trecho" só de pontuação não é contato — evita mascarar traços
      // soltos que o padrão de telefone às vezes alcança.
      if (!/[\w]/.test(trecho)) return trecho;
      acionados.add(nome);
      return REDACTED;
    });
  }

  // Redações adjacentes viram uma só: "[contato removido] [contato removido]"
  // é ruído para quem lê.
  resultado = resultado.replace(
    new RegExp(`(?:${escapar(REDACTED)}[\\s.,;:-]*){2,}`, "g"),
    `${REDACTED} `,
  );

  return {
    texto: resultado.trim(),
    redigido: acionados.size > 0,
    padroes: [...acionados].sort(),
  };
}

function escapar(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
