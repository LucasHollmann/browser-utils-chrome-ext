// Gera os PNGs do ícone da extensão sem dependências externas.
// Desenho: uma janela de navegador com uma engrenagem no canto, sobre um
// quadrado arredondado indigo - as utilidades do navegador.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT_DIR = process.argv[2];
if (!OUT_DIR) throw new Error('uso: node gen-icons.mjs <dir-de-saida>');

const BG = [79, 70, 229]; // #4F46E5
const WHITE = [255, 255, 255];

/** Distância assinada a um retângulo arredondado (negativa = dentro). */
function sdRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const dx = Math.abs(px - cx) - hx;
  const dy = Math.abs(py - cy) - hy;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}

/** Dentro de um círculo? */
function inCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) < r;
}

/**
 * Dentro de uma engrenagem?
 *
 * Disco de raio `root` com `teeth` dentes até `outer` (metade de cada período
 * angular é dente, metade é vale) e um furo central de raio `hole`.
 */
function inGear(x, y, cx, cy, outer, root, teeth, hole) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= outer || d < hole) return false;
  if (d <= root) return true;
  return Math.cos(Math.atan2(dy, dx) * teeth) > 0;
}

/** Mistura de duas cores, `t` em 0..1. */
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const TOOLBAR = mix(BG, WHITE, 0.4);

/** Cor (r,g,b,a) de um ponto do desenho, em coordenadas 0..1. */
function sample(x, y) {
  let color = [0, 0, 0];
  let alpha = 0;

  const paint = (inside, rgb) => {
    if (!inside) return;
    color = rgb;
    alpha = 1;
  };

  // Fundo: quadrado arredondado.
  paint(sdRoundRect(x, y, 0.03, 0.03, 0.97, 0.97, 0.22) < 0, BG);

  // Janela do navegador.
  paint(sdRoundRect(x, y, 0.14, 0.18, 0.76, 0.68, 0.08) < 0, WHITE);
  // Barra de ferramentas, com a aba ativa destacada à esquerda.
  paint(sdRoundRect(x, y, 0.14, 0.18, 0.76, 0.33, 0.08) < 0, TOOLBAR);
  paint(sdRoundRect(x, y, 0.19, 0.21, 0.42, 0.33, 0.03) < 0, WHITE);

  // Recorte indigo em volta da engrenagem, para separá-la da janela.
  paint(inCircle(x, y, 0.71, 0.72, 0.31), BG);
  // Engrenagem.
  paint(inGear(x, y, 0.71, 0.72, 0.27, 0.215, 8, 0.085), WHITE);

  return [color[0], color[1], color[2], Math.round(alpha * 255)];
}

const SS = 4; // supersampling (anti-aliasing)

function renderRGBA(size) {
  const data = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = sample(
            (px + (sx + 0.5) / SS) / size,
            (py + (sy + 0.5) / SS) / size,
          );
          const w = sa / 255;
          r += sr * w;
          g += sg * w;
          b += sb * w;
          a += sa;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const weight = alpha / 255 || 1;
      const i = (py * size + px) * 4;
      data[i] = Math.round(r / n / weight);
      data[i + 1] = Math.round(g / n / weight);
      data[i + 2] = Math.round(b / n / weight);
      data[i + 3] = Math.round(alpha);
    }
  }
  return data;
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  const file = join(OUT_DIR, `${size}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePNG(size, renderRGBA(size)));
  console.log('gerado', file);
}
