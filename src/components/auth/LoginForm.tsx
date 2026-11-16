'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState, useEffect } from 'react';
import { loadSupabase, preloadSupabase } from '@/lib/supabase/lazy';
import { translateAuthError } from '@/lib/auth-errors';

export function LoginForm() {
  const router = useRouter();
  useEffect(() => preloadSupabase(), []);
  const search = useSearchParams();
  const next = search.get('next') || '/fichas';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = await loadSupabase().catch(() => null);
    if (!supabase) {
      setError('Sem conexão. Tente de novo.');
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(translateAuthError(err.message));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="font-display text-3xl text-parchment">Entrar</h1>
        <p className="mt-1 text-sm text-ink-muted">Acesse sua conta da Ordem Carmesim.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="label">E-mail</span>
        <input
          className="field"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Senha</span>
        <input
          className="field"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error && (
        <p className="rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson-soft">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Não tem conta?{' '}
        <Link href="/cadastro" className="text-crimson-soft hover:underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}
