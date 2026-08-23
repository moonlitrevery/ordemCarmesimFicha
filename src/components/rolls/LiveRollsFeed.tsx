'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

export type DiceRollRow = {
  id: string;
  character_id: string | null;
  character_name: string;
  roller_id: string;
  roller_name: string | null;
  label: string;
  notation: string;
  die_result: number | null;
  bonus: number;
  total: number;
  breakdown: string | null;
  created_at: string;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function LiveRollsFeed() {
  const [rolls, setRolls] = useState<DiceRollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('dice_rolls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80);

      if (cancelled) return;
      if (err) {
        setError(
          err.message.includes('dice_rolls')
            ? 'Tabela dice_rolls não encontrada. Rode supabase/migrations/003_dice_rolls.sql no Supabase.'
            : err.message
        );
        setLoading(false);
        return;
      }
      setRolls((data as DiceRollRow[]) ?? []);
      setError(null);
      setLoading(false);
    }

    void load();

    const channel = supabase
      .channel('dice_rolls_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls' },
        (payload) => {
          const row = payload.new as DiceRollRow;
          setRolls((prev) => [row, ...prev].slice(0, 100));
          setLive(true);
          window.setTimeout(() => setLive(false), 1200);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-parchment">Rolagens</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Feed ao vivo das rolagens dos jogadores (atributos, perícias e dados
            na ficha).
          </p>
        </div>
        <span
          className={
            'rounded-full border px-3 py-1 text-xs uppercase tracking-wider ' +
            (live
              ? 'border-emerald-500/50 text-emerald-400'
              : 'border-ink-border text-ink-muted')
          }
        >
          {live ? 'Nova rolagem' : 'Ao vivo'}
        </span>
      </div>

      {loading && (
        <div className="panel p-6 text-ink-muted">Carregando rolagens…</div>
      )}
      {error && (
        <div className="rounded-md border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-crimson-soft">
          {error}
        </div>
      )}

      {!loading && !error && rolls.length === 0 && (
        <div className="panel p-8 text-center text-ink-muted">
          Nenhuma rolagem ainda. Quando um jogador rolar na ficha, aparece aqui.
        </div>
      )}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rolls.map((r) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg text-parchment">
                  {r.character_name}
                  <span className="text-ink-muted"> · </span>
                  <span className="text-crimson-soft">{r.label}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  {r.roller_name || 'Jogador'} · {formatTime(r.created_at)} ·{' '}
                  {r.notation}
                  {r.breakdown ? ` · ${r.breakdown}` : ''}
                </p>
              </div>
              <p className="font-display text-4xl leading-none text-crimson-soft">
                {r.total}
              </p>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
