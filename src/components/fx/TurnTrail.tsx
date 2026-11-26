'use client';

/**
 * Borda luminosa do turno da vez (Fase 15, item 8).
 *
 * Origem: motion-primitives, "Border Trail" (components/core/border-trail.tsx),
 * https://motion-primitives.com — licença MIT
 * (https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md).
 *
 * Adaptado (decisão da mestra): em vez de `offsetDistance` em loop infinito (a
 * Motion não roda isso no compositor), um gradiente cônico **gira por `transform`**
 * dentro de um anel recortado por máscara, por **duas voltas** quando o turno muda;
 * depois o rastro some e fica só a borda acesa, parada (zero quadros). A borda
 * parada tem `layoutId`: ao passar o turno, ela desliza até o próximo.
 * Movimento reduzido / modo leve: só a borda parada.
 *
 * Quem usa: o item da lista precisa de `position: relative` e cantos arredondados.
 * Precisa do `MotionProvider full` (layout), que a Mesa já tem.
 */
import { m } from 'framer-motion';
import type { CSSProperties } from 'react';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';
import { useReducedFx } from './useReducedFx';

const LAPS = 2;
const LAP_S = 1.2;

const RING_MASK: CSSProperties = {
  // Só a borda (2 px) aparece: o miolo é recortado.
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
};

const TRAIL =
  'conic-gradient(from 0deg, transparent 0deg 240deg, rgba(196,69,54,0.25) 280deg, #C44536 330deg, #F3B6A8 350deg, transparent 360deg)';

export function TurnTrail({ layoutId, trailKey }: { layoutId: string; trailKey: string }) {
  const reduced = useReducedFx();
  return (
    <>
      <m.span
        aria-hidden
        layoutId={layoutId}
        transition={{ duration: DUR.slow, ease: EASE_ENTER }}
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-crimson-glow shadow-[0_0_10px_rgba(196,69,54,0.45)]"
      />
      {!reduced && <Laps key={trailKey} />}
    </>
  );
}

function Laps() {
  return (
    <m.span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] p-[2px]"
      style={RING_MASK}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: LAPS * LAP_S - DUR.slow, duration: DUR.slow, ease: EASE_ENTER }}
    >
      <m.span
        className="absolute left-1/2 top-1/2 aspect-square w-[max(200%,8rem)]"
        style={{ x: '-50%', y: '-50%', background: TRAIL }}
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 * LAPS }}
        transition={{ duration: LAPS * LAP_S, ease: 'linear' }}
      />
    </m.span>
  );
}
