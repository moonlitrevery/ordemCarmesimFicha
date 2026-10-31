'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { unlockAudio } from '@/lib/vtt/audio/unlock';
import { fetchTableSnapshot } from '@/lib/vtt/queries';
import { joinTableChannel, type TableChannel } from '@/lib/vtt/realtime';
import { useVttStore } from '@/lib/vtt/store';
import type { PendingAsset } from '@/lib/vtt/store';
import type { TableSnapshot } from '@/lib/vtt/types';
import { ApprovalPanel } from './ApprovalPanel';
import { LibraryPanel } from './LibraryPanel';
import { MembersPanel } from './MembersPanel';
import { PlayerUploadPanel } from './PlayerUploadPanel';
import { SidePanel, type SidePanelTab } from './SidePanel';

const TOAST_MS = 4000;

function Placeholder({ title }: { title: string }) {
  return (
    <p className="text-sm text-ink-muted">{title} chega em uma próxima fase.</p>
  );
}

const PLAYER_TABS: SidePanelTab[] = [
  { id: 'chat', label: 'Chat', content: <Placeholder title="O chat" /> },
  { id: 'docs', label: 'Docs', content: <Placeholder title="Os documentos" /> },
  {
    id: 'reports',
    label: 'Relatórios',
    content: <Placeholder title="Os relatórios" />,
  },
];

const GM_PLACEHOLDER_TABS: SidePanelTab[] = [
  { id: 'scenes', label: 'Cenas', content: <Placeholder title="As cenas" /> },
  { id: 'sound', label: 'Som', content: <Placeholder title="O som" /> },
  { id: 'fx', label: 'Efeitos', content: <Placeholder title="Os efeitos" /> },
];

