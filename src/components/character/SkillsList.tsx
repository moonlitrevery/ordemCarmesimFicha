'use client';

import { formatModifier, getSkillRollModifier, getSkillTotal } from '@/lib/calculations';
import { isDefaultSkillName, SPECIALIZATION_LABELS } from '@/lib/constants';
import { QuickRollButton } from '@/components/dice/DiceRoller';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Attributes, Skill, SkillSpecialization } from '@/types/database';
import { ATTRIBUTE_KEYS } from '@/types/database';

export function SkillsList({
  skills,
  attributes,
  onChange,
}: {
  skills: Skill[];
  attributes: Attributes;
  onChange: (skills: Skill[]) => void;
}) {
  function update(i: number, partial: Partial<Skill>) {
    const next = [...skills];
    next[i] = { ...skills[i], ...partial };
    onChange(next);
  }

  return (
    <SectionCard
      title="Perícias"
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
      <div className="divide-y divide-ink-border rounded-md border border-ink-border">
        {skills.map((skill, i) => {
          const total = getSkillTotal(skill, attributes);
          const rollMod = getSkillRollModifier(total);
          const isDefault = isDefaultSkillName(skill.name);
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-1.5 px-2 py-1.5"
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
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-parchment">
                  {skill.name}
                </p>
              ) : (
                <input
                  className="field min-w-[7rem] flex-1 px-2 py-1 text-sm"
                  value={skill.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              )}

              <select
                className="field w-[7.25rem] shrink-0 px-1 py-1 text-xs"
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

              <div className="flex w-16 shrink-0 flex-col items-end leading-tight">
                <span className="font-display text-lg text-crimson-soft">{total}</span>
                <span className="text-[0.65rem] text-ink-muted">
                  d20 {formatModifier(rollMod)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
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