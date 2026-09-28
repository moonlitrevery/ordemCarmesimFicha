'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_ATTRIBUTES } from '@/types/database';
import { DEFAULT_SKILLS } from '@/lib/constants';
import { computeDerivedMaxes } from '@/lib/calculations';

export default function NovaFichaPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Você precisa estar logado.');
      setLoading(false);
      return;
    }

    const maxes = computeDerivedMaxes(0, DEFAULT_ATTRIBUTES);
    const { data, error: err } = await supabase
      .from('characters')
      .insert({
        owner_id: user.id,
        name: name.trim() || 'Novo personagem',
        attributes: DEFAULT_ATTRIBUTES,
        skills: DEFAULT_SKILLS,
        hp_current: maxes.hpMax,
        mana_current: maxes.manaMax,
        mana_max: maxes.manaMax,
        sanity_current: maxes.sanityMax,
        sanity_max: maxes.sanityMax,
        milestone_notes: {},
      })
      .select('id')
      .single();

    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? 'Falha ao criar ficha.');
      return;
    }
    router.push(`/fichas/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-5xl text-parchment">Nova Ficha</h1>
      <form onSubmit={onSubmit} className="panel space-y-4 p-6">
        <label className="block space-y-1.5">
          <span className="label">Nome do personagem</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Valen Ashcroft"
            autoFocus
            required
          />
        </label>
        {error && <p className="text-base text-crimson-soft">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Criando…' : 'Criar ficha'}
        </button>
      </form>
    </div>
  );
}
