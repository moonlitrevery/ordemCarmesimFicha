import fs from 'fs';

// —— Quick roll component appended/replaced in DiceRoller ——
// Rewrite full DiceRoller with QuickRollButton
fs.writeFileSync(
  'src/components/dice/DiceRoller.tsx',
  fs.readFileSync('src/components/dice/DiceRoller.tsx', 'utf8') // keep for now, append QuickRoll below via separate write
);

const diceFull = `'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMMON_DICE, parseDiceNotation, rollDice, type DiceRollResult } from '@/lib/dice';
import { formatModifier } from '@/lib/calculations';

export function DiceIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v13A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3Zm1.25 3.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM6.75 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM6.75 16.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  );
}

/** Clique = rola na hora 1d20+bonus (sem abrir editor). */
export function QuickRollButton({
  bonus,
  label,
}: {
  bonus: number;
  label: string;
}) {
  const [flash, setFlash] = useState<{ total: number; breakdown: string } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function roll() {
    const die = Math.floor(Math.random() * 20) + 1;
    const total = die + bonus;
    const breakdown = die + ' ' + formatModifier(bonus) + ' = ' + total;
    setFlash({ total, breakdown });
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: Math.max(8, rect.top - 88),
        left: Math.min(rect.left - 40, window.innerWidth - 160),
      });
    }
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost inline-flex h-10 w-10 items-center justify-center p-0"
        onClick={roll}
        title={'Rolar 1d20' + formatModifier(bonus) + ' — ' + label}
        aria-label={'Rolar ' + label}
      >
        <DiceIcon className="h-5 w-5" />
      </button>
      {flash &&
        pos &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="pointer-events-none fixed z-[9999] min-w-[7rem] rounded-lg border border-crimson/40 bg-ink-panel px-4 py-3 text-center shadow-panel"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="label mb-0.5">{label}</p>
            <p className="font-display text-4xl text-crimson-soft">{flash.total}</p>
            <p className="text-sm text-ink-muted">1d20 {formatModifier(bonus)}</p>
            <p className="text-xs text-ink-muted">{flash.breakdown}</p>
          </motion.div>,
          document.body
        )}
    </>
  );
}

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
    setResult(rollDice(n));
    setRolling(false);
  }

  return (
    <div className={'space-y-3 ' + (compact ? '' : 'panel p-4')}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-parchment">Rolar Dados</h3>
          {onClose && (
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onClose}>
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
            className="btn-ghost px-2.5 py-1 text-sm"
            onClick={() => handleRoll('1' + d)}
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
      {error && <p className="text-base text-crimson-soft">{error}</p>}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.total + '-' + result.breakdown}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: rolling ? [1, 1.04, 0.98, 1] : 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35 }}
            className="rounded-md border border-crimson/30 bg-ink-raised px-4 py-3 text-center"
          >
            <p className="label mb-1">{result.notation}</p>
            <p className="font-display text-5xl text-crimson-soft">{result.total}</p>
            <p className="mt-1 text-base text-ink-muted">{result.breakdown}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InlineRollButton({
  notation,
  label,
}: {
  notation: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const width = 300;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 320);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost inline-flex h-10 w-10 items-center justify-center p-0"
        onClick={() => setOpen((v) => !v)}
        title={label ? 'Rolar ' + label + ' (' + notation + ')' : 'Rolar ' + notation}
        aria-label={label ? 'Rolar ' + label : 'Rolar ' + notation}
      >
        <DiceIcon className="h-5 w-5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] w-[300px] rounded-lg border border-ink-border bg-ink-panel p-3 shadow-panel"
            style={{ top: pos.top, left: pos.left }}
          >
            <DiceRoller initialNotation={notation} compact onClose={() => setOpen(false)} />
          </div>,
          document.body
        )}
    </>
  );
}
`;

fs.writeFileSync('src/components/dice/DiceRoller.tsx', diceFull);
console.log('DiceRoller ok');
