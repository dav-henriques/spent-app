/**
 * Modelo de dados: validação, normalização e migração.
 *
 * Toda despesa ou categoria que entra no app — lida do localStorage ou de um
 * backup importado — passa por aqui. Registros válidos são normalizados;
 * registros inválidos são devolvidos à parte para que quem chamou possa
 * preservá-los, nunca descartados em silêncio.
 */
import {
  LIMITS, FALLBACK_COLOR, FALLBACK_ICON, SCHEMA_VERSION, CATEGORY_ICONS, DEFAULT_CATEGORIES,
} from './config.js';
import { isValidISODate } from './dates.js';

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Date.now().toString(36) + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Texto para comparação: sem acentos, minúsculo e sem espaços nas pontas. */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanSingleLine(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function cleanMultiline(value, max) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
    : '';
}

export const isHexColor = (value) => typeof value === 'string' && HEX_COLOR_RE.test(value);

const ICON_IDS = new Set(CATEGORY_ICONS.map((i) => i.id));
export const isCategoryIcon = (value) => ICON_IDS.has(value);

/** Ícone padrão: o da categoria padrão de mesmo id, ou uma etiqueta genérica. */
export function defaultIconFor(categoryId) {
  return DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.icon ?? FALLBACK_ICON;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null;
}

/**
 * Normaliza uma despesa. Valor e data são indispensáveis: sem eles o registro
 * é inválido (null). Os demais campos recebem valores seguros quando faltam.
 */
export function normalizeExpense(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amountCents = typeof raw.amountCents === 'number' ? raw.amountCents : Number(raw.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > LIMITS.maxCents) return null;
  if (!isValidISODate(raw.date)) return null;

  const createdAt = canonicalTimestamp(raw.createdAt) ?? new Date().toISOString();
  return {
    id: cleanId(raw.id) ?? createId(),
    title: cleanSingleLine(raw.title, LIMITS.titleMax) || 'Sem descrição',
    amountCents,
    categoryId: cleanId(raw.categoryId) ?? '',
    date: raw.date,
    note: cleanMultiline(raw.note, LIMITS.noteMax),
    createdAt,
    updatedAt: canonicalTimestamp(raw.updatedAt) ?? createdAt,
  };
}

export function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanSingleLine(raw.name, LIMITS.categoryNameMax);
  if (!name && !cleanId(raw.id)) return null;
  const id = cleanId(raw.id) ?? createId();
  return {
    id,
    name: name || 'Sem nome',
    color: isHexColor(raw.color) ? raw.color.toUpperCase() : FALLBACK_COLOR,
    // Campo opcional (adicionado na versão 1.1): dados antigos recebem um ícone padrão.
    icon: isCategoryIcon(raw.icon) ? raw.icon : defaultIconFor(id),
  };
}

/**
 * Normaliza um conjunto completo (despesas + categorias) e garante a
 * integridade referencial: toda despesa aponta para uma categoria existente.
 * Despesas cuja categoria sumiu ganham uma "Categoria recuperada" em vez de
 * desaparecerem.
 */
export function normalizeDataset({ expenses, categories }) {
  const report = { invalidExpenses: [], invalidCategories: [], recoveredCategories: 0, reassignedIds: 0 };

  const categoryList = [];
  const categoryIds = new Set();
  for (const raw of Array.isArray(categories) ? categories : []) {
    const category = normalizeCategory(raw);
    if (!category || categoryIds.has(category.id)) {
      report.invalidCategories.push(raw);
      continue;
    }
    categoryIds.add(category.id);
    categoryList.push(category);
  }

  const expenseList = [];
  const expenseIds = new Set();
  for (const raw of Array.isArray(expenses) ? expenses : []) {
    const expense = normalizeExpense(raw);
    if (!expense) {
      report.invalidExpenses.push(raw);
      continue;
    }
    if (expenseIds.has(expense.id)) {
      // Dois registros com o mesmo id: mantém ambos, com um id novo para o segundo.
      expense.id = createId();
      report.reassignedIds += 1;
    }
    expenseIds.add(expense.id);
    expenseList.push(expense);
  }

  const usedNames = new Set(categoryList.map((c) => normalizeText(c.name)));
  const recoveredName = () => {
    let name = 'Categoria recuperada';
    for (let n = 2; usedNames.has(normalizeText(name)); n += 1) name = `Categoria recuperada ${n}`;
    usedNames.add(normalizeText(name));
    return name;
  };

  for (const expense of expenseList) {
    if (!expense.categoryId) {
      const fallback = categoryList.find((c) => c.id === 'outros') ?? null;
      expense.categoryId = fallback ? fallback.id : 'recuperada';
    }
    if (!categoryIds.has(expense.categoryId)) {
      categoryList.push({ id: expense.categoryId, name: recoveredName(), color: FALLBACK_COLOR, icon: FALLBACK_ICON });
      categoryIds.add(expense.categoryId);
      report.recoveredCategories += 1;
    }
  }

  return { expenses: expenseList, categories: categoryList, report };
}

/**
 * Migrações do formato dos dados. Cada entrada transforma a versão N−1 na N.
 * Exemplo para uma futura versão 2:
 *
 *   2: (data) => ({ ...data, expenses: data.expenses.map((e) => ({ ...e, tags: [] })) }),
 *
 * As migrações recebem uma cópia, então uma falha no meio do caminho não
 * altera os dados originais.
 */
const MIGRATIONS = {};

export function migrate(data, fromVersion) {
  let current = JSON.parse(JSON.stringify(data));
  for (let version = fromVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (step) current = step(current);
  }
  return current;
}

export function normalizePrefs(raw) {
  const prefs = raw && typeof raw === 'object' ? raw : {};
  return {
    lastCategoryId: cleanId(prefs.lastCategoryId),
  };
}
