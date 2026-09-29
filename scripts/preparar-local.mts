/**
 * Prepara o AirFlow para rodar no próprio computador — Windows, macOS ou Linux.
 * Execução: pnpm local:preparar (passo a passo em docs/LOCAL.md)
 *
 * 1. Cria o .env com segredos sorteados, se ainda não existir.
 * 2. Espera o PostgreSQL aceitar conexão (o do `compose.yaml` ou outro).
 * 3. Aplica as migrations e roda o seed (catálogo e contas de demonstração).
 *
 * Em Node, e não em PowerShell ou bash, para ser um script só em qualquer
 * sistema — e para poder ser testado num ambiente que não tem Windows.
 * Pode rodar de novo quando quiser: nada é sobrescrito nem duplicado.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

import { parse } from "dotenv";

import { origemPublica } from "../src/lib/origem-publica";

const RAIZ = resolve(import.meta.dirname, "..");
const ARQUIVO_ENV = resolve(RAIZ, ".env");
const PRAZO_BANCO_MS = 90_000;

function falhar(mensagem: string): never {
  console.error(`\n✗ ${mensagem}`);
  process.exit(1);
}

function esperar(ms: number): Promise<void> {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

function segredo(): string {
  return randomBytes(48).toString("base64url");
}

/**
 * Só o que roda localmente, e só em ASCII: acento em arquivo de ambiente já
 * quebrou o `next build` (AGENTS.md, Defeitos). 127.0.0.1 em vez de localhost
 * porque o `compose.yaml` só escuta em IPv4, e localhost pode resolver para ::1.
 */
function conteudoEnv(porta: string, publica: string | null): string {
  return [
    "# Gerado por pnpm local:preparar para rodar no proprio computador.",
    "# Segredos sorteados nesta maquina: nunca use estes valores em producao.",
    `DATABASE_URL="postgresql://airflow:airflow@127.0.0.1:${porta}/airflow"`,
    `AUTH_SECRET="${segredo()}"`,
    'PAYMENT_PROVIDER="sandbox"',
    `SANDBOX_WEBHOOK_SECRET="${segredo()}"`,
    `BACKEND_WEBHOOK_SECRET="${segredo()}"`,
    // No Codespaces, a origem pública fica gravada para o servidor aceitá-la
    // mesmo que o processo dele não herde as variáveis do codespace.
    ...(publica ? [`ORIGEM_PUBLICA="${publica}"`] : []),
    "",
  ].join("\n");
}

function prepararEnv(): Record<string, string> {
  if (existsSync(ARQUIVO_ENV)) {
    console.log("• .env já existe: mantido como está.");
  } else {
    writeFileSync(ARQUIVO_ENV, conteudoEnv(process.env.AIRFLOW_DB_PORTA || "5432", origemPublica()));
    console.log("• .env criado, com segredos sorteados nesta máquina.");
  }

  const env = parse(readFileSync(ARQUIVO_ENV));
  if (!env.DATABASE_URL) {
    falhar("O .env não tem DATABASE_URL. Apague o .env e rode de novo, ou preencha a variável.");
  }
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    falhar("O .env precisa de AUTH_SECRET com ao menos 32 caracteres. Apague o .env e rode de novo.");
  }
  return env;
}

function portaAberta(host: string, porta: number): Promise<boolean> {
  return new Promise((pronto) => {
    const socket = connect({ host, port: porta });
    const fim = (aberta: boolean) => {
      socket.destroy();
      pronto(aberta);
    };
    socket.setTimeout(2000, () => fim(false));
    socket.once("connect", () => fim(true));
    socket.once("error", () => fim(false));
  });
}

async function esperarBanco(urlBanco: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlBanco);
  } catch {
    falhar("DATABASE_URL do .env não é uma URL válida.");
  }
  const host = url.hostname || "127.0.0.1";
  const porta = Number(url.port || 5432);

  process.stdout.write(`• Esperando o PostgreSQL em ${host}:${porta}`);
  const prazo = Date.now() + PRAZO_BANCO_MS;
  while (Date.now() < prazo) {
    if (await portaAberta(host, porta)) {
      console.log(" ok.");
      return;
    }
    process.stdout.write(".");
    await esperar(2000);
  }
  console.log();
  falhar(
    `Nenhum PostgreSQL respondeu em ${host}:${porta} em ${PRAZO_BANCO_MS / 1000} s. ` +
      'O Docker Desktop está aberto? Rode "docker compose up -d" e tente de novo.',
  );
}

/**
 * No Windows, o pnpm é um `.cmd`, e o Node recusa executar `.cmd` sem shell
 * (correção de segurança CVE-2024-27980). Os argumentos aqui são fixos, sem
 * nada vindo de fora, então passar pelo shell não abre injeção.
 */
function pnpm(descricao: string, args: string[]): boolean {
  console.log(`• ${descricao}...`);
  const resultado = spawnSync("pnpm", args, {
    cwd: RAIZ,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return resultado.status === 0;
}

async function main() {
  const versaoNode = Number(process.versions.node.split(".")[0]);
  if (versaoNode < 24) {
    console.warn(`! Node ${process.versions.node} detectado; o projeto pede o Node 24 ou mais novo.`);
  }

  const env = prepararEnv();
  await esperarBanco(env.DATABASE_URL);

  // Logo depois de o contêiner subir, o PostgreSQL pode aceitar a conexão e
  // ainda responder "the database system is starting up". Três tentativas.
  for (let tentativa = 1; ; tentativa++) {
    if (pnpm("Aplicando as migrations", ["exec", "prisma", "migrate", "deploy"])) break;
    if (tentativa === 3) falhar("As migrations falharam: veja a mensagem acima.");
    await esperar(3000);
  }

  if (!pnpm("Criando catálogo e contas de demonstração (seed)", ["db:seed"])) {
    falhar("O seed falhou: veja a mensagem acima.");
  }

  const endereco = origemPublica(env) ?? origemPublica() ?? `http://localhost:${process.env.PORT || "3000"}`;
  console.log(`
✓ Pronto. Para abrir o app:

    pnpm dev

  e acesse ${endereco}/entrar
  Admin de teste: admin@airflow.local / Demo1234 (menu "Estúdio de marketing")
`);
}

main().catch((erro: unknown) => {
  falhar(erro instanceof Error ? erro.message : String(erro));
});
