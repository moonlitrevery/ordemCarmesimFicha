import { create } from 'zustand';
import type { Asset } from './assets/rules';
import type { ChatMessage } from './chat-rules';
import type { ChatSync } from './chat-sync';
import type { LibrarySync } from './library-sync';
import { EMPTY_INITIATIVE, parseInitiative } from './initiative';
import type { InitiativeSync } from './initiative-sync';
import type { Npc } from './npc-rules';
import type { NpcSync } from './npc-sync';
import type { SceneSync } from './scene-sync';
import type {
  Drawing,
  InitiativeState,
  PendingPlacement,
  SceneAsset,
  SceneObject,
  TableSnapshot,
  VttMe,
  VttMember,
  VttPresence,
  VttScene,
  VttTable,
} from './types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export type VttTool = 'select' | 'pan' | 'draw' | 'erase' | 'ruler' | 'ping';

export interface PendingAsset extends Asset {
  profiles: { display_name: string } | null;
}

interface VttState {
  table: VttTable | null;
  ownerName: string;
  me: VttMe | null;
  members: VttMember[];
  online: VttPresence[];
  sessionOpen: boolean;
  audioUnlocked: boolean;
  connection: ConnectionStatus;
  pendingAssets: PendingAsset[];
  /** Sobe a cada mudança na biblioteca: o `LibrarySync` relê a lista. */
  libraryVersion: number;
  /** `null` até a primeira carga. Abrir o painel só lê daqui. */
  library: Asset[] | null;
  libraryError: string | null;
  librarySync: LibrarySync | null;
  /** Quem persiste e transmite as ações de cena. Existe enquanto a mesa está aberta. */
  sync: SceneSync | null;
  chat: ChatSync | null;
  initiativeSync: InitiativeSync | null;
  /** Só da mestra: para os outros fica nulo, e o RLS não devolveria nada. */
  npcSync: NpcSync | null;
  toast: string | null;

  /** Fora de `table`: quem escreve é só o `InitiativeSync`, não o snapshot da mesa. */
  initiative: InitiativeState;
  npcs: Record<string, Npc>;
  npcError: string | null;

  chatMessages: ChatMessage[];
  chatHasMore: boolean;
  chatError: string | null;
  chatUnread: number;
  /** Painel aberto na aba do chat: mensagem nova já está sendo vista. */
  chatVisible: boolean;
  chatCharacterNames: { owner_id: string; name: string }[];
  /** Ficha escolhida na Ficha Rápida: é quem rola, inclusive no /r. */
  rollCharacter: { id: string; name: string } | null;
  rollHidden: boolean;

  scenes: VttScene[];
  /** Cena aberta pela mestra para preparar. É local dela. */
  gmSceneChoice: string | null;
  viewedSceneId: string | null;
  objects: Record<string, SceneObject>;
  drawings: Record<string, Drawing>;
  sceneAssets: Record<string, SceneAsset>;
  placements: PendingPlacement[];

  tool: VttTool;
  strokeColor: string;
  strokeWidth: number;
  selectedId: string | null;
  contextMenu: { id: string; x: number; y: number } | null;
  captionTargetId: string | null;
  npcLinkTargetId: string | null;
  /** Nome da condição sob o mouse ou o dedo, em coordenadas da janela. */
  conditionTip: { text: string; x: number; y: number } | null;
  /** "Anexar a…": o próximo clique em um token escolhe o pai deste objeto. */
  attachingId: string | null;
  /** Toque na lista e depois no mapa: arrastar de DOM não funciona bem no touch. */
  armedAsset: SceneAsset | null;
  calibrating: boolean;
  /** Fim do arraste de calibração: o guia pergunta quantos metros aquilo tem. */
  calibrationPixels: number | null;
  lightMode: boolean;
  /** FPS baixo com efeito ligado: pergunta uma vez por visita (SPEC §7.4). */
  lightModePrompt: boolean;
  lightModeAsked: boolean;
  canUndo: boolean;
  canRedo: boolean;

  /** Ao entrar na mesa: zera tudo o que é da mesa anterior. */
  enterTable: (snapshot: TableSnapshot) => void;
  applySnapshot: (snapshot: TableSnapshot) => void;
  setOnline: (online: VttPresence[]) => void;
  setSessionOpen: (open: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setPendingAssets: (pendingAssets: PendingAsset[]) => void;
  bumpLibrary: () => void;
  showToast: (text: string) => void;
  setLightMode: (on: boolean) => void;
  askLightMode: () => void;
  startCalibration: () => void;
  cancelCalibration: () => void;
}

const TOAST_MS = 4000;
const LIGHT_MODE_KEY = 'vtt:light-mode';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function savedLightMode(): string | null {
  try {
    return window.localStorage.getItem(LIGHT_MODE_KEY);
  } catch {
    // Sem localStorage (janela anônima): segue a detecção.
    return null;
  }
}

/** SPEC §7.4: escolha salva vale mais; sem escolha, liga em aparelho fraco. */
function initialLightMode(): boolean {
  const saved = savedLightMode();
  if (saved !== null) return saved === '1';
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
  );
}

