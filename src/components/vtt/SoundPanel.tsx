'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Square, Star, Trash2 } from 'lucide-react';
import {
  assetsOfKind,
} from '@/lib/vtt/assets/static';
import { matchesSearch, type Asset } from '@/lib/vtt/assets/rules';
import {
  AUDIO_CATEGORIES,
  matchesCategory,
  MAX_FADE_MS,
  MIN_FADE_MS,
  type AmbientLayer,
} from '@/lib/vtt/audio/rules';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from './hud';

const FAVORITES_KEY = 'vtt:sfx-favorites';
/** A grade não é virtualizada: quem tem mais que isto refina a busca. */
const MAX_SHOWN = 60;

function readFavorites(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Sem localStorage: vale só nesta visita.
  }
}

function useKind(kind: 'audio_ambiente' | 'audio_sfx'): Asset[] {
  const library = useVttStore((s) => s.library);
  return useMemo(() => assetsOfKind(library ?? [], kind), [library, kind]);
}

/** Jogadores online, mais quem já é o alvo: quem caiu não some da camada dele. */
function TargetSelect({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (target: string | null) => void;
  label: string;
}) {
  const online = useVttStore((s) => s.online);
  const members = useVttStore((s) => s.members);
  const myId = useVttStore((s) => s.me?.userId);
  const ids = new Set(online.map((person) => person.userId));
  const options = members.filter(
    (member) =>
      !member.banned && member.userId !== myId && (ids.has(member.userId) || member.userId === value)
  );

  return (
    <select
      className="field min-h-11 min-w-0 px-2 py-1 text-xs desk:min-h-0"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Todos</option>
      {options.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.name}
          {ids.has(member.userId) ? '' : ' (offline)'}
        </option>
      ))}
    </select>
  );
}

function CategoryChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (category: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {AUDIO_CATEGORIES.map(({ tag, label }) => (
        <button
          key={tag}
          type="button"
          aria-pressed={value === tag}
          onClick={() => onChange(value === tag ? null : tag)}
          className={
            'min-h-11 rounded-full px-2 text-xs transition desk:min-h-0 desk:py-0.5 ' +
            (value === tag
              ? 'bg-crimson/25 text-parchment'
              : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between gap-2 text-xs text-ink-muted">
        <span className="min-w-0 truncate">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        className="block min-h-11 w-full accent-crimson desk:min-h-0"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function LayerRow({
  layer,
  sceneId,
  name,
}: {
  layer: AmbientLayer;
  sceneId: string;
  name: string;
}) {
  const audio = useVttStore((s) => s.audioSync);
  return (
    <li className="space-y-1 rounded-md border border-ink-border p-2">
      <VolumeSlider
        label={name}
        value={layer.volume}
        onChange={(volume) => audio?.patchLayer(sceneId, layer.id, { volume })}
      />
      <div className="flex items-center gap-1">
        <TargetSelect
          label={`Quem ouve ${name}`}
          value={layer.target}
          onChange={(target) => audio?.patchLayer(sceneId, layer.id, { target })}
        />
        <IconButton
          icon={Trash2}
          label={`Remover ${name}`}
          tooltip="native"
          onClick={() => audio?.removeLayer(sceneId, layer.id)}
        />
      </div>
    </li>
  );
}

function AmbientSection() {
  const audio = useVttStore((s) => s.audioSync);
  const layers = useVttStore((s) => s.ambientLayers);
  const scene = useVttStore((s) => s.scenes.find((item) => item.id === s.viewedSceneId));
  const assets = useKind('audio_ambiente');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      assets.filter(
        (asset) => matchesCategory(asset.tags, category) && matchesSearch(asset, search)
      ),
    [assets, category, search]
  );

  if (!scene) {
    return (
      <p className="text-xs text-ink-muted">
        Nenhuma página aberta. Crie ou abra uma em Páginas, abaixo do nome da mesa.
      </p>
    );
  }

  const nameOf = (id: string) =>
    assets.find((asset) => asset.id === id)?.name ?? 'Som indisponível';

  return (
    <section className="space-y-2">
      <h3 className="label">Ambiente de {scene.name}</h3>
      <p className="text-xs text-ink-muted">
        As camadas se somam e ficam salvas na cena. Camada com alvo só toca se a pessoa estiver nesta cena.
      </p>
      {layers.length === 0 ? (
        <p className="text-xs text-ink-muted">Sem ambiente. Adicione uma camada abaixo.</p>
      ) : (
        <ul className="space-y-2">
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              sceneId={scene.id}
              name={nameOf(layer.assetId)}
            />
          ))}
        </ul>
      )}
      <details className="rounded-md border border-ink-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm desk:min-h-8">
          Adicionar camada
        </summary>
        <div className="space-y-2 p-2 pt-0">
          <input
            className="field px-2 py-1 text-xs"
            type="search"
            value={search}
            placeholder="Buscar por nome"
            aria-label="Buscar ambiente por nome"
            onChange={(e) => setSearch(e.target.value)}
          />
          <CategoryChips value={category} onChange={setCategory} />
          {filtered.length === 0 && (
            <p className="text-xs text-ink-muted">
              Nada aqui. Envie em Biblioteca, no filtro Sons ambiente.
            </p>
          )}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {filtered.slice(0, MAX_SHOWN).map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-ink-raised desk:min-h-8"
                  onClick={() => audio?.addLayer(scene.id, asset.id, null)}
                >
                  <Plus size={14} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

function SfxSection() {
  const audio = useVttStore((s) => s.audioSync);
  const assets = useKind('audio_sfx');
  const [target, setTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => setFavorites(readFavorites()), []);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((other) => other !== id)
      : [...favorites, id];
    setFavorites(next);
    saveFavorites(next);
  }

  const filtered = useMemo(
    () =>
      assets
        .filter(
          (asset) =>
            (!onlyFavorites || favorites.includes(asset.id)) &&
            matchesCategory(asset.tags, category) &&
            matchesSearch(asset, search)
        )
        // Favorito primeiro. O sort é estável: o resto segue a ordem da biblioteca.
        .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id))),
    [assets, category, favorites, onlyFavorites, search]
  );

  return (
    <section className="space-y-2 border-t border-ink-border pt-3">
      <h3 className="label">SFX</h3>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        Quem ouve
        <TargetSelect label="Quem ouve o SFX" value={target} onChange={setTarget} />
      </label>
      <button
        type="button"
        className="btn-ghost min-h-11 w-full gap-2 px-2 py-1 text-xs desk:min-h-0"
        onClick={() => audio?.stopAllSfx()}
      >
        <Square size={14} aria-hidden />
        Parar todos os SFX
      </button>
      <div className="flex items-center gap-1">
        <input
          className="field min-w-0 flex-1 px-2 py-1 text-xs"
          type="search"
          value={search}
          placeholder="Buscar por nome"
          aria-label="Buscar SFX por nome"
          onChange={(e) => setSearch(e.target.value)}
        />
        <IconButton
          icon={Star}
          label={onlyFavorites ? 'Mostrar todos os SFX' : 'Mostrar só os favoritos'}
          active={onlyFavorites}
          tooltip="native"
          onClick={() => setOnlyFavorites((value) => !value)}
        />
      </div>
      <CategoryChips value={category} onChange={setCategory} />
      {filtered.length === 0 && (
        <p className="text-xs text-ink-muted">
          {assets.length === 0
            ? 'Sem SFX ainda. Envie em Biblioteca, no filtro SFX.'
            : 'Nada encontrado. Mude a busca ou os filtros.'}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-1">
        {filtered.slice(0, MAX_SHOWN).map((asset) => (
          <li key={asset.id} className="flex min-w-0 items-center rounded-md border border-ink-border">
            <button
              type="button"
              title={asset.name}
              className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-xs hover:bg-ink-raised desk:min-h-8"
              onClick={() => void audio?.playSfx(asset, target)}
            >
              {asset.name}
            </button>
            <IconButton
              icon={Star}
              label={`${favorites.includes(asset.id) ? 'Desfavoritar' : 'Favoritar'} ${asset.name}`}
              active={favorites.includes(asset.id)}
              tooltip="native"
              onClick={() => toggleFavorite(asset.id)}
            />
          </li>
        ))}
      </ul>
      {filtered.length > MAX_SHOWN && (
        <p className="text-xs text-ink-muted">
          Mostrando {MAX_SHOWN} de {filtered.length}. Use a busca ou uma categoria para achar os outros.
        </p>
      )}
    </section>
  );
}

/** Só a mestra controla o som. Cada um cuida do próprio volume em ⋯. */
export function SoundPanel() {
  const audio = useVttStore((s) => s.audioSync);
  const settings = useVttStore((s) => s.audioSettings);

  return (
    <div className="space-y-4 text-sm text-parchment">
      <section className="space-y-2">
        <VolumeSlider
          label="Volume geral (todo mundo)"
          value={settings.volume}
          onChange={(volume) => audio?.changeSettings({ volume })}
        />
        <label className="block">
          <span className="flex justify-between text-xs text-ink-muted">
            Duração do fade
            <span className="tabular-nums">{(settings.fadeMs / 1000).toFixed(1)} s</span>
          </span>
          <input
            type="range"
            min={MIN_FADE_MS}
            max={MAX_FADE_MS}
            step={500}
            className="block min-h-11 w-full accent-crimson desk:min-h-0"
            aria-label="Duração do fade"
            value={settings.fadeMs}
            onChange={(e) => audio?.changeSettings({ fadeMs: Number(e.target.value) })}
          />
        </label>
      </section>
      <AmbientSection />
      <SfxSection />
    </div>
  );
}
