'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Images,
  Map as MapIcon,
  MessageSquare,
  ScrollText,
  Skull,
  Sparkles,
  Swords,
  UserRound,
  Volume2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AudioSync } from '@/lib/vtt/audio/audio-sync';
import { unlockAudio } from '@/lib/vtt/audio/unlock';
import { fetchTableSnapshot } from '@/lib/vtt/queries';
import { joinTableChannel, type TableChannel } from '@/lib/vtt/realtime';
import { ChatSync } from '@/lib/vtt/chat-sync';
import { InitiativeSync } from '@/lib/vtt/initiative-sync';
import { LibrarySync } from '@/lib/vtt/library-sync';
import { NpcSync } from '@/lib/vtt/npc-sync';
import { perfPanelOpened } from '@/lib/vtt/perf';
import { SceneSync } from '@/lib/vtt/scene-sync';
import { useVttStore } from '@/lib/vtt/store';
import type { PendingAsset } from '@/lib/vtt/store';
import type { TableSnapshot } from '@/lib/vtt/types';
import { CalibrationGuide } from './CalibrationGuide';
import { CaptionModal } from './CaptionModal';
import { ChatPanel } from './ChatPanel';
import { useIsDesk } from './hud';
import { InitiativePanel } from './InitiativePanel';
import { LibraryPanel } from './LibraryPanel';
import { MapToolbar } from './MapToolbar';
import { NpcLinkModal } from './NpcLinkModal';
import { NpcPanel } from './NpcPanel';
import {
  IconRail,
  PanelHost,
  RailBottomBar,
  type RailItem,
  type RailSide,
} from './PanelRail';
import { QuickSheet } from './QuickSheet';
import { ScaleChip } from './ScaleChip';
import { ScenesPanel } from './ScenesPanel';
import { SceneTransitionOverlay } from './SceneTransitionOverlay';
import { SceneViewBanner } from './SceneViewBanner';
import { SettingsMenu } from './SettingsMenu';
import { SoundPanel } from './SoundPanel';
import { TokenContextMenu } from './TokenContextMenu';
import { TopBar } from './TopBar';
import { WeatherPanel } from './WeatherPanel';

// ssr: false e import dinâmico: Pixi só existe no navegador e só nesta rota.
const MapCanvas = dynamic(
  () => import('./MapCanvas').then((module) => module.MapCanvas),
  { ssr: false }
);

