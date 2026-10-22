'use client';

import { useEffect, useState } from 'react';
import { ListSection } from '@/components/character/ListSection';
import type { InventoryItem } from '@/types/database';

export function InventorySection({
  inventory,
  weight,
  limit,
  money,
  onMoneyChange,
  onChange,
}: {
  inventory: InventoryItem[];
  weight: number;
  limit: number;
  money: number;
  onMoneyChange: (money: number) => void;
  onChange: (inventory: InventoryItem[]) => void;
}) {
  return (
    <ListSection
      title={`Inventário (${weight} / ${limit} peso)`}
      onAdd={() =>
        onChange([...inventory, { name: 'Item', description: '', weight: 0 }])
      }
    >
      <MoneyField value={money} onChange={onMoneyChange} />
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

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function MoneyField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  // Rascunho em texto pra permitir digitar "-" ou "10." sem o input pular.
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)));
  }, [value]);

  return (
    <label className="flex flex-wrap items-center gap-3 rounded-md border border-ink-border bg-ink-raised/40 p-3">
      <span className="label">Dinheiro (US$)</span>
      <input
        type="number"
        step="0.01"
        className="field w-40"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) {
            onChange(Math.round(n * 100) / 100);
          } else if (e.target.value.trim() === '') {
            onChange(0);
          }
        }}
      />
      <span className={value < 0 ? 'text-crimson-soft' : 'text-parchment'}>
        {usd.format(value)}
      </span>
    </label>
  );
}
