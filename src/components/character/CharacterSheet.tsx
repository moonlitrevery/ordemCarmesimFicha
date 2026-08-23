'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  computeDerivedMaxes,
  getAttributeModifier,
  getCarryLimit,
  getInventoryWeight,
  getSkillTotal,
  getTotalLevel,
} from '@/lib/calculations';
import {
  DEFAULT_SKILLS,
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';
import { FloatingDiceButton } from '@/components/dice/FloatingDiceButton';
import { InlineRollButton } from '@/components/dice/DiceRoller';
import { ElementsSection } from '@/components/character/ElementsSection';
import { LevelProgression } from '@/components/character/LevelProgression';
import { MosaicFrame } from '@/components/mosaic/MosaicFrame';
import { CharacterImage } from '@/components/ui/CharacterImage';
import { SaveIndicator, type SaveStatus } from '@/components/ui/SaveIndicator';
import { SectionCard } from '@/components/ui/SectionCard';
import type {
  Attributes,
  Character,
  CharacterElementRow,
  Curse,
  HistoricalFeat,
  InventoryItem,
  MilestoneNotes,
  Skill,
  SkillSpecialization,
  Spell,
  Weapon,
} from '@/types/database';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
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
  curses: Curse[];
  historical_feats: HistoricalFeat[];
  milestone_notes: MilestoneNotes;
  notes: string;
  backstory: string;
  is_order_agent: boolean;
  order_rank: string;
};

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
    curses: c.curses ?? [],
    historical_feats: c.historical_feats ?? [],
    milestone_notes: c.milestone_notes ?? {},
    notes: c.notes ?? '',
    backstory: c.backstory ?? '',
    is_order_agent: c.is_order_agent ?? true,
    order_rank: c.order_rank ?? 'Agente Principiante',
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

  useEffect(() => {
    setReady(true);
  }, []);

  const totalLevel = getTotalLevel(elements);
  const derived = useMemo(
    () => computeDerivedMaxes(totalLevel, sheet.attributes),
    [totalLevel, sheet.attributes]
  );

  const persistCharacter = useCallback(
    async (next: SheetState, nextElements: CharacterElementRow[]) => {
      const supabase = createClient();
      const maxes = computeDerivedMaxes(
        getTotalLevel(nextElements),
        next.attributes
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
        hp_current: next.hp_current,
        hp_max: maxes.hpMax,
        mana_current: next.mana_current,
        mana_max: maxes.manaMax,
        sanity_current: next.sanity_current,
        sanity_max: maxes.sanityMax,
        skills: next.skills,
        spells: next.spells,
        weapons: next.weapons,
        inventory: next.inventory,
        curses: next.curses,
        historical_feats: next.historical_feats,
        milestone_notes: next.milestone_notes,
        notes: next.notes || null,
        backstory: next.backstory || null,
        is_order_agent: next.is_order_agent,
        order_rank: next.order_rank || null,
      };

      const { error } = await supabase
        .from('characters')
        .update(payload)
        .eq('id', character.id);
      if (error) throw error;

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

  useEffect(() => {
    if (!ready) return;
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        await persistCharacter(sheet, elements);
        // refresh element ids
        const supabase = createClient();
        const { data } = await supabase
          .from('character_elements')
          .select('*')
          .eq('character_id', character.id);
        if (data) setElements(data as CharacterElementRow[]);
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
              <span className="label">Nascimento</span>
              <input
                className="field"
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
      <SectionCard title="Atributos">
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
                  <InlineRollButton
                    notation="1d100"
                    label={ATTRIBUTE_LABELS[key] + ' (meta ' + value + ')'}
                  />
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
              ['HP', 'hp_current', derived.hpMax, '#8B1E2D'],
              ['Mana', 'mana_current', derived.manaMax, '#3B6EA5'],
              ['Sanidade', 'sanity_current', derived.sanityMax, '#7A6B9A'],
            ] as const
          ).map(([label, key, max, color]) => {
            const current = sheet[key];
            const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className="label">{label}</span>
                  <div className="flex items-center gap-1 text-sm">
                    <input
                      type="number"
                      className="field w-16 py-1 text-center"
                      value={current}
                      onChange={(e) =>
                        patch({ [key]: Number(e.target.value) || 0 } as Partial<SheetState>)
                      }
                    />
                    <span className="text-ink-muted">/ {max}</span>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <ElementsSection
        elements={elements}
        onChange={(next) => setElements(next)}
      />

      {/* Perícias */}
      <ListSection
        title="Perícias"
        onAdd={() =>
          patch({
            skills: [
              ...sheet.skills,
              { name: 'Nova perícia', attribute: 'INT', specialization: 'none' },
            ],
          })
        }
      >
        {sheet.skills.map((skill, i) => {
          const total = getSkillTotal(skill, sheet.attributes);
          return (
            <div
              key={i}
              className="grid gap-2 rounded-md border border-ink-border bg-ink-raised/40 p-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center"
            >
              <input
                className="field"
                value={skill.name}
                onChange={(e) => {
                  const skills = [...sheet.skills];
                  skills[i] = { ...skill, name: e.target.value };
                  patch({ skills });
                }}
              />
              <select
                className="field"
                value={skill.attribute}
                onChange={(e) => {
                  const skills = [...sheet.skills];
                  skills[i] = {
                    ...skill,
                    attribute: e.target.value as keyof Attributes,
                  };
                  patch({ skills });
                }}
              >
                {ATTRIBUTE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={skill.specialization}
                onChange={(e) => {
                  const skills = [...sheet.skills];
                  skills[i] = {
                    ...skill,
                    specialization: e.target.value as SkillSpecialization,
                  };
                  patch({ skills });
                }}
              >
                {Object.entries(SPECIALIZATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="text-center font-display text-xl text-crimson-soft">
                {total}
              </span>
              <div className="flex items-center gap-1">
                <InlineRollButton notation="1d100" label={skill.name + " (meta " + total + ")"} />
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() =>
                    patch({ skills: sheet.skills.filter((_, j) => j !== i) })
                  }
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </ListSection>

      {/* Magias */}
      <ListSection
        title="Magias e Poderes Passivos"
        onAdd={() =>
          patch({
            spells: [
              ...sheet.spells,
              {
                name: 'Nova magia',
                element: 'fogo',
                description: '',
                effect: '',
                range: '',
                manaCost: '',
              },
            ],
          })
        }
      >
        {sheet.spells.map((spell, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-border bg-ink-raised/40 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="field flex-1"
                placeholder="Nome"
                value={spell.name}
                onChange={(e) => {
                  const spells = [...sheet.spells];
                  spells[i] = { ...spell, name: e.target.value };
                  patch({ spells });
                }}
              />
              <input
                className="field w-40"
                placeholder="Elemento"
                value={spell.element}
                onChange={(e) => {
                  const spells = [...sheet.spells];
                  spells[i] = { ...spell, element: e.target.value };
                  patch({ spells });
                }}
              />
              <InlineRollButton notation="1d6" />
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() =>
                  patch({ spells: sheet.spells.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </div>
            <textarea
              className="field min-h-[60px]"
              placeholder="Descrição"
              value={spell.description}
              onChange={(e) => {
                const spells = [...sheet.spells];
                spells[i] = { ...spell, description: e.target.value };
                patch({ spells });
              }}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="field"
                placeholder="Efeito"
                value={spell.effect}
                onChange={(e) => {
                  const spells = [...sheet.spells];
                  spells[i] = { ...spell, effect: e.target.value };
                  patch({ spells });
                }}
              />
              <input
                className="field"
                placeholder="Alcance"
                value={spell.range}
                onChange={(e) => {
                  const spells = [...sheet.spells];
                  spells[i] = { ...spell, range: e.target.value };
                  patch({ spells });
                }}
              />
              <input
                className="field"
                placeholder="Custo de mana"
                value={spell.manaCost}
                onChange={(e) => {
                  const spells = [...sheet.spells];
                  spells[i] = { ...spell, manaCost: e.target.value };
                  patch({ spells });
                }}
              />
            </div>
          </div>
        ))}
      </ListSection>

      {/* Armas */}
      <ListSection
        title="Armas"
        onAdd={() =>
          patch({
            weapons: [
              ...sheet.weapons,
              {
                name: 'Nova arma',
                type: '',
                damage: '1d6',
                ammo: '',
                hitsPerTurn: 1,
                range: '',
                flaw: '',
                area: '',
              },
            ],
          })
        }
      >
        {sheet.weapons.map((w, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-border bg-ink-raised/40 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="field flex-1"
                value={w.name}
                onChange={(e) => {
                  const weapons = [...sheet.weapons];
                  weapons[i] = { ...w, name: e.target.value };
                  patch({ weapons });
                }}
              />
              <input
                className="field w-28"
                placeholder="Dano"
                value={w.damage}
                onChange={(e) => {
                  const weapons = [...sheet.weapons];
                  weapons[i] = { ...w, damage: e.target.value };
                  patch({ weapons });
                }}
              />
              <InlineRollButton notation={w.damage || '1d6'} />
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() =>
                  patch({ weapons: sheet.weapons.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['type', 'Tipo'],
                  ['ammo', 'Munição'],
                  ['range', 'Alcance'],
                  ['flaw', 'Falha'],
                  ['area', 'Área'],
                ] as const
              ).map(([key, ph]) => (
                <input
                  key={key}
                  className="field"
                  placeholder={ph}
                  value={w[key]}
                  onChange={(e) => {
                    const weapons = [...sheet.weapons];
                    weapons[i] = { ...w, [key]: e.target.value };
                    patch({ weapons });
                  }}
                />
              ))}
              <input
                type="number"
                className="field"
                placeholder="Acertos/turno"
                value={w.hitsPerTurn}
                onChange={(e) => {
                  const weapons = [...sheet.weapons];
                  weapons[i] = { ...w, hitsPerTurn: Number(e.target.value) || 0 };
                  patch({ weapons });
                }}
              />
            </div>
          </div>
        ))}
      </ListSection>

      {/* Inventário */}
      <ListSection
        title={`Inventário (${weight.toFixed(1)} / ${limit} peso)`}
        onAdd={() =>
          patch({
            inventory: [
              ...sheet.inventory,
              { name: 'Item', description: '', weight: 0 },
            ],
          })
        }
      >
        {weight > limit && (
          <p className="text-sm text-crimson-soft">Acima do limite de carga (FOR/2).</p>
        )}
        {sheet.inventory.map((item, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_80px_auto]">
            <input
              className="field"
              value={item.name}
              onChange={(e) => {
                const inventory = [...sheet.inventory];
                inventory[i] = { ...item, name: e.target.value };
                patch({ inventory });
              }}
            />
            <input
              className="field"
              placeholder="Descrição"
              value={item.description}
              onChange={(e) => {
                const inventory = [...sheet.inventory];
                inventory[i] = { ...item, description: e.target.value };
                patch({ inventory });
              }}
            />
            <input
              type="number"
              step="0.1"
              className="field"
              value={item.weight}
              onChange={(e) => {
                const inventory = [...sheet.inventory];
                inventory[i] = { ...item, weight: Number(e.target.value) || 0 };
                patch({ inventory });
              }}
            />
            <button
              type="button"
              className="btn-ghost px-2"
              onClick={() =>
                patch({ inventory: sheet.inventory.filter((_, j) => j !== i) })
              }
            >
              ×
            </button>
          </div>
        ))}
      </ListSection>

      {/* Maldições */}
      <ListSection
        title="Maldições"
        onAdd={() =>
          patch({
            curses: [...sheet.curses, { name: 'Maldição', story: '', effect: '' }],
          })
        }
      >
        {sheet.curses.map((c, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-border p-3">
            <div className="flex gap-2">
              <input
                className="field flex-1"
                value={c.name}
                onChange={(e) => {
                  const curses = [...sheet.curses];
                  curses[i] = { ...c, name: e.target.value };
                  patch({ curses });
                }}
              />
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() =>
                  patch({ curses: sheet.curses.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </div>
            <textarea
              className="field min-h-[50px]"
              placeholder="História"
              value={c.story}
              onChange={(e) => {
                const curses = [...sheet.curses];
                curses[i] = { ...c, story: e.target.value };
                patch({ curses });
              }}
            />
            <textarea
              className="field min-h-[50px]"
              placeholder="Efeito"
              value={c.effect}
              onChange={(e) => {
                const curses = [...sheet.curses];
                curses[i] = { ...c, effect: e.target.value };
                patch({ curses });
              }}
            />
          </div>
        ))}
      </ListSection>

      {/* Feitos */}
      <ListSection
        title="Feitos Históricos"
        onAdd={() =>
          patch({
            historical_feats: [
              ...sheet.historical_feats,
              {
                title: 'Feito',
                description: '',
                alignment: 'positivo',
              },
            ],
          })
        }
      >
        {totalLevel >= 20 && (
          <p className="text-sm text-crimson-soft">
            Após o nível 20, a evolução do personagem vem destes feitos.
          </p>
        )}
        {sheet.historical_feats.map((f, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-border p-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="field flex-1"
                value={f.title}
                onChange={(e) => {
                  const historical_feats = [...sheet.historical_feats];
                  historical_feats[i] = { ...f, title: e.target.value };
                  patch({ historical_feats });
                }}
              />
              <select
                className="field w-36"
                value={f.alignment}
                onChange={(e) => {
                  const historical_feats = [...sheet.historical_feats];
                  historical_feats[i] = {
                    ...f,
                    alignment: e.target.value as 'positivo' | 'negativo',
                  };
                  patch({ historical_feats });
                }}
              >
                <option value="positivo">Positivo</option>
                <option value="negativo">Negativo</option>
              </select>
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() =>
                  patch({
                    historical_feats: sheet.historical_feats.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
            <textarea
              className="field min-h-[50px]"
              value={f.description}
              onChange={(e) => {
                const historical_feats = [...sheet.historical_feats];
                historical_feats[i] = { ...f, description: e.target.value };
                patch({ historical_feats });
              }}
            />
            <input
              className="field"
              placeholder="Sessão / data"
              value={f.dateOrSession ?? ''}
              onChange={(e) => {
                const historical_feats = [...sheet.historical_feats];
                historical_feats[i] = { ...f, dateOrSession: e.target.value };
                patch({ historical_feats });
              }}
            />
          </div>
        ))}
      </ListSection>

      <SectionCard title="Anotações">
        <textarea
          className="field min-h-[120px]"
          value={sheet.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Notas de sessão…"
        />
      </SectionCard>

      <SectionCard title="História do Personagem">
        <textarea
          className="field min-h-[220px]"
          value={sheet.backstory}
          onChange={(e) => patch({ backstory: e.target.value })}
          placeholder="História de fundo…"
        />
      </SectionCard>

      <MosaicFrame characterName={sheet.name} elements={elements} />
      <FloatingDiceButton />
    </div>
  );
}

function ListSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      action={
        <button type="button" className="btn-ghost text-xs" onClick={onAdd}>
          + Adicionar
        </button>
      }
    >
      <div className="space-y-3">{children}</div>
    </SectionCard>
  );
}
