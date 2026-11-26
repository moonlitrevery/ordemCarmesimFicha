import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors';

const FALLBACK = 'falhou';

describe('authErrorMessage', () => {
  it('traduz os erros conhecidos', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' }, FALLBACK)).toBe(
      'E-mail ou senha inválidos.'
    );
    expect(authErrorMessage({ status: 429, message: 'x' }, FALLBACK)).toContain('Muitas tentativas');
    expect(authErrorMessage({ code: 'email_not_confirmed' }, FALLBACK)).toContain('Confirme');
  });

  it('não repete o texto cru, nem revela e-mail já cadastrado', () => {
    expect(authErrorMessage({ message: 'User already registered' }, FALLBACK)).toBe(FALLBACK);
    expect(authErrorMessage({ message: 'relation "profiles" does not exist' }, FALLBACK)).toBe(
      FALLBACK
    );
  });
});
