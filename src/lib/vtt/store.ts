import { create } from 'zustand';
import type { Asset } from './assets/rules';
import type { TableSnapshot, VttMe, VttMember, VttPresence, VttTable } from './types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

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
  /** Ao entrar na mesa: zera tudo o que é da mesa anterior. */
  enterTable: (snapshot: TableSnapshot) => void;
  applySnapshot: (snapshot: TableSnapshot) => void;
  setOnline: (online: VttPresence[]) => void;
  setSessionOpen: (open: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setPendingAssets: (pendingAssets: PendingAsset[]) => void;
  bumpLibrary: () => void;
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
  enterTable: (snapshot) =>
    set({
      ...fromSnapshot(snapshot),
      online: [],
      audioUnlocked: false,
      connection: 'connecting',
      pendingAssets: [],
    }),
  applySnapshot: (snapshot) => set(fromSnapshot(snapshot)),
  setOnline: (online) => set({ online }),
  setSessionOpen: (sessionOpen) => set({ sessionOpen }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setConnection: (connection) => set({ connection }),
  setPendingAssets: (pendingAssets) => set({ pendingAssets }),
  bumpLibrary: () =>
    set((state) => ({ libraryVersion: state.libraryVersion + 1 })),
}));
