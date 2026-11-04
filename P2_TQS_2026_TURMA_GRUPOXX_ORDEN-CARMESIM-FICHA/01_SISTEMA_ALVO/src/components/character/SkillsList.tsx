'use client';

import { useMemo } from 'react';
import {
  formatModifier,
  getNextSpecialization,
  getSkillRollModifier,
  getSkillTotal,
  getTotalSkillUpgradesAvailable,
  getUpgradeKeyForNext,
} from '@/lib/calculations';
import {
  ATTRIBUTE_FRAME_COLORS,
  isDefaultSkillName,
  SPECIALIZATION_LABELS,
} from '@/lib/constants';
import { QuickRollButton } from '@/components/dice/DiceRoller';
import { SectionCard } from '@/components/ui/SectionCard';
import type {
  Attributes,
  Skill,
  SkillSpecialization,
  SkillUpgradeSpent,
} from '@/types/database';
import { ATTRIBUTE_KEYS } from '@/types/database';

const UPGRADE_BADGE_LABEL: Record<keyof SkillUpgradeSpent, string> = {
  basico: 'Básico',
  medio: 'Médio',
  alto: 'Alto',
  expert: 'Expert',
};

export function SkillsList({
  skills,
  attributes,
  skillUpgradesAvailable,
  onChange,
  onSpendSkillPoint,
}: {
  skills: Skill[];
  attributes: Attributes;
  skillUpgradesAvailable: SkillUpgradeSpent;
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

  const totalAvailable = getTotalSkillUpgradesAvailable(skillUpgradesAvailable);
  const badgeParts = (
    Object.keys(UPGRADE_BADGE_LABEL) as (keyof SkillUpgradeSpent)[]
  )
    .filter((k) => skillUpgradesAvailable[k] > 0)
    .map((k) => skillUpgradesAvailable[k] + ' ' + UPGRADE_BADGE_LABEL[k]);

  return (
    <SectionCard
      title="Perícias"
      badge={
        totalAvailable > 0 ? (
          <span className="animate-pulse rounded-md border border-crimson/50 bg-crimson/20 px-2 py-0.5 text-xs font-medium text-crimson-soft">
            {badgeParts.join(' · ') + ' disponíveis'}
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
          const upgradeKey = getUpgradeKeyForNext(skill.specialization);
          const poolLeft = upgradeKey
            ? skillUpgradesAvailable[upgradeKey]
            : 0;
          const canSpendThis = Boolean(upgradeKey && poolLeft > 0);

          let spendLabel: string | null = null;
          if (nextSpec === 'basico') {
            spendLabel = 'Treinar (Básico)';
          } else if (nextSpec) {
            spendLabel = 'Promover → ' + SPECIALIZATION_LABELS[nextSpec];
          }

          const frame = ATTRIBUTE_FRAME_COLORS[skill.attribute] ?? '#8A7F86';

          return (
            <div
              key={i}
              className="relative flex flex-wrap items-center gap-2 overflow-hidden rounded-md border px-2 py-1.5"
              style={{
                borderColor: frame + '66',
                background:
                  'linear-gradient(135deg, ' +
                  frame +
                  '22 0%, rgba(22,18,24,0.55) 55%, rgba(12,10,13,0.4) 100%)',
              }}
            >
              <div
                className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-25 blur-xl"
                style={{ backgroundColor: frame }}
              />
              <select
                className="field relative w-14 shrink-0 px-1 py-1 text-center text-xs"
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
                <p className="relative min-w-0 flex-1 text-sm font-medium text-parchment">
                  {skill.name}
                </p>
              ) : (
                <input
                  className="field relative min-w-0 flex-1 px-2 py-1 text-sm"
                  value={skill.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              )}

              <select
                className="field relative w-[6.75rem] shrink-0 px-1 py-1 text-xs"
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

              <div className="relative flex w-14 shrink-0 flex-col items-end leading-tight">
                <span className="font-display text-lg text-crimson-soft">
                  {total}
                </span>
                <span className="text-[0.65rem] text-ink-muted">
                  d20 {formatModifier(rollMod)}
                </span>
              </div>

              <div className="relative flex shrink-0 items-center gap-1">
                {spendLabel && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-[0.7rem] disabled:opacity-40"
                    disabled={!canSpendThis}
                    onClick={() => onSpendSkillPoint(i)}
                    title={
                      canSpendThis
                        ? spendLabel
                        : 'Sem upgrades desse tipo disponíveis'
                    }
                  >
                    {spendLabel}
                  </button>
                )}
                <QuickRollButton bonus={rollMod} label={skill.name} />
                {!isDefault && (
                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 p-0 text-xs"
                    onClick={() => onChange(skills.filter((_, j) => j !== i))}
                    aria-label="Remover perícia"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}