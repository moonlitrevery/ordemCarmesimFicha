'use client';

import { useState } from 'react';
import { DiceIcon, DiceRoller } from './DiceRoller';

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
        aria-label="Rolar dados">
        <DiceIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
