'use client';

import { InlineRollButton } from '@/components/dice/DiceRoller';
import { ListSection } from '@/components/character/ListSection';
import type { Spell } from '@/types/database';

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
      {spells.map((spell, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-ink-border bg-ink-raised/40 p-3"
        >
          <div className="flex flex-wrap gap-2">
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
            <input
              className="field w-40"
              placeholder="Elemento"
              value={spell.element}
              onChange={(e) => {
                const next = [...spells];
                next[i] = { ...spell, element: e.target.value };
                onChange(next);
              }}
            />
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
            className="field min-h-[60px]"
            placeholder="Descrição"
            value={spell.description}
            onChange={(e) => {
              const next = [...spells];
              next[i] = { ...spell, description: e.target.value };
              onChange(next);
            }}
          />
          <div className="grid gap-2 sm:grid-cols-3">
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
      ))}
    </ListSection>
  );
}
