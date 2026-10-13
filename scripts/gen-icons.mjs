// Gera os PNGs do ícone da extensão sem dependências externas.
// Desenho: duas "abas" arredondadas sobrepostas (ideia de duplicata) sobre
// um quadrado arredondado indigo.
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

/** Cor (r,g,b,a) de um ponto do desenho, em coordenadas 0..1. */
function sample(x, y) {
  let color = [0, 0, 0];
  let alpha = 0;

  const paint = (inside, rgb, strength = 1) => {
    if (!inside) return;
    color = rgb;
    alpha = strength;
  };

  // Fundo: quadrado arredondado.
  paint(sdRoundRect(x, y, 0.03, 0.03, 0.97, 0.97, 0.22) < 0, BG);
  // Aba de trás (branco suave).
  if (sdRoundRect(x, y, 0.2, 0.16, 0.63, 0.59, 0.09) < 0) {
    color = [
      Math.round(BG[0] + (WHITE[0] - BG[0]) * 0.55),
      Math.round(BG[1] + (WHITE[1] - BG[1]) * 0.55),
      Math.round(BG[2] + (WHITE[2] - BG[2]) * 0.55),
    ];
    alpha = 1;
  }
  // Recorte indigo em volta da aba da frente, para separar as duas.
  paint(sdRoundRect(x, y, 0.33, 0.33, 0.85, 0.85, 0.12) < 0, BG);
  // Aba da frente (branco sólido).
  paint(sdRoundRect(x, y, 0.38, 0.38, 0.8, 0.8, 0.09) < 0, WHITE);

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
