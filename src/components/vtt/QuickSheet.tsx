'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatModifier,
  getEffectiveMaxes,
  getTotalLevel,
} from '@/lib/calculations';
import { ALL_ELEMENTS, DEFAULT_SKILLS, ELEMENT_LABELS } from '@/lib/constants';
import { ElementSymbol } from '@/components/elements/ElementSymbol';
import {
  backpackToSave,
  mergeRemoteBackpack,
  mergeRemoteResources,
  normalizeBackpack,
  resourcesToSave,
  type BackpackValues,
  type ResourceKey,
  type ResourceValues,
} from '@/lib/resource-sync';
import type { ChatRoll } from '@/lib/vtt/chat-rules';
import {
  attributeBonus,
  clampResource,
  d20Notation,
  skillBonus,
  skillRollLabel,
  sortSkills,
} from '@/lib/vtt/quick-sheet';
import { useVttStore } from '@/lib/vtt/store';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
  DEFAULT_RESOURCE_MODS,
  type Attributes,
  type CharacterElementRow,
  type InventoryItem,
  type ResourceMods,
  type Skill,
} from '@/types/database';
import { QuickBackpack } from './QuickBackpack';

const SAVE_DEBOUNCE_MS = 400;

const RESOURCES: { key: ResourceKey; label: string; maxKey: 'hp' | 'mana' | 'sanity' }[] = [
  { key: 'hp_current', label: 'HP', maxKey: 'hp' },
  { key: 'mana_current', label: 'Mana', maxKey: 'mana' },
  { key: 'sanity_current', label: 'Sanidade', maxKey: 'sanity' },
];

const ROW_BUTTON =
  'flex min-h-11 items-center justify-center rounded-md border border-ink-border px-2 text-sm text-parchment hover:border-crimson/60 desk:min-h-8';

interface QuickCharacter extends ResourceValues {
  id: string;
  name: string;
  attributes: Attributes;
  skills: Skill[];
  resource_mods: ResourceMods;
  inventory: InventoryItem[] | null;
  money: number | string | null;
  character_elements: CharacterElementRow[];
}

const CHARACTER_COLUMNS =
  'id, name, attributes, skills, resource_mods, hp_current, mana_current, sanity_current, inventory, money, character_elements(element, level)';

/** Elementos da ficha na ordem padrão (os que ela tem, mesmo nível 0). */
function elementsOf(character: QuickCharacter): CharacterElementRow[] {
  const rows = character.character_elements ?? [];
  return ALL_ELEMENTS.flatMap((el) => rows.filter((r) => r.element === el));
}

function normalizeCharacter(row: QuickCharacter): QuickCharacter {
  return {
    ...row,
    attributes: { ...DEFAULT_ATTRIBUTES, ...(row.attributes || {}) },
    skills:
      row.skills && row.skills.length > 0
        ? row.skills
        : DEFAULT_SKILLS.map((skill) => ({ ...skill })),
    resource_mods: { ...DEFAULT_RESOURCE_MODS, ...(row.resource_mods || {}) },
    hp_current: row.hp_current ?? 0,
    mana_current: row.mana_current ?? 0,
    sanity_current: row.sanity_current ?? 0,
  };
}

function resourcesOf(row: ResourceValues): ResourceValues {
  return {
    hp_current: row.hp_current,
    mana_current: row.mana_current,
    sanity_current: row.sanity_current,
  };
}

function ResourceRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  // Rascunho: apagar o campo para digitar não pode virar 0 na hora.
  const [draft, setDraft] = useState<string | null>(null);
  const current = Math.min(value, max);

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs text-ink-muted">{label}</span>
      <button
        type="button"
        className={ROW_BUTTON + ' w-11 desk:w-8'}
        aria-label={`Diminuir ${label}`}
        onClick={() => onChange(clampResource(current - 1, max))}
      >
        −
      </button>
      <input
        className="field min-h-11 w-16 px-1 py-1 text-center text-sm desk:min-h-8"
        inputMode="numeric"
        aria-label={`${label} atual`}
        value={draft ?? current}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          const typed = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(typed)) {
            onChange(clampResource(typed, max));
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <button
        type="button"
        className={ROW_BUTTON + ' w-11 desk:w-8'}
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(clampResource(current + 1, max))}
      >
        +
      </button>
      <span className="text-xs text-ink-muted">/ {max}</span>
    </div>
  );
}

