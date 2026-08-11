import { logger } from "@/server/observability/logger";

/**
 * Leitura tolerante para páginas que são pré-renderizadas no build.
 *
 * O problema que isto resolve: `next build` gera as páginas estáticas, e as
 * de conteúdo (home, catálogo, sitemap) leem o banco para montar as listas.
 * Numa imagem Docker o banco normalmente **não** está acessível no momento da
 * compilação — e um deploy inteiro falhava por causa de uma consulta de
 * marketing.
 *
 * A troca é deliberada: em vez de derrubar o build, a página sai com o
 * conteúdo reduzido e o `revalidate` a repõe com dados reais na primeira
 * regeneração depois que a aplicação sobe. Nenhuma dessas consultas é
 * financeira nem decide autorização — degradar aqui não esconde nada que
 * importe, e a falha vai para o log em nível de erro.
 *
 * NÃO use isto em caminho transacional. Lá, falha de banco tem de estourar.
 */
export async function consultaTolerante<T>(
  contexto: string,
  consulta: () => Promise<T>,
  reserva: T,
): Promise<T> {
  try {
    return await consulta();
  } catch (error) {
    logger.error("Consulta de pré-renderização falhou — usando conteúdo reduzido", {
      contexto,
      error: error instanceof Error ? error.message : String(error),
    });
    return reserva;
  }
}
