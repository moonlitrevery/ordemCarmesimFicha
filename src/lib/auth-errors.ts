/** Só o que ajuda a pessoa: o texto cru do Supabase não vai para a tela. */
export function authErrorMessage(
  error: { message?: string; status?: number; code?: string },
  fallback: string
): string {
  const message = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  if (error.status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  }
  if (code === 'weak_password' || message.includes('password should')) {
    return 'Senha fraca. Escolha uma senha mais longa, misturando letras e números.';
  }
  if (code === 'email_address_invalid' || message.includes('invalid format')) {
    return 'E-mail inválido.';
  }
  // Cadastro com e-mail já usado cai aqui de propósito: não revela que a conta existe.
  return fallback;
}
