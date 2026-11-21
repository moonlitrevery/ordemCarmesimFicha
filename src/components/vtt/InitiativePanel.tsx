'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dices,
  Plus,
  Trash2,
} from 'lucide-react';
import { parseDiceExpression } from '@/lib/dice';
import {
  clearInitiative,
  moveEntry,
  nextTurn,
  previousTurn,
  removeEntry,
  SECRET_ENTRY_NAME,
  sortEntries,
  updateEntry,
} from '@/lib/vtt/initiative';
import { useVttStore } from '@/lib/vtt/store';
import type { InitiativeEntry } from '@/lib/vtt/types';
import { IconButton } from './hud';

function turnTag(entry: InitiativeEntry) {
  return entry.turns > 1 ? `${entry.turn}/${entry.turns}` : null;
}

function ReadOnlyRow({ entry, active }: { entry: InitiativeEntry; active: boolean }) {
  return (
    <li
      aria-current={active ? 'true' : undefined}
      className={
        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ' +
        (active ? 'border-amber-400 text-parchment' : 'border-ink-border text-ink-muted')
      }
    >
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {turnTag(entry) && <span className="shrink-0 text-xs">{turnTag(entry)}</span>}
      <span className="w-8 shrink-0 text-right tabular-nums">{entry.value ?? '–'}</span>
    </li>
  );
}

/** Quem é o "???" da lista: só a mestra tem como saber, e só neste navegador. */
function useSecretHint(entry: InitiativeEntry): string | null {
  return useVttStore((s) => {
    if (entry.name !== SECRET_ENTRY_NAME || !entry.objectId) return null;
    const object = s.objects[entry.objectId];
    if (!object) return null;
    return (
      object.caption?.text ||
      (object.npc_id ? s.npcs[object.npc_id]?.name : undefined) ||
      s.sceneAssets[object.asset_id]?.name ||
      null
    );
  });
}

