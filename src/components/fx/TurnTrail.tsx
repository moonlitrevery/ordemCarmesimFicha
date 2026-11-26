'use client';

/**
 * Borda luminosa do turno da vez (Fase 15, item 8).
 *
 * Origem: motion-primitives, "Border Trail" (components/core/border-trail.tsx),
 * https://motion-primitives.com — licença MIT
 * (https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md).
 *
 * Adaptado (decisão da mestra): em vez de `offsetDistance` em loop infinito, um
 * gradiente cônico **gira por `transform`** dentro de um anel recortado por
 * máscara, por **duas voltas** quando o turno muda; depois o rastro some e fica
 * só a borda acesa, parada (zero quadros). **Só CSS** (`.turn-spin`,
 * `.turn-laps` em globals.css), sem a Motion: um anel só, por cima da lista,
 * mede o item da vez e desliza até ele (`transform`; o tamanho troca na hora).
 * Movimento reduzido / modo leve: só a borda parada.
 *
 * Quem usa: o contêiner da lista precisa de `position: relative`; o item da vez
 * casa com `selector`.
 */
import type { CSSProperties, RefObject } from 'react';
import { useSlidingBox } from '@/components/ui/sliding';

const RING_MASK: CSSProperties = {
  // Só a borda (2 px) aparece: o miolo é recortado.
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
};

const TRAIL =
  'conic-gradient(from 0deg, transparent 0deg 240deg, rgba(196,69,54,0.25) 280deg, #C44536 330deg, #F3B6A8 350deg, transparent 360deg)';

export function TurnTrail({
  containerRef,
  selector,
  trailKey,
  rounded = 'rounded-md',
}: {
  containerRef: RefObject<HTMLElement>;
  selector: string;
  /** Muda a cada turno: o rastro roda de novo. */
  trailKey: string;
  rounded?: string;
}) {
  const { box, placed } = useSlidingBox(containerRef, selector, trailKey);
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={
        'pointer-events-none absolute left-0 top-0 z-10 ' +
        rounded +
        (placed ? ' transition-transform duration-slow ease-enter' : '')
      }
      style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
    >
      <span
        className={
          'absolute inset-0 border border-crimson-glow shadow-[0_0_10px_rgba(196,69,54,0.45)] ' + rounded
        }
      />
      <span key={trailKey} className={'turn-laps absolute inset-0 overflow-hidden p-[2px] ' + rounded} style={RING_MASK}>
        <span
          className="turn-spin absolute left-1/2 top-1/2 aspect-square w-[max(200%,8rem)]"
          style={{ background: TRAIL }}
        />
      </span>
    </span>
  );
}
