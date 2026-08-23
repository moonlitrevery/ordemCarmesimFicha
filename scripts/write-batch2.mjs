import fs from 'fs';
import path from 'path';

const root = process.cwd();
function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

write(
  'src/app/layout.tsx',
  `import type { Metadata } from 'next';
import { Cormorant_Garamond, Source_Sans_3 } from 'next/font/google';
import { Nav } from '@/components/layout/Nav';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Ordem Carmesim',
  description: 'Fichas, lore e regras da campanha Ordem Carmesim',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={\`\${display.variable} \${sans.variable} font-sans antialiased bg-ink bg-ink-veil text-parchment\`}
      >
        <div className="min-h-dvh bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,30,45,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(92,15,26,0.15),transparent)]">
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
`
);

write(
  'src/components/layout/Nav.tsx',
  `'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const links = [
  { href: '/fichas', label: 'Fichas' },
  { href: '/lore', label: 'Lore' },
  { href: '/regras', label: 'Regras' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const hideOnAuth =
    pathname === '/' || pathname === '/login' || pathname === '/cadastro';

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (hideOnAuth) return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/fichas" className="font-display text-xl tracking-wide text-parchment">
          Ordem <span className="text-crimson-soft">Carmesim</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={\`rounded-md px-3 py-1.5 text-sm transition \${
                  active
                    ? 'bg-crimson/25 text-parchment'
                    : 'text-ink-muted hover:bg-ink-raised hover:text-parchment'
                }\`}
              >
                {l.label}
              </Link>
            );
          })}
          {email && (
            <button
              type="button"
              onClick={signOut}
              className="ml-1 rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-ink-raised hover:text-parchment"
            >
              Sair
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
`
);

write(
  'src/app/page.tsx',
  `import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center text-center">
      <p className="label mb-4 text-crimson-soft">Campanha privada</p>
      <h1 className="font-display text-5xl leading-none text-parchment md:text-7xl">
        Ordem <span className="text-crimson-soft">Carmesim</span>
      </h1>
      <p className="mt-5 max-w-md text-balance text-ink-muted">
        Compêndio de lore, regras e fichas interativas para a mesa.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link href="/login" className="btn-primary">
          Entrar
        </Link>
        <Link href="/cadastro" className="btn-ghost">
          Criar conta
        </Link>
      </div>
    </div>
  );
}
`
);

write(
  'src/components/auth/LoginForm.tsx',
  `'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
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
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'E-mail ou senha inválidos.'
        : err.message);
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
`
);

write(
  'src/components/auth/SignupForm.tsx',
  `'use client';

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
`
);

write(
  'src/app/login/page.tsx',
  `import { Suspense } from 'react';
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
`
);

write(
  'src/app/cadastro/page.tsx',
  `import Link from 'next/link';
import { SignupForm } from '@/components/auth/SignupForm';

export default function CadastroPage() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center gap-6">
      <Link href="/" className="text-center font-display text-2xl text-parchment">
        Ordem <span className="text-crimson-soft">Carmesim</span>
      </Link>
      <SignupForm />
    </div>
  );
}
`
);

console.log('batch 2 done');
