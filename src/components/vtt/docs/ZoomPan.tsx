'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Minus, Plus } from 'lucide-react';
import { clampPan, panForZoom } from '@/lib/vtt/docs/rules';
import { IconButton } from '../hud';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const BUTTON_STEP = 1.5;
const WHEEL_STEP = 1.0015;

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Zoom e arraste por CSS, escrevendo no elemento sem passar pelo React:
 * pinça no touch, roda do mouse e botões. Serve à imagem e à página do PDF.
 */
export function ZoomPan({
  wheel,
  children,
}: {
  /** `zoom`: a roda aproxima. `pan`: rola, e Ctrl + roda aproxima (PDF, de cima a baixo). */
  wheel: 'zoom' | 'pan';
  children: (viewport: ViewportSize) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const [viewport, setViewport] = useState<ViewportSize | null>(null);

  const apply = useCallback(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    const current = view.current;
    current.x = clampPan(current.x, content.offsetWidth * current.scale, root.clientWidth);
    current.y = clampPan(current.y, content.offsetHeight * current.scale, root.clientHeight);
    content.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.scale})`;
  }, []);

  const zoomTo = useCallback(
    (next: number, focusX: number, focusY: number) => {
      const current = view.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      current.x = panForZoom(current.x, focusX, current.scale, scale);
      current.y = panForZoom(current.y, focusY, current.scale, scale);
      current.scale = scale;
      apply();
    },
    [apply]
  );

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    const observer = new ResizeObserver(() => {
      setViewport((prev) =>
        prev?.width === root.clientWidth && prev?.height === root.clientHeight
          ? prev
          : { width: root.clientWidth, height: root.clientHeight }
      );
      apply();
    });
    observer.observe(root);
    observer.observe(content);

    // Não passivo: precisa do preventDefault, e o React registra a roda como passiva.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      if (wheel === 'zoom' || event.ctrlKey) {
        zoomTo(
          view.current.scale * WHEEL_STEP ** -event.deltaY,
          event.clientX - rect.left,
          event.clientY - rect.top
        );
        return;
      }
      view.current.x -= event.deltaX;
      view.current.y -= event.deltaY;
      apply();
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      root.removeEventListener('wheel', onWheel);
    };
  }, [apply, wheel, zoomTo]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchDistance.current = 0;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 1) {
      view.current.x += point.x - previous.x;
      view.current.y += point.y - previous.y;
      apply();
      return;
    }
    const [a, b] = Array.from(pointers.current.values());
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance.current > 0 && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      zoomTo(
        (view.current.scale * distance) / pinchDistance.current,
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top
      );
    }
    pinchDistance.current = distance;
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = 0;
  }

  function step(factor: number) {
    const root = rootRef.current;
    if (root) {
      zoomTo(view.current.scale * factor, root.clientWidth / 2, root.clientHeight / 2);
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={rootRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          zoomTo(
            view.current.scale > 1 ? 1 : 2.5,
            event.clientX - rect.left,
            event.clientY - rect.top
          );
        }}
      >
        <div ref={contentRef} className="absolute left-0 top-0 w-max origin-top-left">
          {viewport && children(viewport)}
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex gap-0.5 rounded-lg border border-ink-border bg-ink/90 p-0.5">
        <IconButton
          icon={Minus}
          label="Diminuir zoom"
          tooltip="native"
          onClick={() => step(1 / BUTTON_STEP)}
        />
        <IconButton
          icon={Plus}
          label="Aumentar zoom"
          tooltip="native"
          onClick={() => step(BUTTON_STEP)}
        />
      </div>
    </div>
  );
}
