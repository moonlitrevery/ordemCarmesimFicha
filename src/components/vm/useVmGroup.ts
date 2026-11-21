'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removeElement, upsertElement } from '@/lib/vm/card';
import {
  fetchGroupData,
  toVmCharacter,
  toVmNpc,
  type VmGroupData,
} from '@/lib/vm/data';
import type { ElementType } from '@/types/database';

type Row = Record<string, unknown>;

/** Aba escondida por mais que isso: ao voltar, relê o grupo inteiro. */
const STALE_AFTER_HIDDEN_MS = 5_000;

/**
 * Dados do grupo aberto + realtime só nas linhas dele. Um evento troca só a
 * entrada daquele personagem; os outros cards mantêm a mesma referência.
 */
export function useVmGroup(groupId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<VmGroupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Troca para reassinar o canal depois de uma queda.
  const [channelNonce, setChannelNonce] = useState(0);
  const requestRef = useRef(0);
  const droppedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!groupId) {
      setData(null);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await fetchGroupData(supabase, groupId);
      if (request !== requestRef.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (request !== requestRef.current) return;
      console.error('V.M.: falha ao carregar o grupo', err);
      setError('Não foi possível carregar o grupo.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [groupId, supabase]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  // Só os ids entram na chave: reordenar não reassina.
  const characterKey = useMemo(
    () =>
      Object.keys(data?.characters ?? {})
        .sort()
        .join(','),
    [data?.characters]
  );
  const npcKey = useMemo(
    () =>
      Object.keys(data?.npcs ?? {})
        .sort()
        .join(','),
    [data?.npcs]
  );

  useEffect(() => {
    if (!groupId || (!characterKey && !npcKey)) return;
    let disposed = false;
    const channel = supabase.channel(`vm:${groupId}:${crypto.randomUUID()}`);

    if (characterKey) {
      const inChars = `(${characterKey})`;
      channel
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=in.${inChars}`,
        }, ({ new: row }) => {
          const id = String((row as Row).id);
          setData((d) =>
            d && d.characters[id]
              ? { ...d, characters: { ...d.characters, [id]: toVmCharacter(row as Row, d.characters[id]) } }
              : d
          );
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'character_elements',
          filter: `character_id=in.${inChars}`,
        }, ({ new: row }) => applyElement(row as Row))
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'character_elements',
          filter: `character_id=in.${inChars}`,
        }, ({ new: row }) => applyElement(row as Row))
        // DELETE não aceita filtro e só traz o id: quem não é do grupo é ignorado.
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'character_elements',
        }, ({ old }) => {
          const id = (old as Row)?.id;
          if (!id) return;
          setData((d) => {
            if (!d) return d;
            const characters = removeElement(d.characters, String(id));
            return characters === d.characters ? d : { ...d, characters };
          });
        })
        // Ficha apagada: o FK já tirou do grupo, aqui só some da tela.
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'characters',
        }, ({ old }) => {
          const id = (old as Row)?.id;
          if (id) dropTarget('character_id', String(id));
        });
    }

    if (npcKey) {
      channel
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'npcs',
          filter: `id=in.(${npcKey})`,
        }, ({ new: row }) => {
          const id = String((row as Row).id);
          setData((d) =>
            d && d.npcs[id]
              ? { ...d, npcs: { ...d.npcs, [id]: toVmNpc(row as Row, d.npcs[id]) } }
              : d
          );
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'npcs',
        }, ({ old }) => {
          const id = (old as Row)?.id;
          if (id) dropTarget('npc_id', String(id));
        });
    }

    function applyElement(row: Row) {
      const characterId = String(row.character_id ?? '');
      setData((d) => {
        if (!d || !d.characters[characterId]) return d;
        return {
          ...d,
          characters: upsertElement(d.characters, characterId, {
            id: String(row.id),
            element: row.element as ElementType,
            level: Number(row.level) || 0,
          }),
        };
      });
    }

    function dropTarget(key: 'character_id' | 'npc_id', id: string) {
      setData((d) => {
        if (!d || !d.members.some((m) => m[key] === id)) return d;
        return { ...d, members: d.members.filter((m) => m[key] !== id) };
      });
    }

    channel.subscribe((status) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        // Voltou depois de cair: o que mudou no meio não chegou.
        if (droppedRef.current) {
          droppedRef.current = false;
          void reload();
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        droppedRef.current = true;
      }
    });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
    // reload muda junto com groupId, que já está na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, characterKey, npcKey, channelNonce, supabase]);

  // Aba em segundo plano ou rede caída: ao voltar, relê tudo e reassina se caiu.
  useEffect(() => {
    if (!groupId) return;
    let hiddenAt: number | null = null;
    const resync = () => {
      if (droppedRef.current) {
        droppedRef.current = false;
        setChannelNonce((n) => n + 1);
      }
      void reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (droppedRef.current || away > STALE_AFTER_HIDDEN_MS) resync();
    };
    const onOnline = () => resync();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [groupId, reload]);

  return { supabase, data, setData, error, loading, reload };
}
