import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { parseDiceExpression, rollDiceExpression } from '../dice';
import { logDiceRoll } from '../dice-log';
import { parseChatInput, type WhisperTarget } from './chat-commands';
import {
  CHAT_PAGE_SIZE,
  isChatRoll,
  mergeChatMessages,
  type ChatMessage,
  type ChatRoll,
} from './chat-rules';

/** PostgREST não acha a função: a migração ainda não rodou. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}
import { useVttStore } from './store';

const MESSAGE_COLUMNS =
  'id, table_id, author_id, author_name, character_id, character_name, kind, body, roll, hidden, whisper_to, deleted, created_at';

const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];

function store() {
  return useVttStore.getState();
}

/** Chat da mesa: `postgres_changes` entrega a cada um só o que o RLS deixa ler. */
export class ChatSync {
  private channel: RealtimeChannel | null = null;
  private stopped = false;
  private loadingOlder = false;

  constructor(
    private supabase: SupabaseClient,
    private tableId: string,
    private userId: string
  ) {}

  start() {
    void this.subscribe().catch(() => undefined);
  }

  stop() {
    this.stopped = true;
    if (this.channel) void this.supabase.removeChannel(this.channel);
    this.channel = null;
  }

  private async subscribe() {
    await this.supabase.realtime.setAuth();
    if (this.stopped) return;
    // Tópico único: entrar de novo enquanto o anterior sai (Strict Mode) quebraria.
    this.channel = this.supabase
      .channel(`chat:${this.tableId}:${crypto.randomUUID()}`)
      .on<ChatMessage>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `table_id=eq.${this.tableId}`,
        },
        ({ new: row }) => this.onRow(row, true)
      )
      .on<ChatMessage>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `table_id=eq.${this.tableId}`,
        },
        ({ new: row }) => this.onRow(row, false)
      )
      .subscribe((status) => {
        // Também roda ao reconectar: busca o que passou enquanto estava fora.
        if (status === 'SUBSCRIBED') void this.loadLatest();
      });
  }

  private onRow(row: ChatMessage, isNew: boolean) {
    useVttStore.setState((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, [row]),
      chatUnread:
        isNew && !s.chatVisible && row.author_id !== this.userId
          ? s.chatUnread + 1
          : s.chatUnread,
    }));
  }

  private page() {
    return this.supabase
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('table_id', this.tableId)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
  }

  async loadLatest() {
    const { data, error } = await this.page();
    if (this.stopped) return;
    if (error) {
      useVttStore.setState({
        chatError: MISSING_TABLE_CODES.includes(error.code)
          ? 'Tabela do chat não encontrada. Rode supabase/migrations/011_vtt_chat.sql no Supabase.'
          : 'Não foi possível carregar o chat.',
      });
      return;
    }
    const rows = (data ?? []) as unknown as ChatMessage[];
    useVttStore.setState((s) => ({
      chatError: null,
      chatMessages: mergeChatMessages(s.chatMessages, rows),
      chatHasMore: s.chatMessages.length === 0
        ? rows.length === CHAT_PAGE_SIZE
        : s.chatHasMore,
    }));
  }

  async loadOlder() {
    const [oldest] = store().chatMessages;
    if (!oldest || this.loadingOlder || !store().chatHasMore) return;
    this.loadingOlder = true;
    const { data, error } = await this.page().lt('created_at', oldest.created_at);
    this.loadingOlder = false;
    if (this.stopped || error) return;
    const rows = (data ?? []) as unknown as ChatMessage[];
    useVttStore.setState((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, rows),
      chatHasMore: rows.length === CHAT_PAGE_SIZE,
    }));
  }

  private async insert(
    message: Partial<ChatMessage>,
    failure: string
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert({
        table_id: this.tableId,
        author_id: this.userId,
        ...message,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (this.stopped) return null;
    if (error || !data) return failure;
    useVttStore.setState((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, [
        data as unknown as ChatMessage,
      ]),
    }));
    return null;
  }

  /** Devolve o erro para mostrar; `null` = enviado. */
  async send(text: string, targets: WhisperTarget[]): Promise<string | null> {
    const command = parseChatInput(text, targets);
    switch (command.kind) {
      case 'error':
        return command.message;
      case 'text':
        if (!command.body) return null;
        return this.insert(
          { kind: 'text', body: command.body },
          'Não foi possível enviar. Tente de novo.'
        );
      case 'whisper':
        return this.insert(
          { kind: 'whisper', body: command.body, whisper_to: command.to.userId },
          'Não foi possível sussurrar. Tente de novo.'
        );
      default: {
        const roll = await this.roll({
          notation: command.notation,
          label: command.label,
          hidden: command.hidden,
        });
        return roll ? null : 'Não foi possível rolar. Tente de novo.';
      }
    }
  }

  /** Toda rolagem da Mesa vai para o chat e continua gravada em `dice_rolls` (sem leitor desde a Fase 13). */
  async roll(input: {
    notation: string;
    label: string;
    hidden: boolean;
    /** Quem age não é a ficha escolhida (NPC, entrada da iniciativa). */
    actor?: string;
  }): Promise<ChatRoll | null> {
    // Notação inválida nem sai do navegador.
    if (!parseDiceExpression(input.notation)) return null;
    const rollCharacterId = input.actor ? null : store().rollCharacter?.id ?? null;

    // Desde a migração 028, o banco sorteia: ninguém inventa o próprio resultado.
    const { data, error } = await this.supabase.rpc('chat_roll', {
      p_table: this.tableId,
      p_notation: input.notation,
      p_label: input.label,
      p_hidden: input.hidden,
      p_character: rollCharacterId,
      p_actor: input.actor ?? null,
    });
    if (this.stopped) return null;
    if (!error && data) {
      const message = data as unknown as ChatMessage;
      useVttStore.setState((s) => ({
        chatMessages: mergeChatMessages(s.chatMessages, [message]),
      }));
      return isChatRoll(message.roll) ? message.roll : null;
    }
    if (!isMissingFunction(error)) return null;
    return this.rollLocally(input);
  }

  /** Banco sem a migração 028: o jeito antigo, sorteado no navegador. */
  private async rollLocally(input: {
    notation: string;
    label: string;
    hidden: boolean;
    actor?: string;
  }): Promise<ChatRoll | null> {
    const rolled = rollDiceExpression(input.notation);
    if (!rolled) return null;
    const roll: ChatRoll = { ...rolled, label: input.label };
    const { me } = store();
    const rollCharacter = input.actor ? null : store().rollCharacter;

    const failure = await this.insert(
      {
        kind: 'roll',
        roll,
        hidden: input.hidden,
        character_id: rollCharacter?.id ?? null,
      },
      'erro'
    );
    if (failure) return null;

    const singleDie =
      rolled.groups.length === 1 && rolled.groups[0].results.length === 1;
    void logDiceRoll({
      characterId: rollCharacter?.id ?? null,
      characterName: input.actor ?? rollCharacter?.name ?? me?.name ?? 'Jogador',
      label: input.label || rolled.notation,
      notation: rolled.notation,
      dieResult: singleDie ? rolled.groups[0].results[0] : null,
      bonus: rolled.modifier,
      total: rolled.total,
      breakdown: `${rolled.math} = ${rolled.total}`,
    });
    return roll;
  }

  async deleteMessage(id: string) {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .update({ deleted: true })
      .eq('id', id)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();
    if (this.stopped) return;
    if (error || !data) {
      store().showToast('Não foi possível apagar a mensagem.');
      return;
    }
    useVttStore.setState((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, [
        data as unknown as ChatMessage,
      ]),
    }));
  }
}
