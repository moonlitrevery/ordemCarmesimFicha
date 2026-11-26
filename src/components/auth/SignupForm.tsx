'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState, useEffect } from 'react';
import { loadSupabase, preloadSupabase } from '@/lib/supabase/lazy';
import { authErrorMessage } from '@/lib/auth-errors';

export function SignupForm() {
  const router = useRouter();
  useEffect(() => preloadSupabase(), []);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

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
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim().slice(0, 80) },
      },
    });
    setLoading(false);
    if (err) {
      setError(authErrorMessage(err, 'Não foi possível criar a conta. Tente de novo.'));
      return;
    }
    // Com confirmação de e-mail ligada no Supabase, não há sessão até clicar no link.
    if (!data.session) {
      setConfirmSent(true);
      return;
    }
    router.push('/fichas');
    router.refresh();
  }

  if (confirmSent) {
    return (
      <div className="panel mx-auto w-full max-w-md space-y-3 p-6">
        <h1 className="font-display text-3xl text-parchment">Confira seu e-mail</h1>
        <p className="text-sm text-ink-muted">
          Se o endereço puder ser usado, enviamos um link de confirmação para {email}. Abra o
          link e depois entre com sua senha.
        </p>
        <Link href="/login" className="btn-primary block w-full text-center">
          Ir para o login
        </Link>
      </div>
    );
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
          maxLength={80}
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
          minLength={8}
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
