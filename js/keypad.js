/**
 * Teclado numérico do próprio app para digitar valores.
 *
 * Substitui o teclado do celular no campo de valor: nada sobe por cima do
 * painel, a página não se desloca e as teclas ficam sempre no mesmo lugar,
 * ao alcance do polegar. Também aceita o teclado físico no computador
 * (números, vírgula/ponto, Backspace).
 *
 * A lógica de edição do valor fica em money.js (applyAmountKey), em funções
 * puras e testadas; aqui ficam só a exibição e os eventos.
 */
import {
  applyAmountKey, formatAmountDraft, parseAmount, draftFromCents,
} from './money.js';
import { icon, prefersReducedMotion } from './ui.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'backspace'];

export function amountDisplayHTML() {
  return `
    <div class="amount" data-amount>
      <output class="amount-value" id="f-amount" aria-live="polite" aria-label="Valor">
        <span class="amount-currency">R$</span><span class="amount-digits">0</span><span class="amount-caret" aria-hidden="true"></span>
      </output>
    </div>`;
}

export function keypadHTML() {
  const keys = KEYS.map((key) => {
    if (key === 'backspace') {
      return `<button type="button" class="key key-fn" data-key="backspace" aria-label="Apagar (segure para limpar)">${icon('delete-left')}</button>`;
    }
    if (key === ',') return '<button type="button" class="key key-fn" data-key="," aria-label="Vírgula">,</button>';
    return `<button type="button" class="key" data-key="${key}">${key}</button>`;
  }).join('');
  return `<div class="keypad" role="group" aria-label="Teclado numérico">${keys}</div>`;
}

/** Tamanho da fonte do valor: diminui conforme o número cresce, sem quebrar linha. */
function fontSizeFor(text) {
  const n = text.length;
  if (n <= 4) return 64;
  if (n <= 6) return 58;
  if (n <= 8) return 50;
  if (n <= 10) return 42;
  return 36;
}

/**
 * Liga a exibição e o teclado. Com `selectAll`, o valor inicial aparece
 * selecionado e a primeira tecla o substitui (útil ao editar uma despesa).
 * Devolve { getCents, isEmpty, destroy }.
 */
export function mountAmountKeypad({
  root, initialCents = null, selectAll = false, onChange = () => {}, onEnter = () => {},
}) {
  const display = root.querySelector('[data-amount]');
  const digits = display.querySelector('.amount-digits');
  const keypad = root.querySelector('.keypad');
  let draft = initialCents ? draftFromCents(initialCents) : '';
  let selected = selectAll && Boolean(draft);
  let longPressTimer = null;
  let longPressed = false;

  function render() {
    const text = formatAmountDraft(draft);
    digits.textContent = text;
    display.classList.toggle('is-empty', !draft);
    display.classList.toggle('is-selected', selected);
    display.style.setProperty('--amount-fs', `${fontSizeFor(text)}px`);
    onChange();
  }

  function shake() {
    if (prefersReducedMotion()) return;
    display.classList.remove('is-shaking');
    void display.offsetWidth;
    display.classList.add('is-shaking');
    navigator.vibrate?.(12);
  }

  function press(key) {
    if (selected) {
      // Valor selecionado: apagar limpa tudo; um número ou vírgula começa de novo.
      selected = false;
      draft = key === 'backspace' ? '' : applyAmountKey('', key) ?? '';
      render();
      return;
    }
    const next = applyAmountKey(draft, key);
    if (next === null) shake();
    else draft = next;
    render();
  }

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    if (longPressed) {
      longPressed = false;
      return;
    }
    press(button.dataset.key);
  });

  // Segurar o "apagar" limpa o valor inteiro.
  keypad.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-key="backspace"]')) return;
    longPressed = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressed = true;
      selected = false;
      draft = '';
      render();
      navigator.vibrate?.(20);
    }, 450);
  });
  const cancelLongPress = () => clearTimeout(longPressTimer);
  keypad.addEventListener('pointerup', cancelLongPress);
  keypad.addEventListener('pointerleave', cancelLongPress);
  keypad.addEventListener('pointercancel', cancelLongPress);
  // Evita o menu de contexto do toque longo.
  keypad.addEventListener('contextmenu', (event) => event.preventDefault());

  // Tocar no valor selecionado desfaz a seleção (para continuar digitando no fim).
  display.addEventListener('click', () => {
    if (selected) {
      selected = false;
      render();
    }
  });

  /** Teclado físico (computador ou teclado externo). */
  function onKeyDown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter();
      return;
    }
    let key = null;
    if (/^\d$/.test(event.key)) key = event.key;
    else if (event.key === ',' || event.key === '.' || event.key === 'Decimal') key = ',';
    else if (event.key === 'Backspace') key = 'backspace';
    else if (event.key === 'Delete') key = 'clear';
    if (!key) return;
    event.preventDefault();
    if (key === 'clear') {
      selected = false;
      draft = '';
      render();
    } else {
      press(key);
    }
    const button = keypad.querySelector(`[data-key="${key}"]`);
    if (button) {
      button.classList.add('is-pressed');
      setTimeout(() => button.classList.remove('is-pressed'), 120);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  render();

  return {
    getCents: () => parseAmount(draft),
    isEmpty: () => !draft,
    destroy: () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(longPressTimer);
    },
  };
}
