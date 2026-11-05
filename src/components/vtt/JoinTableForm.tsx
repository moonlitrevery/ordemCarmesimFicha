'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadSupabase, preloadSupabase } from '@/lib/supabase/lazy';
import {
  isValidTableCode,
  joinErrorMessage,
  normalizeTableCode,
  TABLE_CODE_LENGTH,
} from '@/lib/vtt/table-code';

export function JoinTableForm() {
  const router = useRouter();
  useEffect(() => preloadSupabase(), []);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeTableCode(code);
    if (!isValidTableCode(normalized)) {
      setError('Código inválido.');
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = await loadSupabase().catch(() => null);
    if (!supabase) {
      setError('Sem conexão. Tente de novo.');
      setBusy(false);
      return;
    }
    const { data, error: err } = await supabase.rpc('join_table', {
      p_code: normalized,
    });
    if (err) {
      setError(joinErrorMessage(err.message));
      setBusy(false);
      return;
    }
    router.push(`/mesa/${data as string}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-2 p-4">
      <label htmlFor="table-code" className="label block">
        Entrar com código
      </label>
      <div className="flex gap-2">
        <input
          id="table-code"
          className="field font-mono uppercase tracking-[0.2em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={TABLE_CODE_LENGTH + 2}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC234"
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={busy || !code.trim()}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
      {error && <p className="text-sm text-crimson-soft">{error}</p>}
    </form>
  );
}
