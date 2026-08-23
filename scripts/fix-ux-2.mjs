import fs from 'fs';

// —— nova ficha: seed DEFAULT_SKILLS ——
fs.writeFileSync(
  'src/app/fichas/nova/page.tsx',
  `'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_ATTRIBUTES } from '@/types/database';
import { DEFAULT_SKILLS } from '@/lib/constants';
import { computeDerivedMaxes } from '@/lib/calculations';

export default function NovaFichaPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Você precisa estar logado.');
      setLoading(false);
      return;
    }

    const maxes = computeDerivedMaxes(0, DEFAULT_ATTRIBUTES);
    const { data, error: err } = await supabase
      .from('characters')
      .insert({
        owner_id: user.id,
        name: name.trim() || 'Novo personagem',
        attributes: DEFAULT_ATTRIBUTES,
        skills: DEFAULT_SKILLS,
        hp_current: maxes.hpMax,
        hp_max: maxes.hpMax,
        mana_current: maxes.manaMax,
        mana_max: maxes.manaMax,
        sanity_current: maxes.sanityMax,
        sanity_max: maxes.sanityMax,
        milestone_notes: {},
      })
      .select('id')
      .single();

    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? 'Falha ao criar ficha.');
      return;
    }
    router.push(\`/fichas/\${data.id}\`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-5xl text-parchment">Nova Ficha</h1>
      <form onSubmit={onSubmit} className="panel space-y-4 p-6">
        <label className="block space-y-1.5">
          <span className="label">Nome do personagem</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Valen Ashcroft"
            autoFocus
            required
          />
        </label>
        {error && <p className="text-base text-crimson-soft">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Criando…' : 'Criar ficha'}
        </button>
      </form>
    </div>
  );
}
`
);

// —— layout: Lexend + larger container ——
fs.writeFileSync(
  'src/app/layout.tsx',
  `import type { Metadata } from 'next';
import { Cormorant_Garamond, Lexend } from 'next/font/google';
import { Nav } from '@/components/layout/Nav';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const sans = Lexend({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
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
        className={\`\${display.variable} \${sans.variable} font-sans antialiased bg-ink text-parchment text-base leading-relaxed\`}
      >
        <div className="min-h-dvh bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,30,45,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(92,15,26,0.15),transparent)]">
          <Nav />
          <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 md:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
`
);

fs.writeFileSync(
  'src/app/globals.css',
  `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0c0a0d;
  --foreground: #e8dfd0;
}

html {
  color-scheme: dark;
  font-size: 18px;
}

@media (min-width: 768px) {
  html {
    font-size: 19px;
  }
}

body {
  color: var(--foreground);
  background-color: var(--background);
  min-height: 100dvh;
  letter-spacing: 0.01em;
}

@layer base {
  ::selection {
    background: rgba(139, 30, 45, 0.45);
    color: #fff;
  }
}

@layer components {
  .panel {
    @apply rounded-lg border border-ink-border bg-ink-panel/80 shadow-panel backdrop-blur-sm;
  }

  .field {
    @apply w-full rounded-md border border-ink-border bg-ink-raised px-3.5 py-2.5 text-base text-parchment outline-none transition focus:border-crimson/70 focus:ring-1 focus:ring-crimson/40;
  }

  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-base font-medium transition disabled:opacity-50;
  }

  .btn-primary {
    @apply btn bg-crimson text-parchment hover:bg-crimson-soft;
  }

  .btn-ghost {
    @apply btn border border-ink-border bg-transparent text-parchment hover:border-crimson/50 hover:bg-ink-raised;
  }

  .section-title {
    @apply font-display text-2xl tracking-wide text-parchment md:text-3xl;
  }

  .label {
    @apply text-sm font-medium uppercase tracking-[0.12em] text-ink-muted;
  }
}
`
);

// Floating dice button
let float = fs.readFileSync('src/components/dice/FloatingDiceButton.tsx', 'utf8');
if (!float.includes('DiceIcon')) {
  float = float.replace(
    "import { DiceRoller } from './DiceRoller';",
    "import { DiceIcon, DiceRoller } from './DiceRoller';"
  );
  float = float.replace(/>Dados</, '><DiceIcon className="h-6 w-6" /><');
  // fix if it was just D or Dados as text
  float = float.replace(
    /aria-label="Rolar dados"\s*>\s*Dados\s*</,
    'aria-label="Rolar dados">\n        <DiceIcon className="h-6 w-6" />\n      <'
  );
  float = float.replace(
    /aria-label="Rolar dados"\s*>\s*D\s*</,
    'aria-label="Rolar dados">\n        <DiceIcon className="h-6 w-6" />\n      <'
  );
  fs.writeFileSync('src/components/dice/FloatingDiceButton.tsx', float);
}

console.log('nova + layout + globals done');
