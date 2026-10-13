/**
 * Tela inicial: o período é o título; o anel com o total é o centro, com a
 * aura de gastos atrás; uma frase lê os dados; depois vêm as categorias e a
 * lista de despesas do período.
 */
import * as store from '../store.js';
import {
  summarizePeriod, sortByDate, groupByDay, groupByMonth, filterByRange, sumCents,
} from '../calc.js';
import { formatMoney, formatNumber, formatPercent } from '../money.js';
import {
  todayISO, formatDayHeading, capitalize, MONTHS, PERIOD_NOUNS, addDays, parseISODate,
  timestampToLocalDate, timestampToLocalTime, formatShortDate, toISODate, getPreviousRange, formatPeriodTitle,
} from '../dates.js';
import { createDonut } from '../charts.js';
import { normalizeText } from '../model.js';
import {
  esc, icon, colorStyle, categoryIconHTML, expenseRowHTML, periodControlsHTML, updatePeriodControls, replayAnimation,
} from '../ui.js';
import { createAura, rollNumber, setTopbar, observeReveals } from '../atmosphere.js';

const SUMMARY_LIMIT = 5;

/** Texto secundário de cada despesa: categoria e, quando faz sentido, o horário. */
export function expenseMeta(expense, category, { withDate = false, today = todayISO() } = {}) {
  // Sem descrição, o título já é o nome da categoria: não repete.
  const parts = normalizeText(expense.title) === normalizeText(category.name) ? [] : [category.name];
  if (withDate) parts.push(formatShortDate(expense.date, today));
  // O horário só é informativo se a despesa foi registrada no próprio dia.
  else if (timestampToLocalDate(expense.createdAt) === expense.date) parts.push(timestampToLocalTime(expense.createdAt));
  return parts.join(' · ');
}

