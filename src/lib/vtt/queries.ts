import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TableMemberRole,
  TableSnapshot,
  VttMember,
  VttTable,
} from './types';

export const TABLE_COLUMNS =
  'id, name, owner_id, session_open, default_scene_id, initiative, created_at';

type MemberRow = {
  user_id: string;
  role: TableMemberRole;
  scene_id: string | null;
  banned: boolean;
  joined_at: string;
  profiles: { display_name: string } | null;
};

/**
 * Lê o estado da mesa. `null` = o RLS não deixa este usuário ver a mesa
 * (não é membro, foi removido ou banido); falha de rede lança erro.
 */
export async function fetchTableSnapshot(
  supabase: SupabaseClient,
  tableId: string,
  userId: string
): Promise<TableSnapshot | null> {
  const { data: tableRow, error: tableErr } = await supabase
    .from('tables')
    .select(TABLE_COLUMNS)
    .eq('id', tableId)
    .maybeSingle();
  if (tableErr) {
    // 22P02: id da URL não é um uuid válido
    if (tableErr.code === '22P02') return null;
    throw tableErr;
  }
  if (!tableRow) return null;
  const table = tableRow as unknown as VttTable;

  const [membersRes, ownerRes] = await Promise.all([
    supabase
      .from('table_members')
      .select('user_id, role, scene_id, banned, joined_at, profiles(display_name)')
      .eq('table_id', tableId)
      .order('joined_at'),
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', table.owner_id)
      .maybeSingle(),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (ownerRes.error) throw ownerRes.error;

  const members: VttMember[] = (
    (membersRes.data ?? []) as unknown as MemberRow[]
  ).map((m) => ({
    userId: m.user_id,
    name: m.profiles?.display_name ?? 'Jogador',
    role: m.role,
    sceneId: m.scene_id,
    banned: m.banned,
    joinedAt: m.joined_at,
  }));

  const ownerName = ownerRes.data?.display_name ?? 'Mestre';

  if (table.owner_id === userId) {
    return {
      table,
      ownerName,
      members,
      me: { userId, name: ownerName, role: 'mestre', sceneId: null },
    };
  }

  const self = members.find((m) => m.userId === userId);
  if (!self) return null;
  return {
    table,
    ownerName,
    members,
    me: { userId, name: self.name, role: self.role, sceneId: self.sceneId },
  };
}
