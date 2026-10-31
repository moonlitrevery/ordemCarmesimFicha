'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  computeDerivedMaxes,
  getAttributeModifier,
  getEffectiveMaxes,
  getAttributePointsAvailable,
  getCarryLimit,
  getInventoryWeight,
  getSkillUpgradesAvailable,
  getUpgradeKeyForNext,
  getTotalLevel,
  normalizeSkillUpgradeSpent,
} from '@/lib/calculations';
import {
  DEFAULT_SKILLS,
  ORDER_RANKS,
  VALID_IMAGE_URL,
} from '@/lib/constants';
import {
  mergeRemoteResources,
  resourcesToSave,
  type ResourceValues,
} from '@/lib/resource-sync';
import { FloatingDiceButton } from '@/components/dice/FloatingDiceButton';
import { QuickRollButton } from '@/components/dice/DiceRoller';
import { CursesSection } from '@/components/character/CursesSection';
import { HistoricalFeatsSection } from '@/components/character/HistoricalFeatsSection';
import { InventorySection } from '@/components/character/InventorySection';
import {
  BackstorySection,
  NotesSection,
} from '@/components/character/NotesAndBackstorySection';
import { SpellsSection } from '@/components/character/SpellsSection';
import { WeaponsSection } from '@/components/character/WeaponsSection';
import { ArmorSection } from '@/components/character/ArmorSection';
import { useDiceToast } from '@/components/dice/DiceToast';
import { ElementsSection } from '@/components/character/ElementsSection';
import { LevelProgression } from '@/components/character/LevelProgression';
import { MosaicFrame } from '@/components/mosaic/MosaicFrame';
import { CharacterImage } from '@/components/ui/CharacterImage';
import { SaveIndicator, type SaveStatus } from '@/components/ui/SaveIndicator';
import { SkillsList } from '@/components/character/SkillsList';
import { SectionCard } from '@/components/ui/SectionCard';
import { SheetTabs } from '@/components/ui/SheetTabs';
import type {
  ArmorPiece,
  Attributes,
  Character,
  CharacterElementRow,
  Curse,
  HistoricalFeat,
  InventoryItem,
  MilestoneNotes,
  Skill,
  Spell,
  Weapon,
} from '@/types/database';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
  DEFAULT_RESOURCE_MODS,
  type ResourceMods,
  type SkillUpgradeSpent,
} from '@/types/database';

type SheetState = {
  name: string;
  occupation: string;
  age: string;
  pronouns: string;
  birthplace: string;
  residence: string;
  image_url: string;
  arcana: string;
  subarcana: string;
  attributes: Attributes;
  hp_current: number;
  mana_current: number;
  sanity_current: number;
  skills: Skill[];
  spells: Spell[];
  weapons: Weapon[];
  inventory: InventoryItem[];
  money: number;
  armor: ArmorPiece[];
  curses: Curse[];
  historical_feats: HistoricalFeat[];
  milestone_notes: MilestoneNotes;
  notes: string;
  backstory: string;
  is_order_agent: boolean;
  order_rank: string;
  resource_mods: ResourceMods;
  attribute_points_spent: number;
  skill_points_spent: SkillUpgradeSpent;
};

/** HP acima do máximo não é salvo: conta como o máximo, igual à tela. */
function localResources(
  sheet: SheetState,
  elements: CharacterElementRow[]
): ResourceValues {
  const maxes = getEffectiveMaxes(
    getTotalLevel(elements),
    sheet.attributes,
    sheet.resource_mods || DEFAULT_RESOURCE_MODS
  );
  return {
    hp_current: Math.min(sheet.hp_current, maxes.hp),
    mana_current: sheet.mana_current,
    sanity_current: sheet.sanity_current,
  };
}

