'use client';

import { useState, type FormEvent } from 'react';
import { Trash2, Users } from 'lucide-react';
import { WeightBadge, WeightInput } from '@/components/character/WeightInput';
import { MoneyControl, type MoneyAction, type MoneyLogEntry } from '@/components/money/MoneyControl';
import { getCarryLimit, getInventoryWeight, itemQty } from '@/lib/calculations';
import type { BackpackValues } from '@/lib/resource-sync';
import type { Attributes } from '@/types/database';
import { QtyPrompt } from './QtyPrompt';

export interface BackpackPartyActions {
  send: (index: number, qty: number) => Promise<boolean>;
  deposit: (amount: number, reason: string | null) => Promise<boolean>;
  withdraw: (amount: number, reason: string | null) => Promise<boolean>;
}

/** Só o rápido em sessão: editar um item por inteiro continua na ficha. */
export function QuickBackpack({
  backpack,
  attributes,
  onChange,
  onMoneyDelta,
  loadMoneyHistory,
  party,
  busy = false,
}: {
  backpack: BackpackValues;
  attributes: Attributes;
  onChange: (patch: Partial<BackpackValues>) => void;
  onMoneyDelta: (delta: number, reason: string | null) => Promise<boolean>;
  loadMoneyHistory: () => Promise<MoneyLogEntry[] | null>;
  /** Sem isto (espectador, fora da mesa), não aparece nada de party. */
  party?: BackpackPartyActions;
  busy?: boolean;
}) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState<number | null>(null);
  const [weightKey, setWeightKey] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [sendIndex, setSendIndex] = useState<number | null>(null);

  const { inventory, money } = backpack;
  const total = getInventoryWeight(inventory);
  const limit = getCarryLimit(attributes);

  function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange({
      inventory: [...inventory, { name: trimmed, description: '', weight: weight ?? 0 }],
    });
    setName('');
    setWeight(null);
    setWeightKey((k) => k + 1);
  }

  async function send(index: number, qty: number) {
    if (!party) return;
    if (await party.send(index, qty)) {
      setSendIndex(null);
      setOpenIndex(null);
    }
  }

  const moneyActions: MoneyAction[] = [
    { label: '− Gastar', sign: -1, run: (amount, reason) => onMoneyDelta(-amount, reason) },
    { label: '+ Receber', sign: 1, run: (amount, reason) => onMoneyDelta(amount, reason) },
    ...(party
      ? [
          { label: 'Depositar no caixa', sign: -1 as const, run: party.deposit },
          { label: 'Sacar do caixa', sign: 1 as const, run: party.withdraw },
        ]
      : []),
  ];

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
        <MoneyControl
          compact
          value={money}
          onSet={(next) => onChange({ money: next })}
          onDelta={onMoneyDelta}
          actions={moneyActions}
          loadHistory={loadMoneyHistory}
          disabled={busy}
        />

        {inventory.length === 0 ? (
          <p className="text-xs text-ink-muted">Mochila vazia. Adicione um item abaixo.</p>
        ) : (
          <ul className="space-y-1">
            {inventory.map((item, index) => {
              const qty = itemQty(item);
              return (
                <li key={index} className="rounded-md border border-ink-border/60">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-expanded={openIndex === index}
                      className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 px-2 text-left text-sm text-parchment desk:min-h-8"
                      onClick={() => setOpenIndex(openIndex === index ? null : index)}
                    >
                      <span className="truncate">
                        {item.name}
                        {qty > 1 && <span className="text-ink-muted"> ×{qty}</span>}
                      </span>
                      <WeightBadge weight={item.weight} className="shrink-0 text-xs" />
                    </button>
                    {party && (
                      <button
                        type="button"
                        aria-label={`Mandar ${item.name} pra party`}
                        title="Mandar pra party"
                        disabled={busy}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-parchment desk:h-8 desk:w-8"
                        onClick={() => {
                          if (qty > 1) setSendIndex(sendIndex === index ? null : index);
                          else void send(index, 1);
                        }}
                      >
                        <Users size={14} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remover ${item.name}`}
                      title={`Remover ${item.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-crimson-soft desk:h-8 desk:w-8"
                      onClick={() => {
                        setOpenIndex(null);
                        setSendIndex(null);
                        onChange({ inventory: inventory.filter((_, i) => i !== index) });
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  {sendIndex === index && (
                    <QtyPrompt
                      max={qty}
                      busy={busy}
                      confirmLabel="Mandar pra party"
                      onConfirm={(n) => void send(index, n)}
                      onCancel={() => setSendIndex(null)}
                    />
                  )}
                  {openIndex === index && (
                    <p className="whitespace-pre-wrap break-words px-2 pb-2 text-xs text-ink-muted">
                      {item.description || 'Sem descrição. Dá para escrever uma na ficha.'}
                    </p>
                  )}
                </li>
              );
            })}
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
          <WeightInput
            key={weightKey}
            className="field min-h-11 w-16 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
            placeholder="Peso"
            value={weight}
            onChange={setWeight}
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
