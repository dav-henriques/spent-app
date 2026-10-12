/**
 * Gera os ícones do app a partir de uma única definição geométrica:
 * um anel segmentado (a mesma linguagem do gráfico da tela inicial) sobre
 * fundo preto.
 *
 * Uso: node tools/generate-icons.mjs   (ou npm run icons)
 *
 * Saída em assets/:
 *   icon.svg                 ícone vetorial (favicon e manifest)
 *   icon-192.png, icon-512.png   ícones do manifest
 *   icon-maskable-512.png    versão "maskable" (o anel fica dentro da zona segura de 80%)
 *   apple-touch-icon.png     180×180, tela de início do iPhone (o iOS arredonda os cantos)
 *   favicon-32.png           favicon em PNG, com cantos arredondados
 *
 * Sem dependências: o PNG é codificado aqui mesmo, com o zlib do Node.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const BACKGROUND = '#090909';
// Proporções relativas ao lado do ícone.
const RING_RADIUS = 0.285;
const RING_STROKE = 0.092;
const RING_GAP = 0.045; // espaço visível entre as pontas arredondadas
const SEGMENTS = [
  { share: 0.40, color: '#F2C14E' },
  { share: 0.25, color: '#4F8BFF' },
  { share: 0.20, color: '#FF5C5C' },
  { share: 0.15, color: '#9D7BFF' },
];

/** Ângulos visíveis de cada segmento (radianos, sentido horário a partir do topo). */
function segmentArcs() {
  const trim = (RING_GAP / 2 + RING_STROKE / 2) / RING_RADIUS;
  let start = 0;
  return SEGMENTS.map((segment) => {
    const span = segment.share * Math.PI * 2;
    const arc = { from: start + trim, to: start + span - trim, color: segment.color };
    start += span;
    return arc;
  });
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/* ----------------------------------------------------------------- SVG */

function buildSVG(size = 512, cornerRadius = 0.225) {
  const c = size / 2;
  const r = RING_RADIUS * size;
  const point = (angle) => [c + r * Math.sin(angle), c - r * Math.cos(angle)].map((v) => v.toFixed(2));
  const paths = segmentArcs().map(({ from, to, color }) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `<path d="M${x1} ${y1}A${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x2} ${y2}" stroke="${color}"/>`;
  }).join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${(cornerRadius * size).toFixed(1)}" fill="${BACKGROUND}"/>
  <g fill="none" stroke-width="${(RING_STROKE * size).toFixed(2)}" stroke-linecap="round">
    ${paths}
  </g>
</svg>
`;
}

/* ---------------------------------------------------------- rasterizador */

/**
 * Desenha o ícone em RGBA. Cada pixel é amostrado em uma grade 5×5
 * (antialiasing). `corner` arredonda o fundo (0 = quadrado inteiro).
 */
function rasterize(size, corner = 0) {
  const SAMPLES = 5;
  const data = new Uint8Array(size * size * 4);
  const c = size / 2;
  const r = RING_RADIUS * size;
  const halfStroke = (RING_STROKE * size) / 2;
  const cornerPx = corner * size;
  const bg = hexToRgb(BACKGROUND);
  const arcs = segmentArcs().map((arc) => ({
    ...arc,
    rgb: hexToRgb(arc.color),
    ends: [arc.from, arc.to].map((a) => [c + r * Math.sin(a), c - r * Math.cos(a)]),
  }));

  const insideBackground = (x, y) => {
    if (cornerPx <= 0) return true;
    const dx = Math.max(cornerPx - x, x - (size - cornerPx), 0);
    const dy = Math.max(cornerPx - y, y - (size - cornerPx), 0);
    return dx * dx + dy * dy <= cornerPx * cornerPx;
  };

  const segmentAt = (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const dist = Math.hypot(dx, dy);
    let angle = Math.atan2(dx, -dy); // 0 no topo, crescendo no sentido horário
    if (angle < 0) angle += Math.PI * 2;
    for (const arc of arcs) {
      let d;
      if (angle >= arc.from && angle <= arc.to) d = Math.abs(dist - r);
      else d = Math.min(...arc.ends.map(([ex, ey]) => Math.hypot(x - ex, y - ey)));
      if (d <= halfStroke) return arc.rgb;
    }
    return null;
  };

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = px + (sx + 0.5) / SAMPLES;
          const y = py + (sy + 0.5) / SAMPLES;
          if (!insideBackground(x, y)) continue;
          const rgb = segmentAt(x, y) ?? bg;
          rs += rgb[0];
          gs += rgb[1];
          bs += rgb[2];
          as += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (as > 0) {
        data[i] = Math.round(rs / as);
        data[i + 1] = Math.round(gs / as);
        data[i + 2] = Math.round(bs / as);
      }
      data[i + 3] = Math.round((as / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return data;
}

/* ------------------------------------------------------------ PNG mínimo */

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGBA → PNG. Com `opaque`, grava RGB (sem canal alfa), como o iOS prefere. */
function encodePNG(size, rgba, { opaque = false } = {}) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * channels + 1);
    raw[row] = 0; // filtro "None"
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = row + 1 + x * channels;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      if (!opaque) raw[dst + 3] = rgba[src + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = opaque ? 2 : 6; // RGB ou RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- saída */

mkdirSync(OUT, { recursive: true });

const outputs = [
  { file: 'icon-192.png', size: 192, opaque: true },
  { file: 'icon-512.png', size: 512, opaque: true },
  { file: 'icon-maskable-512.png', size: 512, opaque: true },
  { file: 'apple-touch-icon.png', size: 180, opaque: true },
  { file: 'favicon-32.png', size: 32, corner: 0.225 },
];

writeFileSync(join(OUT, 'icon.svg'), buildSVG());
console.log('assets/icon.svg');
for (const { file, size, opaque = false, corner = 0 } of outputs) {
  writeFileSync(join(OUT, file), encodePNG(size, rasterize(size, corner), { opaque }));
  console.log(`assets/${file} (${size}×${size})`);
}
