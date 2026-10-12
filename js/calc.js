/**
 * Cálculos sobre as despesas. Funções puras: recebem listas e devolvem
 * resultados, sem tocar em armazenamento ou interface.
 *
 * O gráfico, o resumo por categoria, a lista e a tela de análise usam todos
 * `summarizePeriod`, de modo que o total central é, por construção, a soma
 * exata das categorias exibidas.
 */
import {
  addDays, diffDays, getPeriodRange, isDateInRange, shiftAnchor, todayISO,
} from './dates.js';
import { normalizeText } from './model.js';

/** Despesas cuja data está dentro do intervalo (limites inclusivos). */
export function filterByRange(expenses, range) {
  return expenses.filter((e) => e.date >= range.start && e.date <= range.end);
}

export function sumCents(expenses) {
  let total = 0;
  for (const e of expenses) total += e.amountCents;
  return total;
}

export const countExpenses = (expenses) => expenses.length;

/** Média por despesa, arredondada ao centavo. Zero quando não há despesas. */
export function averageCents(expenses) {
  return expenses.length ? Math.round(sumCents(expenses) / expenses.length) : 0;
}

/** Agrupa por categoria: Map(categoryId → { categoryId, totalCents, count }). */
export function groupByCategory(expenses) {
  const groups = new Map();
  for (const e of expenses) {
    const group = groups.get(e.categoryId) ?? { categoryId: e.categoryId, totalCents: 0, count: 0 };
    group.totalCents += e.amountCents;
    group.count += 1;
    groups.set(e.categoryId, group);
  }
  return groups;
}

/**
 * Participação de cada categoria no total, da maior para a menor.
 * Categorias sem despesas simplesmente não aparecem.
 */
export function categoryBreakdown(expenses) {
  const totalCents = sumCents(expenses);
  const rows = [...groupByCategory(expenses).values()]
    .map((row) => ({ ...row, percent: totalCents > 0 ? (row.totalCents / totalCents) * 100 : 0 }))
    .sort((a, b) => b.totalCents - a.totalCents || a.categoryId.localeCompare(b.categoryId));
  return { totalCents, rows };
}

/** Ordena por data e, no mesmo dia, pela ordem de criação. */
export function sortByDate(expenses, direction = 'desc') {
  const factor = direction === 'asc' ? 1 : -1;
  return [...expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -factor : factor;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -factor : factor;
    return 0;
  });
}

/** Agrupa uma lista já ordenada por dia, preservando a ordem. */
export function groupByDay(sortedExpenses) {
  const groups = [];
  let current = null;
  for (const e of sortedExpenses) {
    if (!current || current.date !== e.date) {
      current = { date: e.date, items: [], totalCents: 0 };
      groups.push(current);
    }
    current.items.push(e);
    current.totalCents += e.amountCents;
  }
  return groups;
}

/** Agrupa uma lista já ordenada por mês ("YYYY-MM"), preservando a ordem. */
export function groupByMonth(sortedExpenses) {
  const groups = [];
  let current = null;
  for (const e of sortedExpenses) {
    const key = e.date.slice(0, 7);
    if (!current || current.key !== key) {
      current = { key, year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), items: [], totalCents: 0 };
      groups.push(current);
    }
    current.items.push(e);
    current.totalCents += e.amountCents;
  }
  return groups;
}

/** Resumo completo de um período — a fonte única para gráfico, resumo e análise. */
export function summarizePeriod(expenses, range) {
  const items = filterByRange(expenses, range);
  const { totalCents, rows } = categoryBreakdown(items);
  return {
    range,
    items,
    totalCents,
    count: items.length,
    averageCents: items.length ? Math.round(totalCents / items.length) : 0,
    categories: rows,
  };
}

/**
 * Compara dois totais. A variação percentual só existe quando o período
 * anterior tem gastos (não há divisão por zero nem porcentagens infinitas).
 */
export function comparePeriods(currentCents, previousCents) {
  const diffCents = currentCents - previousCents;
  if (currentCents === 0 && previousCents === 0) return { status: 'empty', diffCents: 0, percent: null };
  if (previousCents === 0) return { status: 'no-previous', diffCents, percent: null };
  return { status: 'ok', diffCents, percent: (diffCents / previousCents) * 100 };
}

/**
 * Se o período atual ainda está em andamento, devolve o trecho equivalente do
 * período anterior (ex.: 1º–12 de setembro quando hoje é 12 de outubro), para
 * uma comparação justa "até o mesmo ponto". Caso contrário, null.
 */
export function elapsedEquivalentRange(range, previousRange, today = todayISO()) {
  if (range.mode === 'day' || !isDateInRange(today, range) || today === range.end) return null;
  const elapsedDays = diffDays(range.start, today);
  const end = addDays(previousRange.start, elapsedDays);
  return {
    mode: 'custom',
    start: previousRange.start,
    end: end > previousRange.end ? previousRange.end : end,
    currentStart: range.start,
    currentEnd: today,
  };
}

/**
 * Série temporal para o gráfico de barras da análise:
 * dia → últimos 7 dias; semana → últimas 8 semanas;
 * mês → últimos 6 meses; ano → os 12 meses do ano.
 */
export function buildTimeline(expenses, range) {
  const buckets = [];
  const push = (bucketRange, selected) => {
    buckets.push({ range: bucketRange, totalCents: sumCents(filterByRange(expenses, bucketRange)), selected });
  };
  if (range.mode === 'year') {
    const year = range.start.slice(0, 4);
    for (let m = 1; m <= 12; m += 1) {
      push(getPeriodRange('month', `${year}-${String(m).padStart(2, '0')}-01`), false);
    }
    return buckets;
  }
  const count = { day: 7, week: 8, month: 6 }[range.mode];
  for (let i = count - 1; i >= 0; i -= 1) {
    push(getPeriodRange(range.mode, shiftAnchor(range.mode, range.anchor, -i)), i === 0);
  }
  return buckets;
}

/** As maiores despesas do conjunto (por valor; empate → mais recente primeiro). */
export function topExpenses(expenses, limit = 5) {
  return [...expenses]
    .sort((a, b) => b.amountCents - a.amountCents || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

/**
 * Filtros do histórico. Nunca altera a lista original.
 * `query` busca na descrição e na observação, ignorando acentos e maiúsculas.
 */
export function filterExpenses(expenses, { query = '', categoryId = '', from = '', to = '' } = {}) {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  return expenses.filter((e) => {
    if (categoryId && e.categoryId !== categoryId) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (terms.length) {
      const haystack = normalizeText(`${e.title} ${e.note}`);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}

/**
 * Sugestões de descrição para o cadastro rápido, com base nas despesas mais
 * recentes. Cada sugestão traz a categoria usada da última vez com aquele texto.
 */
export function titleSuggestions(expenses, prefix = '', limit = 6) {
  const recent = [...expenses].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 300);
  const wanted = normalizeText(prefix);
  const scores = new Map();
  recent.forEach((e, index) => {
    const key = normalizeText(e.title);
    if (!key || (wanted && (!key.startsWith(wanted) || key === wanted))) return;
    const entry = scores.get(key) ?? { title: e.title, categoryId: e.categoryId, score: 0 };
    entry.score += 1 + (300 - index) / 300; // frequência, com peso para o que é recente
    scores.set(key, entry);
  });
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Assinatura usada para detectar possíveis duplicatas ao mesclar backups. */
export const expenseSignature = (e) => `${e.date}|${e.amountCents}|${normalizeText(e.title)}`;
