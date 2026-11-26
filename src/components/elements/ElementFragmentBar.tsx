'use client';

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
  removeFragmentsFromElement,
} from '@/lib/calculations';
import type { CharacterElementRow, ElementType } from '@/types/database';
import { AnimatedNumber } from '@/components/fx/AnimatedNumber';
import { DrawnElementSymbol } from '@/components/fx/DrawnElementSymbol';
import { ElementSymbol } from '@/components/elements/ElementSymbol';

export function ElementFragmentBar({
  elements,
  element,
  isNew = false,
  onChange,
}: {
  elements: CharacterElementRow[];
  element: ElementType;
  /** Elemento ganho agora (não estava na ficha ao abrir): o símbolo se desenha. */
  isNew?: boolean;
  onChange: (
    next: CharacterElementRow[],
    meta: {
      leveledUp?: boolean;
      leveledDown?: boolean;
      blockedByCap?: boolean;
      levelsGained?: number;
      levelsLost?: number;
    }
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
  const needsGlow = element === 'luz' || element === 'sombra';

  function flash(msg: string, withPulse = false) {
    setNotice(msg);
    if (withPulse) {
      setPulse(true);
      setTimeout(() => setPulse(false), 700);
    }
    setTimeout(() => setNotice(null), 2200);
  }

  function add(n: number) {
    const result = addFragmentsToElement(elements, element, n);
    onChange(result.elements, {
      leveledUp: result.leveledUp,
      blockedByCap: result.blockedByCap,
      levelsGained: result.levelsGained,
    });
    if (result.leveledUp) {
      flash(result.levelsGained > 1 ? '+' + result.levelsGained + ' níveis!' : 'Nível up!', true);
    } else if (result.blockedByCap) {
      flash('Nível máximo do personagem atingido');
    }
  }

  function remove(n: number) {
    const result = removeFragmentsFromElement(elements, element, n);
    onChange(result.elements, {
      leveledDown: result.leveledDown,
      levelsLost: result.levelsLost,
    });
    if (result.leveledDown) {
      flash(result.levelsLost > 1 ? '-' + result.levelsLost + ' níveis' : 'Nível reduzido');
    }
  }

  function removeElement() {
    const levelsLost = row.level || 0;
    onChange(
      elements.filter((e) => e.element !== element),
      {
        leveledDown: levelsLost > 0,
        levelsLost,
      }
    );
  }

  const canRemove = row.level > 0 || row.fragments_current > 0;

  return (
    <div
      className={
        'relative overflow-hidden rounded-xl border border-ink-border bg-gradient-to-br from-ink-raised/90 to-ink/60 p-3 ' +
        (pulse ? 'ring-2' : '')
      }
      style={
        pulse
          ? { boxShadow: '0 0 28px ' + color + '99', borderColor: color }
          : { borderColor: color + '44' }
      }
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: color }}
      />

      <div className="relative mb-3 flex items-end justify-between gap-2">
        <div className="flex items-end gap-2.5">
          {isNew ? (
            <DrawnElementSymbol trigger="mount" element={element} size={30} glow pulse={pulse} decorative />
          ) : (
            <ElementSymbol element={element} size={30} glow pulse={pulse} decorative />
          )}
          <div>
          <p
            className="label"
            style={{
              color,
              textShadow: needsGlow
                ? '0 0 8px rgba(255,255,255,0.55), 0 0 16px rgba(255,255,255,0.25)'
                : undefined,
            }}
          >
            {ELEMENT_LABELS[element]}
          </p>
          <p className="font-display text-3xl leading-none text-parchment">
            <AnimatedNumber value={row.level} />
            <span className="ml-1 text-sm text-ink-muted">nível</span>
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <input
            type="number"
            min={1}
            className="field w-14 py-1.5 text-center"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          />
          <button type="button" className="btn-ghost py-1.5 px-2.5" disabled={!canRemove} onClick={() => remove(amount)} title="Remover fragmentos">
            −
          </button>
          <button
            type="button"
            className="btn-primary py-1.5"
            disabled={capped && row.fragments_current >= cost}
            onClick={() => add(amount)}
          >
            +
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1.5 text-sm"
            onClick={removeElement}
            title={'Remover ' + ELEMENT_LABELS[element] + ' da ficha'}
            aria-label={'Remover ' + ELEMENT_LABELS[element]}
          >
            ×
          </button>
        </div>
      </div>

      <div className="relative h-8 overflow-hidden rounded-full border border-white/5 bg-ink/90 shadow-inner">
        <div
          className="fragment-fill absolute inset-y-0 left-0 overflow-hidden"
          style={{
            width: progress + '%',
            background: 'linear-gradient(90deg, ' + color + 'cc, ' + color + ', ' + color + 'ee)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px ' + color + '66',
          }}
        >
          {progress > 2 && (
            <div className="fragment-shimmer absolute inset-0">
              <div className="h-full w-10 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            </div>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold tracking-wide text-parchment drop-shadow">
          {row.level >= 20
            ? 'Nível máximo do elemento'
            : row.fragments_current + ' / ' + (cost === Infinity ? '—' : cost) + ' fragmentos'}
        </div>
      </div>

      {notice && (
        <p key={notice} className="fragment-notice mt-2 text-center text-xs text-crimson-soft">
          {notice}
        </p>
      )}
    </div>
  );
}
