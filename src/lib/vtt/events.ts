/**
 * Eventos de broadcast do canal da mesa. Qualquer membro consegue enviar no
 * canal, então estes são só avisos: quem recebe relê o estado do banco.
 */
export type VttEvent =
  | { type: 'session:state'; open: boolean }
  | { type: 'member:changed'; userId: string }
  | { type: 'asset:pending' };

export type VttEventType = VttEvent['type'];

export type VttEventOf<T extends VttEventType> = Extract<VttEvent, { type: T }>;
