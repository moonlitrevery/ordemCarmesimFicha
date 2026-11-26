/** Mesa nova tem 8 símbolos (migração 027); a antiga continua com 6 até regenerar. */
export const TABLE_CODE_LENGTH = 8;

const TABLE_CODE_PATTERN = /^(?:[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{8})$/;

export function normalizeTableCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidTableCode(code: string): boolean {
  return TABLE_CODE_PATTERN.test(code);
}

export function joinErrorMessage(message: string): string {
  if (message.includes('invalid_code')) return 'Código inválido.';
  if (message.includes('too_many_attempts')) {
    return 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.';
  }
  if (message.includes('banned')) return 'Você foi removido desta mesa.';
  return 'Não foi possível entrar na mesa. Tente de novo.';
}
