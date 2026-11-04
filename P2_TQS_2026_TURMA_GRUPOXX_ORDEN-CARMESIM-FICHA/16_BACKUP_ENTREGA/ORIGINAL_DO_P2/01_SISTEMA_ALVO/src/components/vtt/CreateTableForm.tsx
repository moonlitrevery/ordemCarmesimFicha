'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function CreateTableForm({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('tables')
      .insert({ name: trimmed, owner_id: ownerId });
    setBusy(false);
    if (err) {
      setError('Não foi possível criar a mesa. Tente de novo.');
      return;
    }
    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-2 p-4">
      <label htmlFor="table-name" className="label block">
        Criar mesa
      </label>
      <div className="flex gap-2">
        <input
          id="table-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da mesa"
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={busy || !name.trim()}
        >
          {busy ? 'Criando…' : 'Criar mesa'}
        </button>
      </div>
      {error && <p className="text-sm text-crimson-soft">{error}</p>}
    </form>
  );
}
