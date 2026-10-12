/**
 * Tela inicial: período, anel com o total, resumo por categoria e a lista
 * de despesas do período.
 */
import * as store from '../store.js';
import { APP_NAME } from '../config.js';
import { summarizePeriod, sortByDate, groupByDay, groupByMonth } from '../calc.js';
import { formatMoney, formatNumber, formatPercent } from '../money.js';
import {
  todayISO, formatDayHeading, capitalize, MONTHS,
  timestampToLocalDate, timestampToLocalTime, formatShortDate, toISODate,
} from '../dates.js';
import { createDonut } from '../charts.js';
import {
  esc, icon, colorStyle, expenseRowHTML, emptyStateHTML, periodControlsHTML, todayPillHTML,
  updatePeriodControls, replayAnimation,
} from '../ui.js';

const SUMMARY_LIMIT = 5;

/** Texto secundário de cada despesa: categoria e, quando faz sentido, o horário. */
export function expenseMeta(expense, category, { withDate = false, today = todayISO() } = {}) {
  const parts = [category.name];
  if (withDate) parts.push(formatShortDate(expense.date, today));
  // O horário só é informativo se a despesa foi registrada no próprio dia.
  else if (timestampToLocalDate(expense.createdAt) === expense.date) parts.push(timestampToLocalTime(expense.createdAt));
  return parts.join(' · ');
}

/** Ajusta o tamanho do total para caber no centro do anel. */
function totalFontSize(text) {
  const n = text.length;
  if (n <= 6) return 34;
  if (n <= 8) return 30;
  if (n <= 10) return 26;
  if (n <= 12) return 22;
  return 19;
}

