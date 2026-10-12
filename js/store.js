/**
 * Gerenciamento dos dados do app: despesas, categorias, preferências e o
 * período selecionado na interface.
 *
 * Toda alteração passa por `commit`, que grava no localStorage *antes* de
 * atualizar a memória. Se a gravação falhar, nada muda e o erro é informado —
 * a interface nunca mostra algo que não foi salvo.
 */
import {
  STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_CATEGORIES, LIMITS, CATEGORY_PALETTE, LEGACY_DEFAULT_COLORS,
} from './config.js';
import {
  isStorageAvailable, readJSON, writeMany, preserveForRecovery, listRecoveryEntries, removeKey,
} from './storage.js';
import {
  createId, normalizeDataset, normalizePrefs, normalizeText, migrate, cleanSingleLine, cleanMultiline, isHexColor,
  isCategoryIcon,
} from './model.js';
import {
  getPeriodRange, shiftAnchor, todayISO, isValidISODate, PERIOD_MODES,
} from './dates.js';

export class StoreError extends Error {}

const SAVE_ERROR = 'Não foi possível salvar. O armazenamento do aparelho pode estar cheio ou bloqueado.';

const state = {
  expenses: [],
  categories: [],
  prefs: { lastCategoryId: null },
  persistent: true,
  issues: [],
};

const period = { mode: 'month', anchor: todayISO() };
const listeners = new Set();
let recentlySaved = null; // { id, at } — usado para destacar a despesa recém-salva

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(type) {
  for (const listener of listeners) listener(type);
}

const copyDefaults = () => DEFAULT_CATEGORIES.map((c) => ({ ...c }));

/* ------------------------------------------------------------------------ */
/* Carregamento                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Lê os dados salvos, recuperando o que for possível.
 * - JSON corrompido: o texto original é copiado para uma chave de recuperação.
 * - Registros inválidos: idem; os válidos continuam carregados.
 * - Versão antiga: uma cópia é guardada antes da migração.
 */
export function init() {
  const issues = [];
  state.persistent = isStorageAvailable();
  if (!state.persistent) issues.push('unavailable');

  const meta = readJSON(STORAGE_KEYS.meta);
  const expensesRead = readJSON(STORAGE_KEYS.expenses);
  const categoriesRead = readJSON(STORAGE_KEYS.categories);
  const prefsRead = readJSON(STORAGE_KEYS.prefs);
  const firstRun = meta.raw === null && expensesRead.raw === null && categoriesRead.raw === null;

  let dirty = firstRun;
  let canWrite = true;

  let rawExpenses = [];
  if (expensesRead.raw !== null) {
    if (expensesRead.ok && Array.isArray(expensesRead.value)) {
      rawExpenses = expensesRead.value;
    } else {
      preserveForRecovery('despesas', expensesRead.raw);
      issues.push('corrupted');
      dirty = true;
    }
  }

  let rawCategories = null;
  if (categoriesRead.raw !== null) {
    if (categoriesRead.ok && Array.isArray(categoriesRead.value)) {
      rawCategories = categoriesRead.value;
    } else {
      preserveForRecovery('categorias', categoriesRead.raw);
      issues.push('corrupted');
      dirty = true;
    }
  }

  const storedVersion = Number.isInteger(meta.value?.schemaVersion) ? meta.value.schemaVersion : SCHEMA_VERSION;
  if (storedVersion < SCHEMA_VERSION) {
    preserveForRecovery(`antes-da-migracao-v${storedVersion}`, { expenses: rawExpenses, categories: rawCategories });
    try {
      const migrated = migrate({ expenses: rawExpenses, categories: rawCategories }, storedVersion);
      rawExpenses = migrated.expenses;
      rawCategories = migrated.categories;
      dirty = true;
    } catch (error) {
      console.error('Falha na migração dos dados', error);
      issues.push('migration');
      canWrite = false; // não sobrescreve dados que não foram migrados
    }
  } else if (storedVersion > SCHEMA_VERSION) {
    issues.push('newer-version');
  }

  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    rawCategories = copyDefaults();
    dirty = true;
  }

  const { expenses, categories, report } = normalizeDataset({ expenses: rawExpenses, categories: rawCategories });
  if (report.invalidExpenses.length || report.invalidCategories.length) {
    preserveForRecovery('registros-invalidos', {
      expenses: report.invalidExpenses,
      categories: report.invalidCategories,
    });
    issues.push('invalid-records');
    dirty = true;
  }
  if (report.recoveredCategories || report.reassignedIds) dirty = true;

  // Versão 1.1: categorias ganharam ícone, e as padrão que mantinham a cor
  // original da 1.0 passam para a paleta nova. Cores personalizadas não mudam.
  if (rawCategories.some((c) => c && typeof c === 'object' && !c.icon)) dirty = true;
  for (const category of categories) {
    const fresh = DEFAULT_CATEGORIES.find((c) => c.id === category.id);
    if (fresh && LEGACY_DEFAULT_COLORS[category.id] === category.color) {
      category.color = fresh.color;
      dirty = true;
    }
  }

  state.expenses = expenses;
  state.categories = categories;
  state.prefs = normalizePrefs(prefsRead.value);
  state.issues = issues;

  if (dirty && canWrite && state.persistent) {
    writeMany([
      [STORAGE_KEYS.expenses, state.expenses],
      [STORAGE_KEYS.categories, state.categories],
      [STORAGE_KEYS.prefs, state.prefs],
      [STORAGE_KEYS.meta, { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }],
    ]);
  }
}

