import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LiveRollsFeed } from '@/components/rolls/LiveRollsFeed';

export default async function RolagensPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'mestre') {
    redirect('/fichas');
  }

  return <LiveRollsFeed />;
}
