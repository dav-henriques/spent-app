/**
 * Formulário de despesa — o mesmo para criar e para editar.
 *
 * Pensado para registrar um gasto em poucos segundos e sem o teclado do
 * celular: o valor é digitado no teclado numérico do próprio app, a última
 * categoria usada vem selecionada, a data já é hoje e a descrição (opcional)
 * pode ser escolhida entre sugestões com um toque. O teclado do sistema só
 * aparece se a pessoa tocar em "Descrição" ou "Observação".
 */
import * as store from './store.js';
import { LIMITS, QUICK_TITLES } from './config.js';
import {
  todayISO, formatLongDate, formatShortDate, timestampToLocalTime, timestampToLocalDate, isDateInRange,
  capitalize, isValidISODate,
} from './dates.js';
import { titleSuggestions } from './calc.js';
import { normalizeText } from './model.js';
import {
  esc, icon, colorStyle, openSheet, closeSheet, showToast, confirmTwoStep,
} from './ui.js';
import { amountDisplayHTML, keypadHTML, mountAmountKeypad } from './keypad.js';

export function openExpenseForm({ expense = null } = {}) {
  const isEdit = Boolean(expense);
  const categories = store.getCategories();
  const categoryNames = new Set(categories.map((c) => normalizeText(c.name)));
  const state = {
    categoryId: isEdit ? expense.categoryId : store.getDefaultCategoryId(),
    categoryTouched: isEdit,
  };
  // Ao editar, uma descrição igual ao nome da categoria foi gerada automaticamente: o campo fica vazio.
  const initialTitle = isEdit && !categoryNames.has(normalizeText(expense.title)) ? expense.title : '';
  const note = isEdit ? expense.note : '';

  const chips = categories.map((c) => `
    <button type="button" class="cat-chip" data-category="${esc(c.id)}" style="${colorStyle(c.color)}"
      aria-pressed="${c.id === state.categoryId}">
      <svg class="cat-chip-icon" aria-hidden="true" focusable="false"><use href="#c-${esc(c.icon)}"></use></svg>${esc(c.name)}
    </button>`).join('');

  const body = `
    <form class="expense-form" id="expense-form" novalidate autocomplete="off">
      ${amountDisplayHTML()}

      <div class="form-card">
        <label class="visually-hidden" for="f-title">Descrição</label>
        <input class="form-input" id="f-title" maxlength="${LIMITS.titleMax}" enterkeyhint="done"
          autocapitalize="sentences" spellcheck="true" placeholder="Descrição (opcional)" value="${esc(initialTitle)}">
      </div>
      <div class="suggestions" role="group" aria-label="Sugestões de descrição"></div>

      <p class="form-label" id="f-cat-label">Categoria</p>
      <div class="cat-picker" role="group" aria-labelledby="f-cat-label">${chips}</div>

      <div class="form-row">
        <label class="pill pill-icon date-pill">
          ${icon('calendar')}<span class="date-pill-text"></span>
          <input type="date" class="date-overlay" id="f-date" value="${esc(isEdit ? expense.date : todayISO())}"
            min="1900-01-01" max="2999-12-31" aria-label="Data da despesa">
        </label>
        <button type="button" class="pill pill-icon note-toggle" aria-expanded="${note ? 'true' : 'false'}" aria-controls="f-note-field">
          ${icon('note')}Observação
        </button>
      </div>
      <div class="form-card" id="f-note-field"${note ? '' : ' hidden'}>
        <label class="visually-hidden" for="f-note">Observação</label>
        <textarea class="form-input form-textarea" id="f-note" rows="2" maxlength="${LIMITS.noteMax}"
          placeholder="Ex.: comprei para levar para a escola">${esc(note)}</textarea>
      </div>
      <p class="field-error" id="f-error" hidden></p>
      ${isEdit ? `<p class="form-meta">${esc(describeCreation(expense))}</p>` : ''}
    </form>`;

  const footer = `
    ${keypadHTML()}
    <button type="submit" form="expense-form" class="btn btn-primary btn-block" data-save disabled>
      ${isEdit ? 'Salvar alterações' : 'Salvar'}
    </button>`;

  const headerStart = isEdit
    ? `<button type="button" class="circle-btn circle-btn-danger" data-delete-expense aria-label="Excluir despesa">${icon('trash')}</button>`
    : '';

  let pad = null;
  const panel = openSheet({
    title: isEdit ? 'Editar despesa' : 'Nova despesa',
    body,
    footer,
    headerStart,
    className: 'sheet-form',
    onClose: () => pad?.destroy(),
  });

  const sheet = panel.closest('.sheet');
  const form = panel.querySelector('#expense-form');
  const titleInput = form.querySelector('#f-title');
  const dateInput = form.querySelector('#f-date');
  const datePillText = form.querySelector('.date-pill-text');
  const noteInput = form.querySelector('#f-note');
  const saveButton = panel.querySelector('[data-save]');
  const suggestionsBox = form.querySelector('.suggestions');
  const picker = form.querySelector('.cat-picker');
  const errorEl = form.querySelector('#f-error');

  const readInput = () => ({
    amountCents: pad.getCents(),
    title: titleInput.value,
    categoryId: state.categoryId,
    date: dateInput.value,
    note: noteInput.value,
  });

  function refresh() {
    const { ok, errors } = store.validateExpenseInput(readInput());
    saveButton.disabled = !ok;
    const message = !dateInput.value || !isValidISODate(dateInput.value) ? errors.date : '';
    errorEl.textContent = message ?? '';
    errorEl.hidden = !message;
    datePillText.textContent = isValidISODate(dateInput.value) ? capitalize(formatShortDate(dateInput.value)) : 'Escolher data';
    return ok;
  }

  pad = mountAmountKeypad({
    root: panel,
    initialCents: isEdit ? expense.amountCents : null,
    selectAll: isEdit,
    onChange: () => { if (pad) refresh(); }, // a primeira renderização acontece antes de `pad` existir
    onEnter: () => submit(),
  });

  /* ------------------------------------------------------- categorias */

  function selectCategory(id, { touched = true } = {}) {
    state.categoryId = id;
    if (touched) state.categoryTouched = true;
    for (const chip of picker.querySelectorAll('[data-category]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.category === id));
    }
    renderSuggestions();
    refresh();
  }

  function revealSelectedCategory() {
    const chip = picker.querySelector('[aria-pressed="true"]');
    if (chip) picker.scrollLeft = Math.max(0, chip.offsetLeft - picker.clientWidth / 2 + chip.offsetWidth / 2);
  }

  /* ------------------------------------------------------- sugestões */

  /**
   * Sem digitar: descrições já usadas nesta categoria e, depois, sugestões
   * prontas. Digitando: descrições anteriores que começam com o texto.
   */
  function renderSuggestions() {
    const typed = titleInput.value.trim();
    const typing = document.activeElement === titleInput && typed;
    let items;
    if (typing) {
      items = titleSuggestions(store.getExpenses(), typed, 6)
        .map((s) => ({ title: s.title, categoryId: s.categoryId }));
    } else {
      const used = titleSuggestions(store.getExpenses(), '', 8, state.categoryId).map((s) => s.title);
      const seen = new Set();
      items = [...used, ...(QUICK_TITLES[state.categoryId] ?? [])]
        .filter((title) => {
          const key = normalizeText(title);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8)
        .map((title) => ({ title, categoryId: state.categoryId }));
    }
    items = items.filter((s) => !categoryNames.has(normalizeText(s.title)));
    const current = normalizeText(titleInput.value);
    suggestionsBox.innerHTML = items.map((s) => `
      <button type="button" class="suggestion" data-suggestion="${esc(s.title)}" data-suggestion-category="${esc(s.categoryId)}"
        aria-pressed="${normalizeText(s.title) === current}">${esc(s.title)}</button>`).join('');
    suggestionsBox.hidden = items.length === 0;
  }

  /** Ao digitar uma descrição já usada antes, sugere a mesma categoria (se a pessoa ainda não escolheu). */
  function matchCategoryFromTitle() {
    if (state.categoryTouched) return;
    const wanted = normalizeText(titleInput.value);
    if (!wanted) return;
    const match = titleSuggestions(store.getExpenses(), '', 300).find((s) => normalizeText(s.title) === wanted);
    if (match && categories.some((c) => c.id === match.categoryId)) {
      selectCategory(match.categoryId, { touched: false });
      revealSelectedCategory();
    }
  }

  /* ------------------------------------- teclado do sistema (texto) */

  // Enquanto o teclado do celular está aberto, o teclado numérico do app se recolhe.
  let typingTimer = null;
  const textFields = [titleInput, noteInput];
  for (const field of textFields) {
    field.addEventListener('focus', () => {
      clearTimeout(typingTimer);
      sheet.classList.add('is-typing');
    });
    field.addEventListener('blur', () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (!textFields.includes(document.activeElement)) sheet.classList.remove('is-typing');
        renderSuggestions();
      }, 120);
    });
  }

  titleInput.addEventListener('input', () => {
    renderSuggestions();
    matchCategoryFromTitle();
    refresh();
  });
  titleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (refresh()) submit();
    else titleInput.blur();
  });
  noteInput.addEventListener('input', refresh);

  /* ------------------------------------------------------------ data */

  dateInput.addEventListener('input', refresh);
  dateInput.addEventListener('change', refresh);
  dateInput.addEventListener('click', () => {
    // No computador, abre o calendário ao clicar em qualquer parte do botão.
    if (window.matchMedia('(pointer: fine)').matches) {
      try { dateInput.showPicker(); } catch { /* navegador sem showPicker */ }
    }
  });

  /* ---------------------------------------------------------- cliques */

  form.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (chip) {
      selectCategory(chip.dataset.category);
      return;
    }
    const suggestion = event.target.closest('[data-suggestion]');
    if (suggestion) {
      const same = normalizeText(titleInput.value) === normalizeText(suggestion.dataset.suggestion);
      titleInput.value = same ? '' : suggestion.dataset.suggestion; // tocar de novo desmarca
      const cat = suggestion.dataset.suggestionCategory;
      if (!same && !state.categoryTouched && cat !== state.categoryId && categories.some((c) => c.id === cat)) {
        selectCategory(cat, { touched: false });
        revealSelectedCategory();
      }
      renderSuggestions();
      refresh();
      return;
    }
    if (event.target.closest('.note-toggle')) {
      const field = form.querySelector('#f-note-field');
      const opening = field.hidden;
      field.hidden = !opening;
      form.querySelector('.note-toggle').setAttribute('aria-expanded', String(opening));
      if (opening) noteInput.focus();
    }
  });

  panel.querySelector('[data-delete-expense]')?.addEventListener('click', (event) => {
    if (confirmTwoStep(event.currentTarget, 'Excluir?')) removeExpense(expense);
  });

  /* ---------------------------------------------------------- salvar */

  function submit() {
    if (!refresh()) return;
    try {
      const input = readInput();
      const saved = isEdit ? store.updateExpense(expense.id, input) : store.addExpense(input);
      closeSheet();
      announceSaved(saved, isEdit);
    } catch (error) {
      showToast(error.message || 'Não foi possível salvar.', { duration: 5000 });
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  renderSuggestions();
  refresh();
  requestAnimationFrame(revealSelectedCategory);
}

function describeCreation(expense) {
  const createdDate = timestampToLocalDate(expense.createdAt);
  if (!createdDate) return '';
  const time = timestampToLocalTime(expense.createdAt);
  const edited = expense.updatedAt && expense.updatedAt !== expense.createdAt ? ' · editada depois' : '';
  return `Registrada em ${formatLongDate(createdDate)} às ${time}${edited}`;
}

function announceSaved(expense, isEdit) {
  const range = store.getRange();
  const message = isEdit ? 'Alterações salvas' : 'Despesa salva';
  if (isDateInRange(expense.date, range)) {
    showToast(message, { glyph: 'check' });
    return;
  }
  // A despesa foi registrada fora do período visível: oferece ir até ela.
  showToast(`${message} em ${formatShortDate(expense.date)}`, {
    glyph: 'check',
    actionLabel: 'Ver',
    duration: 5000,
    onAction: () => store.setPeriod({ anchor: expense.date }),
  });
}

function removeExpense(expense) {
  try {
    const removed = store.deleteExpense(expense.id);
    closeSheet();
    showToast('Despesa excluída', {
      glyph: 'trash',
      actionLabel: 'Desfazer',
      duration: 6000,
      onAction: () => {
        try {
          store.restoreExpense(removed);
          showToast('Despesa restaurada', { glyph: 'check' });
        } catch (error) {
          showToast(error.message);
        }
      },
    });
  } catch (error) {
    showToast(error.message);
  }
}
