'use client';

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
          ? `+${result.levelsGained} níveis!`
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
      className={`rounded-lg border border-ink-border bg-ink-raised/60 p-3 ${
        pulse ? 'ring-2 ring-offset-0' : ''
      }`}
      style={pulse ? { boxShadow: `0 0 24px ${color}88` } : undefined}
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
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-parchment mix-blend-difference">
          {row.level >= 20
            ? 'Nível máximo do elemento'
            : `${row.fragments_current} / ${cost === Infinity ? '—' : cost} fragmentos`}
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
