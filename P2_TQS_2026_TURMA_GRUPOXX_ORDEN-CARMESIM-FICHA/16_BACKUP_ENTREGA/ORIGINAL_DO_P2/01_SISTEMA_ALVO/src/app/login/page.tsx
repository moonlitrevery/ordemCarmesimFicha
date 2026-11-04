import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center gap-6">
      <Link href="/" className="text-center font-display text-2xl text-parchment">
        Ordem <span className="text-crimson-soft">Carmesim</span>
      </Link>
      <Suspense fallback={<div className="panel p-6 text-ink-muted">Carregando…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
