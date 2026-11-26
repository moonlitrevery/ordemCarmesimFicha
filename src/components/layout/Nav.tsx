'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPaletteHost } from '@/components/fx/CommandPaletteHost';
import { useEffect, useRef, useState } from 'react';
import { SlideFill, useSlidingBox } from '@/components/ui/sliding';

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isMestre, setIsMestre] = useState(false);
  const hideOnAuth =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/cadastro' ||
    pathname.startsWith('/mesa/');

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    // Supabase fora do bundle inicial: Regras e Lore são só texto e não esperam por ele.
    void Promise.all([
      import('@/lib/supabase/client'),
      import('@/lib/profile-cache'),
    ]).then(([{ createClient }, { getCachedProfile }]) => {
      if (!active) return;
      // Já dispara uma vez ao assinar (INITIAL_SESSION), com a sessão atual.
      const { data: sub } = createClient().auth.onAuthStateChange(
        (_e, session) => {
          const user = session?.user;
          setEmail(user?.email ?? null);
          if (!user) {
            setIsMestre(false);
            return;
          }
          getCachedProfile(user.id).then(
            (profile) => {
              if (active) setIsMestre(profile?.role === 'mestre');
            },
            () => {
              if (active) setIsMestre(false);
            }
          );
        }
      );
      unsubscribe = () => sub.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const navRef = useRef<HTMLElement>(null);
  // Fase 15: o destaque desliza até o item novo, só CSS (a Motion não entra em toda página).
  const { box, placed } = useSlidingBox(navRef, '[data-active="true"]', pathname + (isMestre ? ':m' : '') + (email ? ':e' : ''));

  // A busca rápida (Ctrl+K) vale também na Mesa, onde o menu fica escondido.
  const palette = <CommandPaletteHost enabled={isMestre} />;
  if (hideOnAuth) return palette;

  // Rota dinâmica sem loading.tsx: o prefetch custa uma ida ao servidor e não adianta nada.
  const links = [
    { href: '/fichas', label: 'Fichas', prefetch: false },
    { href: '/mesa', label: 'Mesa', prefetch: false },
    ...(isMestre
      ? [{ href: '/vm', label: 'V.M.', prefetch: false }]
      : []),
    { href: '/lore', label: 'Lore' },
    { href: '/regras', label: 'Regras' },
  ];

  async function signOut() {
    const { createClient } = await import('@/lib/supabase/client');
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
          prefetch={false}
          className="font-display text-2xl tracking-wide text-parchment"
        >
          Ordem <span className="text-crimson-soft">Carmesim</span>
        </Link>
        <nav ref={navRef} className="relative flex flex-wrap items-center gap-1 sm:gap-2">
          {box && <SlideFill box={box} placed={placed} className="rounded-md bg-crimson/25" />}
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                prefetch={l.prefetch}
                data-active={active || undefined}
                className={
                  'relative rounded-md px-3 py-1.5 text-base transition duration-fast ease-enter ' +
                  (active
                    ? (box ? '' : 'bg-crimson/25 ') + 'text-parchment'
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
      {palette}
    </header>
  );
}
