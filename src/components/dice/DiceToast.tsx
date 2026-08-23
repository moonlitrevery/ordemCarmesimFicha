'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { formatModifier } from '@/lib/calculations';

export type DiceToastItem = {
  id: string;
  label: string;
  total: number;
  die: number;
  bonus: number;
  breakdown: string;
};

type DiceToastContextValue = {
  pushRoll: (label: string, bonus: number) => void;
};

const DiceToastContext = createContext<DiceToastContextValue | null>(null);

export function useDiceToast() {
  const ctx = useContext(DiceToastContext);
  if (!ctx) throw new Error('useDiceToast must be used within DiceToastProvider');
  return ctx;
}

export function DiceToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<DiceToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushRoll = useCallback((label: string, bonus: number) => {
    const die = Math.floor(Math.random() * 20) + 1;
    const total = die + bonus;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: DiceToastItem = {
      id,
      label,
      total,
      die,
      bonus,
      breakdown: `${die} ${formatModifier(bonus)} = ${total}`,
    };
    setToasts((prev) => [...prev, item].slice(-6));
    window.setTimeout(() => dismiss(id), 10000);
  }, [dismiss]);

  const value = useMemo(() => ({ pushRoll }), [pushRoll]);

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
