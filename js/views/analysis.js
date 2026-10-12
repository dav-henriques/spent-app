/**
 * Análise: indicadores do período, comparação com o período anterior
 * equivalente, evolução ao longo do tempo, distribuição por categoria e as
 * maiores despesas. Tudo calculado a partir dos registros reais.
 *
 * Os números são apresentados de forma neutra: um aumento não é marcado como
 * "ruim" nem uma queda como "boa".
 */
import * as store from '../store.js';
import {
  summarizePeriod, comparePeriods, elapsedEquivalentRange, filterByRange, sumCents, buildTimeline, topExpenses,
} from '../calc.js';
import { formatMoney, formatSignedMoney, formatPercent, formatSignedPercent } from '../money.js';
import {
  todayISO, getPreviousRange, formatPeriodLabel, formatRange, capitalize, isDateInRange,
  MONTHS_SHORT, parseISODate, weekdayShort,
} from '../dates.js';
import { barChartHTML } from '../charts.js';
import {
  esc, colorStyle, expenseRowHTML, emptyStateHTML, periodControlsHTML, todayPillHTML, updatePeriodControls, replayAnimation,
} from '../ui.js';
import { expenseMeta } from './home.js';

const TIMELINE_TITLES = {
  day: 'Últimos 7 dias',
  week: 'Últimas 8 semanas',
  month: 'Últimos 6 meses',
  year: 'Mês a mês',
};

const AVERAGE_LABELS = {
  day: 'Média diária',
  week: 'Média semanal',
  month: 'Média mensal',
  year: 'Média mensal',
};

function bucketLabel(mode, range) {
  const p = parseISODate(range.start);
  switch (mode) {
    case 'day': return weekdayShort(range.start);
    case 'week': return `${p.d}/${p.m}`;
    default: return MONTHS_SHORT[p.m - 1];
  }
}

