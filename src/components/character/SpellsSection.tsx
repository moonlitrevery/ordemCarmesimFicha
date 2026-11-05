'use client';

import { InlineRollButton } from '@/components/dice/DiceRoller';
import { ListSection } from '@/components/character/ListSection';
import {
  ALL_ELEMENTS,
  ELEMENT_COLORS,
  ELEMENT_LABELS,
} from '@/lib/constants';
import type { ElementType, Spell } from '@/types/database';
import { ElementSymbol } from '@/components/elements/ElementSymbol';

function resolveElement(raw: string): ElementType {
  const key = raw.trim().toLowerCase() as ElementType;
  return ALL_ELEMENTS.includes(key) ? key : 'fogo';
}

export function SpellsSection({
  spells,
  onChange,
}: {
  spells: Spell[];
  onChange: (spells: Spell[]) => void;
}) {
  return (
    <ListSection
      title="Magias e Poderes Passivos"
      onAdd={() =>
        onChange([
          ...spells,
          {
            name: 'Nova magia',
            element: 'fogo',
            description: '',
            effect: '',
            range: '',
            manaCost: '',
          },
        ])
      }
    >
      {spells.map((spell, i) => {
        const element = resolveElement(String(spell.element ?? 'fogo'));
        const color = ELEMENT_COLORS[element];
        const needsGlow = element === 'luz' || element === 'sombra';

        return (
          <div
            key={i}
            className="relative space-y-2 overflow-hidden rounded-md border p-3"
            style={{
              borderColor: color + '66',
              background:
                'linear-gradient(135deg, ' +
                color +
                '22 0%, rgba(22,18,24,0.55) 55%, rgba(12,10,13,0.4) 100%)',
            }}
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl"
              style={{ backgroundColor: color }}
            />

            <div className="relative flex flex-wrap gap-2">
              <input
                className="field flex-1"
                placeholder="Nome"
                value={spell.name}
                onChange={(e) => {
                  const next = [...spells];
                  next[i] = { ...spell, name: e.target.value };
                  onChange(next);
                }}
              />
              <span className="flex items-center gap-1.5">
              <ElementSymbol element={element} size={20} decorative />
              <select
                className="field w-44"
                value={element}
                onChange={(e) => {
                  const next = [...spells];
                  next[i] = {
                    ...spell,
                    element: e.target.value as ElementType,
                  };
                  onChange(next);
                }}
                style={{
                  color,
                  borderColor: color + '88',
                  textShadow: needsGlow
                    ? '0 0 8px rgba(255,255,255,0.45)'
                    : undefined,
                }}
                aria-label="Elemento"
              >
                {ALL_ELEMENTS.map((el) => (
                  <option key={el} value={el}>
                    {ELEMENT_LABELS[el]}
                  </option>
                ))}
              </select>
              </span>
              <InlineRollButton notation={spell.effect || '1d6'} />
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() => onChange(spells.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <textarea
              className="field relative min-h-[60px]"
              placeholder="Descrição"
              value={spell.description}
              onChange={(e) => {
                const next = [...spells];
                next[i] = { ...spell, description: e.target.value };
                onChange(next);
              }}
            />
            <div className="relative grid gap-2 sm:grid-cols-3">
              <input
                className="field"
                placeholder="Efeito"
                value={spell.effect}
                onChange={(e) => {
                  const next = [...spells];
                  next[i] = { ...spell, effect: e.target.value };
                  onChange(next);
                }}
              />
              <input
                className="field"
                placeholder="Alcance"
                value={spell.range}
                onChange={(e) => {
                  const next = [...spells];
                  next[i] = { ...spell, range: e.target.value };
                  onChange(next);
                }}
              />
              <input
                className="field"
                placeholder="Custo de mana"
                value={spell.manaCost}
                onChange={(e) => {
                  const next = [...spells];
                  next[i] = { ...spell, manaCost: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          </div>
        );
      })}
    </ListSection>
  );
}