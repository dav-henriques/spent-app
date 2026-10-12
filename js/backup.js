/**
 * Exportação e restauração dos dados.
 *
 * - Backup JSON: todas as despesas e categorias + versão do esquema. É o
 *   formato que permite restaurar o app em outro aparelho ou navegador.
 * - CSV: as despesas em formato de planilha (separador ";" e vírgula
 *   decimal, como o Excel em português espera; UTF-8 com BOM para acentos).
 *
 * A importação acontece em duas etapas: `analyzeBackup` valida o arquivo e
 * calcula o que vai acontecer, sem tocar em nada; só `applyImport` grava,
 * depois da confirmação do usuário.
 */
import * as store from './store.js';
import { APP_NAME, APP_VERSION, SCHEMA_VERSION } from './config.js';
import { normalizeDataset, migrate, normalizeText } from './model.js';
import { sortByDate, expenseSignature } from './calc.js';
import { formatCSVAmount } from './money.js';
import { formatNumericDate, todayISO } from './dates.js';

export const BACKUP_FORMAT = 'gastos-backup';

export function buildBackup() {
  const { expenses, categories } = store.snapshot();
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    app: APP_NAME,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { expenses: expenses.length, categories: categories.length },
    categories,
    expenses: sortByDate(expenses, 'asc'),
  };
}

/** Campo de CSV: aspas quando necessário e proteção contra fórmulas em planilhas. */
function csvField(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCSV() {
  const header = ['Data', 'Descrição', 'Categoria', 'Valor (R$)', 'Observação'];
  const lines = sortByDate(store.getExpenses(), 'asc').map((e) => [
    formatNumericDate(e.date),
    e.title,
    store.getCategory(e.categoryId).name,
    formatCSVAmount(e.amountCents),
    e.note,
  ].map(csvField).join(';'));
  return `﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}

/**
 * Entrega um arquivo ao usuário. No celular usa a folha de compartilhamento
 * (que permite "Salvar em Arquivos" no iPhone); nos demais, um download comum.
 */
export async function deliverFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
        // outros erros: segue para o download comum
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export const exportJSON = () =>
  deliverFile(`gastos-backup-${todayISO()}.json`, `${JSON.stringify(buildBackup(), null, 2)}\n`, 'application/json');

export const exportCSV = () =>
  deliverFile(`gastos-despesas-${todayISO()}.csv`, buildCSV(), 'text/csv;charset=utf-8');

export class ImportError extends Error {}

/**
 * Valida o conteúdo de um arquivo de backup e prepara as duas opções
 * (substituir ou mesclar), sem gravar nada.
 */
export function analyzeBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('O arquivo não é um backup válido (não foi possível ler o conteúdo).');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ImportError('O arquivo não tem o formato de um backup deste app.');
  }
  const looksLikeBackup = data.format === BACKUP_FORMAT || (Array.isArray(data.expenses) && Array.isArray(data.categories));
  if (!looksLikeBackup || !Array.isArray(data.expenses) || !Array.isArray(data.categories)) {
    throw new ImportError('O arquivo não tem o formato de um backup deste app.');
  }
  const version = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1;
  if (version > SCHEMA_VERSION) {
    throw new ImportError('Este backup foi criado por uma versão mais nova do app. Atualize o app e tente novamente.');
  }

  let dataset = { expenses: data.expenses, categories: data.categories };
  if (version < SCHEMA_VERSION) {
    try {
      dataset = migrate(dataset, version);
    } catch {
      throw new ImportError('Não foi possível converter este backup para a versão atual do app.');
    }
  }

  const incoming = normalizeDataset(dataset);
  if (incoming.expenses.length === 0 && incoming.categories.length === 0) {
    throw new ImportError('O backup não contém despesas nem categorias válidas.');
  }

  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    incoming,
    invalidCount: incoming.report.invalidExpenses.length + incoming.report.invalidCategories.length,
    merge: planMerge(store.snapshot(), incoming),
  };
}

/**
 * Mescla: mantém tudo o que existe neste aparelho e acrescenta o que é novo.
 * - Despesas com o mesmo id já existem → ficam como estão (não são sobrescritas).
 * - Despesas novas idênticas a uma existente (data, valor e descrição) são
 *   separadas como "possíveis duplicadas" e só entram se o usuário pedir.
 * - Categorias de mesmo id ou mesmo nome são reaproveitadas.
 */
function planMerge(current, incoming) {
  const currentById = new Map(current.categories.map((c) => [c.id, c]));
  const currentByName = new Map(current.categories.map((c) => [normalizeText(c.name), c]));
  const categoryMap = new Map();
  const newCategories = [];
  for (const category of incoming.categories) {
    if (currentById.has(category.id)) {
      categoryMap.set(category.id, category.id);
      continue;
    }
    const sameName = currentByName.get(normalizeText(category.name));
    if (sameName) {
      categoryMap.set(category.id, sameName.id);
      continue;
    }
    categoryMap.set(category.id, category.id);
    newCategories.push(category);
  }

  const existingIds = new Set(current.expenses.map((e) => e.id));
  const signatures = new Set(current.expenses.map(expenseSignature));
  const toAdd = [];
  const duplicates = [];
  let alreadyPresent = 0;
  for (const expense of incoming.expenses) {
    if (existingIds.has(expense.id)) {
      alreadyPresent += 1;
      continue;
    }
    const mapped = { ...expense, categoryId: categoryMap.get(expense.categoryId) ?? expense.categoryId };
    if (signatures.has(expenseSignature(mapped))) duplicates.push(mapped);
    else toAdd.push(mapped);
  }
  return { newCategories, toAdd, duplicates, alreadyPresent };
}

/**
 * Grava a importação. Devolve uma cópia do estado anterior para permitir
 * desfazer logo em seguida.
 */
export function applyImport(analysis, { mode, includeDuplicates = false }) {
  const before = store.snapshot();
  if (mode === 'replace') {
    store.replaceAll({ expenses: analysis.incoming.expenses, categories: analysis.incoming.categories });
  } else {
    const { newCategories, toAdd, duplicates } = analysis.merge;
    store.replaceAll({
      expenses: [...before.expenses, ...toAdd, ...(includeDuplicates ? duplicates : [])],
      categories: [...before.categories, ...newCategories],
    });
  }
  return before;
}