export function createAnalysisView(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title" tabindex="-1">Análise</h1>
      <div class="header-actions">${todayPillHTML()}</div>
    </header>
    ${periodControlsHTML()}
    <div class="analysis-body"></div>`;

  const body = root.querySelector('.analysis-body');
  let lastRangeKey = '';

  function metricsHTML(summary) {
    const top = summary.categories[0];
    const topCategory = top ? store.getCategory(top.categoryId) : null;
    const topHref = top ? `#/historico?cat=${encodeURIComponent(top.categoryId)}&de=${summary.range.start}&ate=${summary.range.end}` : '';
    return `
      <div class="metrics">
        <div class="metric">
          <span class="metric-label">Total gasto</span>
          <span class="metric-value">${formatMoney(summary.totalCents)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Despesas</span>
          <span class="metric-value">${summary.count}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Média por despesa</span>
          <span class="metric-value">${formatMoney(summary.averageCents)}</span>
        </div>
        <a class="metric metric-link" href="${esc(topHref)}" style="${colorStyle(topCategory.color)}">
          <span class="metric-label">Maior categoria</span>
          <span class="metric-value metric-category"><span class="dot" aria-hidden="true"></span>${esc(topCategory.name)}</span>
          <span class="metric-detail">${formatMoney(top.totalCents)} · ${formatPercent(top.percent)}</span>
        </a>
      </div>`;
  }

  function comparisonHTML(summary, today) {
    const range = summary.range;
    const previous = getPreviousRange(range);
    const previousCents = sumCents(filterByRange(store.getExpenses(), previous));
    const result = comparePeriods(summary.totalCents, previousCents);
    const previousLabel = formatPeriodLabel(previous);
    const prefix = { day: 'o dia anterior', week: 'a semana anterior', month: 'o mês anterior', year: 'o ano anterior' }[range.mode];

    let content;
    if (result.status === 'empty') {
      return ''; // nada a comparar; o estado vazio da tela já informa isso
    } else if (result.status === 'no-previous') {
      content = `
        <p class="compare-note">Nenhum gasto registrado em ${esc(previousLabel)} — não há base para comparar.</p>`;
    } else {
      content = `
        <div class="compare-grid">
          <div>
            <span class="metric-label">${esc(capitalize(previousLabel))}</span>
            <span class="compare-value">${formatMoney(previousCents)}</span>
          </div>
          <div class="compare-diff">
            <span class="metric-label">Diferença</span>
            <span class="compare-value">${formatSignedMoney(result.diffCents)}</span>
            <span class="compare-pct">${formatSignedPercent(result.percent)}</span>
          </div>
        </div>`;
    }

    // Período em andamento: compara também com o mesmo trecho do período anterior.
    const partial = elapsedEquivalentRange(range, previous, today);
    let partialHTML = '';
    if (partial && result.status === 'ok') {
      const partialCents = sumCents(filterByRange(store.getExpenses(), partial));
      const currentToDate = sumCents(filterByRange(summary.items, { start: partial.currentStart, end: partial.currentEnd }));
      const partialResult = comparePeriods(currentToDate, partialCents);
      const diffText = partialResult.status === 'ok'
        ? ` (${formatSignedMoney(partialResult.diffCents)}, ${formatSignedPercent(partialResult.percent)})`
        : '';
      partialHTML = `
        <p class="compare-partial">
          Como o período ainda não terminou: até hoje foram <strong>${formatMoney(currentToDate)}</strong>;
          no mesmo trecho do período anterior (${esc(formatRange(partial.start, partial.end, { compact: true }))}),
          <strong>${formatMoney(partialCents)}</strong>${diffText}.
        </p>`;
    }

    return `
      <section class="analysis-section" aria-labelledby="an-compare">
        <h2 class="section-title" id="an-compare">Comparado com ${esc(prefix)}</h2>
        <div class="card card-pad">${content}${partialHTML}</div>
      </section>`;
  }

  function timelineHTML(range, today) {
    const buckets = buildTimeline(store.getExpenses(), range);
    if (!buckets.some((b) => b.totalCents > 0)) return '';
    const items = buckets.map((bucket) => {
      const anchor = isDateInRange(today, bucket.range) ? today : bucket.range.start;
      const label = bucketLabel(range.mode === 'year' ? 'month' : range.mode, bucket.range);
      const name = capitalize(formatPeriodLabel(bucket.range));
      return {
        label,
        anchor,
        totalCents: bucket.totalCents,
        selected: bucket.selected,
        current: range.mode === 'year' && isDateInRange(today, bucket.range),
        ariaLabel: `${name}: ${formatMoney(bucket.totalCents)}. Ver período`,
      };
    });
    const max = buckets.reduce((m, b) => Math.max(m, b.totalCents), 0);
    const average = Math.round(sumCents(buckets.map((b) => ({ amountCents: b.totalCents }))) / buckets.length);
    return `
      <section class="analysis-section" aria-labelledby="an-timeline">
        <h2 class="section-title" id="an-timeline">${TIMELINE_TITLES[range.mode]}</h2>
        <div class="card card-pad">
          <div class="timeline-stats">
            <span>Maior: <strong>${formatMoney(max)}</strong></span>
            <span>${AVERAGE_LABELS[range.mode]}: <strong>${formatMoney(average)}</strong></span>
          </div>
          ${barChartHTML(items)}
        </div>
      </section>`;
  }

  function categoriesHTML(summary) {
    if (summary.categories.length < 2) return '';
    const max = summary.categories[0].totalCents;
    const rows = summary.categories.map((row) => {
      const category = store.getCategory(row.categoryId);
      const href = `#/historico?cat=${encodeURIComponent(row.categoryId)}&de=${summary.range.start}&ate=${summary.range.end}`;
      return `
        <li>
          <a class="hbar" href="${esc(href)}" style="${colorStyle(category.color)}">
            <span class="hbar-top">
              <span class="hbar-name"><span class="dot" aria-hidden="true"></span>${esc(category.name)}</span>
              <span class="hbar-value">${formatMoney(row.totalCents)} <span class="hbar-pct">${formatPercent(row.percent)}</span></span>
            </span>
            <span class="hbar-track" aria-hidden="true"><span style="width:${Math.max((row.totalCents / max) * 100, 1).toFixed(2)}%"></span></span>
          </a>
        </li>`;
    }).join('');
    return `
      <section class="analysis-section" aria-labelledby="an-categories">
        <h2 class="section-title" id="an-categories">Por categoria</h2>
        <ul class="card hbar-list">${rows}</ul>
      </section>`;
  }

  function topHTML(summary, today) {
    if (summary.count < 2) return '';
    const items = topExpenses(summary.items, 5).map((e) => {
      const category = store.getCategory(e.categoryId);
      return expenseRowHTML(e, category, { meta: expenseMeta(e, category, { withDate: true, today }) });
    }).join('');
    return `
      <section class="analysis-section" aria-labelledby="an-top">
        <h2 class="section-title" id="an-top">Maiores despesas</h2>
        <ul class="expense-list card">${items}</ul>
      </section>`;
  }

  function render() {
    const range = store.getRange();
    const today = todayISO();
    updatePeriodControls(root, range, today);

    if (store.getExpenses().length === 0) {
      body.innerHTML = emptyStateHTML({
        title: 'Ainda não há o que analisar',
        text: 'Os indicadores aparecem conforme você registra suas despesas.',
        action: { action: 'add-expense', label: 'Adicionar despesa' },
      });
      return;
    }

    const summary = summarizePeriod(store.getExpenses(), range);
    if (summary.count === 0) {
      body.innerHTML = `
        ${emptyStateHTML({ title: 'Nenhum gasto neste período.' })}
        ${comparisonHTML(summary, today)}
        ${timelineHTML(range, today)}`;
    } else {
      body.innerHTML = `
        ${metricsHTML(summary)}
        ${comparisonHTML(summary, today)}
        ${timelineHTML(range, today)}
        ${categoriesHTML(summary)}
        ${topHTML(summary, today)}`;
    }

    const rangeKey = `${range.mode}:${range.start}`;
    if (lastRangeKey && rangeKey !== lastRangeKey) replayAnimation(body, 'is-entering');
    lastRangeKey = rangeKey;
  }

  return { el: root, render, show: render };
}
