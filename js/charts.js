/**
 * Gráficos em SVG, calculados a partir dos dados reais.
 */
import { esc } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------------ */
/* Anel (gráfico circular segmentado)                                        */
/* ------------------------------------------------------------------------ */

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 102;
const STROKE = 18;
const GAP = 6; // espaço visível entre as pontas arredondadas de dois segmentos
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Distribui a circunferência entre os segmentos, proporcionalmente aos valores.
 *
 * Cada segmento recebe um arco exatamente proporcional ao seu valor. A única
 * exceção são valores minúsculos: eles recebem um arco mínimo (o suficiente
 * para aparecer como um ponto) e os demais encolhem na mesma proporção. As
 * porcentagens exibidas em texto continuam exatas.
 */
export function layoutDonut(values, circumference = CIRCUMFERENCE) {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [circumference];
  const minSpan = Math.min(STROKE + GAP + 2, circumference / n);
  const fixed = new Array(n).fill(false);
  let spans = [];
  for (let pass = 0; pass <= n; pass += 1) {
    const fixedCount = fixed.filter(Boolean).length;
    const freeTotal = values.reduce((sum, v, i) => (fixed[i] ? sum : sum + v), 0);
    const freeLength = circumference - fixedCount * minSpan;
    spans = values.map((v, i) => {
      if (fixed[i]) return minSpan;
      return freeTotal > 0 ? (v / freeTotal) * freeLength : 0;
    });
    let changed = false;
    spans.forEach((span, i) => {
      if (!fixed[i] && span < minSpan) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return spans;
}

/**
 * Cria o anel dentro de um <svg>. Os segmentos são reaproveitados entre
 * atualizações (pela chave da categoria) para que as mudanças sejam animadas.
 */
export function createDonut(svg) {
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('class', 'donut-track');
  track.setAttribute('cx', CENTER);
  track.setAttribute('cy', CENTER);
  track.setAttribute('r', RADIUS);
  const group = document.createElementNS(SVG_NS, 'g');
  // O traçado de um <circle> começa às 3h; girando −90° ele começa às 12h, em sentido horário.
  group.setAttribute('transform', `rotate(-90 ${CENTER} ${CENTER})`);
  svg.append(track, group);

  const segments = new Map();

  function createSegment() {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('class', 'donut-seg');
    el.setAttribute('cx', CENTER);
    el.setAttribute('cy', CENTER);
    el.setAttribute('r', RADIUS);
    return el;
  }

  /**
   * items: [{ key, value, color }] — valores em centavos, já ordenados.
   * Devolve a geometria de cada segmento ({ key, color, share, angle }),
   * usada pela aura para emitir luz a partir do lugar certo do anel.
   */
  function update(items) {
    const data = items.filter((item) => item.value > 0);
    svg.classList.toggle('is-empty', data.length === 0);
    const spans = layoutDonut(data.map((item) => item.value));
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const seen = new Set();
    const geometry = [];
    let cursor = 0;
    let newcomers = 0;

    data.forEach((item, index) => {
      const span = spans[index];
      let dash;
      let offset;
      let cap = 'round';
      if (data.length === 1) {
        dash = CIRCUMFERENCE + 1;
        offset = 0;
        cap = 'butt';
      } else {
        // A ponta arredondada avança STROKE/2 além do traço em cada extremidade.
        const body = span - GAP - STROKE;
        if (body > 0.5) {
          dash = body;
          offset = cursor + GAP / 2 + STROKE / 2;
        } else {
          dash = 0.01; // vira um ponto do diâmetro do traço
          offset = cursor + span / 2;
        }
      }

      let el = segments.get(item.key);
      if (!el) {
        el = createSegment();
        group.append(el);
        segments.set(item.key, el);
        // Nasce como um ponto no meio do próprio arco e cresce até o tamanho final;
        // os segmentos novos entram em sequência, do maior para o menor.
        el.style.strokeDasharray = `0.01 ${CIRCUMFERENCE}`;
        el.style.strokeDashoffset = `${-(offset + dash / 2)}`;
        el.style.stroke = item.color;
        el.style.transitionDelay = `${newcomers * 70}ms`;
        newcomers += 1;
        el.getBoundingClientRect();
        setTimeout(() => { el.style.transitionDelay = ''; }, 1200);
      }
      seen.add(item.key);
      el.style.stroke = item.color;
      el.style.strokeLinecap = cap;
      el.style.strokeDasharray = `${dash} ${CIRCUMFERENCE}`;
      el.style.strokeDashoffset = `${-offset}`;
      geometry.push({
        key: item.key,
        color: item.color,
        share: total > 0 ? item.value / total : 0,
        angle: data.length === 1 ? null : ((cursor + span / 2) / CIRCUMFERENCE) * Math.PI * 2,
      });
      cursor += span;
    });

    for (const [key, el] of segments) {
      if (seen.has(key)) continue;
      segments.delete(key);
      el.style.strokeDasharray = `0.01 ${CIRCUMFERENCE}`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    }
    return geometry;
  }

  return { update };
}

/* ------------------------------------------------------------------------ */
/* Barras verticais (evolução ao longo do tempo)                             */
/* ------------------------------------------------------------------------ */

/**
 * Gera o HTML de um gráfico de barras. As barras são linhas SVG com
 * espessura fixa em pixels (vector-effect), então o gráfico se ajusta à
 * largura disponível sem distorcer as pontas arredondadas. Cada coluna é
 * também um botão acessível que leva ao período correspondente.
 *
 * buckets: [{ label, ariaLabel, totalCents, anchor, selected, current }]
 */
export function barChartHTML(buckets) {
  const n = buckets.length;
  const max = Math.max(...buckets.map((b) => b.totalCents), 0);
  const bars = buckets.map((bucket, i) => {
    if (bucket.totalCents <= 0 || max <= 0) return '';
    const height = Math.max(3, (bucket.totalCents / max) * 88);
    const cls = bucket.selected ? 'bar is-selected' : bucket.current ? 'bar is-current' : 'bar';
    const x = i + 0.5;
    return `<line class="${cls}" style="--i:${i}" x1="${x}" x2="${x}" y1="104" y2="${100 - height}" vector-effect="non-scaling-stroke"/>`;
  }).join('');

  const columns = buckets.map((bucket) => `
    <button type="button" class="bars-col${bucket.selected ? ' is-selected' : ''}" data-action="timeline-select"
      data-anchor="${esc(bucket.anchor)}" aria-label="${esc(bucket.ariaLabel)}"${bucket.selected ? ' aria-current="true"' : ''}>
      <span class="bars-label">${esc(bucket.label)}</span>
    </button>`).join('');

  return `
    <div class="bars" data-reveal style="--bar-w:${n >= 10 ? 10 : n >= 8 ? 14 : 18}px">
      <svg class="bars-svg" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><clipPath id="bars-clip"><rect x="0" y="0" width="${n}" height="100"/></clipPath></defs>
        <line class="bars-base" x1="0" x2="${n}" y1="100" y2="100" vector-effect="non-scaling-stroke"/>
        <g clip-path="url(#bars-clip)">${bars}</g>
      </svg>
      <div class="bars-cols">${columns}</div>
    </div>`;
}
