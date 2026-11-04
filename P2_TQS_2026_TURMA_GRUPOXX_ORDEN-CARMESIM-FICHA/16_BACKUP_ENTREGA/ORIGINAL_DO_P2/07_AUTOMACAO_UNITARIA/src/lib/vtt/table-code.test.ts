import { describe, expect, it } from 'vitest';
import {
  isValidTableCode,
  joinErrorMessage,
  normalizeTableCode,
} from './table-code';

describe('normalizeTableCode', () => {
  it('remove espaços e hífens e passa para maiúsculas', () => {
    expect(normalizeTableCode(' ab-c d2x ')).toBe('ABCD2X');
  });
});

describe('isValidTableCode', () => {
  it('aceita 6 símbolos do alfabeto', () => {
    expect(isValidTableCode('ABCD23')).toBe(true);
    expect(isValidTableCode('ZZZ999')).toBe(true);
  });

  it('recusa caracteres ambíguos', () => {
    for (const code of ['ABCD20', 'ABCD21', 'ABCDEO', 'ABCDEI']) {
      expect(isValidTableCode(code)).toBe(false);
    }
  });

  it('recusa tamanho errado', () => {
    expect(isValidTableCode('ABCDE')).toBe(false);
    expect(isValidTableCode('ABCDEFG')).toBe(false);
  });
});

describe('joinErrorMessage', () => {
  it('traduz os erros do join_table', () => {
    expect(joinErrorMessage('invalid_code')).toBe('Código inválido.');
    expect(joinErrorMessage('banned')).toBe('Você foi removido desta mesa.');
  });

  it('tem mensagem genérica para o resto', () => {
    expect(joinErrorMessage('Failed to fetch')).toContain('Tente de novo');
  });
});
