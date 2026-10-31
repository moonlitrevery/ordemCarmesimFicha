'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { libraryImageUrl, type Asset } from '@/lib/vtt/assets/rules';
import { membersInScene } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import type { VttMember, VttScene } from '@/lib/vtt/types';
import { AssetThumb } from './AssetThumb';

function useMapAssets(): Asset[] {
  const libraryVersion = useVttStore((s) => s.libraryVersion);
  const [maps, setMaps] = useState<Asset[]>([]);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from('assets')
      .select('*')
      .eq('kind', 'mapa')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setMaps((data ?? []) as Asset[]);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryVersion]);
  return maps;
}

function MapPicker({
  maps,
  value,
  onChange,
}: {
  maps: Asset[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (maps.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Sem mapas na biblioteca ainda. Envie na aba Biblioteca.
      </p>
    );
  }
  return (
    <ul className="grid max-h-40 grid-cols-3 gap-1 overflow-y-auto">
      {maps.map((map) => (
        <li key={map.id}>
          <button
            type="button"
            title={map.name}
            aria-label={map.name}
            aria-pressed={map.id === value}
            onClick={() => onChange(map.id)}
            className={
              'block w-full overflow-hidden rounded border ' +
              (map.id === value ? 'border-crimson' : 'border-ink-border')
            }
          >
            <AssetThumb asset={map} size={80} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CreateSceneForm({ maps }: { maps: Asset[] }) {
  const sync = useVttStore((s) => s.sync);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [mapId, setMapId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !mapId) return;
    setBusy(true);
    await sync?.createScene(trimmed, folder.trim(), mapId);
    setBusy(false);
    setName('');
    setMapId(null);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-md border border-ink-border p-2"
    >
      <h3 className="label">Nova cena</h3>
      <input
        className="field px-2 py-1 text-xs"
        placeholder="Nome da cena"
        aria-label="Nome da cena"
        maxLength={120}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="field px-2 py-1 text-xs"
        placeholder="Pasta (opcional)"
        aria-label="Pasta"
        maxLength={80}
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
      />
      <MapPicker maps={maps} value={mapId} onChange={setMapId} />
      <button
        type="submit"
        className="btn-primary w-full px-2 py-1 text-xs"
        disabled={busy || !name.trim() || !mapId}
      >
        Criar cena
      </button>
    </form>
  );
}

function Avatars({ people, onlineIds }: { people: VttMember[]; onlineIds: Set<string> }) {
  if (people.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Quem está nesta cena">
      {people.map((person) => (
        <li
          key={person.userId}
          title={person.name}
          className={
            'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] uppercase text-parchment ' +
            (onlineIds.has(person.userId)
              ? 'border-emerald-500/70'
              : 'border-ink-border opacity-60')
          }
        >
          {person.name.slice(0, 2)}
        </li>
      ))}
    </ul>
  );
}

function SceneCard({
  scene,
  maps,
  isDefault,
  isViewing,
  people,
  onlineIds,
  checkedPlayers,
  dragging,
  onDragStart,
  onDropOn,
  onMove,
}: {
  scene: VttScene;
  maps: Asset[];
  isDefault: boolean;
  isViewing: boolean;
  people: VttMember[];
  onlineIds: Set<string>;
  checkedPlayers: string[];
  dragging: boolean;
  onDragStart: () => void;
  onDropOn: () => void;
  onMove: (delta: number) => void;
}) {
  const sync = useVttStore((s) => s.sync);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scene.name);
  const [folder, setFolder] = useState(scene.folder);
  const [confirming, setConfirming] = useState(false);

  const map = maps.find((m) => m.id === scene.map_asset_id);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await sync?.updateScene(scene.id, { name: trimmed, folder: folder.trim() });
    setEditing(false);
  }

  return (
    <li
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      className={
        'space-y-2 rounded-md border p-2 ' +
        (isViewing ? 'border-crimson ' : 'border-ink-border ') +
        (dragging ? 'opacity-50' : '')
      }
    >
      <div className="flex gap-2">
        <button
          type="button"
          title="Abrir esta cena"
          aria-label={`Abrir ${scene.name}`}
          className="shrink-0 overflow-hidden rounded"
          onClick={() => useVttStore.setState({ gmSceneChoice: scene.id })}
        >
          {map && libraryImageUrl(map) ? (
            <AssetThumb asset={map} size={64} />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center bg-ink-raised text-xl text-ink-muted">
              🗺
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1 text-sm text-parchment">
            {isDefault && (
              <span
                className="shrink-0 rounded-sm bg-amber-400 px-1 text-[10px] font-semibold text-ink"
                title="Cena padrão: é onde o grupo está"
              >
                PADRÃO
              </span>
            )}
            <span className="truncate" title={scene.name}>
              {scene.name}
            </span>
          </p>
          <Avatars people={people} onlineIds={onlineIds} />
        </div>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            className="btn-ghost px-1.5 py-0 text-xs"
            aria-label={`Subir ${scene.name}`}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-ghost px-1.5 py-0 text-xs"
            aria-label={`Descer ${scene.name}`}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="space-y-2">
          <input
            className="field px-2 py-1 text-xs"
            aria-label="Nome da cena"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field px-2 py-1 text-xs"
            aria-label="Pasta"
            placeholder="Pasta (opcional)"
            maxLength={80}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />
          <p className="label">Trocar mapa</p>
          <MapPicker
            maps={maps}
            value={scene.map_asset_id}
            onChange={(id) => void sync?.changeMap(scene.id, id)}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => setEditing(false)}
            >
              Fechar
            </button>
            <button type="submit" className="btn-primary px-2 py-1 text-xs">
              Salvar
            </button>
          </div>
        </form>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-ink-muted">
            Apagar a cena, os objetos e os desenhos dela?
          </span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            onClick={() => void sync?.deleteScene(scene.id)}
          >
            Apagar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {!isDefault && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => void sync?.setDefaultScene(scene.id)}
            >
              Tornar padrão
            </button>
          )}
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={checkedPlayers.length === 0}
            onClick={() => void sync?.assignMembers(checkedPlayers, scene.id)}
          >
            Mover para esta cena
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => void sync?.duplicateScene(scene.id)}
          >
            Duplicar
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
            onClick={() => setConfirming(true)}
          >
            Apagar
          </button>
        </div>
      )}
    </li>
  );
}

