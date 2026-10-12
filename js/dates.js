/**
 * Datas locais no formato "YYYY-MM-DD".
 *
 * As datas das despesas são sempre strings — nunca objetos Date — para evitar
 * o clássico deslocamento de um dia: `new Date("2026-10-12")` é interpretado
 * como meia-noite UTC e, no Brasil (UTC−3), vira 11/10 às 21h.
 *
 * Para a aritmética (somar dias, achar a segunda-feira, etc.) as strings são
 * convertidas em "número do dia" com Date.UTC, que não sofre influência de
 * fuso horário nem de horário de verão. Strings ISO também se comparam
 * corretamente em ordem alfabética, o que simplifica os filtros por intervalo.
 *
 * O único ponto em que o fuso local importa é descobrir "que dia é hoje"
 * (todayISO), que usa os getters locais de Date.
 */

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const PERIOD_MODES = ['day', 'week', 'month', 'year'];

export const pad2 = (n) => String(n).padStart(2, '0');

export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(y, m) {
  return m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1];
}

export function toISODate(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** "2026-10-12" → { y: 2026, m: 10, d: 12 }, ou null se a data não existir. */
export function parseISODate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** Datas aceitas pelo app: existentes e entre 1900 e 2999. */
export function isValidISODate(value) {
  const p = parseISODate(value);
  return p !== null && p.y >= 1900 && p.y <= 2999;
}

function toDayNumber(iso) {
  const p = parseISODate(iso);
  if (!p) throw new RangeError(`Data inválida: ${iso}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
}

function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export const addDays = (iso, n) => fromDayNumber(toDayNumber(iso) + n);

/** Quantidade de dias de `from` até `to` (positivo se `to` for posterior). */
export const diffDays = (from, to) => toDayNumber(to) - toDayNumber(from);

/** Dia da semana: 0 = domingo … 6 = sábado (mesma convenção de Date#getDay). */
export const weekday = (iso) => new Date(toDayNumber(iso) * DAY_MS).getUTCDay();

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 → 28/02). */
export function addMonths(iso, n) {
  const { y, m, d } = parseISODate(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return toISODate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export const addYears = (iso, n) => addMonths(iso, n * 12);

/** Data local de hoje (ou de `now`) no formato YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Data local correspondente a um timestamp ISO (ex.: createdAt). */
export function timestampToLocalDate(timestamp) {
  const dt = new Date(timestamp);
  return Number.isNaN(dt.getTime()) ? null : todayISO(dt);
}

/** Hora local "HH:MM" de um timestamp ISO. */
export function timestampToLocalTime(timestamp) {
  const dt = new Date(timestamp);
  return Number.isNaN(dt.getTime()) ? '' : `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

/* ------------------------------------------------------------------------ */
/* Períodos                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Função central que define os limites de cada período. O gráfico, o resumo
 * por categoria, a lista e a análise usam todos este mesmo resultado.
 *
 * - day:   apenas a data `anchor`
 * - week:  segunda-feira a domingo da semana que contém `anchor`
 * - month: dia 1 ao último dia do mês de `anchor`
 * - year:  1º de janeiro a 31 de dezembro do ano de `anchor`
 *
 * `start` e `end` são inclusivos e estão no formato YYYY-MM-DD.
 */
export function getPeriodRange(mode, anchor) {
  const p = parseISODate(anchor);
  if (!p) throw new RangeError(`Data inválida: ${anchor}`);
  switch (mode) {
    case 'day':
      return { mode, anchor, start: anchor, end: anchor };
    case 'week': {
      // weekday(): 0 = domingo. (dia + 6) % 7 = dias decorridos desde a segunda.
      const start = addDays(anchor, -((weekday(anchor) + 6) % 7));
      return { mode, anchor, start, end: addDays(start, 6) };
    }
    case 'month':
      return { mode, anchor, start: toISODate(p.y, p.m, 1), end: toISODate(p.y, p.m, daysInMonth(p.y, p.m)) };
    case 'year':
      return { mode, anchor, start: toISODate(p.y, 1, 1), end: toISODate(p.y, 12, 31) };
    default:
      throw new RangeError(`Período desconhecido: ${mode}`);
  }
}

/** Move a data de referência `delta` períodos para trás (negativo) ou para frente. */
export function shiftAnchor(mode, anchor, delta) {
  switch (mode) {
    case 'day': return addDays(anchor, delta);
    case 'week': return addDays(anchor, delta * 7);
    case 'month': return addMonths(anchor, delta);
    case 'year': return addYears(anchor, delta);
    default: throw new RangeError(`Período desconhecido: ${mode}`);
  }
}

/** Período imediatamente anterior, com a mesma duração lógica (mês → mês anterior, etc.). */
export function getPreviousRange(range) {
  return getPeriodRange(range.mode, shiftAnchor(range.mode, range.anchor, -1));
}

export const isDateInRange = (iso, range) => iso >= range.start && iso <= range.end;

/* ------------------------------------------------------------------------ */
/* Formatação em português brasileiro                                       */
/* ------------------------------------------------------------------------ */

export const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Dia do mês por extenso: o primeiro dia é escrito "1º", como é usual no Brasil. */
const dayOfMonth = (d) => (d === 1 ? '1º' : String(d));

/** "12 de outubro de 2026" */
export function formatLongDate(iso, { withYear = true } = {}) {
  const { y, m, d } = parseISODate(iso);
  return `${dayOfMonth(d)} de ${MONTHS[m - 1]}${withYear ? ` de ${y}` : ''}`;
}

/**
 * Intervalo de datas: "5 – 11 de outubro de 2026",
 * "28 de setembro – 4 de outubro de 2026" ou, com `compact`, "28 set. – 4 out. 2026".
 */
export function formatRange(start, end, { compact = false } = {}) {
  if (start === end) return formatLongDate(start);
  const s = parseISODate(start);
  const e = parseISODate(end);
  const month = (m) => (compact ? `${MONTHS_SHORT[m - 1]}.` : `de ${MONTHS[m - 1]}`);
  const year = (y) => (compact ? ` ${y}` : ` de ${y}`);
  if (s.y !== e.y) {
    return `${dayOfMonth(s.d)} ${month(s.m)}${year(s.y)} – ${dayOfMonth(e.d)} ${month(e.m)}${year(e.y)}`;
  }
  if (s.m !== e.m) {
    return `${dayOfMonth(s.d)} ${month(s.m)} – ${dayOfMonth(e.d)} ${month(e.m)}${year(e.y)}`;
  }
  return `${dayOfMonth(s.d)} – ${e.d} de ${MONTHS[e.m - 1]} de ${e.y}`;
}

export const formatMonthYear = (y, m) => `${MONTHS[m - 1]} de ${y}`;

/** Rótulo do período em minúsculas, pronto para uso no meio de frases. */
export function formatPeriodLabel(range, { compact = false } = {}) {
  const s = parseISODate(range.start);
  switch (range.mode) {
    case 'day': return formatLongDate(range.start);
    case 'week': return formatRange(range.start, range.end, { compact });
    case 'month': return formatMonthYear(s.y, s.m);
    case 'year': return String(s.y);
    default: return '';
  }
}

/** Cabeçalho de grupo diário: "Hoje", "Ontem" ou "Sábado, 10 de outubro". */
export function formatDayHeading(iso, today = todayISO()) {
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  const p = parseISODate(iso);
  const sameYear = p.y === parseISODate(today).y;
  return `${capitalize(WEEKDAYS[weekday(iso)])}, ${formatLongDate(iso, { withYear: !sameYear })}`;
}

/** Data curta para textos secundários: "hoje", "ontem", "12 out." ou "12 out. 2025". */
export function formatShortDate(iso, today = todayISO()) {
  if (iso === today) return 'hoje';
  if (iso === addDays(today, -1)) return 'ontem';
  const p = parseISODate(iso);
  const base = `${p.d} ${MONTHS_SHORT[p.m - 1]}.`;
  return p.y === parseISODate(today).y ? base : `${base} ${p.y}`;
}

/** "12/10/2026" — usado na exportação CSV. */
export function formatNumericDate(iso) {
  const { y, m, d } = parseISODate(iso);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

export const weekdayShort = (iso) => WEEKDAYS_SHORT[weekday(iso)];
