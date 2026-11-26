'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

// No servidor não há layout para medir (e `useLayoutEffect` avisaria).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Largura de referência do destaque: o tamanho real vem por `scaleX`. */
const HIGHLIGHT_BASE = 100;

interface HighlightBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Destaque do item ativo que desliza até o novo (Fase 15, item 11). Só CSS
 * (`translate` + `scaleX`, tokens de duração), sem a Motion: o menu está em toda
 * página e a Motion não entra no primeiro carregamento (decisão da mestra).
 * Antes de medir (SSR), o próprio item ativo tem o fundo.
 */
function useSlidingHighlight(navRef: RefObject<HTMLElement>, key: string) {
  const [box, setBox] = useState<HighlightBox | null>(null);
  // A primeira posição entra sem deslizar (de 0 até o item).
  const [placed, setPlaced] = useState(false);

  useIsoLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[data-active="true"]');
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, key]);

  useEffect(() => {
    if (!box || placed) return;
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [box, placed]);

  return { box, placed };
}

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
  const { box, placed } = useSlidingHighlight(navRef, pathname + (isMestre ? ':m' : '') + (email ? ':e' : ''));

  if (hideOnAuth) return null;

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
          {box && (
            <span
              aria-hidden
              className={
                'pointer-events-none absolute left-0 top-0 rounded-md bg-crimson/25 ' +
                (placed ? 'transition-transform duration-slow ease-enter' : '')
              }
              style={{
                width: HIGHLIGHT_BASE,
                height: box.h,
                transformOrigin: '0 0',
                transform: `translate(${box.x}px, ${box.y}px) scaleX(${box.w / HIGHLIGHT_BASE})`,
              }}
            />
          )}
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
    </header>
  );
}
