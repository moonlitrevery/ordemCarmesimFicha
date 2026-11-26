import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { InkHero } from '@/components/fx/InkHero';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center gap-6">
      {/* Fase 15: fundo de tinta (estático com movimento reduzido ou aparelho fraco). */}
      <InkHero title="Ordem Carmesim" href="/" label="Ordem Carmesim — início" className="h-36 md:h-44" />
      <Suspense fallback={<div className="panel p-6 text-ink-muted">Carregando…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