/* ------------------------------------------------------------------------ */
/* Persistência                                                              */
/* ------------------------------------------------------------------------ */

/** Grava as partes alteradas e, só então, atualiza o estado em memória. */
function commit(next) {
  const entries = [];
  if (next.expenses) entries.push([STORAGE_KEYS.expenses, next.expenses]);
  if (next.categories) entries.push([STORAGE_KEYS.categories, next.categories]);
  if (next.prefs) entries.push([STORAGE_KEYS.prefs, next.prefs]);
  entries.push([STORAGE_KEYS.meta, { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }]);
  if (state.persistent && !writeMany(entries)) throw new StoreError(SAVE_ERROR);
  Object.assign(state, next);
  emit('data');
}

/* ------------------------------------------------------------------------ */
/* Leitura                                                                   */
/* ------------------------------------------------------------------------ */

export const getExpenses = () => state.expenses;
export const getExpense = (id) => state.expenses.find((e) => e.id === id) ?? null;
export const getCategories = () => state.categories;
export const getPrefs = () => state.prefs;
export const getIssues = () => state.issues;
export const isPersistent = () => state.persistent;

const MISSING_CATEGORY = Object.freeze({ id: '', name: 'Sem categoria', color: '#8E8E93', icon: 'tag' });

/** Sempre devolve uma categoria exibível, mesmo para ids desconhecidos. */
export function getCategory(id) {
  return state.categories.find((c) => c.id === id) ?? { ...MISSING_CATEGORY, id };
}

export function countByCategory() {
  const counts = new Map();
  for (const e of state.expenses) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
  return counts;
}

/** Categoria sugerida no cadastro: a última usada, se ainda existir. */
export function getDefaultCategoryId() {
  const last = state.prefs.lastCategoryId;
  if (last && state.categories.some((c) => c.id === last)) return last;
  return state.categories[0]?.id ?? '';
}

/** Id da despesa recém-salva, consumido uma única vez para o destaque visual. */
export function consumeRecentlySaved() {
  if (!recentlySaved || Date.now() - recentlySaved.at > 2000) return null;
  const { id } = recentlySaved;
  recentlySaved = null;
  return id;
}

/* ------------------------------------------------------------------------ */
/* Despesas                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Valida os campos de uma despesa vinda do formulário.
 * Devolve { ok, errors, value } — `value` já normalizado quando ok.
 *
 * A descrição é opcional para que um gasto possa ser registrado só com
 * toques: sem ela, a despesa recebe o nome da categoria.
 */
export function validateExpenseInput(input) {
  const errors = {};
  const category = state.categories.find((c) => c.id === input.categoryId);
  const note = cleanMultiline(input.note, LIMITS.noteMax);
  const amountCents = input.amountCents;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > LIMITS.maxCents) {
    errors.amount = 'Digite um valor maior que zero.';
  }
  if (!category) errors.category = 'Escolha uma categoria.';
  if (!isValidISODate(input.date)) errors.date = 'Escolha uma data válida.';
  const title = cleanSingleLine(input.title, LIMITS.titleMax) || category?.name || '';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { title, note, amountCents, categoryId: input.categoryId, date: input.date } : null };
}

function requireValid(input) {
  const result = validateExpenseInput(input);
  if (!result.ok) throw new StoreError(Object.values(result.errors)[0]);
  return result.value;
}

export function addExpense(input) {
  const value = requireValid(input);
  const now = new Date().toISOString();
  const expense = { id: createId(), ...value, createdAt: now, updatedAt: now };
  commit({
    expenses: [...state.expenses, expense],
    prefs: { ...state.prefs, lastCategoryId: value.categoryId },
  });
  recentlySaved = { id: expense.id, at: Date.now() };
  return expense;
}

export function updateExpense(id, input) {
  const existing = getExpense(id);
  if (!existing) throw new StoreError('Esta despesa não existe mais.');
  const value = requireValid(input);
  const updated = { ...existing, ...value, updatedAt: new Date().toISOString() };
  commit({ expenses: state.expenses.map((e) => (e.id === id ? updated : e)) });
  recentlySaved = { id, at: Date.now() };
  return updated;
}

/** Remove e devolve a despesa, para permitir "desfazer". */
export function deleteExpense(id) {
  const existing = getExpense(id);
  if (!existing) return null;
  commit({ expenses: state.expenses.filter((e) => e.id !== id) });
  return existing;
}

