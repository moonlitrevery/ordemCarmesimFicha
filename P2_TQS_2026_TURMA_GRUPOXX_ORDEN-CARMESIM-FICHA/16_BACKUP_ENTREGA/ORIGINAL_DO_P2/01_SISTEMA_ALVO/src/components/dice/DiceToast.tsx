'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { formatModifier } from '@/lib/calculations';

// Framer e Supabase só carregam em páginas que rolam dados, não no layout de todas.
const loadToastStack = () =>
  import('@/components/dice/DiceToastStack').then((m) => m.DiceToastStack);
const DiceToastStack = dynamic(loadToastStack, { ssr: false });

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
  // Continua montada depois do último toast: a animação de saída depende disso.
  const [hasRolled, setHasRolled] = useState(false);
  const rollContextRef = useRef<RollContext>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setRollContext = useCallback((ctx: RollContext) => {
    rollContextRef.current = ctx;
    // Quem define contexto vai rolar: baixa antes, para o primeiro toast não atrasar.
    if (ctx) void loadToastStack();
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
      void import('@/lib/dice-log').then(({ logDiceRoll }) =>
        logDiceRoll({
          characterId: ctx.characterId,
          characterName: ctx.characterName || 'Personagem',
          label: payload.label,
          notation: payload.notation,
          dieResult: payload.dieResult ?? null,
          bonus: payload.bonus ?? 0,
          total: payload.total,
          breakdown: payload.breakdown,
        })
      );
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
      setHasRolled(true);
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
      {hasRolled && <DiceToastStack toasts={toasts} onDismiss={dismiss} />}
    </DiceToastContext.Provider>
  );
}
