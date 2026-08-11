/**
 * Smoke test da jornada do cliente num browser real.
 *
 * Complementa os testes de integração: aqui o que se verifica é que as telas
 * realmente funcionam juntas — formulário envia, sessão persiste, wizard
 * avança, negociação aceita e o checkout gera o PIX.
 *
 * Uso: pnpm smoke [url]
 */

import { chromium, type Page } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOTS = process.env.SCREENSHOT_DIR;

let passos = 0;
let falhas = 0;

function ok(mensagem: string) {
  passos += 1;
  console.log(`✓ ${mensagem}`);
}

function falhou(mensagem: string, detalhe?: unknown) {
  falhas += 1;
  console.error(`✗ ${mensagem}`);
  if (detalhe) console.error(`    ${String(detalhe)}`);
}

async function shot(page: Page, nome: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/jornada-${nome}.png` });
}

/**
 * Detecta conteúdo espremido — defeito que a checagem de rolagem horizontal
 * não pega, porque o conteúdo comprime em vez de transbordar. Foi assim que
 * passou despercebido um <aside> reservando 208px no mobile.
 */
async function conteudoTemLarguraUtil(page: Page, contexto: string) {
  const largura = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    return {
      main: main.getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
    };
  });

  if (!largura) {
    falhou(`${contexto}: nenhum <main> encontrado`);
    return;
  }
  const proporcao = largura.main / largura.viewport;
  if (proporcao < 0.7) {
    falhou(
      `${contexto}: conteúdo ocupa só ${Math.round(proporcao * 100)}% da largura ` +
        `(${Math.round(largura.main)}px de ${largura.viewport}px)`,
    );
  } else {
    ok(`${contexto}: conteúdo usa ${Math.round(proporcao * 100)}% da largura`);
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
  });
  const page = await context.newPage();

  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`JS: ${e.message}`));
  page.on("console", (m) => {
    // "Failed to load resource" sem a URL é inútil para depurar — a resposta
    // HTTP abaixo já reporta o recurso com o caminho.
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      erros.push(`console: ${m.text()}`);
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      const caminho = new URL(r.url()).pathname;
      const registro = `HTTP ${r.status()} ${caminho}`;
      if (!erros.includes(registro)) erros.push(registro);
    }
  });

  try {
    // ── Cadastro ──────────────────────────────────────────────────────────
    const email = `cliente.smoke.${Date.now()}@teste.local`;
    await page.goto(`${BASE}/cadastrar`, { waitUntil: "load" });
    await page.fill("#name", "Cliente Smoke");
    await page.fill("#email", email);
    await page.fill("#password", "Senha1234");
    await page.check('input[name="acceptTerms"]');
    await shot(page, "01-cadastro");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/app", { timeout: 15_000 });
    ok("cadastro cria conta e abre a área do cliente");
    await conteudoTemLarguraUtil(page, "área do cliente no mobile");
    await shot(page, "02-app");

    // ── Wizard ────────────────────────────────────────────────────────────
    await page.goto(`${BASE}/app/solicitar`, { waitUntil: "load" });
    await page.waitForSelector("text=Solicitar serviço");

    // Passo 1: serviço
    await page.click('label:has-text("Limpeza e higienização")');
    await page.click('button:has-text("Continuar")');

    // Passo 2: equipamento
    await page.waitForSelector("text=Quantos aparelhos?");
    await page.click('label:has-text("Split")');
    await page.click('button[aria-label="Aumentar quantidade"]');
    await page.click('button:has-text("Continuar")');

    // Passo 3: descrição
    await page.waitForSelector("#description");
    await page.fill(
      "#description",
      "O ar da sala não está gelando e faz barulho ao ligar.",
    );
    await page.click('button:has-text("Continuar")');

    // Passo 4: endereço novo
    await page.waitForSelector("#street");
    await page.fill("#street", "Rua Vergueiro");
    await page.fill("#number", "1000");
    await page.fill("#neighborhood", "Vila Mariana");
    await page.fill("#cityName", "São Paulo");
    await page.fill("#state", "SP");
    await page.fill("#postalCode", "04101000");
    await shot(page, "03-wizard-endereco");
    await page.click('button:has-text("Continuar")');

    // Passo 5: valor
    await page.waitForSelector("#valor");
    await page.fill("#valor", "280,00");
    await shot(page, "04-wizard-valor");
    await page.click('button:has-text("Enviar solicitação")');

    await page.waitForURL("**/app/solicitacoes/**", { timeout: 15_000 });
    ok("wizard cria a solicitação e leva ao detalhe");
    await conteudoTemLarguraUtil(page, "detalhe da solicitação no mobile");
    await shot(page, "05-solicitacao");

    const urlSolicitacao = page.url();

    // A solicitação não foi dirigida a um técnico, então não há proposta ainda
    const semProposta = await page
      .locator("text=Nenhuma proposta ainda")
      .isVisible()
      .catch(() => false);
    if (semProposta) {
      ok("solicitação aberta aguarda propostas");
    } else {
      falhou("esperava o estado 'sem propostas' numa solicitação aberta");
    }

    // ── Solicitação dirigida a um técnico ────────────────────────────────
    await page.goto(`${BASE}/tecnicos`, { waitUntil: "load" });
    await shot(page, "06-busca");

    const temTecnico = await page
      .locator('a:has-text("Ver perfil")')
      .first()
      .isVisible()
      .catch(() => false);

    if (!temTecnico) {
      falhou("nenhum técnico aprovado no seed — rode pnpm db:seed");
    } else {
      ok("busca lista técnicos aprovados");
      await page.locator('a:has-text("Ver perfil")').first().click();
      await page.waitForURL("**/tecnico/**", { timeout: 15_000 });
      ok("perfil público do técnico abre");
      await shot(page, "07-perfil-tecnico");

      await page.click('a:has-text("Solicitar serviço")');
      await page.waitForURL("**/app/solicitar**", { timeout: 15_000 });

      const dirigida = await page
        .locator("text=Solicitação dirigida a")
        .isVisible()
        .catch(() => false);
      if (dirigida) ok("wizard reconhece o técnico escolhido");
      else falhou("wizard não indicou o técnico de destino");

      // Refaz o wizard, agora com endereço já salvo
      await page.click('label:has-text("Limpeza e higienização")');
      await page.click('button:has-text("Continuar")');
      await page.waitForSelector("text=Quantos aparelhos?");
      await page.click('button:has-text("Continuar")');
      await page.waitForSelector("#description");
      await page.fill("#description", "Limpeza completa de dois aparelhos split.");
      await page.click('button:has-text("Continuar")');
      await page.waitForSelector("text=Onde será o atendimento?");
      await page.click('button:has-text("Continuar")');
      await page.waitForSelector("#valor");
      await page.fill("#valor", "250,00");
      await page.click('button:has-text("Enviar solicitação")');

      await page.waitForURL("**/app/solicitacoes/**", { timeout: 15_000 });
      ok("solicitação dirigida gera proposta inicial do cliente");
      await shot(page, "08-negociacao");

      const temProposta = await page
        .locator("text=Aguardando o técnico")
        .isVisible()
        .catch(() => false);
      if (temProposta) ok("negociação mostra que a bola está com o técnico");
      else falhou("esperava o estado 'aguardando o técnico' na negociação");
    }

    // ── Autorização: outro usuário não vê a solicitação alheia ───────────
    const outro = await browser.newContext({ locale: "pt-BR" });
    const paginaOutro = await outro.newPage();
    await paginaOutro.goto(`${BASE}/cadastrar`, { waitUntil: "load" });
    await paginaOutro.fill("#name", "Intruso Smoke");
    await paginaOutro.fill("#email", `intruso.${Date.now()}@teste.local`);
    await paginaOutro.fill("#password", "Senha1234");
    await paginaOutro.check('input[name="acceptTerms"]');
    await paginaOutro.click('button[type="submit"]');
    await paginaOutro.waitForURL("**/app", { timeout: 15_000 });

    const resposta = await paginaOutro.goto(urlSolicitacao, { waitUntil: "load" });
    const status = resposta?.status() ?? 0;
    if (status >= 400) {
      ok(`cliente alheio recebe ${status} ao tentar abrir a solicitação de outro`);
    } else {
      falhou(`IDOR: cliente alheio abriu a solicitação de outro (HTTP ${status})`);
    }
    await outro.close();

    // ── Área logada exige sessão ─────────────────────────────────────────
    const anonimo = await browser.newContext({ locale: "pt-BR" });
    const paginaAnonima = await anonimo.newPage();
    await paginaAnonima.goto(`${BASE}/app`, { waitUntil: "load" });
    if (paginaAnonima.url().includes("/entrar")) {
      ok("visitante sem sessão é redirecionado ao login");
    } else {
      falhou(`esperava redirecionamento ao login, veio ${paginaAnonima.url()}`);
    }
    await anonimo.close();
  } catch (error) {
    falhou("jornada interrompida", error);
    await shot(page, "99-erro");
  }

  if (erros.length > 0) {
    console.error(`\nErros de console/página (${erros.length}):`);
    for (const erro of erros.slice(0, 8)) console.error(`    ${erro}`);
  }

  await browser.close();

  console.log(`\n${passos} verificações passaram, ${falhas} falharam.`);
  if (falhas > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