export function ScenesPanel() {
  const scenes = useVttStore((s) => s.scenes);
  const members = useVttStore((s) => s.members);
  const online = useVttStore((s) => s.online);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const defaultSceneId = useVttStore((s) => s.table?.default_scene_id ?? null);
  const calibrating = useVttStore((s) => s.calibrating);
  const sync = useVttStore((s) => s.sync);
  const maps = useMapAssets();
  const [checked, setChecked] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onlineIds = useMemo(() => new Set(online.map((p) => p.userId)), [online]);
  const players = members.filter((m) => m.role === 'jogador' && !m.banned);
  const anyoneSeparated = players.some((p) => p.sceneId);

  const folders = useMemo(() => {
    const grouped = new Map<string, VttScene[]>();
    for (const scene of scenes) {
      grouped.set(scene.folder, [...(grouped.get(scene.folder) ?? []), scene]);
    }
    return Array.from(grouped.entries());
  }, [scenes]);

  function moveTo(id: string, targetIndex: number) {
    const from = scenes.findIndex((s) => s.id === id);
    if (from === -1 || targetIndex < 0 || targetIndex >= scenes.length) return;
    const next = scenes.slice();
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    void sync?.reorderScenes(next);
  }

  function dropOn(targetId: string) {
    if (draggingId && draggingId !== targetId) {
      moveTo(draggingId, scenes.findIndex((s) => s.id === targetId));
    }
    setDraggingId(null);
  }

  return (
    <div className="space-y-3">
      {players.length > 0 && (
        <section className="space-y-2 rounded-md border border-ink-border p-2">
          <h3 className="label">Separar grupo</h3>
          <ul className="space-y-1">
            {players.map((player) => (
              <li key={player.userId}>
                <label className="flex items-center gap-2 text-sm text-parchment">
                  <input
                    type="checkbox"
                    checked={checked.includes(player.userId)}
                    onChange={(e) =>
                      setChecked((current) =>
                        e.target.checked
                          ? [...current, player.userId]
                          : current.filter((id) => id !== player.userId)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{player.name}</span>
                  {player.sceneId && (
                    <span className="shrink-0 text-xs text-ink-muted">separado</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            Marque e use &quot;Mover para esta cena&quot; na cena desejada.
          </p>
          <button
            type="button"
            className="btn-ghost w-full px-2 py-1 text-xs"
            disabled={!anyoneSeparated}
            onClick={() => {
              setChecked([]);
              void sync?.assignMembers([], null);
            }}
          >
            Reagrupar todos na cena padrão
          </button>
        </section>
      )}

      {viewedSceneId && (
        <button
          type="button"
          className="btn-ghost w-full px-2 py-1 text-xs"
          aria-pressed={calibrating}
          onClick={() =>
            useVttStore.setState({
              calibrating: !calibrating,
              selectedId: null,
              tool: 'select',
            })
          }
        >
          {calibrating
            ? 'Arraste sobre um trecho conhecido do mapa…'
            : 'Calibrar régua desta cena'}
        </button>
      )}

      {folders.map(([folder, list]) => (
        <section key={folder} className="space-y-2">
          {folder && <h3 className="label">{folder}</h3>}
          <ul className="space-y-2">
            {list.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                maps={maps}
                isDefault={scene.id === defaultSceneId}
                isViewing={scene.id === viewedSceneId}
                people={membersInScene(scene.id, members, defaultSceneId)}
                onlineIds={onlineIds}
                checkedPlayers={checked}
                dragging={draggingId === scene.id}
                onDragStart={() => setDraggingId(scene.id)}
                onDropOn={() => dropOn(scene.id)}
                onMove={(delta) =>
                  moveTo(
                    scene.id,
                    scenes.findIndex((s) => s.id === scene.id) + delta
                  )
                }
              />
            ))}
          </ul>
        </section>
      ))}

      <CreateSceneForm maps={maps} />
    </div>
  );
}
