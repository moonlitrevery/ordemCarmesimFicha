'use client';

import { ListSection } from '@/components/character/ListSection';
import type { ArmorPiece } from '@/types/database';

export function ArmorSection({
  armor,
  onChange,
}: {
  armor: ArmorPiece[];
  onChange: (armor: ArmorPiece[]) => void;
}) {
  function update(i: number, partial: Partial<ArmorPiece>) {
    const next = [...armor];
    next[i] = { ...armor[i], ...partial };
    onChange(next);
  }

  return (
    <ListSection
      title="Armaduras"
      onAdd={() =>
        onChange([
          ...armor,
          { name: 'Nova armadura', kind: 'fisica', reduction: '', notes: '' },
        ])
      }
    >
      {armor.map((a, i) => (
        <div
          key={i}
          className="grid gap-2 sm:grid-cols-[1fr_120px_140px_1.5fr_auto]"
        >
          <input
            className="field"
            value={a.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select
            className="field"
            value={a.kind}
            onChange={(e) =>
              update(i, { kind: e.target.value as ArmorPiece['kind'] })
            }
          >
            <option value="fisica">Física</option>
            <option value="magica">Mágica</option>
          </select>
          <input
            className="field"
            placeholder="ex.: 5, /2, /3"
            value={a.reduction}
            onChange={(e) => update(i, { reduction: e.target.value })}
          />
          <input
            className="field"
            placeholder="Observações"
            value={a.notes}
            onChange={(e) => update(i, { notes: e.target.value })}
          />
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={() => onChange(armor.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
    </ListSection>
  );
}
