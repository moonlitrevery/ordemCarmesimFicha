'use client';

import { useEffect, useRef, useState } from 'react';

export function CopyCodeButton({ code }: { code: string }) {
  const [label, setLabel] = useState('Copiar');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let next = 'Copiado!';
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      next = 'Não copiou';
    }
    setLabel(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLabel('Copiar'), 1500);
  }

  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      onClick={() => void copy()}
      aria-label={`Copiar código ${code}`}
    >
      {label}
    </button>
  );
}