function fromSnapshot(snapshot: TableSnapshot) {
  return {
    table: snapshot.table,
    ownerName: snapshot.ownerName,
    me: snapshot.me,
    members: snapshot.members,
    sessionOpen: snapshot.table.session_open,
  };
}

export const useVttStore = create<VttState>((set) => ({
  table: null,
  ownerName: '',
  me: null,
  members: [],
  online: [],
  sessionOpen: false,
  audioUnlocked: false,
  connection: 'connecting',
  pendingAssets: [],
  libraryVersion: 0,
  library: null,
  libraryError: null,
  librarySync: null,
  sync: null,
  chat: null,
  initiativeSync: null,
  npcSync: null,
  toast: null,
  initiative: EMPTY_INITIATIVE,
  npcs: {},
  npcError: null,
  chatMessages: [],
  chatHasMore: false,
  chatError: null,
  chatUnread: 0,
  chatVisible: false,
  chatCharacterNames: [],
  rollCharacter: null,
  rollHidden: false,
  scenes: [],
  gmSceneChoice: null,
  viewedSceneId: null,
  objects: {},
  drawings: {},
  sceneAssets: {},
  placements: [],
  tool: 'select',
  strokeColor: '#e0525f',
  strokeWidth: 4,
  selectedId: null,
  contextMenu: null,
  captionTargetId: null,
  npcLinkTargetId: null,
  conditionTip: null,
  attachingId: null,
  armedAsset: null,
  calibrating: false,
  calibrationPixels: null,
  lightMode: false,
  lightModePrompt: false,
  lightModeAsked: false,
  canUndo: false,
  canRedo: false,
  enterTable: (snapshot) =>
    set({
      ...fromSnapshot(snapshot),
      initiative: parseInitiative(snapshot.table.initiative),
      npcs: {},
      npcError: null,
      online: [],
      audioUnlocked: false,
      connection: 'connecting',
      pendingAssets: [],
      library: null,
      libraryError: null,
      chatMessages: [],
      chatHasMore: false,
      chatError: null,
      chatUnread: 0,
      chatVisible: false,
      chatCharacterNames: [],
      rollCharacter: null,
      rollHidden: false,
      scenes: [],
      gmSceneChoice: null,
      viewedSceneId: null,
      objects: {},
      drawings: {},
      sceneAssets: {},
      placements: [],
      // Espectador não seleciona nada: o que sobra para arrastar é o mapa.
      tool: snapshot.me.role === 'espectador' ? 'pan' : 'select',
      selectedId: null,
      contextMenu: null,
      captionTargetId: null,
      npcLinkTargetId: null,
      conditionTip: null,
      attachingId: null,
      armedAsset: null,
      calibrating: false,
      calibrationPixels: null,
      lightMode: initialLightMode(),
      lightModePrompt: false,
      lightModeAsked: false,
      canUndo: false,
      canRedo: false,
    }),
  applySnapshot: (snapshot) => set(fromSnapshot(snapshot)),
  setOnline: (online) => set({ online }),
  setSessionOpen: (sessionOpen) => set({ sessionOpen }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setConnection: (connection) => set({ connection }),
  setPendingAssets: (pendingAssets) => set({ pendingAssets }),
  bumpLibrary: () =>
    set((state) => ({ libraryVersion: state.libraryVersion + 1 })),
  showToast: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_MS);
  },
  setLightMode: (lightMode) => {
    set({ lightMode, lightModePrompt: false });
    try {
      window.localStorage.setItem(LIGHT_MODE_KEY, lightMode ? '1' : '0');
    } catch {
      // Sem localStorage: vale só nesta visita.
    }
  },
  // Quem já escolheu no menu não é perguntado de novo.
  askLightMode: () =>
    set((state) =>
      state.lightMode || state.lightModeAsked || savedLightMode() !== null
        ? state
        : { lightModePrompt: true, lightModeAsked: true }
    ),
  startCalibration: () =>
    set({
      calibrating: true,
      calibrationPixels: null,
      selectedId: null,
      armedAsset: null,
      attachingId: null,
      tool: 'select',
    }),
  cancelCalibration: () => set({ calibrating: false, calibrationPixels: null }),
}));
