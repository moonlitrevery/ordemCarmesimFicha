import { create } from 'zustand';
import type { Asset } from './assets/rules';
import type { AudioSync } from './audio/audio-sync';
import {
  DEFAULT_AUDIO_SETTINGS,
  parseAudioPrefs,
  type AmbientLayer,
  type AudioPrefs,
  type AudioSettings,
} from './audio/rules';
import type { ChatMessage } from './chat-rules';
import type { ChatSync } from './chat-sync';
import type { DocSync } from './docs/doc-sync';
import type { FogMode, FogShape } from './fog/mask';
import type { FogSync } from './fog/fog-sync';
import type { TableDocument, TableReport, ViewerTarget } from './docs/rules';
import type { LibrarySync } from './library-sync';
import { EMPTY_INITIATIVE, parseInitiative } from './initiative';
import type { InitiativeSync } from './initiative-sync';
import type { Npc } from './npc-rules';
import type { NpcSync } from './npc-sync';
import { userColor } from './scene-rules';
import type { SceneSync } from './scene-sync';
import type { SceneTransitionView } from './scene-transition';
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

export type VttTool = 'select' | 'pan' | 'draw' | 'erase' | 'ruler' | 'ping' | 'fog';

export const FOG_BRUSH_MIN = 8;
export const FOG_BRUSH_MAX = 400;

export interface PendingAsset extends Asset {
  profiles: { display_name: string } | null;
}

interface VttState {
  table: VttTable | null;
  ownerName: string;
  /** Só as cores escolhidas, lidas do banco. Sem linha aqui, vale `userColor`. */
  peopleColors: Record<string, string>;
  /** Cobre o mapa enquanto a cena troca. É local de cada cliente. */
  sceneTransition: SceneTransitionView | null;
  me: VttMe | null;
  members: VttMember[];
  online: VttPresence[];
  sessionOpen: boolean;
  audioUnlocked: boolean;
  audioSync: AudioSync | null;
  audioSettings: AudioSettings;
  /** Da cena vista. O jogador só recebe as camadas que são para ele. */
  ambientLayers: AmbientLayer[];
  /** Volume e mudo de quem está usando: só neste navegador. */
  audioPrefs: AudioPrefs;
  connection: ConnectionStatus;
  pendingAssets: PendingAsset[];
  /** Sobe a cada mudança na biblioteca: o `LibrarySync` relê a lista. */
  libraryVersion: number;
  /** `null` até a primeira carga. Abrir o painel só lê daqui. */
  library: Asset[] | null;
  libraryError: string | null;
  librarySync: LibrarySync | null;
  /** `null` até a primeira carga. O RLS só devolve o que a pessoa pode ver. */
  documents: TableDocument[] | null;
  reports: TableReport[] | null;
  docsError: string | null;
  docSync: DocSync | null;
  /** O arquivo aberto no visualizador, por cima da mesa. */
  docViewer: ViewerTarget | null;
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
  /** Ficha escolhida na Ficha Rápida: é quem rola, inclusive no /r. */
  rollCharacter: { id: string; name: string } | null;
  rollHidden: boolean;

  scenes: VttScene[];
  /** Cena aberta pela mestra para preparar. É local dela. */
  gmSceneChoice: string | null;
  /** Pastas das Páginas na ordem salva (`tables.scene_folders`). Só a mestra usa. */
  pageFolders: string[];
  /** Calibração salva em cada mapa (`map_calibrations`). `null` até a mestra carregar. */
  mapCalibrations: Record<string, number> | null;
  /** Overlay de Páginas aberto (só a mestra). */
  pagesOpen: boolean;
  viewedSceneId: string | null;
  objects: Record<string, SceneObject>;
  drawings: Record<string, Drawing>;
  sceneAssets: Record<string, SceneAsset>;
  placements: PendingPlacement[];

  tool: VttTool;
  strokeColor: string;
  strokeWidth: number;
  /** Seleção do canvas, na ordem em que entrou. Até 50 (`MAX_SELECTION`). */
  selectedIds: string[];
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

  /** Névoa da página vista (Fase 11). A máscara fica no `FogSync`, mutável, fora do React. */
  fogSync: FogSync | null;
  /** A página vista tem névoa ligada. */
  fogOn: boolean;
  /** Sobe a cada mudança da máscara: o canvas redesenha só o que mudou. */
  fogRev: number;
  /** Só da mestra, local: vê a névoa opaca e o que os jogadores não veem some. */
  fogPlayerView: boolean;
  fogShape: FogShape;
  fogMode: FogMode;
  /** Diâmetro do pincel em pixels de tela. */
  fogBrush: number;
  /** Fichas do jogador: o token vinculado a elas nunca some na névoa. */
  myCharacterIds: ReadonlySet<string>;

