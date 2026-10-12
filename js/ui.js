/**
 * Componentes de interface reutilizáveis: painel inferior (sheet), mensagens
 * de feedback (toast), confirmação em dois toques, controles de período,
 * item de despesa e estado vazio.
 */
import { formatMoney } from './money.js';
import { capitalize, formatPeriodLabel, isDateInRange } from './dates.js';

/* ------------------------------------------------------------------------ */
/* Utilitários                                                               */
/* ------------------------------------------------------------------------ */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto do usuário antes de inseri-lo em HTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const icon = (name, cls = '') =>
  `<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

/** "#F2C14E" → "rgba(242, 193, 78, 0.2)" — usado em fundos suaves de categoria. */
export function softColor(hex, alpha = 0.18) {
  const value = Number.parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(value)) return `rgba(142, 142, 147, ${alpha})`;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Estilo inline com a cor da categoria (cores já validadas como #RRGGBB). */
export const colorStyle = (color) => `--c:${esc(color)};--c-soft:${softColor(color)}`;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reinicia uma animação CSS de entrada (troca de período, item novo, etc.). */
export function replayAnimation(el, className) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/* ------------------------------------------------------------------------ */
/* Componentes em HTML                                                       */
/* ------------------------------------------------------------------------ */

export function expenseRowHTML(expense, category, { meta = '', flash = false } = {}) {
  return `
    <li class="expense-item${flash ? ' is-flash' : ''}">
      <button type="button" class="expense" data-action="edit-expense" data-id="${esc(expense.id)}" style="${colorStyle(category.color)}">
        <span class="dot" aria-hidden="true"></span>
        <span class="expense-main">
          <span class="expense-title">${esc(expense.title)}</span>
          <span class="expense-meta">${esc(meta)}</span>
        </span>
        <span class="expense-amount">${formatMoney(-expense.amountCents)}</span>
      </button>
    </li>`;
}

export function emptyStateHTML({ title, text = '', action = null }) {
  return `
    <div class="empty">
      <p class="empty-title">${esc(title)}</p>
      ${text ? `<p class="empty-text">${esc(text)}</p>` : ''}
      ${action ? `<button type="button" class="btn btn-secondary btn-small" data-action="${esc(action.action)}">${esc(action.label)}</button>` : ''}
    </div>`;
}

const MODE_LABELS = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' };
const MODE_INDEX = { day: 0, week: 1, month: 2, year: 3 };
const TODAY_LABELS = { day: 'Hoje', week: 'Esta semana', month: 'Este mês', year: 'Este ano' };
const PREV_LABELS = { day: 'Dia anterior', week: 'Semana anterior', month: 'Mês anterior', year: 'Ano anterior' };
const NEXT_LABELS = { day: 'Próximo dia', week: 'Próxima semana', month: 'Próximo mês', year: 'Próximo ano' };

/** Seletor dia/semana/mês/ano + navegação entre períodos (usado no Início e na Análise). */
export function periodControlsHTML() {
  const buttons = Object.entries(MODE_LABELS).map(([mode, label]) =>
    `<button type="button" data-action="period-mode" data-mode="${mode}" aria-pressed="false">${label}</button>`).join('');
  return `
    <div class="period">
      <div class="segmented" role="group" aria-label="Período analisado">
        <span class="segmented-thumb" aria-hidden="true"></span>
        ${buttons}
      </div>
      <div class="period-nav">
        <button type="button" class="icon-btn" data-action="period-prev" aria-label="Período anterior">${icon('chevron-left')}</button>
        <p class="period-label" aria-live="polite"></p>
        <button type="button" class="icon-btn" data-action="period-next" aria-label="Próximo período">${icon('chevron-right')}</button>
      </div>
    </div>`;
}

export function todayPillHTML() {
  return `<button type="button" class="pill pill-today" data-action="period-today" hidden></button>`;
}

export function updatePeriodControls(root, range, today) {
  root.querySelectorAll('[data-action="period-mode"]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === range.mode));
  });
  root.querySelector('.segmented')?.style.setProperty('--i', MODE_INDEX[range.mode]);
  const label = root.querySelector('.period-label');
  if (label) {
    const text = capitalize(formatPeriodLabel(range, { compact: true }));
    if (label.textContent !== text) label.textContent = text;
  }
  root.querySelector('[data-action="period-prev"]')?.setAttribute('aria-label', PREV_LABELS[range.mode]);
  root.querySelector('[data-action="period-next"]')?.setAttribute('aria-label', NEXT_LABELS[range.mode]);
  const pill = root.querySelector('.pill-today');
  if (pill) {
    pill.hidden = isDateInRange(today, range);
    pill.textContent = TODAY_LABELS[range.mode];
  }
}

/* ------------------------------------------------------------------------ */
/* Painel inferior (sheet)                                                   */
/* ------------------------------------------------------------------------ */

let layer;
let panel;
let appRoot;
let current = null; // { opener, onClose, pushed }
let ignoreNextPop = false;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const isSheetOpen = () => current !== null;

/**
 * Abre o painel. Se já houver um aberto, o conteúdo é substituído.
 * O foco inicial é aplicado de forma síncrona — no iPhone o teclado só abre
 * se o campo receber foco dentro do mesmo toque do usuário.
 */
export function openSheet({ title, body, footer = '', initialFocus = null, onClose = null, className = '' }) {
  const wasOpen = current !== null;
  const opener = wasOpen ? current.opener : document.activeElement;
  if (wasOpen && current.onClose) current.onClose();

  panel.className = `sheet${className ? ` ${className}` : ''}`;
  // O conteúdo é recriado a cada abertura: listeners de um painel anterior não sobrevivem.
  panel.innerHTML = `
    <div class="sheet-inner">
      <div class="sheet-top" data-sheet-drag>
        <div class="sheet-grabber" aria-hidden="true"></div>
        <div class="sheet-header">
          <h2 class="sheet-title" id="sheet-title">${esc(title)}</h2>
          <button type="button" class="icon-btn sheet-close" data-sheet-close aria-label="Fechar">${icon('close')}</button>
        </div>
      </div>
      <div class="sheet-content"></div>
      ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}
    </div>`;
  const inner = panel.firstElementChild;
  const content = inner.querySelector('.sheet-content');
  if (typeof body === 'string') content.innerHTML = body;
  else if (body) content.append(body);

  current = { opener, onClose, pushed: wasOpen ? current?.pushed ?? false : false };

  if (!wasOpen) {
    layer.hidden = false;
    void layer.offsetHeight; // aplica o estado inicial antes de animar
    layer.classList.add('is-open');
    document.documentElement.classList.add('has-sheet');
    appRoot.inert = true;
    // Uma entrada no histórico permite fechar o painel com o botão "voltar".
    history.pushState({ sheet: true }, '');
    current.pushed = true;
  }

  const target = initialFocus ? inner.querySelector(initialFocus) : null;
  (target ?? panel).focus({ preventScroll: true });
  return inner;
}

export function closeSheet() {
  if (!current) return;
  const { opener, onClose, pushed } = current;
  current = null;
  layer.classList.remove('is-open');
  document.documentElement.classList.remove('has-sheet');
  appRoot.inert = false;
  panel.style.transform = '';

  const finish = () => {
    if (current) return; // outro painel foi aberto nesse meio-tempo
    layer.hidden = true;
    panel.innerHTML = '';
  };
  if (prefersReducedMotion()) finish();
  else setTimeout(finish, 280);

  if (pushed && history.state?.sheet) {
    ignoreNextPop = true;
    history.back();
  }
  onClose?.();
  if (opener && document.contains(opener) && opener !== document.body) opener.focus({ preventScroll: true });
}

function handlePopState() {
  if (ignoreNextPop) {
    ignoreNextPop = false; // é o nosso próprio history.back() ao fechar o painel
    return;
  }
  if (current) {
    current.pushed = false; // o navegador já removeu a entrada
    closeSheet();
  }
}

function trapFocus(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Arrastar o topo do painel para baixo o fecha (atalho; o botão × continua disponível). */
function enableDragToClose() {
  let start = null;
  panel.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-sheet-drag]') || event.target.closest('button')) return;
    if (window.matchMedia('(min-width: 960px)').matches) return;
    start = { y: event.clientY, t: performance.now(), id: event.pointerId, dy: 0 };
  });
  panel.addEventListener('pointermove', (event) => {
    if (!start || event.pointerId !== start.id) return;
    start.dy = Math.max(0, event.clientY - start.y);
    if (start.dy > 4) {
      panel.setPointerCapture?.(event.pointerId);
      panel.classList.add('is-dragging');
      panel.style.transform = `translateY(${start.dy}px)`;
    }
  });
  const end = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const { dy, t } = start;
    start = null;
    panel.classList.remove('is-dragging');
    const velocity = dy / Math.max(1, performance.now() - t);
    if (dy > 110 || (dy > 40 && velocity > 0.6)) closeSheet();
    else panel.style.transform = '';
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}

/**
 * Teclado virtual: no iPhone o teclado cobre a página sem redimensioná-la.
 * Com a Visual Viewport API medimos a área encoberta e erguemos o painel,
 * mantendo o botão de salvar visível durante a digitação.
 */
function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    root.style.setProperty('--kb', `${Math.round(covered)}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.classList.toggle('kb-open', covered > 80);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/* ------------------------------------------------------------------------ */
/* Toast                                                                     */
/* ------------------------------------------------------------------------ */

