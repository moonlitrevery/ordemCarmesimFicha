import { create } from 'zustand';
import type { TableSnapshot, VttMe, VttMember, VttPresence, VttTable } from './types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface VttState {
  table: VttTable | null;
  ownerName: string;
  me: VttMe | null;
  members: VttMember[];
  online: VttPresence[];
  sessionOpen: boolean;
  audioUnlocked: boolean;
  connection: ConnectionStatus;
  /** Ao entrar na mesa: zera tudo o que é da mesa anterior. */
  enterTable: (snapshot: TableSnapshot) => void;
  applySnapshot: (snapshot: TableSnapshot) => void;
  setOnline: (online: VttPresence[]) => void;
  setSessionOpen: (open: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
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
  enterTable: (snapshot) =>
    set({
      ...fromSnapshot(snapshot),
      online: [],
      audioUnlocked: false,
      connection: 'connecting',
    }),
  applySnapshot: (snapshot) => set(fromSnapshot(snapshot)),
  setOnline: (online) => set({ online }),
  setSessionOpen: (sessionOpen) => set({ sessionOpen }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setConnection: (connection) => set({ connection }),
}));
