import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { VttEvent, VttEventOf, VttEventType } from './events';
import { collectOnline } from './presence';
import type { ConnectionStatus } from './store';
import type { VttPresence } from './types';

const BROADCAST_EVENT = 'vtt';

export interface TableChannel {
  emit: (event: VttEvent) => void;
  on: <T extends VttEventType>(
    type: T,
    handler: (event: VttEventOf<T>) => void
  ) => () => void;
  track: (presence: VttPresence) => void;
  leave: () => void;
}

interface JoinOptions {
  userId: string;
  onOnline: (online: VttPresence[]) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** Chamado a cada SUBSCRIBED, inclusive após reconectar. */
  onSubscribed: () => void;
}

// supabase.channel() devolve o canal existente do mesmo tópico: entrar de novo
// enquanto o anterior ainda está saindo (Strict Mode, troca de rota) quebraria.
const pendingLeaves = new Map<string, Promise<void>>();

export function joinTableChannel(
  supabase: SupabaseClient,
  tableId: string,
  { userId, onOnline, onStatus, onSubscribed }: JoinOptions
): TableChannel {
  const topic = `mesa:${tableId}`;
  const handlers = new Map<VttEventType, Set<(event: VttEvent) => void>>();
  let channel: RealtimeChannel | null = null;
  let joined = false;
  let left = false;
  let presence: VttPresence | null = null;

  async function start() {
    await pendingLeaves.get(topic);
    // Canal privado autoriza pelo JWT do usuário no momento do join.
    await supabase.realtime.setAuth();
    if (left) return;

    const next = supabase.channel(topic, {
      config: { private: true, presence: { key: userId } },
    });
    channel = next;

    next
      .on('presence', { event: 'sync' }, () => {
        onOnline(collectOnline(next.presenceState<VttPresence>()));
      })
      .on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
        const event = payload as VttEvent;
        handlers.get(event.type)?.forEach((handler) => handler(event));
      })
      .subscribe((status) => {
        if (left) return;
        if (status === 'SUBSCRIBED') {
          joined = true;
          onStatus('online');
          if (presence) void next.track(presence);
          onSubscribed();
          return;
        }
        joined = false;
        onStatus('offline');
      });
  }

  void start().catch(() => {
    if (!left) onStatus('offline');
  });

  return {
    emit(event) {
      void channel?.send({
        type: 'broadcast',
        event: BROADCAST_EVENT,
        payload: event,
      });
    },
    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      const entry = handler as (event: VttEvent) => void;
      set.add(entry);
      return () => {
        set.delete(entry);
      };
    },
    track(next) {
      presence = next;
      if (joined) void channel?.track(next);
    },
    leave() {
      left = true;
      handlers.clear();
      const current = channel;
      if (!current) return;
      const leaving = supabase
        .removeChannel(current)
        .catch(() => undefined)
        .then(() => {
          // removeChannel só desmonta se o servidor confirmou a saída
          if (supabase.realtime.getChannels().includes(current)) {
            current.teardown();
          }
          if (pendingLeaves.get(topic) === leaving) pendingLeaves.delete(topic);
        });
      pendingLeaves.set(topic, leaving);
    },
  };
}
