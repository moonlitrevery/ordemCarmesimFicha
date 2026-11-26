'use client';

import { ListSection } from '@/components/character/ListSection';
import { WeightInput } from '@/components/character/WeightInput';
import { MoneyControl, type MoneyLogEntry } from '@/components/money/MoneyControl';
import { itemQty } from '@/lib/calculations';
import type { InventoryItem } from '@/types/database';

export function InventorySection({
  inventory,
  weight,
  limit,
  money,
  onMoneyChange,
  onMoneyDelta,
  loadMoneyHistory,
  onChange,
}: {
  inventory: InventoryItem[];
  weight: number;
  limit: number;
  money: number;
  onMoneyChange: (money: number) => void;
  onMoneyDelta: (delta: number, reason: string | null) => Promise<boolean>;
  loadMoneyHistory: () => Promise<MoneyLogEntry[] | null>;
  onChange: (inventory: InventoryItem[]) => void;
}) {
  const update = (index: number, patch: Partial<InventoryItem>) => {
    const next = [...inventory];
    next[index] = { ...inventory[index], ...patch };
    onChange(next);
  };

  return (
    <ListSection
      title={`Inventário (${weight} / ${limit} peso)`}
      onAdd={() =>
        onChange([...inventory, { name: 'Item', description: '', weight: 0 }])
      }
    >
      <MoneyControl
        value={money}
        onSet={onMoneyChange}
        onDelta={onMoneyDelta}
        loadHistory={loadMoneyHistory}
      />
      {weight > limit && (
        <p className="text-sm text-crimson-soft">
          Acima do limite de carga (FOR/2).
        </p>
      )}
      {inventory.length > 0 && (
        <p className="text-xs text-ink-muted">
          Peso por unidade. Negativo (ex.: mochila militar −2) aumenta a carga que dá pra levar.
        </p>
      )}
      {inventory.map((item, i) => {
        const negative = Number(item.weight) < 0;
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_64px_80px_auto]">
            <input
              className="field"
              aria-label="Nome do item"
              value={item.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              className="field"
              placeholder="Descrição"
              aria-label="Descrição do item"
              value={item.description}
              onChange={(e) => update(i, { description: e.target.value })}
            />
            <input
              type="number"
              min={1}
              step={1}
              className="field"
              title="Quantidade"
              aria-label="Quantidade"
              value={itemQty(item)}
              onChange={(e) => {
                const qty = Math.max(1, Math.min(9999, Math.trunc(Number(e.target.value) || 1)));
                update(i, { qty: qty === 1 ? undefined : qty });
              }}
            />
            <WeightInput
              className={'field ' + (negative ? 'text-emerald-400' : '')}
              placeholder="Peso"
              value={Number(item.weight) || 0}
              onChange={(next) => update(i, { weight: next ?? 0 })}
            />
            <button
              type="button"
              className="btn-ghost px-2"
              aria-label={`Remover ${item.name}`}
              onClick={() => onChange(inventory.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        );
      })}
    </ListSection>
  );
}