function toState(c: Character): SheetState {
  return {
    name: c.name ?? '',
    occupation: c.occupation ?? '',
    age: c.age != null ? String(c.age) : '',
    pronouns: c.pronouns ?? '',
    birthplace: c.birthplace ?? '',
    residence: c.residence ?? '',
    image_url: c.image_url ?? '',
    arcana: c.arcana ?? '',
    subarcana: c.subarcana ?? '',
    attributes: { ...DEFAULT_ATTRIBUTES, ...(c.attributes || {}) },
    hp_current: c.hp_current ?? 0,
    mana_current: c.mana_current ?? 0,
    sanity_current: c.sanity_current ?? 0,
    skills: c.skills && c.skills.length > 0 ? c.skills : DEFAULT_SKILLS.map((sk) => ({ ...sk })),
    spells: c.spells ?? [],
    weapons: c.weapons ?? [],
    inventory: c.inventory ?? [],
    money: Number(c.money ?? 0) || 0,
    armor: c.armor ?? [],
    curses: c.curses ?? [],
    historical_feats: c.historical_feats ?? [],
    milestone_notes: c.milestone_notes ?? {},
    notes: c.notes ?? '',
    backstory: c.backstory ?? '',
    is_order_agent: c.is_order_agent ?? true,
    order_rank: c.order_rank ?? 'Agente Principiante',
    resource_mods: { ...DEFAULT_RESOURCE_MODS, ...(c.resource_mods || {}) },
    attribute_points_spent: c.attribute_points_spent ?? 0,
    skill_points_spent: normalizeSkillUpgradeSpent(c.skill_points_spent),
  };
}

