'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Minus, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { WeightBadge, WeightInput } from '@/components/character/WeightInput';
import { MoneyControl, type MoneyAction, type MoneyLogEntry } from '@/components/money/MoneyControl';
import { callMoneyRpc, type MoneyRpc, type RpcResult } from '@/lib/character-save';
import { createClient } from '@/lib/supabase/client';
import { useVttStore } from '@/lib/vtt/store';
import { QtyPrompt } from './QtyPrompt';

export interface PartyItem {
  id: string;
  name: string;
  qty: number;
  weight: number | null;
  note: string;
  added_by_name: string;
  created_at: string;
}

const ITEM_COLUMNS = 'id, name, qty, weight, note, added_by_name, created_at';
const SEARCH_FROM = 15;
const MAX_QTY = 9999;

const ICON_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-parchment disabled:opacity-40 desk:h-8 desk:w-8';

function toItem(row: Record<string, unknown>): PartyItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    qty: Number(row.qty) || 1,
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    note: String(row.note ?? ''),
    added_by_name: String(row.added_by_name ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

function upsertItem(list: PartyItem[], item: PartyItem): PartyItem[] {
  const index = list.findIndex((i) => i.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

/** Itens e caixa da party desta mesa, com realtime. RLS: só quem é da mesa vê. */
function useParty(tableId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<PartyItem[] | null>(null);
  const [cash, setCash] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [itemsRes, cashRes] = await Promise.all([
      supabase.from('party_items').select(ITEM_COLUMNS).eq('table_id', tableId).order('created_at'),
      supabase.from('party_cash').select('money').eq('table_id', tableId).maybeSingle(),
    ]);
    if (itemsRes.error || cashRes.error) {
      setError('Não foi possível carregar a party.');
      setItems((current) => current ?? []);
      return;
    }
    setError(null);
    setItems((itemsRes.data ?? []).map((row) => toItem(row as Record<string, unknown>)));
    setCash(Number(cashRes.data?.money ?? 0) || 0);
  }, [supabase, tableId]);

  useEffect(() => {
    const channel = supabase
      .channel(`party:${tableId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'party_items', filter: `table_id=eq.${tableId}` },
        ({ new: row }) => setItems((list) => upsertItem(list ?? [], toItem(row as Record<string, unknown>)))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'party_items', filter: `table_id=eq.${tableId}` },
        ({ new: row }) => setItems((list) => upsertItem(list ?? [], toItem(row as Record<string, unknown>)))
      )
      // DELETE não aceita filtro e só traz o id: o que não é desta lista é ignorado.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'party_items' }, ({ old }) => {
        const id = (old as { id?: string })?.id;
        if (id) setItems((list) => (list ? list.filter((i) => i.id !== id) : list));
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_cash', filter: `table_id=eq.${tableId}` },
        ({ new: row }) => {
          const money = (row as { money?: unknown })?.money;
          if (money !== undefined) setCash(Number(money) || 0);
        }
      )
      .subscribe((status) => {
        // Relê ao (re)conectar: o que mudou enquanto o canal estava fora.
        if (status === 'SUBSCRIBED') void reload();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, tableId, reload]);

  return { supabase, items, setItems, cash, setCash, error };
}

export function PartyPanel({
  tableId,
  canEdit,
  character,
  runBackpackRpc,
}: {
  tableId: string;
  /** Mestra e jogadores. Espectador só vê. */
  canEdit: boolean;
  /** Ficha escolhida na Ficha rápida: "Pegar pra mim", depositar e sacar vão pra ela. */
  character: { id: string; name: string; money: number } | null;
  runBackpackRpc: (fn: MoneyRpc, args: Record<string, unknown>) => Promise<RpcResult>;
}) {
  const { supabase, items, setItems, cash, setCash, error } = useParty(tableId);
  const showToast = useVttStore((s) => s.showToast);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [takeId, setTakeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    if (!items || !term) return items ?? [];
    return items.filter(
      (i) =>
        i.name.toLocaleLowerCase('pt-BR').includes(term) ||
        i.note.toLocaleLowerCase('pt-BR').includes(term)
    );
  }, [items, query]);

  async function cashMove(delta: number, reason: string | null, withCharacter: boolean) {
    const args = {
      p_table: tableId,
      p_delta: delta,
      p_reason: reason,
      p_character: withCharacter ? character?.id ?? null : null,
    };
    // Com ficha, passa pela Ficha rápida: ela grava o pendente e aplica a mochila nova.
    const result = withCharacter
      ? await runBackpackRpc('party_cash_move', args)
      : await callMoneyRpc(supabase, 'party_cash_move', args);
    if (!result.ok) {
      showToast(result.message);
      return false;
    }
    if (result.data.cash !== undefined) setCash(Number(result.data.cash) || 0);
    return true;
  }

  const cashActions: MoneyAction[] = [
    { label: '− Gastar', sign: -1, run: (amount, reason) => cashMove(-amount, reason, false) },
    { label: '+ Receber', sign: 1, run: (amount, reason) => cashMove(amount, reason, false) },
    ...(character
      ? [
          {
            label: `Sacar pra ${character.name}`,
            sign: -1 as const,
            run: (amount: number, reason: string | null) => cashMove(-amount, reason, true),
          },
          {
            label: `Depositar de ${character.name}`,
            sign: 1 as const,
            run: (amount: number, reason: string | null) => cashMove(amount, reason, true),
          },
        ]
      : []),
  ];

  const loadCashHistory = useCallback(async (): Promise<MoneyLogEntry[] | null> => {
    const { data, error: err } = await supabase
      .from('party_money_log')
      .select('id, created_at, delta, reason, author_name, character_name')
      .eq('table_id', tableId)
      .order('id', { ascending: false })
      .limit(20);
    if (err) return null;
    return (data ?? []).map((row) => ({ ...row, delta: Number(row.delta) }) as MoneyLogEntry);
  }, [supabase, tableId]);

  async function patchItem(item: PartyItem, patch: Partial<Pick<PartyItem, 'name' | 'qty' | 'weight' | 'note'>>) {
    setBusyId(item.id);
    const { data, error: err } = await supabase
      .from('party_items')
      .update(patch)
      .eq('id', item.id)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    setBusyId(null);
    if (err || !data) {
      showToast('Não foi possível salvar o item da party.');
      return false;
    }
    setItems((list) => upsertItem(list ?? [], toItem(data as Record<string, unknown>)));
    return true;
  }

  async function removeItem(item: PartyItem) {
    setBusyId(item.id);
    const { error: err } = await supabase.from('party_items').delete().eq('id', item.id);
    setBusyId(null);
    setConfirmId(null);
    if (err) {
      showToast('Não foi possível remover o item.');
      return;
    }
    setItems((list) => (list ? list.filter((i) => i.id !== item.id) : list));
  }

  async function take(item: PartyItem, qty: number) {
    if (!character) return;
    setBusyId(item.id);
    const result = await runBackpackRpc('party_take_item', {
      p_item: item.id,
      p_character: character.id,
      p_qty: qty,
    });
    setBusyId(null);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    setTakeId(null);
    setItems((list) =>
      list
        ? qty >= item.qty
          ? list.filter((i) => i.id !== item.id)
          : list.map((i) => (i.id === item.id ? { ...i, qty: i.qty - qty } : i))
        : list
    );
  }

  return (
    <div className="space-y-3">
      <MoneyControl
        compact
        label="Caixa (US$)"
        value={cash}
        onDelta={(delta, reason) => cashMove(delta, reason, false)}
        actions={cashActions}
        loadHistory={loadCashHistory}
        disabled={!canEdit}
      />

      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      {!canEdit && <p className="text-xs text-ink-muted">Espectador: dá pra ver, mas não mexer.</p>}

      {items && items.length > SEARCH_FROM && (
        <input
          type="search"
          className="field min-h-11 w-full px-2 py-1 text-sm desk:min-h-8"
          placeholder="Buscar na party"
          aria-label="Buscar item da party"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {items === null ? (
        <p className="text-xs text-ink-muted">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Inventário da party vazio. Adicione abaixo, ou mande da sua mochila.
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((item) => {
            const busy = busyId === item.id;
            return (
              <li key={item.id} className="rounded-md border border-ink-border/60">
                {editId === item.id ? (
                  <ItemEditor
                    item={item}
                    busy={busy}
                    onCancel={() => setEditId(null)}
                    onSave={async (patch) => {
                      if (await patchItem(item, patch)) setEditId(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-1 pl-2">
                      <div className="min-w-0 flex-1 py-1">
                        <p className="flex items-baseline justify-between gap-2 text-sm text-parchment">
                          <span className="truncate">
                            {item.name}
                            {item.qty > 1 && <span className="text-ink-muted"> ×{item.qty}</span>}
                          </span>
                          {item.weight !== null && (
                            <WeightBadge weight={item.weight} className="shrink-0 text-xs" />
                          )}
                        </p>
                        {item.note && <p className="break-words text-xs text-ink-muted">{item.note}</p>}
                        {item.added_by_name && (
                          <p className="text-[11px] text-ink-muted/80">por {item.added_by_name}</p>
                        )}
                      </div>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Diminuir ${item.name}`}
                            disabled={busy || item.qty <= 1}
                            onClick={() => void patchItem(item, { qty: item.qty - 1 })}
                          >
                            <Minus size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Aumentar ${item.name}`}
                            disabled={busy || item.qty >= MAX_QTY}
                            onClick={() => void patchItem(item, { qty: item.qty + 1 })}
                          >
                            <Plus size={14} aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
                        {character && (
                          <button
                            type="button"
                            disabled={busy}
                            className="flex min-h-11 items-center gap-1 rounded-md border border-ink-border px-2 text-xs text-parchment hover:border-crimson/60 desk:min-h-8"
                            onClick={() => {
                              if (item.qty > 1) setTakeId(takeId === item.id ? null : item.id);
                              else void take(item, 1);
                            }}
                          >
                            <UserRound size={12} aria-hidden />
                            Pegar pra mim
                          </button>
                        )}
                        <span className="flex-1" />
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label={`Editar ${item.name}`}
                          disabled={busy}
                          onClick={() => setEditId(item.id)}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        {confirmId === item.id ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="min-h-11 rounded-md border border-crimson/60 px-2 text-xs text-crimson-soft desk:min-h-8"
                            onClick={() => void removeItem(item)}
                          >
                            Remover mesmo
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={ICON_BUTTON + ' hover:text-crimson-soft'}
                            aria-label={`Remover ${item.name}`}
                            disabled={busy}
                            onClick={() => setConfirmId(item.id)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        )}
                      </div>
                    )}
                    {takeId === item.id && (
                      <QtyPrompt
                        max={item.qty}
                        busy={busy}
                        confirmLabel="Pegar"
                        onConfirm={(qty) => void take(item, qty)}
                        onCancel={() => setTakeId(null)}
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
          {visible.length === 0 && <li className="text-xs text-ink-muted">Nada com esse nome.</li>}
        </ul>
      )}

      {canEdit && (
        <AddPartyItem
          onAdd={async (draft) => {
            const { data, error: err } = await supabase
              .from('party_items')
              .insert({ table_id: tableId, ...draft })
              .select(ITEM_COLUMNS)
              .single();
            if (err || !data) {
              showToast('Não foi possível adicionar o item.');
              return false;
            }
            setItems((list) => upsertItem(list ?? [], toItem(data as Record<string, unknown>)));
            return true;
          }}
        />
      )}
    </div>
  );
}

type ItemDraft = Pick<PartyItem, 'name' | 'qty' | 'weight' | 'note'>;

function AddPartyItem({ onAdd }: { onAdd: (draft: ItemDraft) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [weight, setWeight] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onAdd({
      name: trimmed,
      qty: Math.max(1, Math.min(MAX_QTY, Math.trunc(Number(qty)) || 1)),
      weight,
      note: note.trim(),
    });
    setBusy(false);
    if (!ok) return;
    setName('');
    setQty('1');
    setWeight(null);
    setNote('');
    setResetKey((k) => k + 1);
  }

  return (
    <form onSubmit={submit} className="space-y-1 rounded-md border border-ink-border/60 p-2">
      <div className="flex gap-1">
        <input
          className="field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8"
          placeholder="Novo item da party"
          aria-label="Nome do item"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QTY}
          className="field min-h-11 w-14 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
          aria-label="Quantidade"
          title="Quantidade"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <WeightInput
          key={resetKey}
          className="field min-h-11 w-14 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
          placeholder="Peso"
          value={weight}
          onChange={setWeight}
        />
      </div>
      <div className="flex gap-1">
        <input
          className="field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8"
          placeholder="Observação (opcional)"
          aria-label="Observação"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary min-h-11 shrink-0 px-3 py-1 text-xs desk:min-h-8"
          disabled={!name.trim() || busy}
        >
          Adicionar
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">Peso aqui é só informativo: não conta pra carga de ninguém.</p>
    </form>
  );
}

function ItemEditor({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item: PartyItem;
  busy: boolean;
  onSave: (patch: ItemDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(String(item.qty));
  const [weight, setWeight] = useState<number | null>(item.weight);
  const [note, setNote] = useState(item.note);

  return (
    <form
      className="space-y-1 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onSave({
          name: name.trim(),
          qty: Math.max(1, Math.min(MAX_QTY, Math.trunc(Number(qty)) || 1)),
          weight,
          note: note.trim(),
        });
      }}
    >
      <div className="flex gap-1">
        <input
          className="field min-h-11 min-w-0 flex-1 px-2 py-1 text-sm desk:min-h-8"
          aria-label="Nome do item"
          maxLength={120}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QTY}
          className="field min-h-11 w-14 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
          aria-label="Quantidade"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <WeightInput
          className="field min-h-11 w-14 shrink-0 px-1 py-1 text-center text-sm desk:min-h-8"
          placeholder="Peso"
          value={weight}
          onChange={setWeight}
        />
      </div>
      <input
        className="field min-h-11 w-full px-2 py-1 text-sm desk:min-h-8"
        placeholder="Observação (opcional)"
        aria-label="Observação"
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end gap-1">
        <button type="button" className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-8" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="btn-primary flex min-h-11 items-center gap-1 px-3 py-1 text-xs desk:min-h-8"
        >
          <Check size={12} aria-hidden />
          Salvar
        </button>
      </div>
    </form>
  );
}
