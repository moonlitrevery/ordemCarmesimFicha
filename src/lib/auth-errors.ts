/** Traduz mensagens do Supabase Auth para o usuário (pt-BR). */
export function translateAuthError(message: string): string {
  if (message === 'Invalid login credentials') {
    return 'E-mail ou senha inválidos.';
  }
  const minimo = message.match(/^Password should be at least (\d+) characters/);
  if (minimo) {
    return `A senha deve ter pelo menos ${minimo[1]} caracteres.`;
  }
  if (message === 'User already registered') {
    return 'Este e-mail já está cadastrado.';
  }
  if (message === 'Email rate limit exceeded') {
    return 'Muitas tentativas em pouco tempo. Aguarde e tente de novo.';
  }
  return 'Não foi possível concluir. Tente de novo.';
}