export function CharacterSheet({
  character,
  initialElements,
}: {
  character: Character;
  initialElements: CharacterElementRow[];
}) {
  const [sheet, setSheet] = useState(() => toState(character));
  const [elements, setElements] = useState<CharacterElementRow[]>(initialElements);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [ready, setReady] = useState(false);
  const { setRollContext } = useDiceToast();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    setRollContext({
      characterId: character.id,
      characterName: sheet.name || 'Personagem',
    });
    return () => setRollContext(null);
  }, [character.id, sheet.name, setRollContext]);

  const totalLevel = getTotalLevel(elements);
  const effectiveMaxes = useMemo(
    () => getEffectiveMaxes(totalLevel, sheet.attributes, sheet.resource_mods),
    [totalLevel, sheet.attributes, sheet.resource_mods]
  );

  // Último valor de cada recurso que o banco confirmou. O save só manda o que
  // mudou aqui desde então: a Ficha Rápida pode ter mudado o resto em outra aba.
  const lastSavedResourcesRef = useRef<ResourceValues>({
    hp_current: character.hp_current ?? 0,
    mana_current: character.mana_current ?? 0,
    sanity_current: character.sanity_current ?? 0,
  });

  const persistCharacter = useCallback(
    async (next: SheetState, nextElements: CharacterElementRow[]) => {
      const supabase = createClient();
      const baseMaxes = computeDerivedMaxes(
        getTotalLevel(nextElements),
        next.attributes
      );
      const mods = next.resource_mods || DEFAULT_RESOURCE_MODS;
      const maxes = {
        hpMax: Math.max(1, baseMaxes.hpMax + (mods.hp || 0)),
        manaMax: Math.max(1, baseMaxes.manaMax + (mods.mana || 0)),
        sanityMax: Math.max(1, baseMaxes.sanityMax + (mods.sanity || 0)),
      };
      const changedResources = resourcesToSave(
        localResources(next, nextElements),
        lastSavedResourcesRef.current
      );
      const payload = {
        name: next.name || 'Sem nome',
        occupation: next.occupation || null,
        age: next.age ? Number(next.age) : null,
        pronouns: next.pronouns || null,
        birthplace: next.birthplace || null,
        residence: next.residence || null,
        image_url:
          next.image_url && VALID_IMAGE_URL.test(next.image_url.split('#')[0])
            ? next.image_url
            : next.image_url || null,
        arcana: next.arcana || null,
        subarcana: next.subarcana || null,
        attributes: next.attributes,
        // hp_max não é persistido: sempre derivado de CON + nível (getMaxHp).
        ...changedResources,
        mana_max: maxes.manaMax,
        sanity_max: maxes.sanityMax,
        skills: next.skills,
        spells: next.spells,
        weapons: next.weapons,
        inventory: next.inventory,
        money: next.money,
        armor: next.armor,
        curses: next.curses,
        historical_feats: next.historical_feats,
        milestone_notes: next.milestone_notes,
        resource_mods: next.resource_mods,
        notes: next.notes || null,
        backstory: next.backstory || null,
        is_order_agent: next.is_order_agent,
        order_rank: next.order_rank || null,
        attribute_points_spent: next.attribute_points_spent ?? 0,
        skill_points_spent: normalizeSkillUpgradeSpent(next.skill_points_spent),
      };

      const { error } = await supabase
        .from('characters')
        .update(payload)
        .eq('id', character.id);
      if (error) throw error;
      lastSavedResourcesRef.current = {
        ...lastSavedResourcesRef.current,
        ...changedResources,
      };

      // sync elements: upsert all, delete removed
      for (const el of nextElements) {
        const { error: elErr } = await supabase.from('character_elements').upsert(
          {
            character_id: character.id,
            element: el.element,
            level: el.level,
            fragments_current: el.fragments_current,
            ...(el.id ? { id: el.id } : {}),
          },
          { onConflict: 'character_id,element' }
        );
        if (elErr) throw elErr;
      }

      const keep = new Set(nextElements.map((e) => e.element));
      const toRemove = initialElements
        .concat(nextElements)
        .filter((e) => e.id && !keep.has(e.element));
      // refetch ids after upsert — delete orphans by element not in keep
      const { data: existing } = await supabase
        .from('character_elements')
        .select('id, element')
        .eq('character_id', character.id);
      if (existing) {
        const orphanIds = existing
          .filter((e) => !keep.has(e.element as CharacterElementRow['element']))
          .map((e) => e.id);
        if (orphanIds.length) {
          await supabase.from('character_elements').delete().in('id', orphanIds);
        }
      }
      void toRemove;
    },
    [character.id, initialElements]
  );

  const sheetRef = useRef(sheet);
  const elementsRef = useRef(elements);
  sheetRef.current = sheet;
  elementsRef.current = elements;

  // Recurso vindo de outra aba já está no banco: mesclar não pede save. Mas se já
  // havia um save agendado, ele continua valendo (a limpeza do efeito o cancelou).
  const remoteMergeRef = useRef(false);
  const savePendingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`character:${character.id}:${crypto.randomUUID()}`)
      .on<ResourceValues>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${character.id}`,
        },
        ({ new: row }) => {
          const merged = mergeRemoteResources(
            localResources(sheetRef.current, elementsRef.current),
            lastSavedResourcesRef.current,
            {
              hp_current: row.hp_current,
              mana_current: row.mana_current,
              sanity_current: row.sanity_current,
            }
          );
          lastSavedResourcesRef.current = merged.lastSaved;
          if (!merged.changed) return;
          remoteMergeRef.current = true;
          setSheet((s) => ({ ...s, ...merged.local }));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [character.id]);

  useEffect(() => {
    if (!ready) return;
    const remoteOnly = remoteMergeRef.current && !savePendingRef.current;
    remoteMergeRef.current = false;
    if (remoteOnly) return;
    savePendingRef.current = true;
    setStatus('saving');
    const t = setTimeout(async () => {
      savePendingRef.current = false;
      const snapSheet = sheetRef.current;
      const snapElements = elementsRef.current;
      try {
        await persistCharacter(snapSheet, snapElements);
        const supabase = createClient();
        const { data } = await supabase
          .from('character_elements')
          .select('id, element')
          .eq('character_id', character.id);
        if (data) {
          // Só mescla IDs — não sobrescreve níveis/fragmentos locais (evita rollback)
          setElements((prev) =>
            prev.map((row) => {
              const found = data.find((d) => d.element === row.element);
              return found ? { ...row, id: found.id } : row;
            })
          );
        }
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sheet, elements, ready, persistCharacter, character.id]);

  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(() => setStatus('idle'), 1600);
    return () => clearTimeout(t);
  }, [status]);

  function patch(partial: Partial<SheetState>) {
    setSheet((s) => ({ ...s, ...partial }));
  }

  const weight = getInventoryWeight(sheet.inventory);
  const limit = getCarryLimit(sheet.attributes);
  const attrPointsAvailable = getAttributePointsAvailable(
    totalLevel,
    sheet.attribute_points_spent
  );
  const skillUpgradesAvailable = getSkillUpgradesAvailable(
    totalLevel,
    sheet.attributes.INT,
    sheet.skills
  );
  const imageValid =
    !sheet.image_url || VALID_IMAGE_URL.test(sheet.image_url.split('#')[0]);

  return (
    <div className="relative space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl text-parchment md:text-4xl">
          {sheet.name || 'Sem nome'}
        </h1>
        <SaveIndicator status={status} />
      </div>

      {/* Cabeçalho */}
      <SectionCard title="Cabeçalho">
        <div className="grid gap-4 md:grid-cols-[140px_1fr]">
          <CharacterImage
            url={sheet.image_url}
            name={sheet.name}
            className="h-36 w-full rounded-md border border-ink-border md:h-40"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="label">URL da imagem</span>
              <input
                className="field"
                value={sheet.image_url}
                onChange={(e) => patch({ image_url: e.target.value })}
                placeholder="https://…/retrato.png"
              />
              {!imageValid && (
                <span className="text-xs text-crimson-soft">
                  URL deve terminar em .png, .jpg, .jpeg, .gif, .webp ou .avif
                </span>
              )}
            </label>
            <label className="space-y-1">
              <span className="label">Nome</span>
              <input
                className="field"
                value={sheet.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Ocupação</span>
              <input
                className="field"
                value={sheet.occupation}
                onChange={(e) => patch({ occupation: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Idade</span>
              <input
                className="field"
                type="number"
                value={sheet.age}
                onChange={(e) => patch({ age: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Pronomes</span>
              <input
                className="field"
                value={sheet.pronouns}
                onChange={(e) => patch({ pronouns: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Naturalidade</span>
              <input
                className="field"
                placeholder="Cidade, País"
                value={sheet.birthplace}
                onChange={(e) => patch({ birthplace: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Residência</span>
              <input
                className="field"
                value={sheet.residence}
                onChange={(e) => patch({ residence: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Patente na Ordem</span>
              <select
                className="field"
                value={sheet.order_rank}
                onChange={(e) => patch({ order_rank: e.target.value })}
                disabled={!sheet.is_order_agent}
              >
                {ORDER_RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={sheet.is_order_agent}
                onChange={(e) => patch({ is_order_agent: e.target.checked })}
                className="h-4 w-4 accent-crimson"
              />
              <span className="text-sm text-parchment">Agente da Ordem Carmesim</span>
            </label>
          </div>
        </div>
      </SectionCard>

      <LevelProgression
        elements={elements}
        isOrderAgent={sheet.is_order_agent}
        arcana={sheet.arcana}
        subarcana={sheet.subarcana}
        milestoneNotes={sheet.milestone_notes}
        onArcanaChange={(arcana) => patch({ arcana })}
        onSubarcanaChange={(subarcana) => patch({ subarcana })}
        onMilestoneNoteChange={(level, note) =>
          patch({
            milestone_notes: { ...sheet.milestone_notes, [String(level)]: note },
          })
        }
      />

      {/* Atributos */}
      <SectionCard
        title="Atributos"
        badge={
          attrPointsAvailable > 0 ? (
            <span className="animate-pulse rounded-md border border-crimson/50 bg-crimson/20 px-2 py-0.5 text-xs font-medium text-crimson-soft">
              {attrPointsAvailable === 1
                ? '1 ponto de atributo disponível'
                : attrPointsAvailable + ' pontos de atributo disponíveis'}
            </span>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {ATTRIBUTE_KEYS.map((key) => {
            const value = sheet.attributes[key];
            const mod = getAttributeModifier(value);
            return (
              <div key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-3 text-center">
                <span className="label block">{ATTRIBUTE_LABELS[key]}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{key}</span>
                <input
                  type="number"
                  className="field mt-2 text-center font-display text-2xl"
                  value={value}
                  onChange={(e) =>
                    patch({
                      attributes: {
                        ...sheet.attributes,
                        [key]: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="text-base text-crimson-soft">
                    {mod >= 0 ? '+' + mod : mod}
                  </span>
                  <QuickRollButton bonus={mod} label={ATTRIBUTE_LABELS[key]} />
                  {attrPointsAvailable > 0 && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs text-crimson-soft"
                      onClick={() =>
                        patch({
                          attributes: {
                            ...sheet.attributes,
                            [key]: value + 1,
                          },
                          attribute_points_spent: sheet.attribute_points_spent + 1,
                        })
                      }
                      title="Gastar 1 ponto de atributo"
                    >
                      +1
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

                  {/* Recursos */}
      <SectionCard title="Recursos">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['HP', 'hp_current', 'hp', effectiveMaxes.hp, '#8B1E2D'],
              ['Mana', 'mana_current', 'mana', effectiveMaxes.mana, '#3B6EA5'],
              ['Sanidade', 'sanity_current', 'sanity', effectiveMaxes.sanity, '#7A6B9A'],
            ] as const
          ).map(([label, currentKey, modKey, max, color]) => {
            const current = Math.min(sheet[currentKey], max);
            const modVal = sheet.resource_mods[modKey] || 0;
            return (
              <ResourceBlock
                key={currentKey}
                label={label}
                current={current}
                max={max}
                color={color}
                mod={modVal}
                onModChange={(v) =>
                  patch({
                    resource_mods: { ...sheet.resource_mods, [modKey]: v },
                  })
                }
                onApply={(delta) => {
                  const next = Math.max(0, Math.min(max, current + delta));
                  patch({ [currentKey]: next } as Partial<SheetState>);
                }}
              />
            );
          })}
        </div>
      </SectionCard>

      <SkillsList
        skills={sheet.skills}
        attributes={sheet.attributes}
        skillUpgradesAvailable={skillUpgradesAvailable}
        onChange={(skills) => patch({ skills })}
        onSpendSkillPoint={(i) => {
          const skill = sheet.skills[i];
          const upgradeKey = getUpgradeKeyForNext(skill.specialization);
          if (!upgradeKey || skillUpgradesAvailable[upgradeKey] <= 0) return;
          const skills = [...sheet.skills];
          skills[i] = { ...skill, specialization: upgradeKey };
          // Gasto = especializações atuais; não depende mais do jsonb legado.
          patch({ skills });
        }}
      />

      <section className="space-y-1">
        <SheetTabs
          defaultTabId="elementos"
          tabs={[
            {
              id: "elementos",
              label: "Elementos e Fragmentos",
              content: (
                <ElementsSection
                  elements={elements}
                  onChange={(next) => setElements(next)}
                />
              ),
            },
            {
              id: "magias",
              label: "Magias e Poderes Passivos",
              content: (
                <SpellsSection
                  spells={sheet.spells}
                  onChange={(spells) => patch({ spells })}
                />
              ),
            },
            {
              id: "armas",
              label: "Armas",
              content: (
                <div className="space-y-5">
                  <WeaponsSection
                    weapons={sheet.weapons}
                    onChange={(weapons) => patch({ weapons })}
                  />
                  <ArmorSection
                    armor={sheet.armor}
                    onChange={(armor) => patch({ armor })}
                  />
                </div>
              ),
            },
            {
              id: "inventario",
              label: "Inventário",
              content: (
                <InventorySection
                  inventory={sheet.inventory}
                  weight={weight}
                  limit={limit}
                  money={sheet.money}
                  onMoneyChange={(money) => patch({ money })}
                  onChange={(inventory) => patch({ inventory })}
                />
              ),
            },
            {
              id: "maldicoes",
              label: "Maldições",
              content: (
                <CursesSection
                  curses={sheet.curses}
                  onChange={(curses) => patch({ curses })}
                />
              ),
            },
            {
              id: "feitos",
              label: "Feitos Históricos",
              content: (
                <HistoricalFeatsSection
                  feats={sheet.historical_feats}
                  totalLevel={totalLevel}
                  onChange={(historical_feats) => patch({ historical_feats })}
                />
              ),
            },
            {
              id: "anotacoes",
              label: "Anotações",
              content: (
                <NotesSection
                  notes={sheet.notes}
                  onChange={(notes) => patch({ notes })}
                />
              ),
            },
            {
              id: "historia",
              label: "História do Personagem",
              content: (
                <BackstorySection
                  backstory={sheet.backstory}
                  onChange={(backstory) => patch({ backstory })}
                />
              ),
            },
            {
              id: "mosaico",
              label: "Mosaico",
              content: (
                <MosaicFrame characterName={sheet.name} elements={elements} />
              ),
            },
          ]}
        />
      </section>

      <FloatingDiceButton />
    </div>
  );
}

function ResourceBlock({
  label,
  current,
  max,
  color,
  mod,
  onModChange,
  onApply,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
  mod: number;
  onModChange: (v: number) => void;
  onApply: (delta: number) => void;
}) {
  const [amount, setAmount] = useState(1);
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className="space-y-2 rounded-md border border-ink-border bg-ink-raised/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          mod
          <input
            type="number"
            step={1}
            className="field w-14 py-1 text-center text-sm"
            value={mod}
            onChange={(e) => onModChange(Math.trunc(Number(e.target.value) || 0))}
            title="Ajuste no máximo"
          />
        </label>
      </div>
      <p className="font-display text-2xl text-parchment">
        {current}
        <span className="text-base text-ink-muted"> / {max}</span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink">
        <div className="h-full transition-all" style={{ width: pct + '%', backgroundColor: color }} />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          className="field w-14 py-1 text-center text-sm"
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
        />
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(-amount)}>
          Dano
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(amount)}>
          Cura
        </button>
      </div>
    </div>
  );
}

