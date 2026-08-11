/**
 * Verificação de layout responsivo (§47, §62).
 *
 * Falha se houver rolagem horizontal em qualquer viewport — o defeito mais
 * comum e mais visível em PWA mobile-first. Também captura screenshots para
 * inspeção manual.
 *
 * Uso: pnpm check:layout [url]
 */

import { chromium, devices } from "playwright";

const BASE_URL = process.argv[2] ?? "http://127.0.0.1:3100";
/** Opcional: diretório para salvar screenshots de inspeção. */
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 780 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

/** Todas as páginas públicas — as logadas ficam a cargo do smoke, que tem sessão. */
const PATHS = [
  "/",
  "/tecnicos",
  "/servicos",
  "/seja-prestador",
  "/como-funciona",
  "/seguranca",
  "/termos",
  "/privacidade",
  "/entrar",
  "/cadastrar",
  "/offline",
];

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  let failures = 0;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      userAgent: devices["Pixel 7"].userAgent,
      locale: "pt-BR",
    });
    const page = await context.newPage();

    for (const path of PATHS) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const viewWidth = document.documentElement.clientWidth;
        if (docWidth <= viewWidth) return null;

        // Identifica os culpados para o erro ser acionável
        const offenders: string[] = [];
        for (const el of document.querySelectorAll("*")) {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewWidth + 1 || rect.left < -1) {
            const tag = el.tagName.toLowerCase();
            const cls =
              typeof el.className === "string" ? el.className.slice(0, 70) : "";
            offenders.push(`${tag}.${cls} → right=${Math.round(rect.right)}`);
          }
        }
        return { docWidth, viewWidth, offenders: offenders.slice(0, 6) };
      });

      if (SCREENSHOT_DIR) {
        const slug = path === "/" ? "home" : path.replace(/\//g, "-").slice(1);
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${slug}-${viewport.name}.png`,
        });
      }

      if (overflow) {
        failures += 1;
        console.error(
          `✗ ${viewport.name} ${path}: rolagem horizontal ` +
            `(${overflow.docWidth}px > ${overflow.viewWidth}px)`,
        );
        for (const offender of overflow.offenders) {
          console.error(`    ${offender}`);
        }
      } else {
        console.log(`✓ ${viewport.name} ${path}`);
      }
    }

    await context.close();
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} viewport(s) com rolagem horizontal.`);
    process.exit(1);
  }
  console.log("\nLayout responsivo sem rolagem horizontal.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
