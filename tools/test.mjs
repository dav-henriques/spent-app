/**
 * Testes das funções puras (datas, valores, cálculos e modelo de dados).
 * Uso: node tools/test.mjs   (ou npm test)
 *
 * Os testes rodam em vários fusos horários (variável TZ) para garantir que
 * nenhuma data "pula" um dia por causa de conversões de fuso.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ZONES = ['America/Sao_Paulo', 'UTC', 'Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata'];

if (!process.env.TEST_CHILD) {
  let failed = false;
  for (const tz of ZONES) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, TZ: tz, TEST_CHILD: '1' },
      encoding: 'utf8',
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

const dates = await import('../js/dates.js');
const money = await import('../js/money.js');
const calc = await import('../js/calc.js');
const model = await import('../js/model.js');
const charts = await import('../js/charts.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

const NBSP = ' ';
const brl = (text) => text.replace(/ /g, NBSP);

/* ---------------------------------------------------------------- valores */

test('parseAmount aceita inteiros e vírgula decimal', () => {
  assert.equal(money.parseAmount('12'), 1200);
  assert.equal(money.parseAmount('12,50'), 1250);
  assert.equal(money.parseAmount('12,5'), 1250);
  assert.equal(money.parseAmount('125,90'), 12590);
  assert.equal(money.parseAmount('1.250,00'), 125000);
  assert.equal(money.parseAmount('1.250'), 125000);
  assert.equal(money.parseAmount('1.234.567,89'), 123456789);
  assert.equal(money.parseAmount('0,99'), 99);
  assert.equal(money.parseAmount(',5'), 50);
  assert.equal(money.parseAmount('12,'), 1200);
  assert.equal(money.parseAmount(' R$ 18,50 '), 1850);
});

test('parseAmount aceita ponto decimal de teclados em inglês', () => {
  assert.equal(money.parseAmount('12.50'), 1250);
  assert.equal(money.parseAmount('12.5'), 1250);
  assert.equal(money.parseAmount('0.1'), 10);
});

test('parseAmount rejeita valores inválidos, zero e negativos', () => {
  for (const bad of ['', '0', '0,00', ',', '.', 'abc', '12,505', '1,2,3', '12.50,00', '1.25.0', '-5', '12a', '1.2345']) {
    assert.equal(money.parseAmount(bad), null, `deveria rejeitar "${bad}"`);
  }
  assert.equal(money.parseAmount('9999999999999'), null);
});

test('soma em centavos não sofre erro de ponto flutuante', () => {
  const a = money.parseAmount('0,10');
  const b = money.parseAmount('0,20');
  assert.equal(a + b, 30);
  assert.equal(money.formatMoney(a + b), brl('R$ 0,30'));
});

test('formatMoney no padrão brasileiro', () => {
  assert.equal(money.formatMoney(124402), brl('R$ 1.244,02'));
  assert.equal(money.formatMoney(0), brl('R$ 0,00'));
  assert.equal(money.formatMoney(5), brl('R$ 0,05'));
  assert.equal(money.formatMoney(-1850), brl('− R$ 18,50'));
  assert.equal(money.formatMoney(123456789), brl('R$ 1.234.567,89'));
  assert.equal(money.formatSignedMoney(1200), brl('+ R$ 12,00'));
  assert.equal(money.formatCSVAmount(124402), '1244,02');
});

test('formatPercent', () => {
  assert.equal(money.formatPercent((1000 / 6000) * 100), '16,7%');
  assert.equal(money.formatPercent((2000 / 6000) * 100), '33,3%');
  assert.equal(money.formatPercent(50), '50%');
  assert.equal(money.formatPercent(0.04), '<0,1%');
  assert.equal(money.formatPercent(99.97), '99,9%');
  assert.equal(money.formatSignedPercent(10.71), '+10,7%');
  assert.equal(money.formatSignedPercent(-100), '−100%');
});

/* ------------------------------------------------------------------ datas */

test('todayISO usa a data local', () => {
  const d = new Date(2026, 9, 12, 23, 59); // 12/10/2026 23:59 no fuso local
  assert.equal(dates.todayISO(d), '2026-10-12');
  const early = new Date(2026, 9, 12, 0, 1);
  assert.equal(dates.todayISO(early), '2026-10-12');
});

