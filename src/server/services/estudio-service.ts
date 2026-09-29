/**
 * Estúdio de marketing — gerações de imagem e vídeo na Higgsfield (/admin).
 *
 * Regras que este serviço carrega:
 *
 *   - Posse: toda leitura filtra por `userId` na própria consulta. Geração de
 *     outro admin não existe para quem pergunta (a rota responde 404).
 *   - Um POST cobrado por intenção: o `idempotencyKey` do navegador é unique
 *     por usuário. O segundo envio com a mesma chave devolve a geração
 *     existente — o banco decide o empate, não a interface.
 *   - Resultado incerto nunca é reenviado: timeout, queda ou 5xx depois de
 *     enviar viram INDETERMINADA, com a instrução de conferir o histórico na
 *     Higgsfield antes de gerar de novo.
 *   - Nenhuma chamada à Higgsfield acontece dentro de transação: I/O de rede
 *     segurando transação é lock esperando resposta de terceiro.
 */

import type { MediaGeneration, Prisma } from "@/generated/prisma/client";

import {
  MODELOS,
  ROTULOS_OPCAO,
  ehModeloEstudio,
  type SuperficieEstudio,
} from "@/domain/estudio/catalogo";
import { validarEntrada } from "@/domain/estudio/entradas";
import {
  ehTerminal,
  envioOrfao,
  geracaoMachine,
  podeCancelar,
  proximoStatus,
  statusDaPlataforma,
  type StatusGeracao,
} from "@/domain/estudio/geracao";
import { DomainError } from "@/domain/shared/errors";
import { prisma } from "@/server/db/prisma";
import {
  ErroHiggsfield,
  type ClienteHiggsfield,
  type RespostaEnvio,
  type StatusRemoto,
} from "@/server/higgsfield/cliente";
import { logger } from "@/server/observability/logger";

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const CONFERIR_HISTORICO =
  "A geração pode ter sido criada mesmo assim: confira o histórico em open.higgsfield.ai antes de gerar de novo. " +
  "O Estúdio não reenvia sozinho para não cobrar duas vezes.";

export interface GeracaoDTO {
  id: string;
  modelo: string;
  rotuloModelo: string;
  superficie: SuperficieEstudio;
  prompt: string;
  /** Parâmetros em uma linha: "16:9 · 720p · 5 s · com áudio". */
  resumo: string;
  status: StatusGeracao;
  urls: string[];
  erro: string | null;
  criadaEm: string;
  /** Já formatada no servidor: formatar no navegador divergiria do SSR pelo fuso. */
  criadaEmTexto: string;
  concluidaEm: string | null;
  terminal: boolean;
  podeCancelar: boolean;
}

export function paraDTO(linha: MediaGeneration): GeracaoDTO {
  const modelo = ehModeloEstudio(linha.model) ? MODELOS[linha.model] : null;
  return {
    id: linha.id,
    modelo: linha.model,
    rotuloModelo: modelo?.rotulo ?? linha.model,
    superficie: linha.surface,
    prompt: linha.prompt,
    resumo: resumoDaEntrada(linha.surface, linha.input),
    status: linha.status,
    urls: linha.resultUrls,
    erro: linha.errorMessage,
    criadaEm: linha.createdAt.toISOString(),
    criadaEmTexto: FORMATO_DATA.format(linha.createdAt),
    concluidaEm: linha.finishedAt?.toISOString() ?? null,
    terminal: ehTerminal(linha.status),
    podeCancelar: podeCancelar(linha.status) && linha.requestId !== null,
  };
}

export async function listarGeracoes(userId: string, limite = 40): Promise<GeracaoDTO[]> {
  const linhas = await prisma.mediaGeneration.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  return linhas.map(paraDTO);
}