/** Reinsere uma despesa excluída (desfazer). */
export function restoreExpense(expense) {
  if (!expense || getExpense(expense.id)) return;
  const categoryExists = state.categories.some((c) => c.id === expense.categoryId);
  const restored = categoryExists ? expense : { ...expense, categoryId: getDefaultCategoryId() };
  commit({ expenses: [...state.expenses, restored] });
}

/* ------------------------------------------------------------------------ */
/* Categorias                                                                */
/* ------------------------------------------------------------------------ */

export function isCategoryNameTaken(name, exceptId = null) {
  const wanted = normalizeText(name);
  return state.categories.some((c) => c.id !== exceptId && normalizeText(c.name) === wanted);
}

function validateCategoryInput({ name, color, icon }, exceptId = null) {
  const cleanName = cleanSingleLine(name, LIMITS.categoryNameMax);
  if (!cleanName) throw new StoreError('Dê um nome para a categoria.');
  if (isCategoryNameTaken(cleanName, exceptId)) throw new StoreError('Já existe uma categoria com esse nome.');
  if (!isHexColor(color)) throw new StoreError('Escolha uma cor.');
  if (!isCategoryIcon(icon)) throw new StoreError('Escolha um ícone.');
  return { name: cleanName, color: color.toUpperCase(), icon };
}

export function addCategory(input) {
  const value = validateCategoryInput(input);
  const category = { id: createId(), ...value };
  commit({ categories: [...state.categories, category] });
  return category;
}

/** Alterar a cor ou o nome reflete automaticamente em todas as despesas (que guardam só o id). */
export function updateCategory(id, input) {
  const value = validateCategoryInput(input, id);
  commit({ categories: state.categories.map((c) => (c.id === id ? { ...c, ...value } : c)) });
}

/**
 * Exclui uma categoria. Se houver despesas nela, é obrigatório informar
 * `moveTo` — as despesas são movidas, nunca apagadas.
 */
export function deleteCategory(id, moveTo = null) {
  if (state.categories.length <= 1) throw new StoreError('É preciso manter ao menos uma categoria.');
  const inUse = state.expenses.some((e) => e.categoryId === id);
  if (inUse) {
    if (!moveTo || moveTo === id || !state.categories.some((c) => c.id === moveTo)) {
      throw new StoreError('Escolha para qual categoria as despesas serão movidas.');
    }
  }
  const next = { categories: state.categories.filter((c) => c.id !== id) };
  if (inUse) next.expenses = state.expenses.map((e) => (e.categoryId === id ? { ...e, categoryId: moveTo } : e));
  if (state.prefs.lastCategoryId === id) next.prefs = { ...state.prefs, lastCategoryId: moveTo };
  commit(next);
}

/** Primeira cor da paleta ainda não usada (para novas categorias). */
export function suggestCategoryColor() {
  const used = new Set(state.categories.map((c) => c.color.toUpperCase()));
  return (CATEGORY_PALETTE.find((p) => !used.has(p.color)) ?? CATEGORY_PALETTE[0]).color;
}

/* ------------------------------------------------------------------------ */
/* Operações em lote (backup)                                                */
/* ------------------------------------------------------------------------ */

export const snapshot = () => ({
  expenses: state.expenses,
  categories: state.categories,
  prefs: state.prefs,
});

/** Substitui tudo de uma vez (restaurar backup ou desfazer uma restauração). */
export function replaceAll({ expenses, categories, prefs = state.prefs }) {
  commit({
    expenses: [...expenses],
    categories: categories.length ? [...categories] : copyDefaults(),
    prefs: normalizePrefs(prefs),
  });
}

/** Apaga todos os registros, restaura as categorias padrão e remove cópias de recuperação. */
export function resetAll() {
  commit({ expenses: [], categories: copyDefaults(), prefs: normalizePrefs({}) });
  for (const entry of listRecoveryEntries()) removeKey(entry.key);
  state.issues = state.issues.filter((issue) => issue === 'unavailable');
  emit('data');
}

export { listRecoveryEntries };

export function discardRecoveryEntry(key) {
  removeKey(key);
  emit('data');
}

/* ------------------------------------------------------------------------ */
/* Período selecionado (estado da interface, não persistido)                 */
/* ------------------------------------------------------------------------ */

export const getPeriod = () => ({ ...period });
export const getRange = () => getPeriodRange(period.mode, period.anchor);

export function setPeriod({ mode = period.mode, anchor = period.anchor }) {
  if (!PERIOD_MODES.includes(mode) || !isValidISODate(anchor)) return;
  if (mode === period.mode && anchor === period.anchor) return;
  period.mode = mode;
  period.anchor = anchor;
  emit('period');
}

export const shiftPeriod = (delta) => setPeriod({ anchor: shiftAnchor(period.mode, period.anchor, delta) });
export const goToToday = () => setPeriod({ anchor: todayISO() });
