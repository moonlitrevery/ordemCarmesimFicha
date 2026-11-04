'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/fichas');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h1 className="font-display text-3xl text-parchment">Criar conta</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Toda conta nasce como jogador. O papel de mestre é atribuído manualmente.
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="label">Nome de exibição</span>
        <input
          className="field"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="nickname"
        />
      </label>
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
          autoComplete="new-password"
        />
      </label>
      {error && (
        <p className="rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson-soft">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Criando…' : 'Cadastrar'}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Já tem conta?{' '}
        <Link href="/login" className="text-crimson-soft hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