export async function enviarGeracao(p: {
  userId: string;
  idempotencyKey: string;
  modelo: string;
  entrada: unknown;
  cliente: ClienteHiggsfield;
  correlationId: string;
}): Promise<{ geracao: GeracaoDTO; repetida: boolean; tipoFalha: string | null }> {
  if (!ehModeloEstudio(p.modelo)) {
    throw new DomainError("MODELO_DESCONHECIDO", "Modelo não disponível no Estúdio.");
  }
  const modelo = MODELOS[p.modelo];
  const corpo = validarEntrada(modelo.id, p.entrada);

  let linha: MediaGeneration;
  try {
    linha = await prisma.mediaGeneration.create({
      data: {
        userId: p.userId,
        idempotencyKey: p.idempotencyKey,
        model: modelo.id,
        surface: modelo.superficie,
        prompt: corpo.prompt,
        input: corpo as Prisma.InputJsonObject,
        status: "ENVIANDO",
      },
    });
  } catch (erro) {
    if (!violouUnique(erro)) throw erro;
    // O mesmo envio chegando de novo (clique duplo, retry após queda de
    // rede): devolve o que existe. Um POST à Higgsfield por chave, nunca dois.
    const existente = await prisma.mediaGeneration.findUniqueOrThrow({
      where: { userId_idempotencyKey: { userId: p.userId, idempotencyKey: p.idempotencyKey } },
    });
    return { geracao: paraDTO(existente), repetida: true, tipoFalha: null };
  }

  let resposta: RespostaEnvio | null = null;
  let falha: unknown = null;
  try {
    resposta = await p.cliente.enviar(modelo.id, corpo);
  } catch (erro) {
    falha = erro;
  }

  if (resposta) {
    // O request_id vai ao log ANTES de gravar: se o UPDATE falhar, ainda dá
    // para achar a geração na Higgsfield.
    logger.info("Geração aceita pela Higgsfield", {
      correlationId: p.correlationId,
      geracaoId: linha.id,
      requestId: resposta.requestId,
      modelo: modelo.id,
    });
    const status = geracaoMachine.transition(
      "ENVIANDO",
      statusDaPlataforma(resposta.status) ?? "NA_FILA",
    );
    linha = await prisma.mediaGeneration.update({
      where: { id: linha.id },
      data: {
        requestId: resposta.requestId,
        status,
        finishedAt: ehTerminal(status) ? new Date() : null,
      },
    });
    return { geracao: paraDTO(linha), repetida: false, tipoFalha: null };
  }

  const incerto = !(falha instanceof ErroHiggsfield) || falha.resultadoIncerto;
  const status = geracaoMachine.transition("ENVIANDO", incerto ? "INDETERMINADA" : "RECUSADA");
  const mensagem =
    falha instanceof ErroHiggsfield
      ? incerto
        ? `${falha.message} ${CONFERIR_HISTORICO}`
        : falha.message
      : `Erro inesperado no envio. ${CONFERIR_HISTORICO}`;
  logger.warn("Envio à Higgsfield sem sucesso", {
    correlationId: p.correlationId,
    geracaoId: linha.id,
    status,
    tipo: falha instanceof ErroHiggsfield ? falha.tipo : "INESPERADO",
    erro: falha instanceof ErroHiggsfield ? undefined : String(falha),
  });
  linha = await prisma.mediaGeneration.update({
    where: { id: linha.id },
    data: { status, errorMessage: mensagem, finishedAt: new Date() },
  });
  return {
    geracao: paraDTO(linha),
    repetida: false,
    tipoFalha: falha instanceof ErroHiggsfield ? falha.tipo : "INESPERADO",
  };
}

/**
 * Consulta a Higgsfield e grava o que mudou. Nulo quando a geração não existe
 * para este usuário. Sem cliente (chave ausente), devolve o que se sabe.
 * Erro da Higgsfield no poll sobe para a rota — o estado gravado não muda.
 */
export async function atualizarGeracao(p: {
  userId: string;
  geracaoId: string;
  cliente: ClienteHiggsfield | null;
  correlationId: string;
  agora?: Date;
}): Promise<GeracaoDTO | null> {
  const linha = await prisma.mediaGeneration.findFirst({
    where: { id: p.geracaoId, userId: p.userId },
  });
  if (!linha) return null;
  const agora = p.agora ?? new Date();

  if (envioOrfao(linha.status, linha.createdAt, agora)) {
    return paraDTO(
      await gravarTransicao(linha, "INDETERMINADA", {
        errorMessage: `O envio foi interrompido antes da confirmação. ${CONFERIR_HISTORICO}`,
        finishedAt: agora,
      }),
    );
  }
  if (ehTerminal(linha.status) || !linha.requestId || !p.cliente) return paraDTO(linha);

  const remoto = await p.cliente.consultar(linha.requestId);
  const novo = proximoStatus(linha.status, remoto.status);
  if (novo === linha.status) return paraDTO(linha);

  return paraDTO(
    await gravarTransicao(linha, novo, {
      resultUrls: novo === "CONCLUIDA" ? remoto.urls : [],
      errorMessage: mensagemDoStatus(novo, remoto),
      finishedAt: ehTerminal(novo) ? agora : null,
    }),
  );
}

