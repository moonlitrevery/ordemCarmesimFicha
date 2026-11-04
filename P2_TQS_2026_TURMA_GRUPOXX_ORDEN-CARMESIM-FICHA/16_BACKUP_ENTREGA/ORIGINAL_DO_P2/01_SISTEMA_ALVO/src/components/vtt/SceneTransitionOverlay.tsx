'use client';

import { ORDER_SYMBOL_URL, parseSceneTransition } from '@/lib/vtt/scene-transition';
import { useVttStore } from '@/lib/vtt/store';

const SYMBOL_FADE_MS = 300;

/**
 * Em DOM: só `opacity` e `transform`, que o navegador anima sem desenhar o canvas.
 * Fica montado e invisível, sobre o mapa e sob o HUD. O ícone tem fundo `ink`, a cor daqui.
 */
export function SceneTransitionOverlay() {
  const view = useVttStore((s) => s.sceneTransition);
  // Pré-carrega para o símbolo não chegar atrasado na primeira troca.
  const usesSymbol = useVttStore(
    (s) => parseSceneTransition(s.table?.scene_transition) === 'simbolo'
  );

  const covering = view !== null && view.phase !== 'reveal';
  const showSymbol = view?.style === 'simbolo' && view.phase === 'hold';

  return (
    <div
      aria-hidden
      className={
        'absolute inset-0 z-[5] flex items-center justify-center bg-ink ' +
        (view ? '' : 'pointer-events-none')
      }
      style={{
        opacity: covering ? 1 : 0,
        transitionProperty: 'opacity',
        transitionDuration: `${view?.durationMs ?? 0}ms`,
        transitionTimingFunction: 'ease-in-out',
      }}
    >
      {usesSymbol && (
        // eslint-disable-next-line @next/next/no-img-element -- SVG local, sem otimizador
        <img
          src={ORDER_SYMBOL_URL}
          alt=""
          className="h-40 w-40"
          style={{
            opacity: showSymbol ? 1 : 0,
            transform: showSymbol || view?.lightMode ? 'scale(1)' : 'scale(0.85)',
            transitionProperty: view?.lightMode ? 'opacity' : 'opacity, transform',
            transitionDuration: `${SYMBOL_FADE_MS}ms`,
            transitionTimingFunction: 'ease-out',
          }}
        />
      )}
    </div>
  );
}
