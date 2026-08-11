/**
 * Gera os ícones do PWA a partir de um SVG único (§46).
 *
 * Execução manual: pnpm icons
 * Os PNGs resultantes são versionados em public/icons — o build não depende
 * de sharp nem de rede.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const OUT_DIR = resolve(import.meta.dirname, "../public/icons");

/** Marca: fluxo de ar sobre gradiente azul-petróleo → ciano. */
function logoSvg(size: number, padding: number): string {
  const inner = size - padding * 2;
  const scale = inner / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#123B57"/>
      <stop offset="100%" stop-color="#0B1F30"/>
    </linearGradient>
    <linearGradient id="air" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7FE3EC"/>
      <stop offset="100%" stop-color="#39B4C8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})" fill="url(#air)">
    <path d="M3 7h13a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3V7zm0 5h16a3 3 0 1 1-3 3h2a1 1 0 1 0-1-1H3v-2zm0 5h9a2.5 2.5 0 1 1-2.5 2.5h2A.5.5 0 1 0 12 19H3v-2z"/>
  </g>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: "icon-192.png", size: 192, padding: 34 },
    { file: "icon-512.png", size: 512, padding: 92 },
    // Maskable exige margem de segurança maior: o SO recorta as bordas.
    { file: "icon-maskable-512.png", size: 512, padding: 128 },
    { file: "apple-touch-icon.png", size: 180, padding: 30 },
  ];

  for (const target of targets) {
    const svg = Buffer.from(logoSvg(target.size, target.padding));
    const png = await sharp(svg).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(resolve(OUT_DIR, target.file), png);
    console.log(`  ${target.file} (${target.size}×${target.size})`);
  }

  // Favicon SVG: escala sem perda e é o formato preferido pelos navegadores atuais.
  await writeFile(resolve(OUT_DIR, "../favicon.svg"), logoSvg(32, 4));
  console.log("  favicon.svg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
