'use client';

import { useMemo, useState } from 'react';
import type { Asset } from '@/lib/vtt/assets/rules';
import { normalizeSearch } from '@/lib/vtt/pages';
import { AssetThumb } from '../AssetThumb';

/** Mapas da Biblioteca, com busca. Só as miniaturas: o arquivo cheio só carrega no canvas. */
export function MapPickerGrid({
  maps,
  value,
  onChange,
  loading = false,
}: {
  maps: Asset[];
  value: string | null;
  onChange: (asset: Asset) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const wanted = normalizeSearch(query);
    return wanted ? maps.filter((map) => normalizeSearch(map.name).includes(wanted)) : maps;
  }, [maps, query]);

  if (loading) return <p className="text-xs text-ink-muted">Carregando a Biblioteca…</p>;
  if (maps.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Sem mapas ainda. Envie na aba Biblioteca, no filtro Mapas, e volte aqui.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className="field min-h-11 px-2 py-1 text-xs desk:min-h-8"
        type="search"
        placeholder="Buscar mapa"
        aria-label="Buscar mapa"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5 overflow-y-auto">
        {shown.map((map) => (
          <li key={map.id}>
            <button
              type="button"
              title={map.name}
              aria-pressed={map.id === value}
              onClick={() => onChange(map)}
              className={
                'flex w-full flex-col items-center gap-1 overflow-hidden rounded-md border p-1 text-left ' +
                (map.id === value ? 'border-crimson bg-crimson/15' : 'border-ink-border hover:border-crimson/60')
              }
            >
              <AssetThumb asset={map} size={96} />
              <span className="w-full truncate text-[11px] text-parchment">{map.name}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="col-span-full text-xs text-ink-muted">Nenhum mapa com esse nome.</li>}
      </ul>
    </div>
  );
}
