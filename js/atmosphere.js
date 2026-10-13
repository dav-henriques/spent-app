/**
 * Atmosfera e movimento.
 *
 * - Aura de gastos: cada segmento do anel emite luz na cor da sua categoria,
 *   com intensidade proporcional à fatia. O clima da tela é o próprio dado.
 * - Números que rolam até o novo valor quando o período ou os dados mudam.
 * - Cabeçalho compacto (vidro) que aparece quando o título grande sai da tela,
 *   com parallax suave nos elementos marcados.
 * - Revelações disparadas quando um gráfico entra na tela.
 * - Brilho que acompanha o ponteiro em telas com mouse.
 *
 * Tudo usa transform/opacity (camadas aceleradas) e respeita
 * prefers-reduced-motion.
 */
import { prefersReducedMotion, softColor } from './ui.js';

/* ------------------------------------------------------------------------ */
/* Aura                                                                      */
/* ------------------------------------------------------------------------ */

const MAX_GLOWS = 5;

/**
 * Cria a aura dentro de `anchor` (um ponto de tamanho zero no centro do anel).
 * update(items, radiusPx): items = [{ key, color, share, angle }], com o
 * ângulo do meio do segmento em radianos (0 = topo, sentido horário).
 */
export function createAura(anchor) {
  const glows = new Map();
  const ambient = document.createElement('span');
  ambient.className = 'aura-glow aura-ambient';
  anchor.append(ambient);

  function glowFor(key) {
    let el = glows.get(key);
    if (!el) {
      el = document.createElement('span');
      el.className = 'aura-glow';
      el.style.opacity = '0';
      anchor.append(el);
      glows.set(key, el);
    }
    return el;
  }

  function update(items, radius) {
    const visible = items.slice(0, MAX_GLOWS);
    const seen = new Set();
    visible.forEach((item) => {
      const el = glowFor(item.key);
      seen.add(item.key);
      // A luz nasce sobre o próprio segmento e se espalha para fora do anel.
      // Uma categoria só ocupa o anel inteiro: a luz o envolve por igual.
      const whole = item.angle === null;
      const distance = whole ? 0 : radius * 1.04;
      const x = whole ? 0 : Math.sin(item.angle) * distance;
      const y = whole ? 0 : -Math.cos(item.angle) * distance;
      const scale = whole ? 1.8 : 0.7 + 0.9 * Math.sqrt(item.share);
      const alpha = Math.min(0.62, 0.36 + 0.34 * item.share);
      el.style.setProperty('--glow', softColor(item.color, alpha));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      el.style.opacity = '1';
    });
    for (const [key, el] of glows) {
      if (seen.has(key)) continue;
      glows.delete(key);
      el.style.opacity = '0';
      el.style.transform += ' scale(0.4)';
      setTimeout(() => el.remove(), 900);
    }
    // Luz ambiente: a cor dominante tinge levemente a tela inteira.
    const lead = items[0];
    ambient.style.setProperty('--glow', lead ? softColor(lead.color, 0.2) : 'rgba(142, 142, 147, 0.08)');
  }

  return { update };
}

/* ------------------------------------------------------------------------ */
/* Números que rolam                                                         */
/* ------------------------------------------------------------------------ */

const running = new WeakMap();
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Anima um valor inteiro (centavos) de `from` até `to`, chamando
 * render(valor) a cada quadro. Uma nova chamada para o mesmo elemento
 * cancela a anterior e parte do valor exibido no momento.
 */
export function rollNumber(el, from, to, render, duration = 900) {
  const previous = running.get(el);
  if (previous) cancelAnimationFrame(previous.frame);
  const start = previous ? previous.current : from;
  if (prefersReducedMotion() || start === to) {
    running.delete(el);
    render(to);
    return;
  }
  const state = { current: start, frame: 0 };
  running.set(el, state);
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    state.current = Math.round(start + (to - start) * easeOutExpo(t));
    render(state.current);
    if (t < 1) state.frame = requestAnimationFrame(step);
    else running.delete(el);
  };
  state.frame = requestAnimationFrame(step);
}

/* ------------------------------------------------------------------------ */
/* Cabeçalho compacto e parallax                                             */
/* ------------------------------------------------------------------------ */

let topbarTitle;
let topbarDetail;
let titleObserver = null;
let parallaxItems = [];
let ticking = false;

export function setTopbar(title, detail = '') {
  if (!topbarTitle) return;
  if (topbarTitle.textContent !== title) topbarTitle.textContent = title;
  if (topbarDetail.textContent !== detail) topbarDetail.textContent = detail;
}

/**
 * Liga o cabeçalho compacto e o parallax à tela visível: o cabeçalho de
 * vidro aparece quando o título grande passa por baixo dele.
 */
export function bindView(viewEl) {
  const root = document.documentElement;
  titleObserver?.disconnect();
  const title = viewEl.querySelector('[data-large-title]');
  if (title && 'IntersectionObserver' in window) {
    // A faixa do cabeçalho compacto (área segura + 44 px) conta como "fora da tela".
    const band = document.querySelector('.topbar')?.offsetHeight || 56;
    titleObserver = new IntersectionObserver(([entry]) => {
      if (root.classList.contains('has-sheet')) return;
      root.classList.toggle('is-scrolled', !entry.isIntersecting && entry.boundingClientRect.top < band);
    }, { rootMargin: `-${band}px 0px 0px 0px`, threshold: 0 });
    titleObserver.observe(title);
  } else {
    root.classList.remove('is-scrolled');
  }
  parallaxItems = [...viewEl.querySelectorAll('[data-parallax]')].map((el) => ({
    el,
    speed: Number(el.dataset.parallax) || 0,
    fade: Number(el.dataset.fade) || 0,
  }));
  applyParallax();
}

function applyParallax() {
  ticking = false;
  if (document.documentElement.classList.contains('has-sheet')) return;
  const y = Math.max(0, window.scrollY);
  const still = prefersReducedMotion();
  for (const { el, speed, fade } of parallaxItems) {
    el.style.transform = still || !speed ? '' : `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
    if (fade) el.style.opacity = still ? '' : String(Math.max(0, 1 - y / fade).toFixed(3));
  }
}

/* ------------------------------------------------------------------------ */
/* Revelações ao entrar na tela                                              */
/* ------------------------------------------------------------------------ */

let revealObserver = null;

/** Elementos com [data-reveal] ganham .is-revealed quando entram na tela (uma vez). */
export function observeReveals(root) {
  const items = root.querySelectorAll('[data-reveal]:not(.is-revealed)');
  if (!items.length) return;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-revealed'));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      revealObserver.unobserve(entry.target);
    }
  }, { threshold: 0.2 });
  items.forEach((el) => revealObserver.observe(el));
}

/* ------------------------------------------------------------------------ */
/* Brilho que segue o ponteiro (somente mouse/trackpad)                      */
/* ------------------------------------------------------------------------ */

function initPointerGlow() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let last = null;
  let scheduled = false;
  document.addEventListener('pointermove', (event) => {
    last = event;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const target = last.target?.closest?.('.card, .metric, [data-glow]');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${Math.round(last.clientX - rect.left)}px`);
      target.style.setProperty('--my', `${Math.round(last.clientY - rect.top)}px`);
    });
  }, { passive: true });
}

/* ------------------------------------------------------------------------ */
/* Inicialização                                                             */
/* ------------------------------------------------------------------------ */

export function initAtmosphere() {
  topbarTitle = document.querySelector('.topbar-title');
  topbarDetail = document.querySelector('.topbar-detail');
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(applyParallax);
  }, { passive: true });
  initPointerGlow();
}