function Placeholder({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted">{text}</p>;
}

const DOCS_ITEMS: RailItem[] = [
  {
    id: 'docs',
    label: 'Documentos',
    icon: FileText,
    content: <Placeholder text="Os documentos da mesa chegam na fase 8." />,
  },
  {
    id: 'reports',
    label: 'Relatórios',
    icon: ScrollText,
    content: <Placeholder text="Os relatórios chegam na fase 8." />,
  },
];

export function VttShell({ initial }: { initial: TableSnapshot }) {
  const router = useRouter();
  const channelRef = useRef<TableChannel | null>(null);
  const initialRef = useRef(initial);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const sessionOpen = useVttStore((s) => s.sessionOpen);
  const audioUnlocked = useVttStore((s) => s.audioUnlocked);
  const setAudioUnlocked = useVttStore((s) => s.setAudioUnlocked);
  const setSessionOpen = useVttStore((s) => s.setSessionOpen);
  const pendingCount = useVttStore((s) => s.pendingAssets.length);
  const role = useVttStore((s) => s.me?.role) ?? initial.me.role;

  const toast = useVttStore((s) => s.toast);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const chatUnread = useVttStore((s) => s.chatUnread);
  const conditionTip = useVttStore((s) => s.conditionTip);
  const lightModePrompt = useVttStore((s) => s.lightModePrompt);
  const setLightMode = useVttStore((s) => s.setLightMode);
  const isDesk = useIsDesk();
  const [openPanels, setOpenPanels] = useState<Record<RailSide, string | null>>({
    left: null,
    right: null,
  });
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
        if (isGm) void refreshPending(false);
      },
    });
    channelRef.current = channel;

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
    useVttStore.setState({
      audioSync: audio,
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
      useVttStore.setState({
        audioSync: null,
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

  const chatVisible = openPanels.right === 'chat';
  useEffect(() => {
    useVttStore.setState((s) => ({
      chatVisible,
      chatUnread: chatVisible ? 0 : s.chatUnread,
    }));
  }, [chatVisible]);

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

  /** Um por lado com mouse; no touch a folha cobre a tela, então um só no total. */
  function togglePanel(side: RailSide, id: string) {
    if (id === 'library') perfPanelOpened('painel da Biblioteca');
    setOpenPanels((current) => {
      const next = current[side] === id ? null : id;
      return isDesk
        ? { ...current, [side]: next }
        : { left: null, right: null, [side]: next };
    });
  }

  const closePanel = (side: RailSide) =>
    setOpenPanels((current) => ({ ...current, [side]: null }));

  // No touch a folha cobre o mapa: sai da frente para o toque que coloca o token.
  const onArmed = () => {
    if (!isDesk) setOpenPanels({ left: null, right: null });
  };

  const rightItems: RailItem[] = [
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      content: <ChatPanel />,
      badge: chatUnread,
      quietBadge: true,
    },
    // Espectador não tem ficha nem coloca nada no mapa.
    ...(role === 'espectador'
      ? []
      : [
          {
            id: 'sheet',
            label: 'Ficha Rápida',
            icon: UserRound,
            content: <QuickSheet />,
          },
          {
            id: 'library',
            label: 'Biblioteca',
            icon: Images,
            content: <LibraryPanel onArmed={onArmed} />,
            badge: isGm ? pendingCount : 0,
          },
        ]),
    // A mestra edita pelo trilho dela; aqui é só para ver.
    ...(isGm
      ? []
      : [
          {
            id: 'initiative',
            label: 'Iniciativa',
            icon: Swords,
            content: <InitiativePanel />,
          },
        ]),
    ...DOCS_ITEMS,
  ];

  const leftItems: RailItem[] = isGm
    ? [
        {
          id: 'scenes',
          label: 'Cenas',
          icon: MapIcon,
          content: <ScenesPanel />,
        },
        {
          id: 'npcs',
          label: 'NPCs',
          icon: Skull,
          content: <NpcPanel />,
        },
        {
          id: 'initiative',
          label: 'Iniciativa',
          icon: Swords,
          content: <InitiativePanel />,
        },
        {
          id: 'sound',
          label: 'Som',
          icon: Volume2,
          content: <SoundPanel />,
        },
        {
          id: 'fx',
          label: 'Efeitos de tela',
          icon: Sparkles,
          content: <WeatherPanel />,
        },
      ]
    : [];

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
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 pb-20 text-center">
            {isGm ? (
              <>
                <p className="max-w-sm text-sm text-ink-muted">
                  Nenhuma cena ainda — crie uma em Cenas,{' '}
                  {isDesk ? 'no trilho esquerdo' : 'na barra inferior'}.
                </p>
                <button
                  type="button"
                  className="btn-primary min-h-11 px-3 py-1 text-sm desk:min-h-0"
                  onClick={() => togglePanel('left', 'scenes')}
                >
                  Abrir Cenas
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-2xl text-ink-muted">
                  {sessionOpen
                    ? 'A mestra ainda não abriu uma cena'
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

      {isGm && (
        <>
          <IconRail
            side="left"
            items={leftItems}
            activeId={openPanels.left}
            onToggle={(id) => togglePanel('left', id)}
          />
          <PanelHost
            side="left"
            items={leftItems}
            activeId={openPanels.left}
            onClose={() => closePanel('left')}
          />
        </>
      )}
      <IconRail
        side="right"
        items={rightItems}
        activeId={openPanels.right}
        onToggle={(id) => togglePanel('right', id)}
      />
      <PanelHost
        side="right"
        items={rightItems}
        activeId={openPanels.right}
        onClose={() => closePanel('right')}
      />
      <RailBottomBar
        left={leftItems}
        right={rightItems}
        activeLeft={openPanels.left}
        activeRight={openPanels.right}
        onToggle={togglePanel}
      />

      {toast && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-16 left-1/2 z-40 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-center text-xs text-parchment desk:bottom-4"
        >
          {toast}
        </p>
      )}

      {lightModePrompt && (
        <div
          role="alertdialog"
          aria-label="Ativar modo leve?"
          className="absolute bottom-16 left-1/2 z-40 w-72 max-w-[calc(100vw-1rem)] -translate-x-1/2 space-y-2 rounded-md border border-ink-border bg-ink-raised p-3 text-xs text-parchment desk:bottom-4"
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