test('validação de datas', () => {
  assert.ok(dates.isValidISODate('2028-02-29'));
  assert.ok(!dates.isValidISODate('2026-02-29'));
  assert.ok(!dates.isValidISODate('2026-13-01'));
  assert.ok(!dates.isValidISODate('2026-1-01'));
  assert.ok(!dates.isValidISODate('12/10/2026'));
});

test('semana de segunda a domingo', () => {
  assert.equal(dates.weekday('2026-10-12'), 1); // segunda-feira
  const w = dates.getPeriodRange('week', '2026-10-08'); // quinta
  assert.equal(w.start, '2026-10-05');
  assert.equal(w.end, '2026-10-11');
  const sunday = dates.getPeriodRange('week', '2026-10-11');
  assert.equal(sunday.start, '2026-10-05');
  assert.equal(dates.formatPeriodLabel(w), '5 – 11 de outubro de 2026');
});

test('semana que atravessa dois meses', () => {
  const w = dates.getPeriodRange('week', '2026-10-01');
  assert.equal(w.start, '2026-09-28');
  assert.equal(w.end, '2026-10-04');
  assert.equal(dates.formatPeriodLabel(w), '28 de setembro – 4 de outubro de 2026');
  assert.equal(dates.formatPeriodLabel(w, { compact: true }), '28 set. – 4 out. 2026');
});

test('semana que atravessa dois anos', () => {
  const w = dates.getPeriodRange('week', '2026-01-01');
  assert.equal(w.start, '2025-12-29');
  assert.equal(w.end, '2026-01-04');
  assert.equal(dates.formatPeriodLabel(w), '29 de dezembro de 2025 – 4 de janeiro de 2026');
});

test('limites de mês, incluindo fevereiro e último dia', () => {
  assert.deepEqual(
    [dates.getPeriodRange('month', '2026-10-12').start, dates.getPeriodRange('month', '2026-10-12').end],
    ['2026-10-01', '2026-10-31'],
  );
  assert.equal(dates.getPeriodRange('month', '2026-02-10').end, '2026-02-28');
  assert.equal(dates.getPeriodRange('month', '2028-02-10').end, '2028-02-29');
  assert.equal(dates.formatPeriodLabel(dates.getPeriodRange('month', '2026-10-12')), 'outubro de 2026');
});

test('limites de ano', () => {
  const y = dates.getPeriodRange('year', '2026-06-15');
  assert.equal(y.start, '2026-01-01');
  assert.equal(y.end, '2026-12-31');
  assert.equal(dates.formatPeriodLabel(y), '2026');
});

test('navegação entre períodos', () => {
  assert.equal(dates.shiftAnchor('day', '2026-10-31', 1), '2026-11-01');
  assert.equal(dates.shiftAnchor('day', '2026-01-01', -1), '2025-12-31');
  assert.equal(dates.shiftAnchor('week', '2026-10-12', -1), '2026-10-05');
  assert.equal(dates.shiftAnchor('month', '2026-10-12', -1), '2026-09-12');
  assert.equal(dates.shiftAnchor('month', '2026-03-31', -1), '2026-02-28');
  assert.equal(dates.shiftAnchor('month', '2026-01-15', -1), '2025-12-15');
  assert.equal(dates.shiftAnchor('month', '2026-12-15', 1), '2027-01-15');
  assert.equal(dates.shiftAnchor('year', '2028-02-29', 1), '2029-02-28');
  const prev = dates.getPreviousRange(dates.getPeriodRange('month', '2026-10-12'));
  assert.equal(prev.start, '2026-09-01');
  assert.equal(prev.end, '2026-09-30');
});