function EditableRow({
  entry,
  index,
  active,
  dragging,
  hiddenRolls,
  onDragStart,
  onDropOn,
}: {
  entry: InitiativeEntry;
  index: number;
  active: boolean;
  dragging: boolean;
  hiddenRolls: boolean;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const sync = useVttStore((s) => s.initiativeSync);
  const hint = useSecretHint(entry);
  return (
    <li
      draggable
      aria-current={active ? 'true' : undefined}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      className={
        'space-y-1 rounded-md border p-1.5 ' +
        (active ? 'border-amber-400 ' : 'border-ink-border ') +
        (dragging ? 'opacity-50' : '')
      }
    >
      <div className="flex items-center gap-1">
        <input
          className="field min-w-0 flex-1 px-2 py-1 text-sm"
          aria-label="Nome"
          maxLength={120}
          value={entry.name}
          onChange={(e) =>
            sync?.apply((state) => updateEntry(state, entry.id, { name: e.target.value }))
          }
        />
        {turnTag(entry) && (
          <span className="shrink-0 text-xs text-ink-muted" title="Turno nesta rodada">
            {turnTag(entry)}
          </span>
        )}
        <input
          type="number"
          className="field w-16 shrink-0 px-2 py-1 text-right text-sm"
          aria-label={`Iniciativa de ${entry.name}`}
          value={entry.value ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? null : Number(e.target.value);
            sync?.apply((state) => updateEntry(state, entry.id, { value }));
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-xs text-ink-muted">{hint}</span>
        <div className="flex shrink-0">
          <IconButton
            icon={Dices}
            label={`Rolar iniciativa de ${entry.name}`}
            tooltip="native"
            onClick={() => void sync?.rollEntry(entry.id, hiddenRolls)}
          />
          <IconButton
            icon={ChevronUp}
            label="Subir (desempate)"
            tooltip="native"
            onClick={() => sync?.apply((state) => moveEntry(state, entry.id, index - 1))}
          />
          <IconButton
            icon={ChevronDown}
            label="Descer (desempate)"
            tooltip="native"
            onClick={() => sync?.apply((state) => moveEntry(state, entry.id, index + 1))}
          />
          <IconButton
            icon={Trash2}
            label={`Tirar ${entry.name}`}
            tooltip="native"
            danger
            onClick={() => sync?.apply((state) => removeEntry(state, entry.id))}
          />
        </div>
      </div>
    </li>
  );
}

/** Tokens da cena aberta. Não há seleção múltipla no canvas: daqui entra vários de uma vez. */
function AddFromScene({ onClose }: { onClose: () => void }) {
  const objects = useVttStore((s) => s.objects);
  const sceneAssets = useVttStore((s) => s.sceneAssets);
  const npcs = useVttStore((s) => s.npcs);
  const known = useVttStore((s) => s.initiative.entries);
  const sync = useVttStore((s) => s.initiativeSync);
  const [checked, setChecked] = useState<string[]>([]);

  const inList = new Set(known.map((entry) => entry.objectId));
  const tokens = Object.values(objects).filter(
    (object) => object.kind === 'token' && !inList.has(object.id)
  );

  if (tokens.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Nenhum token de fora da lista nesta cena. Coloque um pela Biblioteca.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-ink-border p-2">
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {tokens.map((object) => (
          <li key={object.id}>
            <label className="flex min-h-11 items-center gap-2 text-sm text-parchment desk:min-h-0">
              <input
                type="checkbox"
                className="h-4 w-4 accent-crimson"
                checked={checked.includes(object.id)}
                onChange={(e) =>
                  setChecked((current) =>
                    e.target.checked
                      ? [...current, object.id]
                      : current.filter((id) => id !== object.id)
                  )
                }
              />
              <span className="truncate">
                {object.caption?.text ||
                  (object.npc_id ? npcs[object.npc_id]?.name : undefined) ||
                  sceneAssets[object.asset_id]?.name ||
                  'Token'}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-primary w-full px-2 py-1 text-sm"
        disabled={checked.length === 0}
        onClick={() => {
          void sync?.addObjects(checked);
          onClose();
        }}
      >
        Adicionar marcados
      </button>
    </div>
  );
}

function GmControls({ hiddenRolls, setHiddenRolls }: {
  hiddenRolls: boolean;
  setHiddenRolls: (hidden: boolean) => void;
}) {
  const sync = useVttStore((s) => s.initiativeSync);
  const selectedIds = useVttStore((s) => s.selectedIds);
  const notation = useVttStore((s) => s.initiative.notation);
  const [picking, setPicking] = useState(false);
  const [manual, setManual] = useState('');
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? notation;
  const valid = parseDiceExpression(shown) !== null;

  function addManual() {
    if (!manual.trim()) return;
    sync?.addManual(manual);
    setManual('');
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    addManual();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost min-h-11 flex-1 px-2 py-1 text-xs desk:min-h-0"
          disabled={selectedIds.length === 0}
          title={selectedIds.length > 0 ? undefined : 'Selecione um ou mais tokens no mapa'}
          onClick={() => {
            // Iniciativa é só de token: adereço e addon da seleção ficam de fora.
            const { objects } = useVttStore.getState();
            void sync?.addObjects(selectedIds.filter((id) => objects[id]?.kind === 'token'));
          }}
        >
          {selectedIds.length > 1 ? `${selectedIds.length} selecionados` : 'Token selecionado'}
        </button>
        <button
          type="button"
          className="btn-ghost min-h-11 flex-1 px-2 py-1 text-xs desk:min-h-0"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          Da cena…
        </button>
      </div>
      {picking && <AddFromScene onClose={() => setPicking(false)} />}
      <form onSubmit={submitManual} className="flex gap-1">
        <input
          className="field min-w-0 flex-1 px-2 py-1 text-sm"
          placeholder="Adicionar pelo nome"
          aria-label="Adicionar pelo nome"
          maxLength={120}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <IconButton icon={Plus} label="Adicionar" tooltip="native" onClick={addManual} />
      </form>
      <div className="flex items-center gap-2">
        <label className="label shrink-0" htmlFor="initiative-notation">
          Rolagem
        </label>
        <input
          id="initiative-notation"
          className="field min-w-0 flex-1 px-2 py-1 text-sm"
          aria-invalid={!valid}
          maxLength={60}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && parseDiceExpression(draft)) {
              const next = draft.trim();
              sync?.apply((state) =>
                state.notation === next ? state : { ...state, notation: next }
              );
            }
            setDraft(null);
          }}
        />
      </div>
      {!valid && <p className="text-xs text-crimson-soft">Notação inválida. Exemplo: 1d20+2.</p>}
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          className="h-4 w-4 accent-crimson"
          checked={hiddenRolls}
          onChange={(e) => setHiddenRolls(e.target.checked)}
        />
        Rolar escondido
      </label>
    </div>
  );
}

export function InitiativePanel() {
  const initiative = useVttStore((s) => s.initiative);
  const sync = useVttStore((s) => s.initiativeSync);
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hiddenRolls, setHiddenRolls] = useState(false);
  const { entries, current, round } = initiative;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg text-parchment">Rodada {round}</p>
        {isGm && (
          <div className="flex items-center gap-1">
            <IconButton
              icon={ChevronLeft}
              label="Anterior"
              tooltip="native"
              disabled={entries.length === 0}
              onClick={() => sync?.apply(previousTurn)}
            />
            <button
              type="button"
              className="btn-primary min-h-11 px-3 py-1 text-sm desk:min-h-0"
              disabled={entries.length === 0}
              onClick={() => sync?.apply(nextTurn)}
            >
              <span className="inline-flex items-center gap-1">
                Próximo
                <ChevronRight size={14} aria-hidden />
              </span>
            </button>
          </div>
        )}
      </div>

      {isGm && <GmControls hiddenRolls={hiddenRolls} setHiddenRolls={setHiddenRolls} />}

      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {isGm
            ? 'Ninguém na lista. Adicione um token do mapa ou um nome acima.'
            : 'A mestra ainda não montou a iniciativa.'}
        </p>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry, index) =>
            isGm ? (
              <EditableRow
                key={entry.id}
                entry={entry}
                index={index}
                active={index === current}
                dragging={draggingId === entry.id}
                hiddenRolls={hiddenRolls}
                onDragStart={() => setDraggingId(entry.id)}
                onDropOn={() => {
                  if (draggingId) {
                    sync?.apply((state) => moveEntry(state, draggingId, index));
                  }
                  setDraggingId(null);
                }}
              />
            ) : (
              <ReadOnlyRow key={entry.id} entry={entry} active={index === current} />
            )
          )}
        </ol>
      )}

      {isGm && entries.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost min-h-11 flex-1 px-2 py-1 text-xs desk:min-h-0"
            onClick={() => sync?.apply(sortEntries)}
          >
            <span className="inline-flex items-center gap-1">
              <ArrowDownWideNarrow size={14} aria-hidden />
              Ordenar
            </span>
          </button>
          <button
            type="button"
            className="btn-ghost min-h-11 flex-1 px-2 py-1 text-xs desk:min-h-0"
            onClick={() => {
              if (window.confirm('Limpar a lista e voltar à rodada 1?')) {
                sync?.apply(clearInitiative);
              }
            }}
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
