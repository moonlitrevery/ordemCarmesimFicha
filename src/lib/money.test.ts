import { describe, expect, it } from 'vitest';
import {
  applyMoneyDelta,
  moneyDraft,
  parseDecimal,
  parseMoney,
  parseMoneyInput,
} from './money';

describe('parseMoney', () => {
  it('vírgula e ponto como decimal dão o mesmo valor', () => {
    expect(parseMoney('1759,99')).toBe(1759.99);
    expect(parseMoney('1759.99')).toBe(1759.99);
    expect(parseMoney('1,5')).toBe(1.5);
    expect(parseMoney('1.5')).toBe(1.5);
  });

  it('3 dígitos depois do último separador é milhar', () => {
    expect(parseMoney('1.759')).toBe(1759);
    expect(parseMoney('1,759')).toBe(1759);
    expect(parseMoney('1.234.567')).toBe(1234567);
  });

  it('milhar e decimal juntos, nos dois formatos', () => {
    expect(parseMoney('1.759,99')).toBe(1759.99);
    expect(parseMoney('1,759.99')).toBe(1759.99);
    expect(parseMoney('$1,759.99')).toBe(1759.99);
  });

  it('inválidos', () => {
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('1.7599')).toBeNull();
    expect(parseMoney('1.75.9')).toBeNull();
    expect(parseMoney('10.')).toBeNull();
    expect(parseMoney('1..5')).toBeNull();
    expect(parseMoney('12a')).toBeNull();
  });

  it('centavos arredondados', () => {
    expect(parseMoney('0,1')).toBe(0.1);
    expect(parseMoney(',5')).toBe(0.5);
  });
});

describe('parseMoneyInput', () => {
  it('+50 e -30 são conta, não valor', () => {
    expect(parseMoneyInput('+50')).toEqual({ kind: 'delta', value: 50 });
    expect(parseMoneyInput('-30')).toEqual({ kind: 'delta', value: -30 });
    expect(parseMoneyInput(' +1.759,99 ')).toEqual({ kind: 'delta', value: 1759.99 });
    expect(parseMoneyInput('−30')).toEqual({ kind: 'delta', value: -30 });
  });

  it('número sem sinal troca o valor', () => {
    expect(parseMoneyInput('250')).toEqual({ kind: 'set', value: 250 });
  });

  it('=-30 grava dívida de propósito', () => {
    expect(parseMoneyInput('=-30')).toEqual({ kind: 'set', value: -30 });
  });

  it('vazio e inválido', () => {
    expect(parseMoneyInput('  ')).toEqual({ kind: 'empty' });
    expect(parseMoneyInput('abc')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('+')).toEqual({ kind: 'invalid' });
    expect(parseMoneyInput('+0')).toEqual({ kind: 'invalid' });
  });
});

describe('applyMoneyDelta', () => {
  it('soma e subtrai', () => {
    expect(applyMoneyDelta(100, 50)).toBe(150);
    expect(applyMoneyDelta(100, -30)).toBe(70);
    expect(applyMoneyDelta(0.1, 0.2)).toBe(0.3);
  });

  it('não deixa ficar negativo sem querer', () => {
    expect(applyMoneyDelta(20, -30)).toBeNull();
    expect(applyMoneyDelta(20, -20)).toBe(0);
  });

  it('já em dívida, receber continua valendo', () => {
    expect(applyMoneyDelta(-50, 20)).toBe(-30);
  });
});

describe('parseDecimal (peso)', () => {
  it('aceita negativo com vírgula ou ponto', () => {
    expect(parseDecimal('-2')).toBe(-2);
    expect(parseDecimal('−1,5')).toBe(-1.5);
    expect(parseDecimal('0.5')).toBe(0.5);
    expect(parseDecimal('x')).toBeNull();
  });
});

describe('moneyDraft', () => {
  it('inteiro sem casas, centavos com vírgula', () => {
    expect(moneyDraft(1759)).toBe('1759');
    expect(moneyDraft(1759.9)).toBe('1759,90');
  });
});
