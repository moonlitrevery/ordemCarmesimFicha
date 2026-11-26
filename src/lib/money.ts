/** Dinheiro da ficha e do caixa: parse com vírgula ou ponto, conta com sinal, passo das setas. */

export const MONEY_LIMIT = 100_000_000_000;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatUsd(value: number): string {
  return usd.format(value);
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Número sem sinal, com `.` ou `,` em qualquer papel. O último separador é decimal
 * se tiver 1 ou 2 dígitos depois dele; com exatamente 3, é de milhar
 * (`1.759` = 1759, `1,5` = 1,5, `1.759,99` = `1,759.99` = 1759,99). Os outros
 * separadores só podem ser de milhar, em grupos de 3.
 */
function parseUnsigned(text: string): number | null {
  if (!/^[0-9.,]+$/.test(text) || !/[0-9]/.test(text)) return null;
  const lastSep = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  let intPart = text;
  let fraction = '';
  if (lastSep >= 0) {
    const after = text.slice(lastSep + 1);
    if (after.length === 1 || after.length === 2) {
      intPart = text.slice(0, lastSep);
      fraction = after;
    } else if (after.length !== 3) {
      return null;
    }
  }
  if (!/^[0-9]/.test(intPart) && intPart !== '') return null;
  const groups = intPart.split(/[.,]/);
  if (groups.some((g) => g === '')) {
    // `,5` vale 0,5; `1..5` ou `1.` não.
    if (!(intPart === '' && fraction)) return null;
  }
  if (groups.length > 1 && groups.slice(1).some((g) => g.length !== 3)) return null;
  if (!/^[0-9]*$/.test(fraction)) return null;
  const value = Number((groups.join('') || '0') + (fraction ? '.' + fraction : ''));
  return Number.isFinite(value) ? value : null;
}

/** Número com sinal opcional (aceita o `−` tipográfico). Sem sinal, `null` se inválido. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(/−/g, '-').replace(/\s/g, '');
  const match = /^([+-]?)(.*)$/.exec(text);
  if (!match) return null;
  const value = parseUnsigned(match[2]);
  if (value === null) return null;
  return match[1] === '-' ? -value : value;
}

export function parseMoney(raw: string): number | null {
  const text = raw.trim().replace(/^US\$|^\$/i, '').trim();
  const value = parseDecimal(text);
  if (value === null || Math.abs(value) > MONEY_LIMIT) return null;
  return roundCents(value);
}

export type MoneyInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'set'; value: number }
  | { kind: 'delta'; value: number };

/**
 * O que foi digitado no campo: `250` troca o valor, `+50`/`-30` somam ou subtraem,
 * `=-30` grava o negativo de propósito (dívida).
 */
export function parseMoneyInput(raw: string): MoneyInput {
  const text = raw.trim().replace(/−/g, '-');
  if (!text) return { kind: 'empty' };
  if (text.startsWith('=')) {
    const value = parseMoney(text.slice(1));
    return value === null ? { kind: 'invalid' } : { kind: 'set', value };
  }
  if (text.startsWith('+') || text.startsWith('-')) {
    const value = parseMoney(text);
    return value === null || value === 0 ? { kind: 'invalid' } : { kind: 'delta', value };
  }
  const value = parseMoney(text);
  return value === null ? { kind: 'invalid' } : { kind: 'set', value };
}

/** Soma que não fica negativa sem querer: devolve `null` se daria abaixo de zero. */
export function applyMoneyDelta(current: number, delta: number): number | null {
  const next = roundCents(current + delta);
  if (next < 0 && delta < 0) return null;
  if (Math.abs(next) > MONEY_LIMIT) return null;
  return next;
}

/** Passo das setas: US$ 1, com Shift US$ 10. */
export function moneyStep(shift: boolean): number {
  return shift ? 10 : 1;
}

/** Texto do campo a partir do valor: sem separador de milhar, vírgula nos centavos. */
export function moneyDraft(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}
