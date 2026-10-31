import type { DiceExpressionRoll } from '../dice';
import type { TableRole } from './types';

export type ChatKind = 'text' | 'roll' | 'whisper' | 'system';

export interface ChatRoll extends DiceExpressionRoll {
  label: string;
}

export interface ChatMessage {
  id: string;
  table_id: string;
  author_id: string | null;
  author_name: string;
  character_id: string | null;
  character_name: string | null;
  kind: ChatKind;
  body: string;
  roll: ChatRoll | null;
  hidden: boolean;
  whisper_to: string | null;
  deleted: boolean;
  created_at: string;
}

export const CHAT_PAGE_SIZE = 50;

/** Em ordem de envio, sem repetir: a mesma linha chega pelo insert e pelo Realtime. */
export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

export function canDeleteMessage(
  message: Pick<ChatMessage, 'author_id' | 'deleted'>,
  role: TableRole,
  userId: string
): boolean {
  if (message.deleted) return false;
  return role === 'mestre' || message.author_id === userId;
}

/** O jsonb é escrito pelo cliente de quem rolou: torto não pode derrubar o chat. */
export function isChatRoll(value: unknown): value is ChatRoll {
  const roll = value as ChatRoll | null;
  return (
    !!roll &&
    typeof roll.total === 'number' &&
    typeof roll.math === 'string' &&
    typeof roll.label === 'string' &&
    Array.isArray(roll.groups) &&
    roll.groups.every(
      (group) =>
        typeof group?.sides === 'number' &&
        Array.isArray(group.results) &&
        group.results.every((die) => typeof die === 'number')
    )
  );
}
