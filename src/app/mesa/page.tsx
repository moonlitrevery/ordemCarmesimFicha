import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CreateTableForm } from '@/components/vtt/CreateTableForm';
import { JoinTableForm } from '@/components/vtt/JoinTableForm';
import { TableCard } from '@/components/vtt/TableCard';
import { TABLE_COLUMNS } from '@/lib/vtt/queries';
import type { VttTable } from '@/lib/vtt/types';
import type { Profile } from '@/types/database';

export default async function MesaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isMestre = profile?.role === 'mestre';

  const { data, error } = await supabase
    .from('tables')
    .select(TABLE_COLUMNS)
    .order('created_at', { ascending: false });
  const tables = (data ?? []) as unknown as VttTable[];

  const ownerIds = Array.from(new Set(tables.map((t) => t.owner_id)));
  const { data: owners } = ownerIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ownerIds)
    : { data: [] as Pick<Profile, 'id' | 'display_name'>[] };
  const ownerNames = new Map(
    ((owners ?? []) as Pick<Profile, 'id' | 'display_name'>[]).map((o) => [
      o.id,
      o.display_name,
    ])
  );

  const { data: codes } = isMestre
    ? await supabase.rpc('get_my_table_codes')
    : { data: [] };
  const codeByTable = new Map(
    ((codes ?? []) as { table_id: string; code: string }[]).map((c) => [
      c.table_id,
      c.code,
    ])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-parchment">Mesa</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Entre com o código que a mestra passou ou abra uma das suas mesas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <JoinTableForm />
        {isMestre && <CreateTableForm ownerId={user.id} />}
      </div>

      <section className="space-y-3">
        <h2 className="section-title">Minhas mesas</h2>
        {error ? (
          <div className="rounded-md border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-crimson-soft">
            {error.message.includes('tables')
              ? 'Tabela de mesas não encontrada. Rode supabase/migrations/007_vtt_tables.sql no Supabase.'
              : error.message}
          </div>
        ) : tables.length === 0 ? (
          <div className="panel p-8 text-center text-ink-muted">
            {isMestre
              ? 'Nenhuma mesa ainda. Crie a primeira acima.'
              : 'Nenhuma mesa ainda. Entre com um código acima.'}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <TableCard
                key={t.id}
                id={t.id}
                name={t.name}
                ownerName={ownerNames.get(t.owner_id) ?? 'Mestre'}
                sessionOpen={t.session_open}
                code={codeByTable.get(t.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
