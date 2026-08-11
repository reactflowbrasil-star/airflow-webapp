/**
 * Envio de WhatsApp (§15, §39).
 *
 * Mesma disciplina do PaymentProvider: o serviço de verificação não conhece
 * SDK de provedor nenhum. Trocar de fornecedor é implementar esta interface e
 * registrar no factory.
 *
 * Regra que a arquitetura impõe: **só o número oficial da plataforma envia.**
 * Nenhuma função aqui aceita "número de origem" como parâmetro — não existe
 * caminho no código para uma mensagem sair do telefone pessoal de um cliente
 * ou de um prestador. A origem é a instância configurada no provedor.
 */

import { logger } from "@/server/observability/logger";

export interface MensagemWhatsApp {
  /** Destino em E.164 (+5511988771200). */
  para: string;
  /** Corpo já renderizado. */
  texto: string;
  /** Identificador do modelo, só para log e métrica — nunca o conteúdo. */
  template: string;
  correlationId: string;
}

export interface ResultadoEnvio {
  aceito: boolean;
  /** Id da mensagem no provedor, para rastrear entrega depois. */
  externalId?: string;
  erro?: string;
}

export interface WhatsAppProvider {
  readonly nome: string;
  enviar(mensagem: MensagemWhatsApp): Promise<ResultadoEnvio>;
}

/** Destino mascarado para log: nem o telefone completo precisa ser registrado. */
function mascarar(e164: string): string {
  return `${e164.slice(0, 5)}…${e164.slice(-2)}`;
}

/**
 * Provedor de desenvolvimento.
 *
 * Não envia nada: registra que enviaria e devolve sucesso. O texto **não**
 * aparece no log — nem aqui, onde seria conveniente para depurar. Código de
 * verificação em log é código vazado, e log de desenvolvimento vira log de
 * produção com uma variável de ambiente errada. Para testar localmente,
 * consulte a tabela `phone_verifications`.
 */
class WhatsAppSandbox implements WhatsAppProvider {
  readonly nome = "sandbox";

  async enviar(mensagem: MensagemWhatsApp): Promise<ResultadoEnvio> {
    logger.info("WhatsApp (sandbox) — envio simulado, nada foi entregue", {
      correlationId: mensagem.correlationId,
      template: mensagem.template,
      para: mascarar(mensagem.para),
    });
    return { aceito: true, externalId: `sandbox-${Date.now()}` };
  }
}

/**
 * Evolution API (edição GO).
 *
 * Contrato verificado no manager da própria instância, não presumido da
 * documentação de outra versão — a linha GO difere da v1/v2 em Node:
 *
 *     POST {base}/send/text
 *     apikey: <token da instância>
 *     { "number": "5511988771200", "text": "..." }
 *
 * O número vai só em dígitos: a Evolution monta o JID a partir disso, e o `+`
 * do E.164 faria o destino não resolver.
 */
class WhatsAppEvolution implements WhatsAppProvider {
  readonly nome = "evolution";

  constructor(
    private readonly base: string,
    private readonly apiKey: string,
  ) {}

  async enviar(mensagem: MensagemWhatsApp): Promise<ResultadoEnvio> {
    const url = `${this.base.replace(/\/+$/, "")}/send/text`;

    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: this.apiKey },
        body: JSON.stringify({
          number: mensagem.para.replace(/\D/g, ""),
          text: mensagem.texto,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!resposta.ok) {
        // Corpo do erro não entra no log sem filtro: pode ecoar a mensagem
        // enviada, e a mensagem contém o código.
        logger.error("Evolution recusou o envio", {
          correlationId: mensagem.correlationId,
          status: resposta.status,
          para: mascarar(mensagem.para),
        });
        return { aceito: false, erro: `HTTP ${resposta.status}` };
      }

      const dados = (await resposta.json().catch(() => ({}))) as {
        data?: { key?: { id?: string }; id?: string };
        key?: { id?: string };
      };
      const externalId =
        dados.data?.key?.id ?? dados.key?.id ?? dados.data?.id ?? undefined;

      logger.info("WhatsApp enviado", {
        correlationId: mensagem.correlationId,
        template: mensagem.template,
        para: mascarar(mensagem.para),
        externalId,
      });
      return { aceito: true, externalId };
    } catch (error) {
      const erro = error instanceof Error ? error.message : "falha de rede";
      logger.error("Falha ao falar com a Evolution", {
        correlationId: mensagem.correlationId,
        para: mascarar(mensagem.para),
        erro,
      });
      return { aceito: false, erro };
    }
  }
}

let instancia: WhatsAppProvider | null = null;

/**
 * Devolve o provedor configurado.
 *
 * Sem `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` cai no sandbox — o cadastro
 * continua funcionando em desenvolvimento, e o aviso no log deixa explícito
 * que nenhum código está saindo de verdade.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (instancia) return instancia;

  const base = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (base && apiKey) {
    instancia = new WhatsAppEvolution(base, apiKey);
  } else {
    logger.warn(
      "EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — códigos de verificação NÃO serão entregues",
      {},
    );
    instancia = new WhatsAppSandbox();
  }
  return instancia;
}

/** Só para teste: descarta a instância memoizada. */
export function resetWhatsAppProvider(): void {
  instancia = null;
}
