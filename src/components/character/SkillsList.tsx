'use client';

import { useMemo } from 'react';
import {
  formatModifier,
  getNextSpecialization,
  getSkillRollModifier,
  getSkillTotal,
} from '@/lib/calculations';
import { isDefaultSkillName, SPECIALIZATION_LABELS } from '@/lib/constants';
import { QuickRollButton } from '@/components/dice/DiceRoller';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Attributes, Skill, SkillSpecialization } from '@/types/database';
import { ATTRIBUTE_KEYS } from '@/types/database';

export function SkillsList({
  skills,
  attributes,
  skillPointsAvailable,
  onChange,
  onSpendSkillPoint,
}: {
  skills: Skill[];
  attributes: Attributes;
  skillPointsAvailable: number;
  onChange: (skills: Skill[]) => void;
  onSpendSkillPoint: (skillIndex: number) => void;
}) {
  const sorted = useMemo(
    () =>
      skills
        .map((skill, index) => ({ skill, index }))
        .sort((a, b) =>
          a.skill.name.localeCompare(b.skill.name, 'pt-BR', {
            sensitivity: 'base',
          })
        ),
    [skills]
  );

  function update(i: number, partial: Partial<Skill>) {
    const next = [...skills];
    next[i] = { ...skills[i], ...partial };
    onChange(next);
  }

  const canSpend = skillPointsAvailable > 0;

  return (
    <SectionCard
      title="Perícias"
      badge={
        canSpend ? (
          <span className="animate-pulse rounded-md border border-crimson/50 bg-crimson/20 px-2 py-0.5 text-xs font-medium text-crimson-soft">
            {skillPointsAvailable === 1
              ? '1 ponto de perícia disponível'
              : skillPointsAvailable + ' pontos de perícia disponíveis'}
          </span>
        ) : null
      }
      action={
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() =>
            onChange([
              ...skills,
              { name: 'Nova perícia', attribute: 'INT', specialization: 'none' },
            ])
          }
        >
          + Adicionar
        </button>
      }
    >
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {sorted.map(({ skill, index: i }) => {
          const total = getSkillTotal(skill, attributes);
          const rollMod = getSkillRollModifier(total);
          const isDefault = isDefaultSkillName(skill.name);
          const nextSpec = getNextSpecialization(skill.specialization);
          let spendLabel: string | null = null;
          if (nextSpec === 'basico') {
            spendLabel = 'Treinar (Básico)';
          } else if (nextSpec) {
            spendLabel = 'Promover → ' + SPECIALIZATION_LABELS[nextSpec];
          }

          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-border/70 bg-ink-raised/30 px-2 py-1.5"
            >
              <select
                className="field w-14 shrink-0 px-1 py-1 text-center text-xs"
                value={skill.attribute}
                onChange={(e) =>
                  update(i, { attribute: e.target.value as keyof Attributes })
                }
                aria-label="Atributo"
              >
                {ATTRIBUTE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>

              {isDefault ? (
                <p className="min-w-0 flex-1 text-sm font-medium text-parchment">
                  {skill.name}
                </p>
              ) : (
                <input
                  className="field min-w-0 flex-1 px-2 py-1 text-sm"
                  value={skill.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              )}

              <select
                className="field w-[6.75rem] shrink-0 px-1 py-1 text-xs"
                value={skill.specialization}
                onChange={(e) =>
                  update(i, {
                    specialization: e.target.value as SkillSpecialization,
                  })
                }
                aria-label="Especialização"
              >
                {Object.entries(SPECIALIZATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              <div className="flex w-14 shrink-0 flex-col items-end leading-tight">
                <span className="font-display text-lg text-crimson-soft">
                  {total}
                </span>
                <span className="text-[0.65rem] text-ink-muted">
                  d20 {formatModifier(rollMod)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {spendLabel && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-[0.7rem] disabled:opacity-40"
                    disabled={!canSpend}
                    onClick={() => onSpendSkillPoint(i)}
                    title={
                      canSpend
                        ? spendLabel
                        : 'Sem pontos de perícia disponíveis'
                    }
                  >
                    {spendLabel}
                  </button>
                )}
                <QuickRollButton bonus={rollMod} label={skill.name} />
                <button
                  type="button"
                  className="btn-ghost h-8 w-8 p-0 text-xs"
                  onClick={() => onChange(skills.filter((_, j) => j !== i))}
                  aria-label="Remover perícia"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}