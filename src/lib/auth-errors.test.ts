import { describe, expect, it } from 'vitest';
import { translateAuthError } from './auth-errors';

/**
 * TDD (P2): mensagens do Supabase Auth exibidas em português.
 * Origem: OBS-01 / CT-04 — o cadastro mostrava "Password should be at least 6 characters."
 */
describe('translateAuthError', () => {
  it('credencial inválida no login', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('E-mail ou senha inválidos.');
  });

  it('senha abaixo do mínimo no cadastro (CT-04)', () => {
    expect(translateAuthError('Password should be at least 6 characters.')).toBe(
      'A senha deve ter pelo menos 6 caracteres.'
    );
  });

  it('aceita a variação sem ponto final e com outro mínimo', () => {
    expect(translateAuthError('Password should be at least 8 characters')).toBe(
      'A senha deve ter pelo menos 8 caracteres.'
    );
  });

  it('e-mail já cadastrado', () => {
    expect(translateAuthError('User already registered')).toBe('Este e-mail já está cadastrado.');
  });

  it('limite de tentativas', () => {
    expect(translateAuthError('Email rate limit exceeded')).toBe(
      'Muitas tentativas em pouco tempo. Aguarde e tente de novo.'
    );
  });

  it('mensagem desconhecida não aparece em inglês para o usuário', () => {
    expect(translateAuthError('Something unexpected happened')).toBe(
      'Não foi possível concluir. Tente de novo.'
    );
  });
});
