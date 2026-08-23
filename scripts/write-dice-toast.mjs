import fs from 'fs';

fs.writeFileSync(
  'src/components/dice/DiceToast.tsx',
  `'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { formatModifier } from '@/lib/calculations';
import { logDiceRoll } from '@/lib/dice-log';

export type DiceToastItem = {
  id: string;
  label: string;
  total: number;
  die: number;
  bonus: number;
  breakdown: string;
};

export type RollContext = {
  characterId: string;
  characterName: string;
} | null;

type DiceToastContextValue = {
  pushRoll: (label: string, bonus: number) => void;
  setRollContext: (ctx: RollContext) => void;
  logExternalRoll: (payload: {
    label: string;
    notation: string;
    dieResult?: number;
    bonus?: number;
    total: number;
    breakdown: string;
  }) => void;
};

const DiceToastContext = createContext<DiceToastContextValue | null>(null);

export function useDiceToast() {
  const ctx = useContext(DiceToastContext);
  if (!ctx) throw new Error('useDiceToast must be used within DiceToastProvider');
  return ctx;
}

export function DiceToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<DiceToastItem[]>([]);
  const rollContextRef = useRef<RollContext>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setRollContext = useCallback((ctx: RollContext) => {
    rollContextRef.current = ctx;
  }, []);

  const persist = useCallback(
    (payload: {
      label: string;
      notation: string;
      dieResult?: number;
      bonus?: number;
      total: number;
      breakdown: string;
    }) => {
      const ctx = rollContextRef.current;
      if (!ctx) return;
      void logDiceRoll({
        characterId: ctx.characterId,
        characterName: ctx.characterName || 'Personagem',
        label: payload.label,
        notation: payload.notation,
        dieResult: payload.dieResult ?? null,
        bonus: payload.bonus ?? 0,
        total: payload.total,
        breakdown: payload.breakdown,
      });
    },
    []
  );

  const pushRoll = useCallback(
    (label: string, bonus: number) => {
      const die = Math.floor(Math.random() * 20) + 1;
      const total = die + bonus;
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const breakdown = die + ' ' + formatModifier(bonus) + ' = ' + total;
      const notation = '1d20' + formatModifier(bonus);
      const item: DiceToastItem = {
        id,
        label,
        total,
        die,
        bonus,
        breakdown,
      };
      setToasts((prev) => [...prev, item].slice(-6));
      window.setTimeout(() => dismiss(id), 10000);
      persist({
        label,
        notation,
        dieResult: die,
        bonus,
        total,
        breakdown,
      });
    },
    [dismiss, persist]
  );

  const logExternalRoll = useCallback(
    (payload: {
      label: string;
      notation: string;
      dieResult?: number;
      bonus?: number;
      total: number;
      breakdown: string;
    }) => {
      persist(payload);
    },
    [persist]
  );

  const value = useMemo(
    () => ({ pushRoll, setRollContext, logExternalRoll }),
    [pushRoll, setRollContext, logExternalRoll]
  );

  return (
    <DiceToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed bottom-20 right-4 z-[9999] flex w-[min(100vw-1.5rem,16rem)] flex-col-reverse gap-2 md:bottom-24 md:right-6">
            <AnimatePresence initial={false}>
              {toasts.map((t) => (
                <motion.button
                  key={t.id}
                  type="button"
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => dismiss(t.id)}
                  className="pointer-events-auto w-full rounded-lg border border-crimson/40 bg-ink-panel/95 px-3 py-2.5 text-left shadow-panel backdrop-blur-md"
                  title="Clique para fechar"
                >
                  <p className="label mb-0.5 truncate text-crimson-soft">{t.label}</p>
                  <p className="font-display text-3xl leading-none text-parchment">
                    {t.total}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    1d20 {formatModifier(t.bonus)} · {t.breakdown}
                  </p>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </DiceToastContext.Provider>
  );
}
`
);

console.log('DiceToast written');
