/**
 * Valores monetários.
 *
 * Todo valor é guardado e calculado como número inteiro de centavos
 * (R$ 18,50 → 1850). A conversão para texto acontece apenas na exibição,
 * e a leitura do que o usuário digita é feita sobre a string — sem passar
 * por números de ponto flutuante — para que "0,1 + 0,2" nunca vire 0,30000004.
 */
import { LIMITS } from './config.js';

const NBSP = ' ';
const MINUS = '−';

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 124402 → "1.244,02" (sem símbolo, sem sinal). */
export function formatNumber(cents) {
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  return `${groupThousands(String(reais))},${String(centavos).padStart(2, '0')}`;
}

/** 124402 → "R$ 1.244,02"; valores negativos recebem "− " à frente. */
export function formatMoney(cents) {
  const sign = cents < 0 ? `${MINUS}${NBSP}` : '';
  return `${sign}R$${NBSP}${formatNumber(cents)}`;
}

/** Diferenças: "+ R$ 12,00", "− R$ 5,50" ou "R$ 0,00". */
export function formatSignedMoney(cents) {
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? '+' : MINUS}${NBSP}R$${NBSP}${formatNumber(cents)}`;
}

/** Valor para o campo de edição: 1850 → "18,50". */
export const formatAmountInput = (cents) => formatNumber(cents);

/** Valor para planilhas: sem separador de milhar, vírgula decimal ("1244,02"). */
export function formatCSVAmount(cents) {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

const isThousandsGrouped = (text) => /^\d{1,3}(\.\d{3})+$/.test(text);

/**
 * Converte o texto digitado em centavos. Devolve null se o valor for inválido,
 * zero ou negativo.
 *
 * Aceita o padrão brasileiro ("12", "12,5", "12,50", "1.250,00") e também o
 * ponto decimal que aparece no teclado de iPhones configurados em inglês
 * ("12.50"). Um único ponto seguido de exatamente três dígitos é tratado como
 * separador de milhar ("1.250" → R$ 1.250,00).
 */
export function parseAmount(input) {
  let text = String(input ?? '').replace(/\s+/g, '').replace(/^R\$/i, '');
  if (!text || !/^[\d.,]+$/.test(text)) return null;

  let integerPart;
  let fractionPart = '';
  const commaIndex = text.indexOf(',');

  if (commaIndex !== -1) {
    // Vírgula é o separador decimal; pontos antes dela separam milhares.
    if (text.indexOf(',', commaIndex + 1) !== -1) return null;
    integerPart = text.slice(0, commaIndex);
    fractionPart = text.slice(commaIndex + 1);
    if (fractionPart.includes('.')) return null;
    if (integerPart.includes('.')) {
      if (!isThousandsGrouped(integerPart)) return null;
      integerPart = integerPart.replace(/\./g, '');
    }
  } else if (text.includes('.')) {
    const parts = text.split('.');
    if (parts.length === 2 && parts[1].length !== 3) {
      [integerPart, fractionPart] = parts; // ponto decimal: "12.5", "12.50", "12."
    } else if (isThousandsGrouped(text)) {
      integerPart = text.replace(/\./g, ''); // milhares: "1.250", "1.250.000"
    } else {
      return null;
    }
  } else {
    integerPart = text;
  }

  integerPart = integerPart.replace(/^0+(?=\d)/, '') || '0';
  if (!/^\d+$/.test(integerPart) || !/^\d{0,2}$/.test(fractionPart)) return null;
  if (integerPart.length > 12) return null;

  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > LIMITS.maxCents) return null;
  return cents;
}

/** Remove caracteres que não fazem parte de um valor (mantém dígitos, vírgula e ponto). */
export const sanitizeAmountText = (text) => String(text).replace(/[^\d.,]/g, '');

/** 16.666… → "16,7%"; 50 → "50%"; valores ínfimos → "<0,1%". */
export function formatPercent(percent) {
  if (!Number.isFinite(percent)) return '—';
  if (percent > 0 && percent < 0.1) return '<0,1%';
  let rounded = Math.round(percent * 10) / 10;
  if (rounded === 100 && percent < 100) rounded = 99.9;
  return `${String(rounded).replace('.', ',')}%`;
}

/** Variação percentual com sinal explícito: "+10,7%", "−5%". */
export function formatSignedPercent(percent) {
  if (!Number.isFinite(percent)) return '—';
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  if (rounded === 0) return '0%';
  return `${percent > 0 ? '+' : MINUS}${String(rounded).replace('.', ',')}%`;
}