test('soma de dias atravessando mudanças de horário de verão', () => {
  // 2018-11-04: início do horário de verão no Brasil (meia-noite não existia).
  assert.equal(dates.addDays('2018-11-03', 1), '2018-11-04');
  assert.equal(dates.addDays('2018-11-04', 1), '2018-11-05');
  // 2026-03-08: início do horário de verão nos EUA.
  assert.equal(dates.addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(dates.diffDays('2026-01-01', '2026-12-31'), 364);
});

test('rótulos de dia em português', () => {
  assert.equal(dates.formatLongDate('2026-10-12'), '12 de outubro de 2026');
  assert.equal(dates.formatLongDate('2026-10-01'), '1º de outubro de 2026');
  assert.equal(dates.formatDayHeading('2026-10-12', '2026-10-12'), 'Hoje');
  assert.equal(dates.formatDayHeading('2026-10-11', '2026-10-12'), 'Ontem');
  assert.equal(dates.formatDayHeading('2026-10-10', '2026-10-12'), 'Sábado, 10 de outubro');
  assert.equal(dates.formatDayHeading('2025-10-10', '2026-10-12'), 'Sexta, 10 de outubro de 2025');
  assert.equal(dates.formatNumericDate('2026-03-05'), '05/03/2026');
});

/* -------------------------------------------------------------- cálculos */

const mk = (id, amountCents, categoryId, date, createdAt = `${date}T12:00:00.000Z`) => ({
  id, title: id, amountCents, categoryId, date, note: '', createdAt, updatedAt: createdAt,
});

test('exemplo de validação: total, porcentagens, edição e exclusão', () => {
  let list = [
    mk('a', 1000, 'alimentacao', '2026-10-05'),
    mk('t', 2000, 'transporte', '2026-10-06'),
    mk('c', 3000, 'compras', '2026-10-07'),
  ];
  const range = dates.getPeriodRange('month', '2026-10-12');
  let s = calc.summarizePeriod(list, range);
  assert.equal(s.totalCents, 6000);
  const pct = Object.fromEntries(s.categories.map((r) => [r.categoryId, r.percent]));
  assert.ok(Math.abs(pct.alimentacao - 16.6667) < 0.001);
  assert.ok(Math.abs(pct.transporte - 33.3333) < 0.001);
  assert.equal(pct.compras, 50);
  assert.deepEqual(s.categories.map((r) => r.categoryId), ['compras', 'transporte', 'alimentacao']);
  assert.equal(s.categories.reduce((t, r) => t + r.totalCents, 0), s.totalCents);

  list = list.map((e) => (e.id === 't' ? { ...e, amountCents: 2500 } : e));
  assert.equal(calc.summarizePeriod(list, range).totalCents, 6500);

  list = list.filter((e) => e.id !== 't');
  s = calc.summarizePeriod(list, range);
  assert.equal(s.totalCents, 4000);
  assert.ok(!s.categories.some((r) => r.categoryId === 'transporte'));
});

test('despesa de outro mês não entra no mês atual', () => {
  const list = [mk('x', 500, 'compras', '2026-09-30'), mk('y', 700, 'compras', '2026-10-31')];
  const oct = calc.summarizePeriod(list, dates.getPeriodRange('month', '2026-10-12'));
  assert.equal(oct.totalCents, 700);
  const sep = calc.summarizePeriod(list, dates.getPeriodRange('month', '2026-09-01'));
  assert.equal(sep.totalCents, 500);
  const lastDay = calc.summarizePeriod(list, dates.getPeriodRange('day', '2026-10-31'));
  assert.equal(lastDay.count, 1);
  const crossWeek = calc.summarizePeriod(list, dates.getPeriodRange('week', '2026-10-01'));
  assert.equal(crossWeek.totalCents, 500); // 28/09–04/10 contém 30/09, mas não 31/10
});

test('limites entre anos', () => {
  const list = [mk('a', 100, 'x', '2025-12-31'), mk('b', 200, 'x', '2026-01-01')];
  assert.equal(calc.summarizePeriod(list, dates.getPeriodRange('year', '2025-06-01')).totalCents, 100);
  assert.equal(calc.summarizePeriod(list, dates.getPeriodRange('year', '2026-06-01')).totalCents, 200);
  assert.equal(calc.summarizePeriod(list, dates.getPeriodRange('week', '2026-01-01')).totalCents, 300);
});

test('período vazio', () => {
  const s = calc.summarizePeriod([], dates.getPeriodRange('day', '2026-10-12'));
  assert.equal(s.totalCents, 0);
  assert.equal(s.count, 0);
  assert.equal(s.averageCents, 0);
  assert.deepEqual(s.categories, []);
});

test('média por despesa e contagem', () => {
  const list = [mk('a', 1000, 'x', '2026-10-01'), mk('b', 1001, 'x', '2026-10-02')];
  assert.equal(calc.averageCents(list), 1001); // 1000,5 arredondado
  assert.equal(calc.countExpenses(list), 2);
});

test('comparação de períodos sem divisão por zero', () => {
  assert.deepEqual(calc.comparePeriods(0, 0), { status: 'empty', diffCents: 0, percent: null });
  assert.deepEqual(calc.comparePeriods(500, 0), { status: 'no-previous', diffCents: 500, percent: null });
  const c = calc.comparePeriods(15000, 10000);
  assert.equal(c.status, 'ok');
  assert.equal(c.diffCents, 5000);
  assert.equal(c.percent, 50);
  assert.equal(calc.comparePeriods(0, 10000).percent, -100);
});

test('trecho equivalente do período anterior', () => {
  const range = dates.getPeriodRange('month', '2026-10-12');
  const prev = dates.getPreviousRange(range);
  const eq = calc.elapsedEquivalentRange(range, prev, '2026-10-12');
  assert.equal(eq.start, '2026-09-01');
  assert.equal(eq.end, '2026-09-12');
  const marchEq = calc.elapsedEquivalentRange(
    dates.getPeriodRange('month', '2026-03-31'), dates.getPeriodRange('month', '2026-02-01'), '2026-03-30',
  );
  assert.equal(marchEq.end, '2026-02-28'); // limitado ao fim de fevereiro
  assert.equal(calc.elapsedEquivalentRange(range, prev, '2026-11-02'), null); // período já encerrado
});

test('ordenação e agrupamento por dia/mês', () => {
  const list = [
    mk('a', 100, 'x', '2026-10-01', '2026-10-01T10:00:00.000Z'),
    mk('b', 100, 'x', '2026-10-03', '2026-10-03T09:00:00.000Z'),
    mk('c', 100, 'x', '2026-10-01', '2026-10-01T15:00:00.000Z'),
    mk('d', 100, 'x', '2026-09-20'),
  ];
  assert.deepEqual(calc.sortByDate(list).map((e) => e.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(calc.sortByDate(list, 'asc').map((e) => e.id), ['d', 'a', 'c', 'b']);
  const days = calc.groupByDay(calc.sortByDate(list));
  assert.deepEqual(days.map((g) => [g.date, g.totalCents]), [['2026-10-03', 100], ['2026-10-01', 200], ['2026-09-20', 100]]);
  const months = calc.groupByMonth(calc.sortByDate(list));
  assert.deepEqual(months.map((g) => [g.key, g.totalCents]), [['2026-10', 300], ['2026-09', 100]]);
});

test('linha do tempo da análise', () => {
  const list = [mk('a', 100, 'x', '2026-10-05'), mk('b', 300, 'x', '2026-09-15'), mk('c', 50, 'x', '2026-04-30')];
  const months = calc.buildTimeline(list, dates.getPeriodRange('month', '2026-10-12'));
  assert.equal(months.length, 6);
  assert.equal(months[0].range.start, '2026-05-01');
  assert.equal(months[5].selected, true);
  assert.deepEqual(months.map((b) => b.totalCents), [0, 0, 0, 0, 300, 100]);
  const year = calc.buildTimeline(list, dates.getPeriodRange('year', '2026-10-12'));
  assert.equal(year.length, 12);
  assert.equal(year[3].totalCents, 50);
  assert.equal(calc.buildTimeline(list, dates.getPeriodRange('week', '2026-10-12')).length, 8);
  assert.equal(calc.buildTimeline(list, dates.getPeriodRange('day', '2026-10-12')).length, 7);
});

test('filtros do histórico não alteram a lista original', () => {
  const list = [
    { ...mk('a', 100, 'alimentacao', '2026-10-01'), title: 'Pão de queijo' },
    { ...mk('b', 200, 'transporte', '2026-10-02'), title: 'Ônibus', note: 'ida à escola' },
    { ...mk('c', 300, 'alimentacao', '2026-09-02'), title: 'Lanche' },
  ];
  const frozen = JSON.stringify(list);
  assert.deepEqual(calc.filterExpenses(list, { query: 'onibus' }).map((e) => e.id), ['b']);
  assert.deepEqual(calc.filterExpenses(list, { query: 'ESCOLA' }).map((e) => e.id), ['b']);
  assert.deepEqual(calc.filterExpenses(list, { categoryId: 'alimentacao' }).map((e) => e.id), ['a', 'c']);
  assert.deepEqual(calc.filterExpenses(list, { from: '2026-10-01', to: '2026-10-31' }).map((e) => e.id), ['a', 'b']);
  assert.deepEqual(calc.filterExpenses(list, { query: 'queijo pão' }).map((e) => e.id), ['a']);
  assert.equal(JSON.stringify(list), frozen);
});

test('sugestões de descrição', () => {
  const list = [
    { ...mk('a', 100, 'alimentacao', '2026-10-01', '2026-10-01T10:00:00.000Z'), title: 'Lanche' },
    { ...mk('b', 100, 'outros', '2026-10-02', '2026-10-02T10:00:00.000Z'), title: 'Lanche' },
    { ...mk('c', 100, 'transporte', '2026-10-03', '2026-10-03T10:00:00.000Z'), title: 'Ônibus' },
  ];
  const all = calc.titleSuggestions(list);
  assert.equal(all[0].title, 'Lanche');
  assert.equal(all[0].categoryId, 'outros'); // categoria mais recente
  assert.deepEqual(calc.titleSuggestions(list, 'on').map((s) => s.title), ['Ônibus']);
  assert.deepEqual(calc.titleSuggestions(list, 'lanche'), []); // já digitado por completo
});

/* --------------------------------------------------------- gráfico anel */

test('anel: arcos proporcionais e soma igual à circunferência', () => {
  const C = 600;
  const spans = charts.layoutDonut([200, 100, 100], C);
  assert.deepEqual(spans.map((s) => Math.round(s)), [300, 150, 150]); // 50% / 25% / 25%
  assert.equal(charts.layoutDonut([500], C)[0], C);
  assert.deepEqual(charts.layoutDonut([], C), []);
});

test('anel: valores minúsculos continuam visíveis', () => {
  const C = 600;
  const spans = charts.layoutDonut([100000, 50, 1], C);
  assert.ok(spans[1] >= 25 && spans[2] >= 25, 'segmentos pequenos recebem arco mínimo');
  assert.ok(Math.abs(spans.reduce((a, b) => a + b, 0) - C) < 1e-6);
  assert.ok(spans[0] > spans[1]);
});

/* ---------------------------------------------------------------- modelo */

test('normalização preserva o que é válido e separa o inválido', () => {
  const { expenses, categories, report } = model.normalizeDataset({
    categories: [{ id: 'alimentacao', name: 'Alimentação', color: '#f2c14e' }, { foo: 1 }],
    expenses: [
      { id: '1', title: '  Lanche ', amountCents: 1850, categoryId: 'alimentacao', date: '2026-10-12', createdAt: '2026-10-12T15:00:00Z' },
      { id: '2', title: 'Sem valor', amountCents: 0, categoryId: 'alimentacao', date: '2026-10-12' },
      { id: '3', title: 'Data ruim', amountCents: 100, categoryId: 'alimentacao', date: '2026-02-30' },
      { id: '4', title: 'Categoria sumiu', amountCents: 100, categoryId: 'xyz', date: '2026-10-12' },
      { id: '1', title: 'Id repetido', amountCents: 200, categoryId: 'alimentacao', date: '2026-10-12' },
    ],
  });
  assert.equal(expenses.length, 3);
  assert.equal(expenses[0].title, 'Lanche');
  assert.equal(expenses[0].createdAt, '2026-10-12T15:00:00.000Z');
  assert.equal(categories[0].color, '#F2C14E');
  assert.equal(report.invalidExpenses.length, 2);
  assert.equal(report.invalidCategories.length, 1);
  assert.equal(report.recoveredCategories, 1);
  assert.ok(categories.some((c) => c.id === 'xyz' && c.name === 'Categoria recuperada'));
  assert.equal(report.reassignedIds, 1);
  assert.notEqual(expenses[2].id, '1');
});

test('normalizeText ignora acentos e maiúsculas', () => {
  assert.equal(model.normalizeText('  Ônibus  ESCOLAR '), 'onibus escolar');
});

/* ------------------------------------------------------------- resultado */

const tz = process.env.TZ;
if (failures.length) {
  console.error(`✗ [${tz}] ${failures.length} falha(s), ${passed} ok`);
  for (const { name, error } of failures) console.error(`  - ${name}\n    ${error.message.split('\n').join('\n    ')}`);
  process.exit(1);
} else {
  console.log(`✓ [${tz}] ${passed} testes ok`);
}
