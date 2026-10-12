/**
 * Componentes de interface reutilizáveis: painel inferior (sheet), mensagens
 * de feedback (toast), confirmação em dois toques, controles de período,
 * ícone de categoria, item de despesa e estado vazio.
 */
import { formatMoney } from './money.js';
import {
  capitalize, formatPeriodLabel, getPeriodRange, isDateInRange,
} from './dates.js';

/* ------------------------------------------------------------------------ */
/* Utilitários                                                               */
/* ------------------------------------------------------------------------ */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto do usuário antes de inseri-lo em HTML. */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const icon = (name, cls = '') =>
  `<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

/** "#FFD60A" → "rgba(255, 214, 10, 0.18)" — usado em fundos suaves de categoria. */
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

/** Círculo com o ícone da categoria, na cor dela. Tamanhos: sm, md (padrão), lg. */
export function categoryIconHTML(category, size = 'md') {
  return `<span class="cat-icon cat-icon-${size}" style="${colorStyle(category.color)}" aria-hidden="true"><svg focusable="false"><use href="#c-${esc(category.icon || 'tag')}"></use></svg></span>`;
}

export function expenseRowHTML(expense, category, { meta = '', flash = false } = {}) {
  return `
    <li class="expense-item${flash ? ' is-flash' : ''}">
      <button type="button" class="expense" data-action="edit-expense" data-id="${esc(expense.id)}">
        ${categoryIconHTML(category)}
        <span class="expense-main">
          <span class="expense-title">${esc(expense.title)}</span>
          <span class="expense-meta">${esc(meta)}</span>
        </span>
        <span class="expense-amount">${formatMoney(-expense.amountCents)}</span>
      </button>
    </li>`;
}

export function emptyStateHTML({ title, text = '', action = null, glyph = '' }) {
  return `
    <div class="empty">
      ${glyph ? `<span class="empty-glyph" aria-hidden="true">${icon(glyph)}</span>` : ''}
      <p class="empty-title">${esc(title)}</p>
      ${text ? `<p class="empty-text">${esc(text)}</p>` : ''}
      ${action ? `<button type="button" class="btn btn-tinted btn-small" data-action="${esc(action.action)}">${esc(action.label)}</button>` : ''}
    </div>`;
}

const MODE_LABELS = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' };
const MODE_NAMES = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' };
const TODAY_LABELS = { day: 'Hoje', week: 'Esta semana', month: 'Este mês', year: 'Este ano' };
const PREV_LABELS = { day: 'Dia anterior', week: 'Semana anterior', month: 'Mês anterior', year: 'Ano anterior' };
const NEXT_LABELS = { day: 'Próximo dia', week: 'Próxima semana', month: 'Próximo mês', year: 'Próximo ano' };

/**
 * Navegação entre períodos (usada no Início e na Análise). O rótulo do
 * período é também o botão de um menu suspenso para escolher entre dia,
 * semana, mês e ano. `id` diferencia o menu de cada tela.
 */
export function periodControlsHTML(id) {
  const options = Object.entries(MODE_LABELS).map(([mode, label]) => `
    <button type="button" class="period-option" role="menuitemradio" aria-checked="false" tabindex="-1"
      data-action="period-mode" data-mode="${mode}">
      ${icon('check', 'period-check')}
      <span class="period-option-text">
        <span class="period-option-title">${label}</span>
        <span class="period-option-sub"></span>
      </span>
      ${icon(`period-${mode}`, 'period-option-icon')}
    </button>`).join('');
  return `
    <div class="period">
      <div class="period-nav">
        <button type="button" class="nav-arrow" data-action="period-prev" aria-label="Período anterior">${icon('chevron-left')}</button>
        <div class="period-picker">
          <button type="button" class="period-trigger" data-period-trigger aria-haspopup="menu" aria-expanded="false"
            aria-controls="period-menu-${id}">
            <span class="period-label" aria-live="polite"></span>
            <span class="visually-hidden period-mode-hint"></span>
            ${icon('chevron-down', 'period-chevron')}
          </button>
          <div class="period-scrim" data-period-scrim aria-hidden="true"></div>
          <div class="period-menu" id="period-menu-${id}" role="menu" aria-label="Ver gastos por">
            <p class="period-menu-title" aria-hidden="true">Ver gastos por</p>
            ${options}
          </div>
        </div>
        <button type="button" class="nav-arrow" data-action="period-next" aria-label="Próximo período">${icon('chevron-right')}</button>
      </div>
    </div>`;
}

export function todayPillHTML() {
  return `<button type="button" class="pill pill-today" data-action="period-today" hidden></button>`;
}

export function updatePeriodControls(root, range, today) {
  const label = root.querySelector('.period-label');
  if (label) {
    const text = capitalize(formatPeriodLabel(range, { compact: true, today }));
    if (label.textContent !== text) label.textContent = text;
  }
  const hint = root.querySelector('.period-mode-hint');
  if (hint) hint.textContent = `, por ${MODE_NAMES[range.mode]}. Mudar período`;

  // Cada opção do menu mostra como ficaria o período naquela visualização.
  root.querySelectorAll('.period-option').forEach((option) => {
    const { mode } = option.dataset;
    option.setAttribute('aria-checked', String(mode === range.mode));
    const preview = getPeriodRange(mode, range.anchor);
    option.querySelector('.period-option-sub').textContent = capitalize(formatPeriodLabel(preview, { compact: true, today }));
  });

  root.querySelector('[data-action="period-prev"]')?.setAttribute('aria-label', PREV_LABELS[range.mode]);
  root.querySelector('[data-action="period-next"]')?.setAttribute('aria-label', NEXT_LABELS[range.mode]);
  const pill = root.querySelector('.pill-today');
  if (pill) {
    pill.hidden = isDateInRange(today, range);
    pill.textContent = TODAY_LABELS[range.mode];
  }
}

/* ------------------------------------------------------------------------ */
/* Menu suspenso do período                                                  */
/* ------------------------------------------------------------------------ */

let openPicker = null;
let closeTimer = null;

const menuOptions = (picker) => [...picker.querySelectorAll('.period-option')];

function openPeriodMenu(picker, { focusChecked = false } = {}) {
  if (openPicker && openPicker !== picker) closePeriodMenu();
  clearTimeout(closeTimer);
  openPicker = picker;
  picker.classList.add('is-open');
  picker.querySelector('[data-period-trigger]').setAttribute('aria-expanded', 'true');
  // Aberto pelo teclado: o foco vai para a opção atual.
  if (focusChecked) {
    const checked = picker.querySelector('[aria-checked="true"]') ?? menuOptions(picker)[0];
    checked.focus({ preventScroll: true });
  }
}

function closePeriodMenu({ returnFocus = false } = {}) {
  if (!openPicker) return;
  const picker = openPicker;
  openPicker = null;
  picker.classList.remove('is-open');
  const trigger = picker.querySelector('[data-period-trigger]');
  trigger.setAttribute('aria-expanded', 'false');
  if (returnFocus || picker.contains(document.activeElement)) trigger.focus({ preventScroll: true });
}

function handleMenuKeys(event) {
  const trigger = event.target.closest?.('[data-period-trigger]');
  if (trigger && !openPicker && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    openPeriodMenu(trigger.closest('.period-picker'), { focusChecked: true });
    return;
  }
  if (!openPicker) return;
  const options = menuOptions(openPicker);
  const index = options.indexOf(document.activeElement);
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      event.stopPropagation();
      closePeriodMenu({ returnFocus: true });
      break;
    case 'ArrowDown':
      event.preventDefault();
      options[(index + 1) % options.length].focus();
      break;
    case 'ArrowUp':
      event.preventDefault();
      options[(index - 1 + options.length) % options.length].focus();
      break;
    case 'Home':
      event.preventDefault();
      options[0].focus();
      break;
    case 'End':
      event.preventDefault();
      options[options.length - 1].focus();
      break;
    case 'Tab':
      closePeriodMenu();
      break;
    default:
      break;
  }
}

function initPeriodMenus() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-period-trigger]');
    if (trigger) {
      const picker = trigger.closest('.period-picker');
      if (openPicker === picker) closePeriodMenu();
      // event.detail === 0: ativado por teclado (Enter/Espaço), não por toque.
      else openPeriodMenu(picker, { focusChecked: event.detail === 0 });
      return;
    }
    if (!openPicker) return;
    if (event.target.closest('[data-period-scrim]')) {
      closePeriodMenu();
    } else if (event.target.closest('.period-option')) {
      // A escolha já foi aplicada (script.js); o menu fecha logo depois,
      // para que a marca de seleção mude de lugar antes de sumir.
      const keyboard = event.detail === 0;
      closeTimer = setTimeout(() => closePeriodMenu({ returnFocus: keyboard }), 160);
    }
  });
  document.addEventListener('keydown', handleMenuKeys);
  window.addEventListener('hashchange', () => closePeriodMenu());
  window.addEventListener('scroll', () => closePeriodMenu(), { passive: true });
  window.addEventListener('resize', () => closePeriodMenu());
}

/* ------------------------------------------------------------------------ */
/* Painel inferior (sheet)                                                   */
/* ------------------------------------------------------------------------ */

let layer;
let panel;
let appRoot;
let current = null; // { opener, onClose, pushed }
let ignoreNextPop = false;
let lockedScrollY = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const isSheetOpen = () => current !== null;

/**
 * Trava a rolagem da página enquanto o painel está aberto. No iPhone,
 * `overflow: hidden` não basta: fixar o <body> impede que a página "pule"
 * por baixo do painel quando um campo recebe foco.
 */
function lockScroll() {
  lockedScrollY = window.scrollY;
  const { style } = document.body;
  style.position = 'fixed';
  style.top = `-${lockedScrollY}px`;
  style.left = '0';
  style.right = '0';
  style.width = '100%';
}

function unlockScroll() {
  const { style } = document.body;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  style.width = '';
  window.scrollTo(0, lockedScrollY);
}

/**
 * Abre o painel. Se já houver um aberto, o conteúdo é substituído.
 * `headerStart` recebe um botão opcional à esquerda do título.
 * Devolve o contêiner do conteúdo, recriado a cada abertura (listeners de um
 * painel anterior não sobrevivem).
 */
export function openSheet({
  title, body, footer = '', headerStart = '', initialFocus = null, onClose = null, className = '',
}) {
  const wasOpen = current !== null;
  const opener = wasOpen ? current.opener : document.activeElement;
  if (wasOpen && current.onClose) current.onClose();

  panel.className = `sheet${className ? ` ${className}` : ''}`;
  panel.innerHTML = `
    <div class="sheet-inner">
      <div class="sheet-top" data-sheet-drag>
        <div class="sheet-grabber" aria-hidden="true"></div>
        <div class="sheet-header">
          <div class="sheet-header-start">${headerStart}</div>
          <h2 class="sheet-title" id="sheet-title">${esc(title)}</h2>
          <div class="sheet-header-end">
            <button type="button" class="circle-btn" data-sheet-close aria-label="Fechar">${icon('close')}</button>
          </div>
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
    lockScroll();
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
  // Fecha o teclado do sistema, se estiver aberto, antes de animar.
  if (panel.contains(document.activeElement)) document.activeElement.blur();
  layer.classList.remove('is-open');
  document.documentElement.classList.remove('has-sheet');
  appRoot.inert = false;
  panel.style.transform = '';
  unlockScroll();

  const finish = () => {
    if (current) return; // outro painel foi aberto nesse meio-tempo
    layer.hidden = true;
    panel.innerHTML = '';
  };
  if (prefersReducedMotion()) finish();
  else setTimeout(finish, 420);

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
 * O teclado do iPhone cobre a página sem redimensioná-la e ainda pode
 * deslocá-la. A camada do painel acompanha a área realmente visível
 * (Visual Viewport API), então o painel fica sempre logo acima do teclado.
 * Com o teclado numérico do próprio app, isso só entra em ação ao digitar
 * a descrição ou a observação.
 */
function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.classList.toggle('kb-open', window.innerHeight - vv.height > 120);
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
export function showToast(message, {
  actionLabel = '', onAction = null, duration = 3200, glyph = '',
} = {}) {
  clearTimeout(toastTimer);
  toastRegion.innerHTML = `
    <div class="toast">
      ${glyph ? icon(glyph, 'toast-glyph') : ''}
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
  }, 260);
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
  // Sem isto o Safari do iPhone não aplica o estado :active (toque visível) nos botões.
  document.addEventListener('touchstart', () => {}, { passive: true });
  enableDragToClose();
  trackVisualViewport();
  initPeriodMenus();
}
