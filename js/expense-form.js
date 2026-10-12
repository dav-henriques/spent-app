/**
 * Formulário de despesa — o mesmo para criar e para editar.
 *
 * Pensado para registrar um gasto em poucos segundos: o valor recebe foco e
 * teclado numérico imediatamente, a última categoria usada vem selecionada,
 * a data já é hoje e o botão de salvar fica visível acima do teclado.
 */
import * as store from './store.js';
import { LIMITS } from './config.js';
import { parseAmount, formatAmountInput, sanitizeAmountText } from './money.js';
import {
  todayISO, addDays, formatLongDate, timestampToLocalTime, timestampToLocalDate, formatShortDate, isDateInRange,
} from './dates.js';
import { titleSuggestions } from './calc.js';
import { normalizeText } from './model.js';
import {
  esc, icon, colorStyle, openSheet, closeSheet, showToast, confirmTwoStep,
} from './ui.js';

export function openExpenseForm({ expense = null } = {}) {
  const isEdit = Boolean(expense);
  const today = todayISO();
  const categories = store.getCategories();
  const state = {
    categoryId: isEdit ? expense.categoryId : store.getDefaultCategoryId(),
    categoryTouched: isEdit,
    showErrors: false,
  };

  const chips = categories.map((c) => `
    <button type="button" class="chip" data-category="${esc(c.id)}" style="${colorStyle(c.color)}"
      aria-pressed="${c.id === state.categoryId}">
      <span class="dot" aria-hidden="true"></span>${esc(c.name)}
    </button>`).join('');

  const note = isEdit ? expense.note : '';
  const createdInfo = isEdit ? describeCreation(expense) : '';

  const body = `
    <form class="expense-form" id="expense-form" novalidate autocomplete="off">
      <div class="amount-field">
        <label class="visually-hidden" for="f-amount">Valor</label>
        <span class="amount-currency" aria-hidden="true">R$</span>
        <input class="amount-input" id="f-amount" name="amount" inputmode="decimal" enterkeyhint="next"
          placeholder="0,00" maxlength="18" aria-describedby="f-amount-error"
          value="${isEdit ? esc(formatAmountInput(expense.amountCents)) : ''}">
      </div>
      <p class="field-error" id="f-amount-error" hidden></p>

      <div class="field">
        <label class="field-label" for="f-title">Descrição</label>
        <input class="input" id="f-title" name="title" maxlength="${LIMITS.titleMax}" enterkeyhint="done"
          autocapitalize="sentences" spellcheck="true" placeholder="Ex.: lanche, ônibus, cinema"
          aria-describedby="f-title-error" value="${isEdit ? esc(expense.title) : ''}">
        <div class="suggestions" role="group" aria-label="Sugestões de descrição"></div>
        <p class="field-error" id="f-title-error" hidden></p>
      </div>

      <fieldset class="field">
        <legend class="field-label">Categoria</legend>
        <div class="chip-grid">${chips}</div>
        <p class="field-error" id="f-category-error" hidden></p>
      </fieldset>

      <div class="field">
        <span class="field-label" id="f-date-label">Data</span>
        <div class="date-row">
          <button type="button" class="pill" data-date-shortcut="0" aria-pressed="false">Hoje</button>
          <button type="button" class="pill" data-date-shortcut="-1" aria-pressed="false">Ontem</button>
          <input type="date" class="date-input" id="f-date" name="date" aria-labelledby="f-date-label"
            value="${isEdit ? esc(expense.date) : today}" min="1900-01-01" max="2999-12-31">
        </div>
        <p class="field-error" id="f-date-error" hidden></p>
      </div>

      <button type="button" class="link-btn note-toggle" aria-expanded="${note ? 'true' : 'false'}" aria-controls="f-note-field"${note ? ' hidden' : ''}>
        ${icon('plus', 'icon-sm')} Adicionar observação
      </button>
      <div class="field" id="f-note-field"${note ? '' : ' hidden'}>
        <label class="field-label" for="f-note">Observação <span class="field-optional">opcional</span></label>
        <textarea class="input textarea" id="f-note" name="note" rows="2" maxlength="${LIMITS.noteMax}"
          placeholder="Ex.: comprei para levar para a escola">${esc(note)}</textarea>
      </div>

      ${isEdit ? `
        <div class="form-danger">
          <p class="form-meta">${esc(createdInfo)}</p>
          <button type="button" class="btn btn-danger btn-block" data-delete-expense>${icon('trash')} Excluir despesa</button>
        </div>` : ''}
    </form>`;

  const footer = `
    <button type="submit" form="expense-form" class="btn btn-primary btn-block" data-save disabled>
      ${isEdit ? 'Salvar alterações' : 'Salvar despesa'}
    </button>`;

  const panel = openSheet({
    title: isEdit ? 'Editar despesa' : 'Nova despesa',
    body,
    footer,
    initialFocus: isEdit ? null : '#f-amount',
    className: 'sheet-form',
  });

  const form = panel.querySelector('#expense-form');
  const amountInput = form.querySelector('#f-amount');
  const titleInput = form.querySelector('#f-title');
  const dateInput = form.querySelector('#f-date');
  const noteInput = form.querySelector('#f-note');
  const saveButton = panel.querySelector('[data-save]');
  const suggestionsBox = form.querySelector('.suggestions');

  const readInput = () => ({
    amountCents: parseAmount(amountInput.value),
    title: titleInput.value,
    categoryId: state.categoryId,
    date: dateInput.value,
    note: noteInput.value,
  });

  function setError(id, message) {
    const el = form.querySelector(`#${id}`);
    el.textContent = message ?? '';
    el.hidden = !message;
  }

  /** Revalida a cada alteração; mensagens só aparecem quando ajudam. */
  function refresh() {
    const { ok, errors } = store.validateExpenseInput(readInput());
    saveButton.disabled = !ok;
    const amountTyped = amountInput.value.trim() !== '';
    setError('f-amount-error', (amountTyped || state.showErrors) && errors.amount
      ? (amountTyped ? 'Valor inválido. Use, por exemplo, 12 ou 12,50.' : errors.amount) : null);
    amountInput.setAttribute('aria-invalid', String(Boolean((amountTyped || state.showErrors) && errors.amount)));
    setError('f-title-error', state.showErrors ? errors.title : null);
    setError('f-category-error', state.showErrors ? errors.category : null);
    setError('f-date-error', state.showErrors || !dateInput.value ? errors.date : null);
    for (const pill of form.querySelectorAll('[data-date-shortcut]')) {
      const target = addDays(todayISO(), Number(pill.dataset.dateShortcut));
      pill.setAttribute('aria-pressed', String(dateInput.value === target));
    }
    return { ok, errors };
  }

  function submit() {
    state.showErrors = true;
    const { ok, errors } = refresh();
    if (!ok) {
      if (errors.amount) amountInput.focus();
      else if (errors.title) titleInput.focus();
      else if (errors.date) dateInput.focus();
      return;
    }
    try {
      const input = readInput();
      const saved = isEdit ? store.updateExpense(expense.id, input) : store.addExpense(input);
      closeSheet();
      announceSaved(saved, isEdit);
    } catch (error) {
      showToast(error.message || 'Não foi possível salvar.', { duration: 5000 });
    }
  }

  function selectCategory(id, { touched = true } = {}) {
    state.categoryId = id;
    if (touched) state.categoryTouched = true;
    for (const chip of form.querySelectorAll('[data-category]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.category === id));
    }
    refresh();
  }

  function renderSuggestions() {
    const items = titleSuggestions(store.getExpenses(), titleInput.value, 6)
      .filter((s) => categories.some((c) => c.id === s.categoryId));
    suggestionsBox.innerHTML = items.map((s) => `
      <button type="button" class="suggestion" data-suggestion="${esc(s.title)}" data-suggestion-category="${esc(s.categoryId)}">${esc(s.title)}</button>`).join('');
    suggestionsBox.hidden = items.length === 0;
  }

  /** Ao digitar uma descrição já usada antes, sugere a mesma categoria (se o usuário ainda não escolheu). */
  function matchCategoryFromTitle() {
    if (state.categoryTouched) return;
    const wanted = normalizeText(titleInput.value);
    if (!wanted) return;
    const match = titleSuggestions(store.getExpenses(), '', 300).find((s) => normalizeText(s.title) === wanted);
    if (match && categories.some((c) => c.id === match.categoryId)) selectCategory(match.categoryId, { touched: false });
  }

  amountInput.addEventListener('input', () => {
    const clean = sanitizeAmountText(amountInput.value);
    if (clean !== amountInput.value) amountInput.value = clean;
    refresh();
  });
  amountInput.addEventListener('blur', () => {
    // Mostra como o valor foi entendido: "12" → "12,00"; "1.250" → "1.250,00".
    const cents = parseAmount(amountInput.value);
    if (cents !== null) amountInput.value = formatAmountInput(cents);
  });
  amountInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInput.focus();
    }
  });

  titleInput.addEventListener('input', () => {
    renderSuggestions();
    matchCategoryFromTitle();
    refresh();
  });

  form.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (chip) {
      selectCategory(chip.dataset.category);
      return;
    }
    const suggestion = event.target.closest('[data-suggestion]');
    if (suggestion) {
      titleInput.value = suggestion.dataset.suggestion;
      if (!state.categoryTouched && categories.some((c) => c.id === suggestion.dataset.suggestionCategory)) {
        selectCategory(suggestion.dataset.suggestionCategory, { touched: false });
      }
      renderSuggestions();
      refresh();
      return;
    }
    const shortcut = event.target.closest('[data-date-shortcut]');
    if (shortcut) {
      dateInput.value = addDays(todayISO(), Number(shortcut.dataset.dateShortcut));
      refresh();
      return;
    }
    if (event.target.closest('.note-toggle')) {
      const toggle = form.querySelector('.note-toggle');
      toggle.hidden = true;
      toggle.setAttribute('aria-expanded', 'true');
      form.querySelector('#f-note-field').hidden = false;
      noteInput.focus();
      return;
    }
    const del = event.target.closest('[data-delete-expense]');
    if (del && confirmTwoStep(del, 'Toque de novo para excluir')) removeExpense(expense);
  });

  dateInput.addEventListener('input', refresh);
  dateInput.addEventListener('change', refresh);
  noteInput.addEventListener('input', refresh);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  // Com o botão de salvar desabilitado o navegador ignora o Enter; tratamos aqui
  // para que o Enter salve (ou aponte o que falta preencher).
  titleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    submit();
  });

  renderSuggestions();
  refresh();
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
  if (isDateInRange(expense.date, range)) {
    showToast(isEdit ? 'Alterações salvas' : 'Despesa salva');
    return;
  }
  // A despesa foi registrada fora do período visível: oferece ir até ela.
  showToast(`${isEdit ? 'Alterações salvas' : 'Despesa salva'} em ${formatShortDate(expense.date)}`, {
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
      actionLabel: 'Desfazer',
      duration: 6000,
      onAction: () => {
        try {
          store.restoreExpense(removed);
          showToast('Despesa restaurada');
        } catch (error) {
          showToast(error.message);
        }
      },
    });
  } catch (error) {
    showToast(error.message);
  }
}
