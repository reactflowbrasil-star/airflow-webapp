/**
 * Gera os ícones do PWA a partir do símbolo da marca (§46).
 *
 * Fonte: public/brand/empurrao-digital-simbolo.png — o "E" da Empurrão
 * Digital recortado do logo horizontal. Execução manual: pnpm icons
 * Os PNGs resultantes são versionados em public/icons — o build não depende
 * de sharp nem de rede.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const PUBLIC_DIR = resolve(import.meta.dirname, "../public");
const OUT_DIR = resolve(PUBLIC_DIR, "icons");
const SIMBOLO = resolve(PUBLIC_DIR, "brand/empurrao-digital-simbolo.png");

/**
 * Fundo branco, não transparente: o símbolo tem círculo preto, e numa aba ou
 * launcher escuros ele sumiria sobre transparência.
 */
const FUNDO = "#ffffff";

/** Símbolo centralizado num quadrado branco; `margem` é fração do lado. */
async function icone(lado: number, margem: number, raio = 0): Promise<Buffer> {
  const interno = Math.round(lado * (1 - margem * 2));
  const simbolo = await sharp(SIMBOLO).resize(interno, interno).toBuffer();
  const base = raio
    ? sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${raio}" fill="${FUNDO}"/></svg>`,
        ),
      )
    : sharp({ create: { width: lado, height: lado, channels: 4, background: FUNDO } });
  return base
    .composite([{ input: simbolo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: "icon-192.png", size: 192, margem: 0.1 },
    { file: "icon-512.png", size: 512, margem: 0.1 },
    // Maskable exige margem de segurança maior: o SO recorta as bordas.
    { file: "icon-maskable-512.png", size: 512, margem: 0.22 },
    { file: "apple-touch-icon.png", size: 180, margem: 0.12 },
  ];

  for (const target of targets) {
    await writeFile(resolve(OUT_DIR, target.file), await icone(target.size, target.margem));
    console.log(`  ${target.file} (${target.size}×${target.size})`);
  }

  // O caminho /favicon.svg continua existindo: o service worker faz precache
  // dele e a instalação inteira falha se um item do precache der 404. O
  // símbolo é raster, então vai embutido no SVG.
  const png = await icone(64, 0.06, 14);
  await writeFile(
    resolve(PUBLIC_DIR, "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${png.toString("base64")}"/></svg>\n`,
  );
  console.log("  favicon.svg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
