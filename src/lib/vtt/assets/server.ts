import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface UploadAccess {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  isMestre: boolean;
  canUpload: boolean;
}

/** `null` = sem sessão. */
export async function getUploadAccess(): Promise<UploadAccess | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: canUpload }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.rpc('can_upload_asset'),
  ]);

  return {
    supabase,
    userId: user.id,
    isMestre: profile?.role === 'mestre',
    canUpload: canUpload === true,
  };
}
