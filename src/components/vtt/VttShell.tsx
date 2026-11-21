'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AudioSync } from '@/lib/vtt/audio/audio-sync';
import { unlockAudio } from '@/lib/vtt/audio/unlock';
import { fetchTableSnapshot } from '@/lib/vtt/queries';
import { joinTableChannel, type TableChannel } from '@/lib/vtt/realtime';
import { ChatSync } from '@/lib/vtt/chat-sync';
import { DocSync } from '@/lib/vtt/docs/doc-sync';
import { FogSync } from '@/lib/vtt/fog/fog-sync';
import { InitiativeSync } from '@/lib/vtt/initiative-sync';
import { LibrarySync } from '@/lib/vtt/library-sync';
import { NpcSync } from '@/lib/vtt/npc-sync';
import { SceneSync } from '@/lib/vtt/scene-sync';
import { useVttStore } from '@/lib/vtt/store';
import type { PendingAsset } from '@/lib/vtt/store';
import type { TableSnapshot } from '@/lib/vtt/types';
import { isTypingTarget } from '@/lib/vtt/ui-prefs';
import { CalibrationGuide } from './CalibrationGuide';
import { CaptionModal } from './CaptionModal';
import { MapToolbar } from './MapToolbar';
import { NpcLinkModal } from './NpcLinkModal';
import { RightSidebar } from './RightSidebar';
import { ScaleChip } from './ScaleChip';
import { SceneTransitionOverlay } from './SceneTransitionOverlay';
import { SceneViewBanner } from './SceneViewBanner';
import { SettingsMenu } from './SettingsMenu';
import { TokenContextMenu } from './TokenContextMenu';
import { TopBar } from './TopBar';

// ssr: false e import dinâmico: Pixi só existe no navegador e só nesta rota.
const MapCanvas = dynamic(
  () => import('./MapCanvas').then((module) => module.MapCanvas),
  { ssr: false }
);

// Só baixa quando alguém abre um arquivo; as libs de cada formato vêm depois, por dentro.
const DocumentViewer = dynamic(
  () => import('./docs/DocumentViewer').then((module) => module.DocumentViewer),
  { ssr: false }
);

// Só da mestra, e só baixa quando ela abre Páginas pela primeira vez.
const PagesOverlay = dynamic(
  () => import('./pages/PagesOverlay').then((module) => module.PagesOverlay),
  { ssr: false }
);

