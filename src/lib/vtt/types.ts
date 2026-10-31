export type TableMemberRole = 'jogador' | 'espectador';

export type TableRole = 'mestre' | TableMemberRole;

export interface InitiativeState {
  entries: unknown[];
  current: number;
  round: number;
}

/** Sem `code`: a coluna só é lida pela mestra, via get_my_table_codes. */
export interface VttTable {
  id: string;
  name: string;
  owner_id: string;
  session_open: boolean;
  default_scene_id: string | null;
  initiative: InitiativeState;
  created_at: string;
}

export interface VttMember {
  userId: string;
  name: string;
  role: TableMemberRole;
  sceneId: string | null;
  banned: boolean;
  joinedAt: string;
}

export interface VttMe {
  userId: string;
  name: string;
  role: TableRole;
  sceneId: string | null;
}

export interface VttPresence {
  userId: string;
  name: string;
  role: TableRole;
  sceneId: string | null;
}

export interface TableSnapshot {
  table: VttTable;
  ownerName: string;
  members: VttMember[];
  me: VttMe;
}
