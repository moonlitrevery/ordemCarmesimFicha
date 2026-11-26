'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isValidImageUrl } from '@/lib/constants';
import { fetchPickOptions, type VmPickOption, type VmSection } from '@/lib/vm/data';
import type { createClient } from '@/lib/supabase/client';
import { VmModal } from './VmModal';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidImageUrl(url) && !failed;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink-border bg-ink-raised font-display text-lg">
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{name.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </div>
  );
}

/** Seletor com busca. Fica aberto para adicionar vários de uma vez. */
export function MemberPicker({
  supabase,
  userId,
  section,
  taken,
  onPick,
  onClose,
}: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  section: VmSection;
  /** `character:<id>` / `npc:<id>` já no grupo. */
  taken: Set<string>;
  onPick: (option: VmPickOption) => Promise<void>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<VmPickOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let active = true;
    fetchPickOptions(supabase, section, userId).then(
      (list) => active && setOptions(list),
      (err) => {
        console.error('V.M.: falha ao listar personagens', err);
        if (active) setError('Não foi possível carregar a lista.');
      }
    );
    return () => {
      active = false;
    };
  }, [supabase, section, userId]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(o.name + ' ' + (o.subtitle ?? '')).includes(q));
  }, [options, query]);

  async function pick(option: VmPickOption) {
    const key = `${option.kind}:${option.id}`;
    if (busy || taken.has(key)) return;
    setBusy(key);
    try {
      await onPick(option);
    } finally {
      setBusy(null);
    }
  }

  return (
    <VmModal title={section === 'pj' ? 'Adicionar PJ' : 'Adicionar NPC'} onClose={onClose} wide>
      <input
        ref={inputRef}
        className="field"
        type="search"
        placeholder={section === 'pj' ? 'Buscar por personagem ou jogador' : 'Buscar NPC'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="-mx-1 min-h-[8rem] overflow-y-auto px-1">
        {error ? (
          <p className="py-6 text-center text-sm text-crimson-soft">{error}</p>
        ) : !options ? (
          <p className="py-6 text-center text-sm text-ink-muted">Carregando…</p>
        ) : !filtered.length ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {options.length ? 'Nada encontrado.' : section === 'npc' ? 'Você ainda não criou NPCs.' : 'Nenhuma ficha.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((o) => {
              const key = `${o.kind}:${o.id}`;
              const added = taken.has(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={added || busy === key}
                    onClick={() => void pick(o)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-ink-raised disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <Thumb url={o.imageUrl} name={o.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-parchment">{o.name}</span>
                      {o.subtitle && <span className="block truncate text-xs text-ink-muted">{o.subtitle}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {added ? '✓ no grupo' : busy === key ? '…' : '+ Adicionar'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </VmModal>
  );
}
