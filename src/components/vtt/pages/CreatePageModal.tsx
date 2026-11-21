'use client';

import { useState, type FormEvent } from 'react';
import type { Asset } from '@/lib/vtt/assets/rules';
import { MAX_PAGE_NAME } from '@/lib/vtt/pages';
import { useVttStore } from '@/lib/vtt/store';
import { MapPickerGrid } from './MapPickerGrid';
import { FolderSelect, PageModal } from './PageModal';

type Source = 'blank' | 'map';

/** "+ Criar página": em branco ou a partir de um mapa da Biblioteca. */
export function CreatePageModal({
  maps,
  loadingMaps,
  folders,
  initialFolder,
  onClose,
  onCreated,
}: {
  maps: Asset[];
  loadingMaps: boolean;
  folders: string[];
  initialFolder: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const sync = useVttStore((s) => s.sync);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(initialFolder);
  const [source, setSource] = useState<Source>('map');
  const [map, setMap] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const ready = Boolean(trimmed) && (source === 'blank' || map !== null) && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !sync) return;
    setBusy(true);
    const id = await sync.createScene(trimmed, folder, source === 'map' ? (map?.id ?? null) : null);
    setBusy(false);
    if (id) onCreated();
  }

  return (
    <PageModal title="Criar página" onClose={onClose} wide={source === 'map'}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          <span className="label">Nome</span>
          <input
            className="field min-h-11 px-2 py-1 text-sm desk:min-h-8"
            autoFocus
            maxLength={MAX_PAGE_NAME}
            placeholder="Ex.: Praça de Trocchia"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1" htmlFor="create-page-folder">
          <span className="label">Pasta</span>
          <FolderSelect id="create-page-folder" folders={folders} value={folder} onChange={setFolder} />
        </label>

        <fieldset className="space-y-2">
          <legend className="label">Começar</legend>
          <div className="grid grid-cols-2 gap-1" role="radiogroup">
            {(
              [
                ['blank', 'Em branco', 'Sem mapa, fundo neutro.'],
                ['map', 'A partir de um mapa', 'Escolha na Biblioteca.'],
              ] as const
            ).map(([value, label, help]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                className={
                  'min-h-11 rounded-md border px-2 py-1.5 text-left text-xs ' +
                  (source === value ? 'border-crimson bg-crimson/20' : 'border-ink-border hover:border-crimson/60')
                }
                onClick={() => setSource(value)}
              >
                <span className="block text-parchment">{label}</span>
                <span className="block text-ink-muted">{help}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {source === 'map' && (
          <>
            <MapPickerGrid
              maps={maps}
              loading={loadingMaps}
              value={map?.id ?? null}
              onChange={(asset) => {
                setMap(asset);
                if (!name.trim()) setName(asset.name.slice(0, MAX_PAGE_NAME));
              }}
            />
            <p className="text-xs text-ink-muted">
              A escala vem do mapa (1 quadrado = 1,5 m). Mapa ainda sem calibração pede uma
              medida uma vez só, e ela fica salva no mapa para as próximas páginas.
            </p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-0" disabled={!ready}>
            {busy ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>
    </PageModal>
  );
}
