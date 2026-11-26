'use client';

/**
 * Símbolo alquímico que se desenha (Fase 15, item 6). Mesma geometria do
 * `ElementSymbol` (modo `draw`); a animação é CSS (`globals.css`, `.symbol-draw`)
 * sobre `pathLength="1"`, então Lore e Regras não carregam a Motion por isso.
 *
 * - `trigger="view"`: desenha quando entra na tela pela primeira vez (Lore/Regras),
 *   uma vez por carregamento.
 * - `trigger="mount"`: desenha ao aparecer (ficha, elemento recém-ganho).
 */
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ElementSymbol, type SymbolDraw } from '@/components/elements/ElementSymbol';

type Props = Omit<ComponentProps<typeof ElementSymbol>, 'draw'> & {
  trigger?: 'view' | 'mount';
};

export function DrawnElementSymbol({ trigger = 'view', ...props }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [draw, setDraw] = useState<SymbolDraw>('wait');

  useEffect(() => {
    if (draw === 'go') return;
    if (trigger === 'mount' || typeof IntersectionObserver === 'undefined') {
      // Um quadro depois: o estado "escondido" chega a ser pintado e a animação roda.
      const frame = requestAnimationFrame(() => setDraw('go'));
      return () => cancelAnimationFrame(frame);
    }
    // `contents` não tem caixa: o observado é o símbolo de dentro.
    const target = ref.current?.firstElementChild;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDraw('go');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [trigger, draw]);

  // O `span` só existe para o observador; `contents` não muda o layout.
  return (
    <span ref={ref} className="contents">
      <ElementSymbol {...props} draw={draw} />
    </span>
  );
}
