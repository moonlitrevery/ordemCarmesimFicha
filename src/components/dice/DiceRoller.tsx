'use client';

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
    <div className={`space-y-3 ${compact ? '' : 'panel p-4'}`}>
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
            onClick={() => handleRoll(`1${d}`)}
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
            key={`${result.total}-${result.breakdown}`}
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
        title={`Rolar ${notation}`}
      >
        D
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