export function VttShell({ initial }: { initial: TableSnapshot }) {
  const router = useRouter();
  const channelRef = useRef<TableChannel | null>(null);
  const initialRef = useRef(initial);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const sessionOpen = useVttStore((s) => s.sessionOpen);
  const audioUnlocked = useVttStore((s) => s.audioUnlocked);
  const setAudioUnlocked = useVttStore((s) => s.setAudioUnlocked);
  const setSessionOpen = useVttStore((s) => s.setSessionOpen);
  const docViewerOpen = useVttStore((s) => s.docViewer !== null);
  const role = useVttStore((s) => s.me?.role) ?? initial.me.role;

  const toast = useVttStore((s) => s.toast);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const pagesOpen = useVttStore((s) => s.pagesOpen);
  const conditionTip = useVttStore((s) => s.conditionTip);
  const lightModePrompt = useVttStore((s) => s.lightModePrompt);
  const setLightMode = useVttStore((s) => s.setLightMode);
  const [sessionBusy, setSessionBusy] = useState(false);

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
        useVttStore.getState().showToast('Novo arquivo aguardando aprovação');
      }
    }

    let sync: SceneSync | null = null;
    let initiative: InitiativeSync | null = null;
    let npcs: NpcSync | null = null;
    let library: LibrarySync | null = null;
    let audio: AudioSync | null = null;
    let docs: DocSync | null = null;

    const channel = joinTableChannel(supabase, tableId, {
      userId,
      onOnline: (next) => useVttStore.getState().setOnline(next),
      onStatus: (next) => useVttStore.getState().setConnection(next),
      onSubscribed: () => {
        void refresh().then(() => sync?.reload());
        void initiative?.reload();
        void npcs?.reload();
        void audio?.reload();
        // A primeira carga é do `start`; aqui é só ao reconectar.
        if (useVttStore.getState().library) void library?.load();
        if (useVttStore.getState().documents) void docs?.load(false);
        if (isGm) void refreshPending(false);
      },
    });
    channelRef.current = channel;

    // Antes da primeira leitura da página: a névoa vem junto com ela.
    const fog = new FogSync(supabase, tableId, isGm);
    fog.start();
    useVttStore.setState({ fogSync: fog });
    // O token vinculado a uma ficha do jogador nunca some na névoa. O RLS só devolve as dele.
    if (!isGm) {
      void supabase
        .from('characters')
        .select('id')
        .eq('owner_id', userId)
        .then(({ data }) => {
          if (disposed || !data) return;
          useVttStore.setState({ myCharacterIds: new Set(data.map((row: { id: string }) => row.id)) });
        });
    }

    sync = new SceneSync(supabase, channel, tableId, userId);
    sync.start();
    const chat = new ChatSync(supabase, tableId, userId);
    chat.start();
    initiative = new InitiativeSync(supabase, channel, tableId);
    initiative.start();
    // Jogador nem tenta: o RLS não devolveria nada.
    if (isGm) {
      npcs = new NpcSync(supabase, channel, tableId);
      npcs.start();
      void npcs.reload();
    }
    library = new LibrarySync(supabase, channel, isGm);
    library.start();
    audio = new AudioSync(supabase, channel, tableId, userId);
    audio.start();
    docs = new DocSync(supabase, channel, tableId, isGm);
    docs.start();
    useVttStore.setState({
      audioSync: audio,
      docSync: docs,
      sync,
      chat,
      initiativeSync: initiative,
      npcSync: npcs,
      librarySync: library,
    });
    void sync.reload();

    channel.on('session:state', () => void refresh());
    channel.on('member:changed', () => void refresh());
    channel.on('table:refresh', () => void refresh());
    // Nesta ordem: o RLS já mostra só a cena nova, e com a padrão antiga no store
    // o jogador cairia em "sem cena" (o canvas desmonta) antes de chegar nela.
    channel.on('scene:assign', () => {
      void refresh().then(() => sync?.reload());
    });
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
      unsubscribeMe();
      sync?.stop();
      chat.stop();
      initiative?.stop();
      npcs?.stop();
      library?.stop();
      audio?.stop();
      docs?.stop();
      fog.stop();
      useVttStore.setState({
        fogSync: null,
        audioSync: null,
        docSync: null,
        docViewer: null,
        librarySync: null,
        sync: null,
        chat: null,
        initiativeSync: null,
        npcSync: null,
      });
      channel.leave();
      channelRef.current = null;
    };
  }, [tableId, userId, isGm, router]);

  // P abre e fecha Páginas (só a mestra). Não vale em campo de texto nem com Ctrl/Alt.
  useEffect(() => {
    if (!isGm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      useVttStore.setState((s) => ({ pagesOpen: !s.pagesOpen }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGm]);

  const notifyMemberChanged = useCallback(async (changedId: string) => {
    channelRef.current?.emit({ type: 'member:changed', userId: changedId });
    await refreshRef.current();
  }, []);

  async function toggleSession() {
    const next = !sessionOpen;
    setSessionBusy(true);
    const { error } = await createClient()
      .from('tables')
      .update({ session_open: next })
      .eq('id', tableId);
    setSessionBusy(false);
    if (error) {
      useVttStore
        .getState()
        .showToast('Não foi possível alterar a sessão. Tente de novo.');
      return;
    }
    setSessionOpen(next);
    channelRef.current?.emit({ type: 'session:state', open: next });
  }

  function enterSession() {
    unlockAudio();
    useVttStore.getState().audioSync?.unlock();
    setAudioUnlocked(true);
  }


  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink text-parchment">
      <main className="absolute inset-0">
        {viewedSceneId ? (
          <>
            <MapCanvas key={tableId} />
            <SceneTransitionOverlay />
            <SceneViewBanner />
            <MapToolbar />
            <ScaleChip />
            <CalibrationGuide />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 pr-[calc(var(--vtt-right,0px)_+_1rem)] text-center">
            {isGm ? (
              <>
                <p className="max-w-sm text-sm text-ink-muted">
                  Nenhuma página ainda. Crie uma em Páginas, logo abaixo do nome da mesa (atalho P).
                </p>
                <button
                  type="button"
                  className="btn-primary min-h-11 px-3 py-1 text-sm desk:min-h-0"
                  onClick={() => useVttStore.setState({ pagesOpen: true })}
                >
                  Abrir Páginas
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-2xl text-ink-muted">
                  {sessionOpen
                    ? 'A mestra ainda não abriu uma página'
                    : 'A sessão ainda não começou'}
                </p>
                <p className="max-w-sm text-sm text-ink-muted">
                  O mapa aparece aqui sozinho. Enquanto isso, o chat já funciona.
                </p>
              </>
            )}
          </div>
        )}
        <CaptionModal />
        <NpcLinkModal />
      </main>

      <TopBar
        tableId={tableId}
        tableName={table.name}
        isGm={isGm}
        sessionBusy={sessionBusy}
        onToggleSession={() => void toggleSession()}
        onMemberChanged={notifyMemberChanged}
      />

      <SettingsMenu />

      <RightSidebar isGm={isGm} canUseSheet={role !== 'espectador'} />

      {isGm && pagesOpen && <PagesOverlay />}

      {toast && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-16 left-[calc((100%_-_var(--vtt-right,0px))/2)] z-40 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-center text-xs text-parchment desk:bottom-4"
        >
          {toast}
        </p>
      )}

      {lightModePrompt && (
        <div
          role="alertdialog"
          aria-label="Ativar modo leve?"
          className="absolute bottom-16 left-[calc((100%_-_var(--vtt-right,0px))/2)] z-40 w-72 max-w-[calc(100vw-1rem)] -translate-x-1/2 space-y-2 rounded-md border border-ink-border bg-ink-raised p-3 text-xs text-parchment desk:bottom-4"
        >
          <p>O mapa está travando. Ativar modo leve? Dá para mudar depois em ⋯, no canto.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
              onClick={() => useVttStore.setState({ lightModePrompt: false })}
            >
              Agora não
            </button>
            <button
              type="button"
              className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-0"
              onClick={() => setLightMode(true)}
            >
              Ativar
            </button>
          </div>
        </div>
      )}

      {conditionTip && (
        <p
          role="tooltip"
          className="pointer-events-none fixed z-40 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border border-ink-border bg-ink-raised px-2 py-1 text-xs text-parchment"
          style={{ left: conditionTip.x, top: conditionTip.y - 12 }}
        >
          {conditionTip.text}
        </p>
      )}

      <TokenContextMenu />

      {docViewerOpen && <DocumentViewer />}

      {!audioUnlocked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/95 p-4">
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
