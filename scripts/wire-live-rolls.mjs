import fs from 'fs';

// Middleware
let mw = fs.readFileSync('src/lib/supabase/middleware.ts', 'utf8');
mw = mw.replace(
  `const isProtected =
    path.startsWith('/fichas') ||
    path.startsWith('/lore') ||
    path.startsWith('/regras');`,
  `const isProtected =
    path.startsWith('/fichas') ||
    path.startsWith('/lore') ||
    path.startsWith('/regras') ||
    path.startsWith('/rolagens');`
);
fs.writeFileSync('src/lib/supabase/middleware.ts', mw);
console.log('middleware ok');

// Nav - show Rolagens for mestre
fs.writeFileSync(
  'src/components/layout/Nav.tsx',
  `'use client';

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
`
);
console.log('nav ok');

// CharacterSheet - set roll context
let sheet = fs.readFileSync('src/components/character/CharacterSheet.tsx', 'utf8');
if (!sheet.includes('setRollContext')) {
  sheet = sheet.replace(
    "import { InlineRollButton, QuickRollButton } from '@/components/dice/DiceRoller';",
    "import { InlineRollButton, QuickRollButton } from '@/components/dice/DiceRoller';\nimport { useDiceToast } from '@/components/dice/DiceToast';"
  );
  sheet = sheet.replace(
    `  const [status, setStatus] = useState<SaveStatus>('idle');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);`,
    `  const [status, setStatus] = useState<SaveStatus>('idle');
  const [ready, setReady] = useState(false);
  const { setRollContext } = useDiceToast();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    setRollContext({
      characterId: character.id,
      characterName: sheet.name || 'Personagem',
    });
    return () => setRollContext(null);
  }, [character.id, sheet.name, setRollContext]);`
  );
  fs.writeFileSync('src/components/character/CharacterSheet.tsx', sheet);
  console.log('sheet context ok');
}

// DiceRoller - log external rolls when result set
let dice = fs.readFileSync('src/components/dice/DiceRoller.tsx', 'utf8');
if (!dice.includes('logExternalRoll')) {
  dice = dice.replace(
    "import { useDiceToast } from '@/components/dice/DiceToast';",
    "import { useDiceToast } from '@/components/dice/DiceToast';"
  );
  // In DiceRoller function, after setResult
  if (!dice.includes('const { pushRoll')) {
    // QuickRoll already uses pushRoll - need logExternalRoll in DiceRoller component
  }
  dice = dice.replace(
    `export function DiceRoller({
  initialNotation = '1d20',
  compact = false,
  onClose,
}: {
  initialNotation?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [notation, setNotation] = useState(initialNotation);
  const [result, setResult] = useState<DiceRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  async function handleRoll(override?: string) {
    const n = (override ?? notation).trim();
    if (!parseDiceNotation(n)) {
      setError('Use o formato XdY+Z (ex: 2d6+3)');
      return;
    }
    setError(null);
    setRolling(true);
    setNotation(n);
    await new Promise((r) => setTimeout(r, 350));
    setResult(rollDice(n));
    setRolling(false);
  }`,
    `export function DiceRoller({
  initialNotation = '1d20',
  compact = false,
  onClose,
  rollLabel,
}: {
  initialNotation?: string;
  compact?: boolean;
  onClose?: () => void;
  rollLabel?: string;
}) {
  const [notation, setNotation] = useState(initialNotation);
  const [result, setResult] = useState<DiceRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const { logExternalRoll } = useDiceToast();

  async function handleRoll(override?: string) {
    const n = (override ?? notation).trim();
    if (!parseDiceNotation(n)) {
      setError('Use o formato XdY+Z (ex: 2d6+3)');
      return;
    }
    setError(null);
    setRolling(true);
    setNotation(n);
    await new Promise((r) => setTimeout(r, 350));
    const rolled = rollDice(n);
    setResult(rolled);
    setRolling(false);
    if (rolled) {
      logExternalRoll({
        label: rollLabel || n,
        notation: rolled.notation,
        dieResult: rolled.dice[0],
        bonus: rolled.modifier,
        total: rolled.total,
        breakdown: rolled.breakdown,
      });
    }
  }`
  );
  fs.writeFileSync('src/components/dice/DiceRoller.tsx', dice);
  console.log('dice roller log ok');
}

console.log('wire done');
