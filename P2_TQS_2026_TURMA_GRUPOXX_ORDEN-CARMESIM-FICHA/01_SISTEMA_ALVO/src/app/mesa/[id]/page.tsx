import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VttShell } from '@/components/vtt/VttShell';
import { fetchTableSnapshot } from '@/lib/vtt/queries';

export default async function MesaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const snapshot = await fetchTableSnapshot(supabase, params.id, user.id).catch(
    () => null
  );
  if (!snapshot) redirect('/mesa');

  return <VttShell key={params.id} initial={snapshot} />;
}