let toastRegion;
let toastTimer = null;

/** Mensagem curta e discreta, com ação opcional (ex.: "Desfazer"). */
export function showToast(message, { actionLabel = '', onAction = null, duration = 3200 } = {}) {
  clearTimeout(toastTimer);
  toastRegion.innerHTML = `
    <div class="toast">
      <span class="toast-text">${esc(message)}</span>
      ${actionLabel ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}
    </div>`;
  const toast = toastRegion.firstElementChild;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  if (actionLabel) {
    toast.querySelector('.toast-action').addEventListener('click', () => {
      hideToast();
      onAction?.();
    });
  }
  toastTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  const toast = toastRegion.firstElementChild;
  if (!toast) return;
  toast.classList.remove('is-visible');
  setTimeout(() => {
    if (toastRegion.firstElementChild === toast) toast.remove();
  }, 220);
}

/* ------------------------------------------------------------------------ */
/* Confirmação em dois toques                                                */
/* ------------------------------------------------------------------------ */

/**
 * Para ações destrutivas: o primeiro toque "arma" o botão (que muda de texto
 * e cor por alguns segundos); só o segundo toque confirma. Devolve true
 * quando a ação deve ser executada.
 */
export function confirmTwoStep(button, confirmLabel, timeout = 4000) {
  if (button.dataset.armed === 'true') {
    clearTimeout(Number(button.dataset.armTimer));
    return true;
  }
  const original = button.innerHTML;
  button.dataset.armed = 'true';
  button.classList.add('is-armed');
  button.textContent = confirmLabel;
  const timer = setTimeout(() => {
    button.dataset.armed = 'false';
    button.classList.remove('is-armed');
    button.innerHTML = original;
  }, timeout);
  button.dataset.armTimer = String(timer);
  return false;
}

/* ------------------------------------------------------------------------ */
/* Inicialização                                                             */
/* ------------------------------------------------------------------------ */

export function initUI() {
  layer = document.getElementById('sheet-layer');
  panel = layer.querySelector('.sheet');
  appRoot = document.getElementById('app');
  toastRegion = document.getElementById('toast-region');

  layer.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-close]') || event.target.classList.contains('sheet-backdrop')) closeSheet();
  });
  layer.addEventListener('keydown', trapFocus);
  window.addEventListener('popstate', handlePopState);
  enableDragToClose();
  trackVisualViewport();
}
