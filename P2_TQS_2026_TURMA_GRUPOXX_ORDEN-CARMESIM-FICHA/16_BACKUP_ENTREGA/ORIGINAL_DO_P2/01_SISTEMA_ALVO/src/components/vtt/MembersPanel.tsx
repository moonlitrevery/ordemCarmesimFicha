'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useVttStore } from '@/lib/vtt/store';
import type { TableMemberRole, VttMember } from '@/lib/vtt/types';
import { CopyCodeButton } from './CopyCodeButton';

const GENERIC_ERROR = 'Não foi possível salvar. Tente de novo.';

function TableCodeSection({ tableId }: { tableId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .rpc('get_my_table_codes')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError('Não foi possível carregar o código.');
          return;
        }
        const rows = (data ?? []) as { table_id: string; code: string }[];
        setCode(rows.find((r) => r.table_id === tableId)?.code ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  async function regenerate() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await createClient().rpc(
      'regenerate_table_code',
      { p_table: tableId }
    );
    setBusy(false);
    setConfirming(false);
    if (err) {
      setError('Não foi possível gerar outro código. Tente de novo.');
      return;
    }
    setCode(data as string);
  }

  return (
    <section className="space-y-2 rounded-md border border-ink-border p-3">
      <h3 className="label">Código da mesa</h3>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-lg tracking-[0.2em] text-parchment">
          {code ?? '······'}
        </span>
        {code && <CopyCodeButton code={code} />}
      </div>
      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            O código atual para de funcionar. Quem já é membro continua na mesa.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary px-2 py-1 text-xs"
              onClick={() => void regenerate()}
              disabled={busy}
            >
              {busy ? 'Gerando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => setConfirming(true)}
        >
          Gerar novo código
        </button>
      )}
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
    </section>
  );
}

function MemberRow({
  member,
  online,
  onChange,
  onDelete,
}: {
  member: VttMember;
  online: boolean;
  onChange: (patch: { role: TableMemberRole } | { banned: true }) => void;
  onDelete: () => void;
}) {
  const [confirmingBan, setConfirmingBan] = useState(false);

  return (
    <li className="space-y-2 rounded-md border border-ink-border p-2">
      <p className="flex items-center gap-2 text-sm text-parchment">
        <span
          className={
            'h-2 w-2 shrink-0 rounded-full ' +
            (online ? 'bg-emerald-400' : 'bg-ink-border')
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{member.name}</span>
        <span className="shrink-0 text-xs text-ink-muted">
          {online ? 'Online' : 'Offline'}
        </span>
      </p>
      {member.banned ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-crimson-soft">Banido</span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={onDelete}
          >
            Desbanir
          </button>
        </div>
      ) : confirmingBan ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-ink-muted">
            Banir {member.name}?
          </span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setConfirmingBan(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            onClick={() => onChange({ banned: true })}
          >
            Banir
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            className="field min-w-0 flex-1 px-2 py-1 text-xs"
            value={member.role}
            aria-label={`Papel de ${member.name}`}
            onChange={(e) =>
              onChange({ role: e.target.value as TableMemberRole })
            }
          >
            <option value="jogador">Jogador</option>
            <option value="espectador">Espectador</option>
          </select>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={onDelete}
          >
            Remover
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
            onClick={() => setConfirmingBan(true)}
          >
            Banir
          </button>
        </div>
      )}
    </li>
  );
}

export function MembersPanel({
  tableId,
  onMemberChanged,
}: {
  tableId: string;
  onMemberChanged: (userId: string) => Promise<void>;
}) {
  const members = useVttStore((s) => s.members);
  const online = useVttStore((s) => s.online);
  const [error, setError] = useState<string | null>(null);

  const onlineIds = new Set(online.map((p) => p.userId));

  async function updateMember(
    userId: string,
    patch: { role: TableMemberRole } | { banned: true }
  ) {
    setError(null);
    const { error: err } = await createClient()
      .from('table_members')
      .update(patch)
      .eq('table_id', tableId)
      .eq('user_id', userId);
    if (err) {
      setError(GENERIC_ERROR);
      return;
    }
    await onMemberChanged(userId);
  }

  async function deleteMember(userId: string) {
    setError(null);
    const { error: err } = await createClient()
      .from('table_members')
      .delete()
      .eq('table_id', tableId)
      .eq('user_id', userId);
    if (err) {
      setError(GENERIC_ERROR);
      return;
    }
    await onMemberChanged(userId);
  }

  return (
    <div className="space-y-3">
      <TableCodeSection tableId={tableId} />
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      {members.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Ninguém entrou ainda. Passe o código para os jogadores.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              online={onlineIds.has(member.userId)}
              onChange={(patch) => void updateMember(member.userId, patch)}
              onDelete={() => void deleteMember(member.userId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
