import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isUuid, type TableUploadRole } from './rules';

export interface TableFileAccess {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  /** `null`: não envia nesta mesa (espectador, banido, fora dela). */
  role: TableUploadRole | null;
}

/** `null` = sem sessão. */
export async function getTableFileAccess(
  tableId: unknown
): Promise<TableFileAccess | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isUuid(tableId)) return { supabase, userId: user.id, role: null };

  const { data } = await supabase.rpc('table_upload_role', { p_table: tableId });
  return {
    supabase,
    userId: user.id,
    role: data === 'gm' || data === 'player' ? data : null,
  };
}