export function createHomeView(root) {
  root.innerHTML = `
    <header class="page-header home-header">
      <h1 class="brand" tabindex="-1">${icon('logo', 'brand-mark')}<span data-app-name>${esc(APP_NAME)}</span></h1>
      <div class="header-actions">
        ${todayPillHTML()}
        <a class="icon-btn header-settings" href="#/ajustes" aria-label="Ajustes">${icon('settings')}</a>
      </div>
    </header>
    <div class="home-layout">
      <div class="home-summary-col">
        ${periodControlsHTML()}
        <section class="summary" aria-label="Resumo do período">
          <div class="donut" role="img">
            <svg class="donut-svg" aria-hidden="true" focusable="false"></svg>
            <div class="donut-center" aria-hidden="true">
              <span class="donut-label">Total gasto</span>
              <strong class="donut-total"></strong>
              <span class="donut-count"></span>
            </div>
          </div>
          <div class="cat-summary-wrap"></div>
        </section>
      </div>
      <section class="home-list-col" aria-labelledby="home-list-title">
        <h2 class="section-title" id="home-list-title">Despesas</h2>
        <div class="home-list"></div>
      </section>
    </div>`;

  const donut = createDonut(root.querySelector('.donut-svg'));
  const donutBox = root.querySelector('.donut');
  const totalEl = root.querySelector('.donut-total');
  const countEl = root.querySelector('.donut-count');
  const summaryWrap = root.querySelector('.cat-summary-wrap');
  const listEl = root.querySelector('.home-list');
  const listTitle = root.querySelector('#home-list-title');
  let showAllCategories = false;
  let lastRangeKey = '';

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-toggle-categories]')) {
      showAllCategories = !showAllCategories;
      render();
    }
  });

  function renderTotal(summary) {
    const value = formatNumber(summary.totalCents);
    totalEl.innerHTML = `<span class="currency">R$</span>${esc(value)}`;
    totalEl.style.setProperty('--donut-fs', `${totalFontSize(value)}px`);
    countEl.textContent = summary.count === 0 ? '' : summary.count === 1 ? '1 despesa' : `${summary.count} despesas`;
    const parts = summary.categories.map((row) => `${store.getCategory(row.categoryId).name} ${formatPercent(row.percent)}`);
    donutBox.setAttribute('aria-label', `Total gasto: ${formatMoney(summary.totalCents)}${parts.length ? `. ${parts.join(', ')}` : ''}`);
  }

  function renderCategories(summary, range) {
    if (summary.count === 0) {
      summaryWrap.innerHTML = '';
      return;
    }
    const rows = showAllCategories ? summary.categories : summary.categories.slice(0, SUMMARY_LIMIT);
    const hidden = summary.categories.length - SUMMARY_LIMIT;
    const items = rows.map((row) => {
      const category = store.getCategory(row.categoryId);
      const href = `#/historico?cat=${encodeURIComponent(row.categoryId)}&de=${range.start}&ate=${range.end}`;
      return `
        <li>
          <a class="cat-row" href="${esc(href)}" style="${colorStyle(category.color)}"
            aria-label="${esc(`${category.name}: ${formatMoney(row.totalCents)}, ${formatPercent(row.percent)} do total. Ver despesas`)}">
            <span class="dot" aria-hidden="true"></span>
            <span class="cat-name">${esc(category.name)}</span>
            <span class="cat-pct">${formatPercent(row.percent)}</span>
            <span class="cat-value">${formatMoney(row.totalCents)}</span>
            <span class="cat-bar" aria-hidden="true"><span style="width:${Math.max(row.percent, 0.8).toFixed(2)}%"></span></span>
          </a>
        </li>`;
    }).join('');
    const toggle = hidden > 0 ? `
      <button type="button" class="link-btn cat-toggle" data-toggle-categories aria-expanded="${showAllCategories}">
        ${showAllCategories ? 'Mostrar menos' : `Mais ${hidden} ${hidden === 1 ? 'categoria' : 'categorias'}`}
      </button>` : '';
    summaryWrap.innerHTML = `<ul class="cat-summary card">${items}</ul>${toggle}`;
  }

  function renderList(summary, range, today) {
    const total = store.getExpenses().length;
    if (summary.count === 0) {
      listTitle.hidden = true;
      listEl.innerHTML = total === 0
        ? emptyStateHTML({
          title: 'Nenhum gasto ainda',
          text: 'Adicione sua primeira despesa para começar.',
          action: { action: 'add-expense', label: 'Adicionar despesa' },
        })
        : emptyStateHTML({ title: 'Nenhum gasto neste período.' });
      return;
    }
    listTitle.hidden = false;
    const flashId = store.consumeRecentlySaved();
    const sorted = sortByDate(summary.items, 'desc');
    const row = (e) => {
      const category = store.getCategory(e.categoryId);
      return expenseRowHTML(e, category, { meta: expenseMeta(e, category, { today }), flash: e.id === flashId });
    };

    if (range.mode === 'day') {
      listEl.innerHTML = `<ul class="expense-list card">${sorted.map(row).join('')}</ul>`;
      return;
    }

    if (range.mode === 'year') {
      // No ano, um resumo por mês evita uma lista interminável; cada mês abre o detalhe.
      const months = groupByMonth(sorted);
      listEl.innerHTML = `<ul class="month-list card">${months.map((m) => {
        const anchor = today.startsWith(m.key) ? today : toISODate(m.year, m.month, 1);
        const label = capitalize(MONTHS[m.month - 1]);
        const count = m.items.length === 1 ? '1 despesa' : `${m.items.length} despesas`;
        return `
          <li>
            <button type="button" class="month-row" data-action="open-month" data-anchor="${anchor}"
              aria-label="${esc(`${label}: ${formatMoney(m.totalCents)}, ${count}`)}">
              <span class="month-main"><span class="month-name">${esc(label)}</span><span class="month-meta">${count}</span></span>
              <span class="month-total">${formatMoney(m.totalCents)}</span>
              ${icon('chevron-right', 'icon-sm month-chevron')}
            </button>
          </li>`;
      }).join('')}</ul>`;
      return;
    }

    // Semana e mês: agrupado por dia, do mais recente para o mais antigo, com subtotal.
    listEl.innerHTML = groupByDay(sorted).map((group) => `
      <div class="day-group">
        <h3 class="day-head"><span>${esc(formatDayHeading(group.date, today))}</span><span class="day-total">${formatMoney(group.totalCents)}</span></h3>
        <ul class="expense-list card">${group.items.map(row).join('')}</ul>
      </div>`).join('');
  }

  function render() {
    const range = store.getRange();
    const today = todayISO();
    const summary = summarizePeriod(store.getExpenses(), range);
    const rangeKey = `${range.mode}:${range.start}`;
    const periodChanged = lastRangeKey !== '' && rangeKey !== lastRangeKey;
    lastRangeKey = rangeKey;
    if (periodChanged) showAllCategories = false;

    updatePeriodControls(root, range, today);
    renderTotal(summary);
    donut.update(summary.categories.map((row) => ({
      key: row.categoryId,
      value: row.totalCents,
      color: store.getCategory(row.categoryId).color,
    })));
    renderCategories(summary, range);
    renderList(summary, range, today);

    if (periodChanged) {
      replayAnimation(summaryWrap, 'is-entering');
      replayAnimation(listEl, 'is-entering');
    }
  }

  return { el: root, render, show: render };
}
