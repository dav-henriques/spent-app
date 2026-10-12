/**
 * Persistência local (localStorage).
 *
 * Esta camada só lê e grava JSON. Ela nunca lança exceções para quem chama:
 * leituras devolvem { ok, value, raw } e gravações devolvem true/false, para
 * que o restante do app decida o que fazer sem perder dados.
 */
import { STORAGE_PREFIX, RECOVERY_PREFIX } from './config.js';

let available = null;

/** localStorage pode estar indisponível (modo privado antigo, bloqueio de cookies…). */
export function isStorageAvailable() {
  if (available !== null) return available;
  try {
    const probe = `${STORAGE_PREFIX}.probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Lê uma chave JSON. `ok: false` indica conteúdo corrompido (o texto bruto vem em `raw`). */
export function readJSON(key) {
  const raw = readRaw(key);
  if (raw === null) return { ok: true, value: undefined, raw: null };
  try {
    return { ok: true, value: JSON.parse(raw), raw };
  } catch (error) {
    return { ok: false, value: undefined, raw, error };
  }
}

function writeRaw(key, raw) {
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
    return true;
  } catch (error) {
    console.warn(`Não foi possível gravar "${key}"`, error);
    return false;
  }
}

/**
 * Grava várias chaves como uma única operação: se qualquer gravação falhar
 * (ex.: armazenamento cheio), as chaves já gravadas voltam ao valor anterior.
 */
export function writeMany(entries) {
  const previous = entries.map(([key]) => [key, readRaw(key)]);
  for (const [key, value] of entries) {
    if (!writeRaw(key, JSON.stringify(value))) {
      for (const [prevKey, prevRaw] of previous) writeRaw(prevKey, prevRaw);
      return false;
    }
  }
  return true;
}

/**
 * Guarda uma cópia de dados que não puderam ser lidos ou migrados. Essas
 * cópias aparecem em Ajustes, onde podem ser baixadas ou descartadas.
 */
export function preserveForRecovery(label, content) {
  const key = `${RECOVERY_PREFIX}${new Date().toISOString()}.${label}`;
  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  return writeRaw(key, raw) ? key : null;
}

export function listRecoveryEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RECOVERY_PREFIX)) {
        entries.push({ key, size: (localStorage.getItem(key) ?? '').length });
      }
    }
  } catch {
    return [];
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export const removeKey = (key) => writeRaw(key, null);