export async function cancelarGeracao(p: {
  userId: string;
  geracaoId: string;
  cliente: ClienteHiggsfield;
  correlationId: string;
}): Promise<GeracaoDTO | null> {
  const linha = await prisma.mediaGeneration.findFirst({
    where: { id: p.geracaoId, userId: p.userId },
  });
  if (!linha) return null;
  if (!podeCancelar(linha.status) || !linha.requestId) {
    throw new DomainError(
      "CANCELAMENTO_INDISPONIVEL",
      "Só dá para cancelar enquanto a geração está na fila — depois que começa, a Higgsfield não interrompe.",
    );
  }

  // Parar de consultar não cancela nada: o pedido precisa chegar à API.
  await p.cliente.cancelar(linha.requestId);
  logger.info("Cancelamento aceito pela Higgsfield", {
    correlationId: p.correlationId,
    geracaoId: linha.id,
    requestId: linha.requestId,
  });

  // A API responde 202; a confirmação vem pelo status. Se a consulta falhar
  // agora, o poll do navegador pega a mudança depois.
  try {
    return await atualizarGeracao({ ...p, cliente: p.cliente });
  } catch (erro) {
    if (erro instanceof ErroHiggsfield) return paraDTO(linha);
    throw erro;
  }
}

export async function registrarAuditoriaChave(
  userId: string,
  acao: "HIGGSFIELD_CHAVE_CONECTADA" | "HIGGSFIELD_CHAVE_REMOVIDA",
  correlationId: string,
): Promise<void> {
  // Registra o fato, nunca o valor — nem mascarado.
  await prisma.auditLog.create({
    data: { userId, action: acao, entityType: "User", entityId: userId, correlationId },
  });
}

/**
 * Aplica a transição pela máquina e grava com trava otimista: só atualiza se
 * o status ainda for o que foi lido. Um poll atrasado não sobrescreve um mais
 * novo — quem perde a corrida devolve o que o vencedor gravou.
 */
async function gravarTransicao(
  linha: MediaGeneration,
  alvo: StatusGeracao,
  dados: Omit<Prisma.MediaGenerationUpdateManyMutationInput, "status">,
): Promise<MediaGeneration> {
  const status = geracaoMachine.transition(linha.status, alvo);
  await prisma.mediaGeneration.updateMany({
    where: { id: linha.id, status: linha.status },
    data: { ...dados, status },
  });
  return prisma.mediaGeneration.findUniqueOrThrow({ where: { id: linha.id } });
}

function mensagemDoStatus(status: StatusGeracao, remoto: StatusRemoto): string | null {
  switch (status) {
    case "CONCLUIDA":
      return remoto.urls.length ? null : "A Higgsfield concluiu sem devolver URL de mídia.";
    case "FALHOU":
      return `A Higgsfield informou falha na geração${remoto.erro ? `: ${remoto.erro}` : "."} Os créditos são devolvidos.`;
    case "BLOQUEADA":
      return "Bloqueada pela moderação de conteúdo da Higgsfield. Ajuste o prompt; os créditos são devolvidos.";
    case "CANCELADA":
      return "Cancelada na Higgsfield.";
    default:
      return null;
  }
}

function resumoDaEntrada(superficie: SuperficieEstudio, input: Prisma.JsonValue): string {
  const e =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const rotulo = (valor: unknown) =>
    typeof valor === "string" ? (ROTULOS_OPCAO[valor] ?? valor) : null;

  if (superficie === "VIDEO") {
    return [
      e.aspect_ratio,
      e.resolution,
      typeof e.duration === "number" ? `${e.duration} s` : null,
      e.generate_audio === false ? "sem áudio" : "com áudio",
    ]
      .filter((parte): parte is string => typeof parte === "string")
      .join(" · ");
  }

  const referencias = Array.isArray(e.image_urls) ? e.image_urls.length : 0;
  return [
    e.aspect_ratio === "auto" ? "proporção automática" : e.aspect_ratio,
    e.resolution,
    e.quality ? `qualidade ${rotulo(e.quality)?.toLowerCase()}` : null,
    e.enhance_prompt === true ? "preset do Marketing Studio" : null,
    referencias ? `${referencias} ${referencias === 1 ? "referência" : "referências"}` : null,
  ]
    .filter((parte): parte is string => typeof parte === "string")
    .join(" · ");
}

function violouUnique(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: string }).code === "P2002"
  );
}