function SkillRow({
  skill,
  attributes,
  onRoll,
}: {
  skill: Skill;
  attributes: Attributes;
  onRoll: (label: string, bonus: number) => void;
}) {
  const [attribute, setAttribute] = useState(skill.attribute);
  const bonus = skillBonus(skill, attributes, attribute);

  return (
    <li className="flex items-center gap-1.5">
      <button
        type="button"
        className={ROW_BUTTON + ' min-w-0 flex-1 justify-between gap-2'}
        onClick={() => {
          onRoll(skillRollLabel(skill, attribute), bonus);
          // Vale só para esta rolagem: volta ao atributo da ficha.
          setAttribute(skill.attribute);
        }}
      >
        <span className="truncate">{skill.name}</span>
        <span className="shrink-0 text-crimson-soft">{formatModifier(bonus)}</span>
      </button>
      <select
        className="field min-h-11 w-16 shrink-0 px-1 py-1 text-xs desk:min-h-8"
        value={attribute}
        aria-label={`Atributo de ${skill.name} nesta rolagem`}
        onChange={(e) => setAttribute(e.target.value as keyof Attributes)}
      >
        {ATTRIBUTE_KEYS.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </li>
  );
}

/** Painel do trilho: só monta depois de aberto uma vez, e aí acompanha a ficha. */
export function QuickSheet() {
  const me = useVttStore((s) => s.me);
  const chat = useVttStore((s) => s.chat);
  const rollCharacter = useVttStore((s) => s.rollCharacter);
  const rollHidden = useVttStore((s) => s.rollHidden);

  const [characters, setCharacters] = useState<QuickCharacter[] | null>(null);
  const [resources, setResources] = useState<ResourceValues | null>(null);
  const [backpack, setBackpack] = useState<BackpackValues | null>(null);
  const [lastRoll, setLastRoll] = useState<ChatRoll | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGm = me?.role === 'mestre';
  const userId = me?.userId;
  const selectedId = rollCharacter?.id ?? null;

  const resourcesRef = useRef<ResourceValues | null>(null);
  const lastSavedRef = useRef<ResourceValues | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeIdRef = useRef<string | null>(null);
  const backpackRef = useRef<BackpackValues | null>(null);
  const lastSavedBackpackRef = useRef<BackpackValues | null>(null);
  resourcesRef.current = resources;
  backpackRef.current = backpack;

  useEffect(() => {
    let cancelled = false;
    let query = createClient()
      .from('characters')
      .select(CHARACTER_COLUMNS)
      .order('name');
    // RLS: a mestra lê todas; o jogador pediria só as dele de qualquer forma.
    if (!isGm && userId) query = query.eq('owner_id', userId);
    void query.then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError('Não foi possível carregar as fichas.');
        setCharacters([]);
        return;
      }
      const list = ((data ?? []) as unknown as QuickCharacter[]).map(
        normalizeCharacter
      );
      setCharacters(list);
      const state = useVttStore.getState();
      const kept = list.find((c) => c.id === state.rollCharacter?.id);
      const chosen = kept ?? list[0] ?? null;
      useVttStore.setState({
        rollCharacter: chosen ? { id: chosen.id, name: chosen.name } : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isGm, userId]);

  const flush = useCallback((id: string) => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const local = resourcesRef.current;
    const saved = lastSavedRef.current;
    const localBackpack = backpackRef.current;
    const savedBackpack = lastSavedBackpackRef.current;
    if (!local || !saved || !localBackpack || !savedBackpack) return;
    const changed = resourcesToSave(local, saved);
    const changedBackpack = backpackToSave(localBackpack, savedBackpack);
    if (Object.keys(changed).length + Object.keys(changedBackpack).length === 0) return;
    // Só estas colunas: o resto da ficha pode estar aberto em outra aba.
    void createClient()
      .from('characters')
      .update({ ...changed, ...changedBackpack })
      .eq('id', id)
      .then(({ error: err }) => {
        if (err) {
          useVttStore.getState().showToast('Não foi possível salvar a ficha.');
          return;
        }
        // Resposta de uma ficha que já saiu da tela não vale para a atual.
        if (activeIdRef.current === id && lastSavedRef.current && lastSavedBackpackRef.current) {
          lastSavedRef.current = { ...lastSavedRef.current, ...changed };
          lastSavedBackpackRef.current = { ...lastSavedBackpackRef.current, ...changedBackpack };
        }
      });
  }, []);

  const loaded = Boolean(characters);

  useEffect(() => {
    if (!selectedId || !loaded) return;
    const row = characters?.find((c) => c.id === selectedId);
    if (!row) return;
    const initial = resourcesOf(row);
    setResources(initial);
    resourcesRef.current = initial;
    lastSavedRef.current = initial;
    const initialBackpack = normalizeBackpack(row);
    setBackpack(initialBackpack);
    backpackRef.current = initialBackpack;
    lastSavedBackpackRef.current = initialBackpack;
    activeIdRef.current = selectedId;

    const applyRemote = (remote: ResourceValues, remotePack: BackpackValues) => {
      const local = resourcesRef.current;
      const saved = lastSavedRef.current;
      const localPack = backpackRef.current;
      const savedPack = lastSavedBackpackRef.current;
      if (!local || !saved || !localPack || !savedPack) return;
      if (activeIdRef.current !== selectedId) return;
      const merged = mergeRemoteResources(local, saved, remote);
      lastSavedRef.current = merged.lastSaved;
      if (merged.changed) {
        resourcesRef.current = merged.local;
        setResources(merged.local);
      }
      const mergedPack = mergeRemoteBackpack(localPack, savedPack, remotePack);
      lastSavedBackpackRef.current = mergedPack.lastSaved;
      if (mergedPack.changed) {
        backpackRef.current = mergedPack.local;
        setBackpack(mergedPack.local);
      }
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`character:${selectedId}:${crypto.randomUUID()}`)
      .on<QuickCharacter>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${selectedId}`,
        },
        ({ new: next }) => {
          applyRemote(resourcesOf(next), normalizeBackpack(next));
          // A ficha pode ter mudado atributos e perícias em outra aba.
          setCharacters((list) =>
            (list ?? []).map((c) =>
              c.id === selectedId
                ? normalizeCharacter({
                    ...c,
                    name: next.name,
                    attributes: next.attributes,
                    skills: next.skills,
                    resource_mods: next.resource_mods,
                  })
                : c
            )
          );
        }
      )
      .subscribe((status) => {
        // A lista pode estar velha: esta ficha mudou enquanto outra estava aberta.
        if (status !== 'SUBSCRIBED') return;
        void supabase
          .from('characters')
          .select('hp_current, mana_current, sanity_current, inventory, money')
          .eq('id', selectedId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              const fresh = data as ResourceValues &
                Pick<QuickCharacter, 'inventory' | 'money'>;
              applyRemote(resourcesOf(fresh), normalizeBackpack(fresh));
            }
          });
      });

    return () => {
      flush(selectedId);
      void supabase.removeChannel(channel);
    };
    // A lista muda a cada evento; só a troca de ficha reinicia isto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loaded, flush]);

  const character = useMemo(
    () => characters?.find((c) => c.id === selectedId) ?? null,
    [characters, selectedId]
  );

  const maxes = useMemo(
    () =>
      character &&
      getEffectiveMaxes(
        getTotalLevel(character.character_elements ?? []),
        character.attributes,
        character.resource_mods
      ),
    [character]
  );

  const skills = useMemo(
    () => (character ? sortSkills(character.skills) : []),
    [character]
  );

  function changeResource(key: ResourceKey, value: number) {
    if (!resourcesRef.current || !selectedId) return;
    const next = { ...resourcesRef.current, [key]: value };
    resourcesRef.current = next;
    setResources(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(selectedId), SAVE_DEBOUNCE_MS);
  }

  function changeBackpack(patch: Partial<BackpackValues>) {
    if (!backpackRef.current || !selectedId) return;
    const next = { ...backpackRef.current, ...patch };
    backpackRef.current = next;
    setBackpack(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(selectedId), SAVE_DEBOUNCE_MS);
  }

  async function roll(label: string, bonus: number) {
    const result = await chat?.roll({
      notation: d20Notation(bonus),
      label,
      hidden: rollHidden,
    });
    if (result) setLastRoll(result);
    else useVttStore.getState().showToast('Não foi possível rolar. Tente de novo.');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0">
        <select
          className="field min-h-11 min-w-0 px-2 py-1 text-sm desk:min-h-8"
          aria-label="Personagem"
          value={selectedId ?? ''}
          disabled={!characters?.length}
          onChange={(e) => {
            const next = characters?.find((c) => c.id === e.target.value);
            if (next) {
              useVttStore.setState({
                rollCharacter: { id: next.id, name: next.name },
              });
              setLastRoll(null);
            }
          }}
        >
          {characters?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {error && <p className="text-xs text-crimson-soft">{error}</p>}
        {characters && characters.length === 0 && !error && (
          <p className="text-sm text-ink-muted">
            Nenhuma ficha ainda. Crie a sua em Fichas, no menu do site.
          </p>
        )}

        {character && resources && backpack && maxes && (
          <>
            {elementsOf(character).length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Elementos">
                {elementsOf(character).map((e) => (
                  <li
                    key={e.element}
                    className="flex items-center gap-1 text-xs text-ink-muted"
                    title={ELEMENT_LABELS[e.element] + ' ' + e.level}
                  >
                    <ElementSymbol element={e.element} size={18} />
                    <span className="text-parchment">{e.level}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1.5">
              {RESOURCES.map(({ key, label, maxKey }) => (
                <ResourceRow
                  key={key}
                  label={label}
                  value={resources[key]}
                  max={maxes[maxKey]}
                  onChange={(value) => changeResource(key, value)}
                />
              ))}
            </div>

            <label className="flex min-h-11 items-center gap-2 text-sm text-parchment desk:min-h-8">
              <input
                type="checkbox"
                className="h-4 w-4 accent-crimson"
                checked={rollHidden}
                onChange={(e) =>
                  useVttStore.setState({ rollHidden: e.target.checked })
                }
              />
              Rolar escondido (só a mestra vê)
            </label>

            {lastRoll && (
              <p className="rounded-md border border-ink-border px-2 py-1 text-xs text-ink-muted">
                {lastRoll.label}: {lastRoll.math} ={' '}
                <strong className="text-base text-crimson-soft">
                  {lastRoll.total}
                </strong>
              </p>
            )}

            <details className="rounded-md border border-ink-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm text-parchment desk:min-h-8">
                Atributos
              </summary>
              <ul className="grid grid-cols-2 gap-1.5 p-2">
                {ATTRIBUTE_KEYS.map((key) => {
                  const bonus = attributeBonus(character.attributes, key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        title={ATTRIBUTE_LABELS[key]}
                        className={ROW_BUTTON + ' w-full justify-between gap-2'}
                        onClick={() => void roll(ATTRIBUTE_LABELS[key], bonus)}
                      >
                        {key}
                        <span className="text-crimson-soft">
                          {formatModifier(bonus)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>

            <details className="rounded-md border border-ink-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm text-parchment desk:min-h-8">
                Perícias
              </summary>
              <ul className="space-y-1.5 p-2">
                {skills.map((skill) => (
                  <SkillRow
                    key={skill.name}
                    skill={skill}
                    attributes={character.attributes}
                    onRoll={(label, bonus) => void roll(label, bonus)}
                  />
                ))}
              </ul>
            </details>

            <QuickBackpack
              backpack={backpack}
              attributes={character.attributes}
              onChange={changeBackpack}
            />
          </>
        )}
      </div>
    </div>
  );
}
