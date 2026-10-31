import { create } from 'zustand';
import type { Asset } from './assets/rules';
import type { SceneSync } from './scene-sync';
import type {
  Drawing,
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

export type VttTool = 'select' | 'draw' | 'erase' | 'ruler' | 'ping';

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
  /** Sobe a cada mudança na biblioteca: o painel aberto recarrega a lista. */
  libraryVersion: number;
  /** Quem persiste e transmite as ações de cena. Existe enquanto a mesa está aberta. */
  sync: SceneSync | null;
  toast: string | null;

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
  /** "Anexar a…": o próximo clique em um token escolhe o pai deste objeto. */
  attachingId: string | null;
  /** Toque na lista e depois no mapa: arrastar de DOM não funciona bem no touch. */
  armedAsset: SceneAsset | null;
  calibrating: boolean;
  /** Fim do arraste de calibração: o modal pergunta quantos metros aquilo tem. */
  calibrationPixels: number | null;
  lightMode: boolean;

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
}

const TOAST_MS = 4000;
const LIGHT_MODE_KEY = 'vtt:light-mode';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** SPEC §7.4: escolha salva vale mais; sem escolha, liga em aparelho fraco. */
function initialLightMode(): boolean {
  try {
    const saved = window.localStorage.getItem(LIGHT_MODE_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Sem localStorage (janela anônima): segue a detecção.
  }
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
  sync: null,
  toast: null,
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
  attachingId: null,
  armedAsset: null,
  calibrating: false,
  calibrationPixels: null,
  lightMode: false,
  enterTable: (snapshot) =>
    set({
      ...fromSnapshot(snapshot),
      online: [],
      audioUnlocked: false,
      connection: 'connecting',
      pendingAssets: [],
      scenes: [],
      gmSceneChoice: null,
      viewedSceneId: null,
      objects: {},
      drawings: {},
      sceneAssets: {},
      placements: [],
      tool: 'select',
      selectedId: null,
      contextMenu: null,
      captionTargetId: null,
      attachingId: null,
      armedAsset: null,
      calibrating: false,
      calibrationPixels: null,
      lightMode: initialLightMode(),
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
    set({ lightMode });
    try {
      window.localStorage.setItem(LIGHT_MODE_KEY, lightMode ? '1' : '0');
    } catch {
      // Sem localStorage: vale só nesta visita.
    }
  },
}));