  /** Ao entrar na mesa: zera tudo o que é da mesa anterior. */
  enterTable: (snapshot: TableSnapshot) => void;
  applySnapshot: (snapshot: TableSnapshot) => void;
  setOnline: (online: VttPresence[]) => void;
  setSessionOpen: (open: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setAudioPrefs: (prefs: AudioPrefs) => void;
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
const AUDIO_PREFS_KEY = 'vtt:audio';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function savedLightMode(): string | null {
  try {
    return window.localStorage.getItem(LIGHT_MODE_KEY);
  } catch {
    // Sem localStorage (janela anônima): segue a detecção.
    return null;
  }
}

function savedAudioPrefs(): AudioPrefs {
  try {
    return parseAudioPrefs(window.localStorage.getItem(AUDIO_PREFS_KEY));
  } catch {
    return parseAudioPrefs(null);
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

function colorsOf(snapshot: TableSnapshot): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const member of snapshot.members) {
    if (member.color) colors[member.userId] = member.color;
  }
  if (snapshot.ownerColor) colors[snapshot.table.owner_id] = snapshot.ownerColor;
  return colors;
}

function fromSnapshot(snapshot: TableSnapshot) {
  return {
    table: snapshot.table,
    ownerName: snapshot.ownerName,
    peopleColors: colorsOf(snapshot),
    me: snapshot.me,
    members: snapshot.members,
    sessionOpen: snapshot.table.session_open,
  };
}

export const useVttStore = create<VttState>((set) => ({
  table: null,
  ownerName: '',
  peopleColors: {},
  sceneTransition: null,
  me: null,
  members: [],
  online: [],
  sessionOpen: false,
  audioUnlocked: false,
  audioSync: null,
  audioSettings: DEFAULT_AUDIO_SETTINGS,
  ambientLayers: [],
  audioPrefs: parseAudioPrefs(null),
  connection: 'connecting',
  pendingAssets: [],
  libraryVersion: 0,
  library: null,
  libraryError: null,
  librarySync: null,
  documents: null,
  reports: null,
  docsError: null,
  docSync: null,
  docViewer: null,
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
  rollCharacter: null,
  rollHidden: false,
  scenes: [],
  gmSceneChoice: null,
  pageFolders: [],
  mapCalibrations: null,
  pagesOpen: false,
  viewedSceneId: null,
  objects: {},
  drawings: {},
  sceneAssets: {},
  placements: [],
  tool: 'select',
  strokeColor: '#e0525f',
  strokeWidth: 4,
  selectedIds: [],
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
  fogSync: null,
  fogOn: false,
  fogRev: 0,
  fogPlayerView: false,
  fogShape: 'brush',
  fogMode: 'reveal',
  fogBrush: 64,
  myCharacterIds: new Set<string>(),
  enterTable: (snapshot) =>
    set({
      ...fromSnapshot(snapshot),
      sceneTransition: null,
      initiative: parseInitiative(snapshot.table.initiative),
      npcs: {},
      npcError: null,
      online: [],
      audioUnlocked: false,
      audioSettings: DEFAULT_AUDIO_SETTINGS,
      ambientLayers: [],
      audioPrefs: savedAudioPrefs(),
      connection: 'connecting',
      pendingAssets: [],
      library: null,
      libraryError: null,
      documents: null,
      reports: null,
      docsError: null,
      docViewer: null,
      chatMessages: [],
      chatHasMore: false,
      chatError: null,
      chatUnread: 0,
      chatVisible: false,
      rollCharacter: null,
      rollHidden: false,
      scenes: [],
      gmSceneChoice: null,
      pageFolders: [],
      mapCalibrations: null,
      pagesOpen: false,
      viewedSceneId: null,
      objects: {},
      drawings: {},
      sceneAssets: {},
      placements: [],
      // Espectador não seleciona nada: o que sobra para arrastar é o mapa.
      tool: snapshot.me.role === 'espectador' ? 'pan' : 'select',
      selectedIds: [],
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
      fogOn: false,
      fogPlayerView: false,
      myCharacterIds: new Set<string>(),
    }),
  applySnapshot: (snapshot) => set(fromSnapshot(snapshot)),
  setOnline: (online) => set({ online }),
  setSessionOpen: (sessionOpen) => set({ sessionOpen }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setAudioPrefs: (audioPrefs) => {
    set({ audioPrefs });
    try {
      window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs));
    } catch {
      // Sem localStorage: vale só nesta visita.
    }
  },
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
      selectedIds: [],
      armedAsset: null,
      attachingId: null,
      tool: 'select',
    }),
  cancelCalibration: () => set({ calibrating: false, calibrationPixels: null }),
}));

/** A cor da pessoa fora do React (ping, régua). */
export function personColor(userId: string): string {
  return useVttStore.getState().peopleColors[userId] ?? userColor(userId);
}

/** O único selecionado, para o que só faz sentido com um (alças, legenda, anexar). */
export function soleSelectedId(state: { selectedIds: string[] }): string | null {
  return state.selectedIds.length === 1 ? state.selectedIds[0] : null;
}
