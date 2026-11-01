'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { userColor } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import type { VttPresence } from '@/lib/vtt/types';
import { FLOATING_PANEL, useDismiss } from './hud';
import { MembersPanel } from './MembersPanel';

const MAX_AVATARS = 6;

function Avatar({ person }: { person: VttPresence }) {
  return (
    <span
      className="group relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink text-xs font-semibold uppercase text-ink"
      style={{ backgroundColor: userColor(person.userId) }}
    >
      {person.name.slice(0, 1)}
      <span className="pointer-events-none absolute right-0 top-full z-40 mt-1.5 hidden whitespace-nowrap rounded-md border border-ink-border bg-ink-raised px-2 py-1 text-xs font-normal normal-case text-parchment desk:group-hover:block">
        {person.name}
      </span>
    </span>
  );
}

function OnlineAvatars({
  tableId,
  isGm,
  onMemberChanged,
}: {
  tableId: string;
  isGm: boolean;
  onMemberChanged: (userId: string) => Promise<void>;
}) {
  const online = useVttStore((s) => s.online);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const shown = online.slice(0, MAX_AVATARS);
  const extra = online.length - shown.length;
  const label = `${online.length} online`;

  const avatars = (
    <span className="flex items-center -space-x-1.5">
      {shown.map((person) => (
        <Avatar key={person.userId} person={person} />
      ))}
      {extra > 0 && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-ink-raised text-[10px] text-parchment">
          +{extra}
        </span>
      )}
    </span>
  );

  if (!isGm) {
    return (
      <div aria-label={label} className="flex min-h-11 items-center desk:min-h-0">
        {avatars}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`${label}. Abrir membros da mesa`}
        aria-expanded={open}
        title="Membros da mesa"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full desk:min-h-0"
        onClick={() => setOpen((value) => !value)}
      >
        {online.length > 0 ? (
          avatars
        ) : (
          <span className="text-xs text-ink-muted">Membros</span>
        )}
      </button>
      {open && (
        <div
          className={
            FLOATING_PANEL +
            ' absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl p-3'
          }
        >
          <MembersPanel tableId={tableId} onMemberChanged={onMemberChanged} />
        </div>
      )}
    </div>
  );
}

/** Fina e transparente: o mapa continua aparecendo atrás dela. */
export function TopBar({
  tableId,
  tableName,
  isGm,
  sessionBusy,
  onToggleSession,
  onMemberChanged,
}: {
  tableId: string;
  tableName: string;
  isGm: boolean;
  sessionBusy: boolean;
  onToggleSession: () => void;
  onMemberChanged: (userId: string) => Promise<void>;
}) {
  const sessionOpen = useVttStore((s) => s.sessionOpen);
  const connection = useVttStore((s) => s.connection);
  const sessionLabel = sessionOpen ? 'Sessão aberta' : 'Sessão fechada';

  return (
    <header className="pointer-events-none absolute inset-x-2 top-2 z-30 flex items-start justify-between gap-2">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-ink/60 pr-3">
        <Link
          href="/mesa"
          title="Voltar para Minhas mesas"
          aria-label="Voltar para Minhas mesas"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-parchment hover:bg-ink-raised desk:h-8 desk:w-8"
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="min-w-0 max-w-[10rem] truncate font-display text-base leading-tight text-parchment desk:max-w-[14rem]">
          {tableName}
        </h1>
        <span
          role="img"
          aria-label={sessionLabel}
          title={sessionLabel}
          className={
            'h-2 w-2 shrink-0 rounded-full ' +
            (sessionOpen ? 'bg-emerald-400' : 'bg-ink-muted')
          }
        />
        {connection === 'offline' && (
          <span className="shrink-0 text-xs text-crimson-soft">Reconectando…</span>
        )}
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-full bg-ink/60 px-1">
        <OnlineAvatars
          tableId={tableId}
          isGm={isGm}
          onMemberChanged={onMemberChanged}
        />
        {isGm && (
          <button
            type="button"
            disabled={sessionBusy}
            onClick={onToggleSession}
            className={
              (sessionOpen ? 'btn-ghost' : 'btn-primary') +
              ' min-h-11 whitespace-nowrap rounded-full px-3 py-1 text-xs desk:min-h-0'
            }
          >
            {sessionOpen ? 'Encerrar sessão' : 'Abrir sessão'}
          </button>
        )}
      </div>
    </header>
  );
}
