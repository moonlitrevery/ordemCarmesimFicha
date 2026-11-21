import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GmView } from '@/components/vm/GmView';

export const metadata: Metadata = { title: 'V.M. · Ordem Carmesim' };

/** Visão da Mestra. Quem não é mestra recebe 404: esconder o link não basta. */
export default async function VmPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/vm');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'mestre') notFound();

  return <GmView userId={user.id} />;
}
