'use client';

import { ListSection } from '@/components/character/ListSection';
import type { InventoryItem } from '@/types/database';

export function InventorySection({
  inventory,
  weight,
  limit,
  onChange,
}: {
  inventory: InventoryItem[];
  weight: number;
  limit: number;
  onChange: (inventory: InventoryItem[]) => void;
}) {
  return (
    <ListSection
      title={`Inventário (${weight} / ${limit} peso)`}
      onAdd={() =>
        onChange([...inventory, { name: 'Item', description: '', weight: 0 }])
      }
    >
      {weight > limit && (
        <p className="text-sm text-crimson-soft">
          Acima do limite de carga (FOR/2).
        </p>
      )}
      {inventory.map((item, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_80px_auto]">
          <input
            className="field"
            value={item.name}
            onChange={(e) => {
              const next = [...inventory];
              next[i] = { ...item, name: e.target.value };
              onChange(next);
            }}
          />
          <input
            className="field"
            placeholder="Descrição"
            value={item.description}
            onChange={(e) => {
              const next = [...inventory];
              next[i] = { ...item, description: e.target.value };
              onChange(next);
            }}
          />
          <input
            type="number"
            step={1}
            min={0}
            className="field"
            value={item.weight}
            onChange={(e) => {
              const next = [...inventory];
              next[i] = {
                ...item,
                weight: Math.trunc(Number(e.target.value) || 0),
              };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={() => onChange(inventory.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
    </ListSection>
  );
}