/** Tamanho do total no centro do anel, para que valores longos ainda caibam. */
function totalFontSize(text) {
  const n = text.length;
  if (n <= 5) return 50;
  if (n <= 7) return 44;
  if (n <= 9) return 37;
  if (n <= 11) return 31;
  return 26;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "de setembro", "da semana anterior", "de ontem"… — a referência da comparação. */
function previousPhrase(range, previous, today) {
  switch (range.mode) {
    case 'day': return previous.start === addDays(today, -1) ? 'de ontem' : 'do dia anterior';
    case 'week': return 'da semana anterior';
    case 'month': {
      const p = parseISODate(previous.start);
      const sameYear = p.y === parseISODate(range.start).y;
      return `de ${MONTHS[p.m - 1]}${sameYear ? '' : ` de ${p.y}`}`;
    }
    case 'year': return `de ${parseISODate(previous.start).y}`;
    default: return '';
  }
}

export function createHomeView(root) {
  root.innerHTML = `
    <h1 class="visually-hidden" tabindex="-1">Resumo de gastos</h1>
    <div class="home-layout">
      <div class="home-summary-col">
        ${periodControlsHTML('home', { variant: 'hero' })}
        <section class="hero" aria-label="Resumo do período">
          <div class="donut" role="img">
            <div class="aura" data-parallax="0.24" data-fade="560" aria-hidden="true"></div>
            <svg class="donut-svg" aria-hidden="true" focusable="false"></svg>
            <div class="donut-center" aria-hidden="true">
              <span class="donut-label">Total gasto</span>
              <strong class="donut-total"><span class="currency">R$</span><span class="total-int">0</span><span class="total-cents">,00</span></strong>
              <span class="donut-count"></span>
            </div>
          </div>
          <div class="insight" aria-live="polite"></div>
        </section>
        <div class="cat-summary-wrap"></div>
      </div>
      <section class="home-list-col" aria-labelledby="home-list-title">
        <div class="section-head">
          <h2 class="section-title" id="home-list-title">Despesas</h2>
          <a class="section-link" href="#/historico">Ver tudo ${icon('chevron-right', 'icon-xs')}</a>
        </div>
        <div class="home-list"></div>
      </section>
    </div>`;

  const donut = createDonut(root.querySelector('.donut-svg'));
  const aura = createAura(root.querySelector('.aura'));
  const donutBox = root.querySelector('.donut');
  const totalEl = root.querySelector('.donut-total');
  const totalInt = root.querySelector('.total-int');
  const totalCents = root.querySelector('.total-cents');
  const countEl = root.querySelector('.donut-count');
  const insightEl = root.querySelector('.insight');
  const summaryWrap = root.querySelector('.cat-summary-wrap');
  const listCol = root.querySelector('.home-list-col');
  const listEl = root.querySelector('.home-list');
  const seeAll = root.querySelector('.section-link');
  let showAllCategories = false;
  let lastRangeKey = '';
  let shownTotal = 0;
  let topbar = { title: '', detail: '' };

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-toggle-categories]')) {
      showAllCategories = !showAllCategories;
      render();
    }
  });

  /* ------------------------------------------------------------ total */

  function paintTotal(cents) {
    const [integer, fraction] = formatNumber(cents).split(',');
    totalInt.textContent = integer;
    totalCents.textContent = `,${fraction}`;
  }

  function renderTotal(summary) {
    totalEl.style.setProperty('--total-fs', `${totalFontSize(formatNumber(summary.totalCents))}px`);
    rollNumber(totalEl, shownTotal, summary.totalCents, paintTotal);
    shownTotal = summary.totalCents;
    countEl.textContent = summary.count === 0 ? 'nenhuma despesa' : plural(summary.count, 'despesa', 'despesas');
    const parts = summary.categories.map((row) => `${store.getCategory(row.categoryId).name} ${formatPercent(row.percent)}`);
    donutBox.setAttribute('aria-label', `Total gasto: ${formatMoney(summary.totalCents)}${parts.length ? `. ${parts.join(', ')}` : ''}`);
  }

  /* ---------------------------------------------------- frase de leitura */

  function renderInsight(summary, range, today) {
    const previous = getPreviousRange(range);
    const previousCents = sumCents(filterByRange(store.getExpenses(), previous));
    const noun = PERIOD_NOUNS[range.mode];

    if (store.getExpenses().length === 0) {
      insightEl.innerHTML = `
        <p class="insight-lead">Seu primeiro gasto começa aqui.</p>
        <p class="insight-sub">Registrar leva poucos segundos — sem precisar abrir o teclado.</p>
        <button type="button" class="btn btn-primary btn-cta" data-action="add-expense">${icon('plus')}Adicionar despesa</button>`;
      return;
    }
    if (summary.count === 0) {
      insightEl.innerHTML = `
        <p class="insight-lead">Nenhum gasto neste período.</p>
        ${previousCents > 0 ? `<p class="insight-sub">No período anterior foram ${formatMoney(previousCents)}.</p>` : ''}`;
      return;
    }

    const top = summary.categories[0];
    const category = store.getCategory(top.categoryId);
    const name = `<span class="insight-cat" style="${colorStyle(category.color)}">${esc(category.name)}</span>`;
    let lead;
    if (summary.categories.length === 1) lead = `Todos os gastos ${noun} foram em ${name}.`;
    else if (top.percent >= 50) lead = `${name} concentra ${formatPercent(top.percent)} dos gastos ${noun}.`;
    else lead = `${name} lidera os gastos ${noun}, com ${formatPercent(top.percent)}.`;

    let sub;
    if (previousCents > 0) {
      const change = ((summary.totalCents - previousCents) / previousCents) * 100;
      const phrase = previousPhrase(range, previous, today);
      sub = Math.abs(change) < 1
        ? `Praticamente o mesmo valor ${phrase}.`
        : `${formatPercent(Math.abs(change))} ${change > 0 ? 'acima' : 'abaixo'} ${phrase}.`;
    } else {
      sub = `Média de ${formatMoney(summary.averageCents)} por despesa.`;
    }
    insightEl.innerHTML = `<p class="insight-lead">${lead}</p><p class="insight-sub">${esc(sub)}</p>`;
  }

  /* --------------------------------------------------------- categorias */

  function renderCategories(summary, range) {
    if (summary.count === 0) {
      summaryWrap.innerHTML = '';
      return;
    }
    const rows = showAllCategories ? summary.categories : summary.categories.slice(0, SUMMARY_LIMIT);
    const hidden = summary.categories.length - SUMMARY_LIMIT;
    const items = rows.map((row, index) => {
      const category = store.getCategory(row.categoryId);
      const href = `#/historico?cat=${encodeURIComponent(row.categoryId)}&de=${range.start}&ate=${range.end}`;
      return `
        <li>
          <a class="cat-row" href="${esc(href)}" style="${colorStyle(category.color)};--i:${index}"
            aria-label="${esc(`${category.name}: ${formatMoney(row.totalCents)}, ${formatPercent(row.percent)} do total. Ver despesas`)}">
            ${categoryIconHTML(category, 'sm')}
            <span class="cat-main">
              <span class="cat-line">
                <span class="cat-name">${esc(category.name)}</span>
                <span class="cat-value">${formatMoney(row.totalCents)}</span>
              </span>
              <span class="cat-meter" aria-hidden="true"><span style="width:${Math.max(row.percent, 1.5).toFixed(2)}%"></span></span>
              <span class="cat-line cat-line-sub">
                <span class="cat-meta">${plural(row.count, 'despesa', 'despesas')}</span>
                <span class="cat-pct">${formatPercent(row.percent)}</span>
              </span>
            </span>
          </a>
        </li>`;
    }).join('');
    const toggle = hidden > 0 ? `
      <li>
        <button type="button" class="cat-toggle" data-toggle-categories aria-expanded="${showAllCategories}">
          ${showAllCategories ? 'Mostrar menos' : `Mostrar mais ${plural(hidden, 'categoria', 'categorias')}`}
          ${icon('chevron-down', 'icon-xs cat-toggle-chevron')}
        </button>
      </li>` : '';
    summaryWrap.innerHTML = `<ul class="cat-summary card" data-reveal>${items}${toggle}</ul>`;
  }

  /* -------------------------------------------------------------- lista */

  function renderList(summary, range, today) {
    if (summary.count === 0) {
      listCol.hidden = true;
      listEl.innerHTML = '';
      return;
    }
    listCol.hidden = false;
    seeAll.href = `#/historico?de=${range.start}&ate=${range.end}`;
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
      const max = Math.max(...months.map((m) => m.totalCents));
      listEl.innerHTML = `<ul class="month-list card" data-reveal>${months.map((m, index) => {
        const anchor = today.startsWith(m.key) ? today : toISODate(m.year, m.month, 1);
        const label = capitalize(MONTHS[m.month - 1]);
        const count = plural(m.items.length, 'despesa', 'despesas');
        return `
          <li>
            <button type="button" class="month-row" data-action="open-month" data-anchor="${anchor}" style="--i:${index}"
              aria-label="${esc(`${label}: ${formatMoney(m.totalCents)}, ${count}`)}">
              <span class="month-main">
                <span class="month-name">${esc(label)}</span>
                <span class="month-meter" aria-hidden="true"><span style="width:${Math.max((m.totalCents / max) * 100, 2).toFixed(2)}%"></span></span>
                <span class="month-meta">${count}</span>
              </span>
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

  /* ------------------------------------------------------------- render */

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
    const geometry = donut.update(summary.categories.map((row) => ({
      key: row.categoryId,
      value: row.totalCents,
      color: store.getCategory(row.categoryId).color,
    })));
    const ringWidth = donutBox.offsetWidth || Math.min(300, window.innerWidth * 0.76);
    aura.update(geometry, ringWidth * (102 / 240));
    renderInsight(summary, range, today);
    renderCategories(summary, range);
    renderList(summary, range, today);
    observeReveals(root);

    topbar = { title: formatPeriodTitle(range, today).title, detail: formatMoney(summary.totalCents) };
    if (!root.hidden) setTopbar(topbar.title, topbar.detail);

    if (periodChanged) {
      replayAnimation(insightEl, 'is-entering');
      replayAnimation(listEl, 'is-entering');
    }
  }

  return { el: root, render, show: render, topbar: () => topbar };
}
