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
  'src/components/ui/SaveIndicator.tsx',
  `export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'Salvando…', className: 'text-ink-muted' },
    saved: { text: 'Salvo', className: 'text-emerald-400/90' },
    error: { text: 'Erro ao salvar', className: 'text-crimson-soft' },
  } as const;
  const item = map[status];
  return (
    <span className={\`text-xs \${item.className}\`} aria-live="polite">
      {item.text}
    </span>
  );
}
`
);

write(
  'src/components/ui/SectionCard.tsx',
  `import { ReactNode } from 'react';

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
`
);

write(
  'src/components/ui/CharacterImage.tsx',
  `'use client';

import { useState } from 'react';
import { VALID_IMAGE_URL } from '@/lib/constants';

export function CharacterImage({
  url,
  name,
  className = '',
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const valid = !!url && VALID_IMAGE_URL.test(url.split('#')[0]);

  if (!valid || failed) {
    return (
      <div
        className={\`flex items-center justify-center bg-ink-raised text-ink-muted \${className}\`}
        aria-label="Sem imagem"
      >
        <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-50" fill="currentColor">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url!}
      alt={name}
      className={\`object-cover \${className}\`}
      onError={() => setFailed(true)}
    />
  );
}
`
);

write(
  'src/hooks/useDebouncedSave.ts',
  `'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '@/components/ui/SaveIndicator';

export function useDebouncedSave<T>(
  value: T,
  saveFn: (value: T) => Promise<void>,
  delay = 600,
  enabled = true
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const first = useRef(true);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        await saveFnRef.current(value);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay, enabled]);

  const markIdle = useCallback(() => setStatus('idle'), []);

  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(markIdle, 1500);
    return () => clearTimeout(t);
  }, [status, markIdle]);

  return status;
}
`
);

write(
  'src/components/dice/DiceRoller.tsx',
  `'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { COMMON_DICE, parseDiceNotation, rollDice, type DiceRollResult } from '@/lib/dice';

export function DiceRoller({
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
    const rolled = rollDice(n);
    setResult(rolled);
    setRolling(false);
  }

  return (
    <div className={\`space-y-3 \${compact ? '' : 'panel p-4'}\`}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-parchment">Rolar Dados</h3>
          {onClose && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
              Fechar
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {COMMON_DICE.map((d) => (
          <button
            key={d}
            type="button"
            className="btn-ghost px-2.5 py-1 text-xs"
            onClick={() => handleRoll(\`1\${d}\`)}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="field"
          value={notation}
          onChange={(e) => setNotation(e.target.value)}
          placeholder="2d6+3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRoll();
          }}
        />
        <button type="button" className="btn-primary shrink-0" onClick={() => handleRoll()}>
          Rolar
        </button>
      </div>
      {error && <p className="text-sm text-crimson-soft">{error}</p>}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={\`\${result.total}-\${result.breakdown}\`}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{
              opacity: 1,
              scale: rolling ? [1, 1.04, 0.98, 1] : 1,
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35 }}
            className="rounded-md border border-crimson/30 bg-ink-raised px-4 py-3 text-center"
          >
            <p className="label mb-1">{result.notation}</p>
            <p className="font-display text-4xl text-crimson-soft">{result.total}</p>
            <p className="mt-1 text-sm text-ink-muted">{result.breakdown}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InlineRollButton({ notation }: { notation: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="btn-ghost px-2 py-1 text-xs"
        onClick={() => setOpen((v) => !v)}
        title={\`Rolar \${notation}\`}
      >
        🎲
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-ink-border bg-ink-panel p-3 shadow-panel">
          <DiceRoller
            initialNotation={notation}
            compact
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
`
);

write(
  'src/components/dice/FloatingDiceButton.tsx',
  `'use client';

import { useState } from 'react';
import { DiceRoller } from './DiceRoller';

export function FloatingDiceButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6">
      {open && (
        <div className="mb-3 w-[min(100vw-2rem,20rem)]">
          <DiceRoller onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-primary ml-auto flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-panel"
        aria-label="Rolar dados"
      >
        🎲
      </button>
    </div>
  );
}
`
);

write(
  'src/components/elements/ElementFragmentBar.tsx',
  `'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  ELEMENT_COLORS,
  ELEMENT_LABELS,
  MAX_CHARACTER_LEVEL,
} from '@/lib/constants';
import {
  addFragmentsToElement,
  getFragmentCostForLevel,
  getTotalLevel,
} from '@/lib/calculations';
import type { CharacterElementRow, ElementType } from '@/types/database';

export function ElementFragmentBar({
  elements,
  element,
  onChange,
}: {
  elements: CharacterElementRow[];
  element: ElementType;
  onChange: (
    next: CharacterElementRow[],
    meta: { leveledUp: boolean; blockedByCap: boolean; levelsGained: number }
  ) => void;
}) {
  const row = elements.find((e) => e.element === element) ?? {
    element,
    level: 0,
    fragments_current: 0,
  };
  const cost = getFragmentCostForLevel(row.level);
  const totalLevel = getTotalLevel(elements);
  const capped = totalLevel >= MAX_CHARACTER_LEVEL;
  const progress =
    cost === Infinity || cost === 0
      ? 0
      : Math.min(100, (row.fragments_current / cost) * 100);
  const color = ELEMENT_COLORS[element];
  const [amount, setAmount] = useState(1);
  const [pulse, setPulse] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function add(n: number) {
    const result = addFragmentsToElement(elements, element, n);
    onChange(result.elements, {
      leveledUp: result.leveledUp,
      blockedByCap: result.blockedByCap,
      levelsGained: result.levelsGained,
    });
    if (result.leveledUp) {
      setPulse(true);
      setNotice(
        result.levelsGained > 1
          ? \`+\${result.levelsGained} níveis!\`
          : 'Nível up!'
      );
      setTimeout(() => setPulse(false), 700);
    }
    if (result.blockedByCap) {
      setNotice('Nível máximo do personagem atingido');
    }
    if (result.leveledUp || result.blockedByCap) {
      setTimeout(() => setNotice(null), 2500);
    }
  }

  return (
    <div
      className={\`rounded-lg border border-ink-border bg-ink-raised/60 p-3 \${
        pulse ? 'ring-2 ring-offset-0' : ''
      }\`}
      style={pulse ? { boxShadow: \`0 0 24px \${color}88\` } : undefined}
    >
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <p className="label" style={{ color }}>
            {ELEMENT_LABELS[element]}
          </p>
          <p className="font-display text-3xl leading-none text-parchment">
            {row.level}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className="field w-16 py-1.5 text-center"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          />
          <button
            type="button"
            className="btn-primary py-1.5"
            disabled={capped && row.fragments_current >= cost}
            onClick={() => add(amount)}
          >
            +Fragmentos
          </button>
        </div>
      </div>

      <div className="relative h-7 overflow-hidden rounded-md bg-ink/80">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ backgroundColor: color }}
          initial={false}
          animate={{ width: \`\${progress}%\` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-parchment mix-blend-difference">
          {row.level >= 20
            ? 'Nível máximo do elemento'
            : \`\${row.fragments_current} / \${cost === Infinity ? '—' : cost} fragmentos\`}
        </div>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-center text-xs text-crimson-soft"
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
`
);

console.log('batch 3 done');