export function VttShell({ initial }: { initial: TableSnapshot }) {
  const router = useRouter();
  const channelRef = useRef<TableChannel | null>(null);
  const initialRef = useRef(initial);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const sessionOpen = useVttStore((s) => s.sessionOpen);
  const online = useVttStore((s) => s.online);
  const connection = useVttStore((s) => s.connection);
  const audioUnlocked = useVttStore((s) => s.audioUnlocked);
  const setAudioUnlocked = useVttStore((s) => s.setAudioUnlocked);
  const setSessionOpen = useVttStore((s) => s.setSessionOpen);
  const pendingCount = useVttStore((s) => s.pendingAssets.length);
  const role = useVttStore((s) => s.me?.role) ?? initial.me.role;

  const [toast, setToast] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const { table, me } = initial;
  const tableId = table.id;
  const userId = me.userId;
  const isGm = me.role === 'mestre';

  useEffect(() => {
    const supabase = createClient();
    const store = useVttStore.getState();
    store.enterTable(initialRef.current);

    let disposed = false;
    let latestRefresh = 0;

    async function refresh() {
      const ticket = ++latestRefresh;
      try {
        const snapshot = await fetchTableSnapshot(supabase, tableId, userId);
        if (disposed || ticket !== latestRefresh) return;
        if (!snapshot) {
          // Removido ou banido: o RLS parou de mostrar a mesa.
          router.replace('/mesa');
          router.refresh();
          return;
        }
        useVttStore.getState().applySnapshot(snapshot);
      } catch {
        // Falha de rede: mantém o estado; o próximo SUBSCRIBED recarrega.
      }
    }
    refreshRef.current = refresh;

    let toastTimer: number | undefined;

    async function refreshPending(notify: boolean) {
      const { data, error } = await supabase
        .from('assets')
        .select('*, profiles(display_name)')
        .eq('status', 'pending')
        .order('created_at');
      if (disposed || error) return;
      const next = (data ?? []) as unknown as PendingAsset[];
      const known = new Set(
        useVttStore.getState().pendingAssets.map((asset) => asset.id)
      );
      useVttStore.getState().setPendingAssets(next);
      // Só avisa se o banco confirma item novo: o broadcast pode ser forjado.
      if (notify && next.some((asset) => !known.has(asset.id))) {
        setToast('Novo arquivo aguardando aprovação');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setToast(null), TOAST_MS);
      }
    }

    const channel = joinTableChannel(supabase, tableId, {
      userId,
      onOnline: (next) => useVttStore.getState().setOnline(next),
      onStatus: (next) => useVttStore.getState().setConnection(next),
      onSubscribed: () => {
        void refresh();
        if (isGm) void refreshPending(false);
      },
    });
    channelRef.current = channel;

    channel.on('session:state', () => void refresh());
    channel.on('member:changed', () => void refresh());
    if (isGm) channel.on('asset:pending', () => void refreshPending(true));

    const presenceOf = () => {
      const current = useVttStore.getState().me;
      return current
        ? {
            userId: current.userId,
            name: current.name,
            role: current.role,
            sceneId: current.sceneId,
          }
        : null;
    };
    const presence = presenceOf();
    if (presence) channel.track(presence);

    const unsubscribeMe = useVttStore.subscribe((state, prev) => {
      if (
        state.me &&
        (state.me.role !== prev.me?.role ||
          state.me.name !== prev.me?.name ||
          state.me.sceneId !== prev.me?.sceneId)
      ) {
        const next = presenceOf();
        if (next) channel.track(next);
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(toastTimer);
      unsubscribeMe();
      channel.leave();
      channelRef.current = null;
    };
  }, [tableId, userId, isGm, router]);

  const notifyMemberChanged = useCallback(async (changedId: string) => {
    channelRef.current?.emit({ type: 'member:changed', userId: changedId });
    await refreshRef.current();
  }, []);

  async function toggleSession() {
    const next = !sessionOpen;
    setSessionBusy(true);
    setSessionError(null);
    const { error } = await createClient()
      .from('tables')
      .update({ session_open: next })
      .eq('id', tableId);
    setSessionBusy(false);
    if (error) {
      setSessionError('Não foi possível alterar a sessão. Tente de novo.');
      return;
    }
    setSessionOpen(next);
    channelRef.current?.emit({ type: 'session:state', open: next });
  }

  function enterSession() {
    unlockAudio();
    setAudioUnlocked(true);
  }

  const gmTabs: SidePanelTab[] = [
    {
      id: 'members',
      label: 'Membros',
      content: (
        <MembersPanel tableId={tableId} onMemberChanged={notifyMemberChanged} />
      ),
    },
    { id: 'library', label: 'Biblioteca', content: <LibraryPanel /> },
    {
      id: 'approval',
      label: 'Aprovação',
      badge: pendingCount,
      content: <ApprovalPanel />,
    },
    ...GM_PLACEHOLDER_TABS,
  ];

  const rightTabs: SidePanelTab[] =
    role === 'jogador'
      ? [
          ...PLAYER_TABS,
          {
            id: 'upload',
            label: 'Enviar imagem',
            content: (
              <PlayerUploadPanel
                onUploaded={() =>
                  channelRef.current?.emit({ type: 'asset:pending' })
                }
              />
            ),
          },
        ]
      : PLAYER_TABS;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-parchment">
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-border bg-ink-raised px-2 py-1.5 sm:gap-3 sm:px-3">
        <Link
          href="/mesa"
          className="btn-ghost shrink-0 px-2 py-1 text-xs"
          aria-label="Voltar para Minhas mesas"
        >
          ←
        </Link>
        {isGm && (
          <button
            type="button"
            className="btn-ghost shrink-0 px-2 py-1 text-xs"
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen((v) => !v)}
          >
            Mestre
            {pendingCount > 0 && (
              <span className="rounded-full bg-crimson px-1.5 text-parchment">
                {pendingCount}
              </span>
            )}
          </button>
        )}
        <h1 className="min-w-0 truncate font-display text-lg leading-tight">
          {table.name}
        </h1>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
          <span
            className={
              'h-2 w-2 rounded-full ' +
              (sessionOpen ? 'bg-emerald-400' : 'bg-ink-border')
            }
            aria-hidden
          />
          <span className="hidden sm:inline">
            {sessionOpen ? 'Sessão aberta' : 'Sessão fechada'}
          </span>
        </span>
        {connection === 'offline' && (
          <span className="shrink-0 text-xs text-crimson-soft">Reconectando…</span>
        )}
        <ul
          className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden"
          aria-label={`${online.length} online`}
        >
          {online.map((person) => (
            <li
              key={person.userId}
              title={person.name}
              className="max-w-[7rem] shrink-0 truncate rounded-full border border-emerald-500/40 px-2 py-0.5 text-xs text-parchment"
            >
              {person.name}
            </li>
          ))}
        </ul>
        {isGm && (
          <button
            type="button"
            className={(sessionOpen ? 'btn-ghost' : 'btn-primary') + ' shrink-0 px-2 py-1 text-xs'}
            disabled={sessionBusy}
            onClick={() => void toggleSession()}
          >
            {sessionOpen ? 'Encerrar sessão' : 'Abrir sessão'}
          </button>
        )}
        <button
          type="button"
          className="btn-ghost shrink-0 px-2 py-1 text-xs"
          aria-expanded={rightOpen}
          onClick={() => setRightOpen((v) => !v)}
        >
          Painéis
        </button>
      </header>

      {sessionError && (
        <p className="shrink-0 bg-crimson/20 px-3 py-1 text-xs text-crimson-soft">
          {sessionError}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {(leftOpen || rightOpen) && (
          <button
            type="button"
            aria-label="Fechar painéis"
            className="absolute inset-0 z-20 bg-black/50 desk:hidden"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        )}

        {isGm && (
          <SidePanel
            side="left"
            label="Painel da mestra"
            open={leftOpen}
            tabs={gmTabs}
          />
        )}

        <div className="flex min-w-0 flex-1 items-center justify-center p-4 text-center">
          {isGm || sessionOpen ? (
            <div className="space-y-1 text-ink-muted">
              <p className="font-display text-2xl">O mapa aparece aqui</p>
              {isGm && !sessionOpen && (
                <p className="text-sm">
                  Sessão fechada: os jogadores ainda não veem o mapa.
                </p>
              )}
            </div>
          ) : (
            <p className="font-display text-2xl text-ink-muted">
              A sessão ainda não começou
            </p>
          )}
        </div>

        <SidePanel
          side="right"
          label="Chat, documentos e relatórios"
          open={rightOpen}
          tabs={rightTabs}
        />

        {toast && (
          <p
            role="status"
            className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-xs text-parchment"
          >
            {toast}
          </p>
        )}
      </div>

      {!audioUnlocked && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/95 p-4">
          <div className="space-y-4 text-center">
            <h2 className="font-display text-4xl text-parchment">{table.name}</h2>
            <p className="text-sm text-ink-muted">
              Um clique para liberar o som e o vídeo da sessão.
            </p>
            <button type="button" className="btn-primary" onClick={enterSession}>
              Entrar na sessão
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
