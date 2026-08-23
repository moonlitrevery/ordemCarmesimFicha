'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isMestre, setIsMestre] = useState(false);
  const hideOnAuth =
    pathname === '/' || pathname === '/login' || pathname === '/cadastro';

  useEffect(() => {
    const supabase = createClient();

    async function load(userId: string | undefined) {
      if (!userId) {
        setEmail(null);
        setIsMestre(false);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      setEmail(userData.user?.email ?? null);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      setIsMestre(profile?.role === 'mestre');
    }

    supabase.auth.getUser().then(({ data }) => {
      void load(data.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void load(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (hideOnAuth) return null;

  const links = [
    { href: '/fichas', label: 'Fichas' },
    ...(isMestre ? [{ href: '/rolagens', label: 'Rolagens' }] : []),
    { href: '/lore', label: 'Lore' },
    { href: '/regras', label: 'Regras' },
  ];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href="/fichas"
          className="font-display text-2xl tracking-wide text-parchment"
        >
          Ordem <span className="text-crimson-soft">Carmesim</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  'rounded-md px-3 py-1.5 text-base transition ' +
                  (active
                    ? 'bg-crimson/25 text-parchment'
                    : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
                }
              >
                {l.label}
              </Link>
            );
          })}
          {email && (
            <button
              type="button"
              onClick={signOut}
              className="ml-1 rounded-md px-3 py-1.5 text-base text-ink-muted hover:bg-ink-raised hover:text-parchment"
            >
              Sair
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
