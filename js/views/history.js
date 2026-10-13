/**
 * Histórico completo: todas as despesas, com busca, filtro por categoria,
 * intervalo de datas e ordenação. Os filtros nunca alteram os dados.
 */
import * as store from '../store.js';
import { filterExpenses, sortByDate, groupByDay, sumCents } from '../calc.js';
import { formatMoney } from '../money.js';
import {
  todayISO, formatDayHeading, formatRange, formatLongDate, capitalize, getPeriodRange, addDays, addMonths, isValidISODate,
} from '../dates.js';
import {
  esc, icon, colorStyle, categoryIconHTML, expenseRowHTML, emptyStateHTML, openSheet, closeSheet,
} from '../ui.js';
import { expenseMeta } from './home.js';

const PAGE_SIZE = 100;

export function createHistoryView(root) {
  const filters = { query: '', categoryId: '', from: '', to: '', order: 'desc' };
  let visibleCount = PAGE_SIZE;

  root.innerHTML = `
    <header class="page-header" data-large-title>
      <h1 class="large-title" tabindex="-1">Histórico</h1>
    </header>
    <div class="search">
      ${icon('search', 'search-icon')}
      <input type="search" class="search-input" placeholder="Buscar" aria-label="Buscar por descrição"
        enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false">
    </div>
    <div class="filter-bar" role="group" aria-label="Filtros">
      <button type="button" class="filter-chip" data-history="category" aria-haspopup="dialog"></button>
      <button type="button" class="filter-chip" data-history="dates" aria-haspopup="dialog"></button>
      <button type="button" class="filter-chip" data-history="order"></button>
    </div>
    <div class="history-summary"></div>
    <div class="history-list"></div>
    <div class="history-more"></div>`;

  const searchInput = root.querySelector('.search-input');
  const categoryChip = root.querySelector('[data-history="category"]');
  const datesChip = root.querySelector('[data-history="dates"]');
  const orderChip = root.querySelector('[data-history="order"]');
  const summaryEl = root.querySelector('.history-summary');
  const listEl = root.querySelector('.history-list');
  const moreEl = root.querySelector('.history-more');

  const hasFilters = () => Boolean(filters.query.trim() || filters.categoryId || filters.from || filters.to);

  function clearFilters() {
    Object.assign(filters, { query: '', categoryId: '', from: '', to: '' });
    searchInput.value = '';
    visibleCount = PAGE_SIZE;
    render();
  }

  searchInput.addEventListener('input', () => {
    filters.query = searchInput.value;
    visibleCount = PAGE_SIZE;
    renderResults();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchInput.blur(); // fecha o teclado no celular
  });

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-history]');
    if (!target) return;
    switch (target.dataset.history) {
      case 'category': openCategoryPicker(); break;
      case 'dates': openDatePicker(); break;
      case 'order':
        filters.order = filters.order === 'desc' ? 'asc' : 'desc';
        visibleCount = PAGE_SIZE;
        render();
        break;
      case 'clear': clearFilters(); break;
      case 'more':
        visibleCount += PAGE_SIZE;
        renderResults();
        break;
      default: break;
    }
  });

  function renderChips() {
    const category = filters.categoryId ? store.getCategory(filters.categoryId) : null;
    categoryChip.classList.toggle('is-active', Boolean(category));
    categoryChip.innerHTML = category
      ? `<svg class="filter-chip-icon" style="${colorStyle(category.color)}" aria-hidden="true"><use href="#c-${esc(category.icon)}"></use></svg>${esc(category.name)}${icon('chevron-down', 'icon-xs')}`
      : `Categoria${icon('chevron-down', 'icon-xs')}`;
    categoryChip.setAttribute('aria-label', `Filtrar por categoria: ${category ? category.name : 'todas'}`);

    const hasDates = Boolean(filters.from || filters.to);
    datesChip.classList.toggle('is-active', hasDates);
    datesChip.innerHTML = `${icon('calendar', 'icon-xs')}${esc(describeDates(filters))}${icon('chevron-down', 'icon-xs')}`;
    datesChip.setAttribute('aria-label', `Filtrar por datas: ${hasDates ? describeDates(filters) : 'todas'}`);

    const desc = filters.order === 'desc';
    orderChip.innerHTML = `${icon('sort', 'icon-xs')}${desc ? 'Mais recentes' : 'Mais antigas'}`;
    orderChip.setAttribute('aria-label', `Ordem: ${desc ? 'mais recentes primeiro' : 'mais antigas primeiro'}. Tocar para inverter`);
  }

  function renderResults() {
    const all = store.getExpenses();
    const today = todayISO();
    if (all.length === 0) {
      summaryEl.innerHTML = '';
      moreEl.innerHTML = '';
      listEl.innerHTML = emptyStateHTML({
        glyph: 'history',
        title: 'Nenhuma despesa registrada',
        text: 'Tudo o que você registrar aparecerá aqui.',
        action: { action: 'add-expense', label: 'Adicionar despesa' },
      });
      return;
    }

    const results = sortByDate(filterExpenses(all, filters), filters.order);
    const count = results.length;
    summaryEl.innerHTML = `
      <span>${count === 1 ? '1 despesa' : `${count} despesas`} · ${formatMoney(sumCents(results))}</span>
      ${hasFilters() ? '<button type="button" class="link-btn" data-history="clear">Limpar filtros</button>' : ''}`;

    if (count === 0) {
      moreEl.innerHTML = '';
      listEl.innerHTML = `
        <div class="empty">
          <span class="empty-glyph" aria-hidden="true">${icon('search')}</span>
          <p class="empty-title">Nada encontrado</p>
          <p class="empty-text">Nenhuma despesa corresponde a esta busca ou filtro.</p>
          <button type="button" class="btn btn-tinted btn-small" data-history="clear">Limpar filtros</button>
        </div>`;
      return;
    }

    const visible = results.slice(0, visibleCount);
    listEl.innerHTML = groupByDay(visible).map((group) => `
      <div class="day-group">
        <h3 class="day-head"><span>${esc(formatDayHeading(group.date, today))}</span><span class="day-total">${formatMoney(group.totalCents)}</span></h3>
        <ul class="expense-list card">${group.items.map((e) => {
          const category = store.getCategory(e.categoryId);
          return expenseRowHTML(e, category, { meta: expenseMeta(e, category, { today }) });
        }).join('')}</ul>
      </div>`).join('');
    const remaining = count - visible.length;
    moreEl.innerHTML = remaining > 0
      ? `<button type="button" class="btn btn-secondary btn-block" data-history="more">Mostrar mais (${remaining})</button>`
      : '';
  }

  function render() {
    // Se a categoria filtrada foi excluída, o filtro deixa de fazer sentido.
    if (filters.categoryId && !store.getCategories().some((c) => c.id === filters.categoryId)) filters.categoryId = '';
    renderChips();
    renderResults();
  }

  /* ---------------------------------------------------------- seletores */

  function openCategoryPicker() {
    const counts = store.countByCategory();
    const rows = [{ id: '', name: 'Todas as categorias', color: null }, ...store.getCategories()].map((c) => `
      <li>
        <button type="button" class="row" data-pick-category="${esc(c.id)}" aria-pressed="${filters.categoryId === c.id}">
          ${c.color ? categoryIconHTML(c, 'sm') : `<span class="cat-icon cat-icon-sm cat-icon-all" aria-hidden="true">${icon('grid')}</span>`}
          <span class="row-main">${esc(c.name)}</span>
          ${c.id ? `<span class="row-detail">${counts.get(c.id) ?? 0}</span>` : ''}
          ${filters.categoryId === c.id ? icon('check', 'row-check') : ''}
        </button>
      </li>`).join('');
    const panel = openSheet({ title: 'Categoria', body: `<ul class="card list-plain list-inset">${rows}</ul>` });
    panel.querySelector('.sheet-content').addEventListener('click', (event) => {
      const button = event.target.closest('[data-pick-category]');
      if (!button) return;
      filters.categoryId = button.dataset.pickCategory;
      visibleCount = PAGE_SIZE;
      closeSheet();
      render();
    });
  }

  function openDatePicker() {
    const today = todayISO();
    const thisMonth = getPeriodRange('month', today);
    const lastMonth = getPeriodRange('month', addMonths(today, -1));
    const thisYear = getPeriodRange('year', today);
    const presets = [
      { label: 'Este mês', from: thisMonth.start, to: thisMonth.end },
      { label: 'Mês passado', from: lastMonth.start, to: lastMonth.end },
      { label: 'Últimos 30 dias', from: addDays(today, -29), to: today },
      { label: 'Este ano', from: thisYear.start, to: thisYear.end },
    ];
    const body = `
      <div class="preset-row">${presets.map((p, i) => `<button type="button" class="pill" data-preset="${i}">${p.label}</button>`).join('')}</div>
      <div class="date-range">
        <label class="field">
          <span class="field-label">De</span>
          <input type="date" class="input date-input-block" id="h-from" value="${esc(filters.from)}" min="1900-01-01" max="2999-12-31">
        </label>
        <label class="field">
          <span class="field-label">Até</span>
          <input type="date" class="input date-input-block" id="h-to" value="${esc(filters.to)}" min="1900-01-01" max="2999-12-31">
        </label>
      </div>
      <p class="field-error" id="h-dates-error" hidden>A data inicial precisa ser anterior à final.</p>`;
    const footer = `
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" data-dates-clear>Todas as datas</button>
        <button type="button" class="btn btn-primary" data-dates-apply>Aplicar</button>
      </div>`;
    const panel = openSheet({ title: 'Período', body, footer });
    const fromInput = panel.querySelector('#h-from');
    const toInput = panel.querySelector('#h-to');
    const error = panel.querySelector('#h-dates-error');
    const applyButton = panel.querySelector('[data-dates-apply]');

    const validate = () => {
      const from = fromInput.value;
      const to = toInput.value;
      const invalid = (from && !isValidISODate(from)) || (to && !isValidISODate(to)) || (from && to && from > to);
      error.hidden = !invalid;
      applyButton.disabled = Boolean(invalid);
      return !invalid;
    };
    const apply = (from, to) => {
      filters.from = from;
      filters.to = to;
      visibleCount = PAGE_SIZE;
      closeSheet();
      render();
    };

    fromInput.addEventListener('input', validate);
    toInput.addEventListener('input', validate);
    panel.addEventListener('click', (event) => {
      const preset = event.target.closest('[data-preset]');
      if (preset) {
        const p = presets[Number(preset.dataset.preset)];
        apply(p.from, p.to);
      } else if (event.target.closest('[data-dates-clear]')) {
        apply('', '');
      } else if (event.target.closest('[data-dates-apply]') && validate()) {
        apply(fromInput.value, toInput.value);
      }
    });
  }

  /** Ao chegar com parâmetros (ex.: tocando numa categoria no Início), aplica os filtros. */
  function show(params) {
    if (params && (params.has('cat') || params.has('de') || params.has('ate'))) {
      const cat = params.get('cat') ?? '';
      const from = params.get('de') ?? '';
      const to = params.get('ate') ?? '';
      filters.categoryId = cat;
      filters.from = isValidISODate(from) ? from : '';
      filters.to = isValidISODate(to) ? to : '';
      filters.query = '';
      searchInput.value = '';
      visibleCount = PAGE_SIZE;
    }
    render();
  }

  return { el: root, render, show };
}

function describeDates({ from, to }) {
  if (from && to) return capitalize(formatRange(from, to, { compact: true }));
  if (from) return `Desde ${formatLongDate(from)}`;
  if (to) return `Até ${formatLongDate(to)}`;
  return 'Datas';
}
