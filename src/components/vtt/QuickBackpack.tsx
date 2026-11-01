'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { getCarryLimit, getInventoryWeight } from '@/lib/calculations';
import type { BackpackValues } from '@/lib/resource-sync';
import type { Attributes } from '@/types/database';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function MoneyRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  // Rascunho em texto: apagar o campo para digitar não pode virar 0 na tela.
  const [draft, setDraft] = useState<string | null>(null);

  // Valor de outra aba troca o rascunho; o da própria digitação ("10.") fica.
  useEffect(() => {
    setDraft((current) => (current !== null && Number(current) === value ? current : null));
  }, [value]);

  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="shrink-0">Dinheiro (US$)</span>
      <input
        type="number"
        step="0.01"
        className="field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const typed = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(typed)) {
            onChange(Math.round(typed * 100) / 100);
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className={'shrink-0 ' + (value < 0 ? 'text-crimson-soft' : 'text-parchment')}>
        {usd.format(value)}
      </span>
    </label>
  );
}

/** Só o rápido em sessão: editar um item por inteiro continua na ficha. */
export function QuickBackpack({
  backpack,
  attributes,
  onChange,
}: {
  backpack: BackpackValues;
  attributes: Attributes;
  onChange: (patch: Partial<BackpackValues>) => void;
}) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const { inventory, money } = backpack;
  const total = getInventoryWeight(inventory);
  const limit = getCarryLimit(attributes);

  function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange({
      inventory: [
        ...inventory,
        {
          name: trimmed,
          description: '',
          weight: Math.max(0, Math.trunc(Number(weight) || 0)),
        },
      ],
    });
    setName('');
    setWeight('');
  }

  return (
    <details className="rounded-md border border-ink-border">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2 text-sm text-parchment desk:min-h-8">
        Mochila
        <span className={'text-xs ' + (total > limit ? 'text-crimson-soft' : 'text-ink-muted')}>
          {total} / {limit} peso
        </span>
      </summary>
      <div className="space-y-2 p-2">
        {total > limit && (
          <p className="text-xs text-crimson-soft">Acima do limite de carga (FOR/2).</p>
        )}
        <MoneyRow value={money} onChange={(next) => onChange({ money: next })} />

        {inventory.length === 0 ? (
          <p className="text-xs text-ink-muted">Mochila vazia. Adicione um item abaixo.</p>
        ) : (
          <ul className="space-y-1">
            {inventory.map((item, index) => (
              <li key={index} className="rounded-md border border-ink-border/60">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={openIndex === index}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 px-2 text-left text-sm text-parchment desk:min-h-8"
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{item.weight}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${item.name}`}
                    title={`Remover ${item.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-crimson-soft desk:h-8 desk:w-8"
                    onClick={() => {
                      setOpenIndex(null);
                      onChange({ inventory: inventory.filter((_, i) => i !== index) });
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                {openIndex === index && (
                  <p className="whitespace-pre-wrap break-words px-2 pb-2 text-xs text-ink-muted">
                    {item.description || 'Sem descrição. Dá para escrever uma na ficha.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex gap-1">
          <input
            className="field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8"
            placeholder="Novo item"
            aria-label="Nome do item"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={0}
            step={1}
            className="field min-h-11 w-16 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
            placeholder="Peso"
            aria-label="Peso do item"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary min-h-11 shrink-0 px-3 py-1 text-xs desk:min-h-8"
            disabled={!name.trim()}
          >
            Adicionar
          </button>
        </form>
      </div>
    </details>
  );
}
