import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 exige driver adapter explícito — o client não embute mais o
 * engine Rust. O pool do `pg` é gerenciado pelo adapter.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Verifique o .env.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Instância única: em desenvolvimento o hot reload do Next recriaria o
 * client a cada alteração, esgotando o pool de conexões.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Criação preguiçosa, na primeira consulta — não no import.
 *
 * O `next build` carrega todo route handler para coletar metadados, e um
 * client construído no topo do módulo fazia o build inteiro exigir
 * `DATABASE_URL`. Ou seja: era impossível compilar a imagem sem entregar a
 * credencial de produção ao builder, e um erro de configuração aparecia como
 * "Failed to collect page data" numa rota que nem seria executada ali.
 *
 * O Proxy preserva a API: quem importa continua escrevendo `prisma.user...`
 * e só nesse momento a conexão é resolvida. A mensagem de erro de
 * `DATABASE_URL` ausente continua existindo — passa a aparecer em tempo de
 * execução, quando de fato faz falta.
 */
function obterCliente(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade, receptor) {
    const cliente = obterCliente();
    const valor = Reflect.get(cliente, propriedade, receptor);
    // Métodos como `$transaction` precisam do cliente como `this`.
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
  has: (_alvo, propriedade) => propriedade in obterCliente(),
});
