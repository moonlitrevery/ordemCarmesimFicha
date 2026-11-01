'use client';

import { AnimatePresence, m } from 'framer-motion';
import { createPortal } from 'react-dom';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { formatModifier } from '@/lib/calculations';
import type { DiceToastItem } from '@/components/dice/DiceToast';

export function DiceToastStack({
  toasts,
  onDismiss,
}: {
  toasts: DiceToastItem[];
  onDismiss: (id: string) => void;
}) {
  return createPortal(
    <MotionProvider>
      <div className="pointer-events-none fixed bottom-20 right-4 z-[9999] flex w-[min(100vw-1.5rem,16rem)] flex-col-reverse gap-2 md:bottom-24 md:right-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <m.button
              key={t.id}
              type="button"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={() => onDismiss(t.id)}
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
            </m.button>
          ))}
        </AnimatePresence>
      </div>
    </MotionProvider>,
    document.body
  );
}
