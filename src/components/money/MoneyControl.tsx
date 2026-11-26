'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDownUp } from 'lucide-react';
import {
  applyMoneyDelta,
  formatUsd,
  moneyDraft,
  moneyStep,
  parseMoney,
  parseMoneyInput,
} from '@/lib/money';

export interface MoneyAction {
  label: string;
  /** −1 tira do valor mostrado, +1 põe. Só decide a cor e o aviso de saldo. */
  sign: 1 | -1;
  run: (amount: number, reason: string | null) => Promise<boolean>;
}

export interface MoneyLogEntry {
  id: number;
  created_at: string;
  delta: number;
  reason: string | null;
  author_name: string;
  character_name?: string | null;
}

const WARNING_MS = 4000;

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Dinheiro da ficha e do caixa. Setas andam US$ 1 (Shift: 10); `+50`/`-30` com
 * Enter somam/subtraem (e entram no histórico); `=-30` grava dívida de propósito.
 * Sem `onSet`, o valor só muda pelo "Movimentar" (caixa da party).
 */
export function MoneyControl({
  label = 'Dinheiro (US$)',
  value,
  onSet,
  onDelta,
  actions,
  loadHistory,
  compact = false,
  disabled = false,
}: {
  label?: string;
  value: number;
  onSet?: (value: number) => void;
  onDelta: (delta: number, reason: string | null) => Promise<boolean>;
  actions?: MoneyAction[];
  loadHistory?: () => Promise<MoneyLogEntry[] | null>;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputId = useId();

  const warn = useCallback((text: string) => {
    setWarning(text);
    clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(null), WARNING_MS);
  }, []);

  useEffect(() => () => clearTimeout(warningTimer.current), []);

  const moveActions: MoneyAction[] = actions ?? [
    { label: '− Gastar', sign: -1, run: (amount, reason) => onDelta(-amount, reason) },
    { label: '+ Receber', sign: 1, run: (amount, reason) => onDelta(amount, reason) },
  ];

  async function applyDelta(delta: number) {
    const next = applyMoneyDelta(value, delta);
    if (next === null) {
      warn(`Ficaria ${formatUsd(value + delta)}. Pra gravar dívida, digite =${moneyDraft(value + delta)}.`);
      return;
    }
    setDraft(null);
    await onDelta(delta, null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!onSet) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = moneyStep(event.shiftKey) * (event.key === 'ArrowUp' ? 1 : -1);
      const next = applyMoneyDelta(value, step);
      if (next === null) {
        warn('Não fica negativo pelas setas. Pra gravar dívida, digite =-valor.');
        return;
      }
      setDraft(moneyDraft(next));
      onSet(next);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const parsed = parseMoneyInput(event.currentTarget.value);
      if (parsed.kind === 'delta') void applyDelta(parsed.value);
      else if (parsed.kind === 'invalid') warn('Valor inválido. Ex.: 1759,99 ou +50.');
      else setDraft(null);
    }
    if (event.key === 'Escape') setDraft(null);
  }

  const rowClass = compact
    ? 'flex flex-wrap items-center gap-2 text-xs text-ink-muted'
    : 'flex flex-wrap items-center gap-3 rounded-md border border-ink-border bg-ink-raised/40 p-3';
  const fieldClass = compact
    ? 'field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8'
    : 'field w-40';

  return (
    <div className="space-y-1">
      <div className={rowClass}>
        <label htmlFor={inputId} className={compact ? 'shrink-0' : 'label'}>
          {label}
        </label>
        {onSet && (
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={fieldClass}
            value={draft ?? moneyDraft(value)}
            disabled={disabled}
            title="Setas: ±1 (Shift: ±10). +50 ou -30 e Enter somam ou subtraem."
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseMoneyInput(e.target.value);
              if (parsed.kind === 'set' && parsed.value !== value) onSet(parsed.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setDraft(null)}
          />
        )}
        <span className={'shrink-0 ' + (value < 0 ? 'text-crimson-soft' : 'text-parchment')}>
          {formatUsd(value)}
        </span>
        <div className="relative shrink-0">
          <button
            type="button"
            className={
              'flex items-center gap-1 rounded-md border border-ink-border px-2 text-xs text-parchment hover:border-crimson/60 ' +
              (compact ? 'h-11 desk:h-8' : 'h-9')
            }
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          >
            <ArrowDownUp size={14} aria-hidden />
            Movimentar
          </button>
          {open && (
            <MovePopover
              value={value}
              actions={moveActions}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      </div>
      {warning && (
        <p role="status" className="text-xs text-crimson-soft">
          {warning}
        </p>
      )}
      {loadHistory && <MoneyHistory load={loadHistory} refreshKey={value} />}
    </div>
  );
}

function MovePopover({
  value,
  actions,
  onClose,
}: {
  value: number;
  actions: MoneyAction[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function run(action: MoneyAction) {
    const parsed = parseMoney(amount);
    if (parsed === null || parsed <= 0) {
      setError('Digite uma quantia maior que zero.');
      return;
    }
    if (action.sign < 0 && applyMoneyDelta(value, -parsed) === null) {
      setError(`Só tem ${formatUsd(value)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await action.run(parsed, reason.trim() || null);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Movimentar dinheiro"
      className="absolute right-0 top-full z-30 mt-1 w-[min(18rem,calc(100vw-2rem))] space-y-2 rounded-md border border-ink-border bg-ink-raised p-2 shadow-lg"
    >
      <label className="block space-y-1 text-xs text-ink-muted">
        Quantia
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          className="field min-h-11 w-full px-2 py-1 text-sm desk:min-h-8"
          placeholder="250,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-xs text-ink-muted">
        Motivo (opcional)
        <input
          type="text"
          maxLength={80}
          className="field min-h-11 w-full px-2 py-1 text-sm desk:min-h-8"
          placeholder="munição"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      <div className="grid grid-cols-2 gap-1">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={busy}
            className={
              'min-h-11 rounded-md border px-2 text-xs desk:min-h-8 ' +
              (action.sign < 0
                ? 'border-crimson/50 text-crimson-soft hover:bg-crimson/10'
                : 'border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/20')
            }
            onClick={() => void run(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MoneyHistory({
  load,
  refreshKey,
}: {
  load: () => Promise<MoneyLogEntry[] | null>;
  refreshKey: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<MoneyLogEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadRef.current().then((rows) => {
      if (cancelled) return;
      setFailed(rows === null);
      if (rows) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  return (
    <details
      className="text-xs text-ink-muted"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer py-1 hover:text-parchment">Ver histórico</summary>
      {failed && <p className="text-crimson-soft">Não foi possível carregar o histórico.</p>}
      {entries && entries.length === 0 && <p>Nenhuma movimentação ainda.</p>}
      {entries && entries.length > 0 && (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular-nums">{dateFormat.format(new Date(entry.created_at))}</span>
              <span className={'tabular-nums ' + (entry.delta < 0 ? 'text-crimson-soft' : 'text-emerald-400')}>
                {entry.delta < 0 ? '−' : '+'}
                {formatUsd(Math.abs(entry.delta))}
              </span>
              {entry.reason && <span className="text-parchment">{entry.reason}</span>}
              <span className="opacity-70">
                {entry.author_name}
                {entry.character_name ? ` · ${entry.character_name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
