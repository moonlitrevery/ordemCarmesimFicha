/**
 * Mensagens do Supabase Auth traduzidas para o usuário (pt-BR).
 * Cada regra casa a mensagem original e devolve o texto exibido na tela.
 */
type Rule = { match: RegExp; text: (m: RegExpMatchArray) => string };

const RULES: Rule[] = [
  { match: /^Invalid login credentials$/, text: () => 'E-mail ou senha inválidos.' },
  {
    match: /^Password should be at least (\d+) characters/,
    text: ([, min]) => `A senha deve ter pelo menos ${min} caracteres.`,
  },
  { match: /^User already registered$/, text: () => 'Este e-mail já está cadastrado.' },
  {
    match: /^Email rate limit exceeded$/,
    text: () => 'Muitas tentativas em pouco tempo. Aguarde e tente de novo.',
  },
];

const FALLBACK = 'Não foi possível concluir. Tente de novo.';

export function translateAuthError(message: string): string {
  for (const rule of RULES) {
    const m = message.match(rule.match);
    if (m) return rule.text(m);
  }
  return FALLBACK;
}
