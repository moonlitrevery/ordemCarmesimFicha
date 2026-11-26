'use client';

/**
 * O canvas do fundo de tinta (Fase 15, item 14). Só chega por import dinâmico,
 * depois que o `InkHero` decidiu que o aparelho aguenta.
 *
 * Origem: kokonutui, "Ink Background" (components/kokonutui/ink-background.tsx),
 * https://kokonutui.com/docs/backgrounds/ink-background — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: cores fixas do tema (fundo `ink`, tinta carmesim; sem a checagem de
 * tema a cada 500 ms); sem conteúdo nem botões do kit; o laço dorme 5 s depois
 * do último movimento (como no kit) e pausa com a aba escondida ou fora da tela;
 * falhou o WebGL2, avisa o pai, que fica no fundo estático.
 */
import { useEffect, useRef } from 'react';
import {
  createFluid,
  drawMask,
  DROP_RADIUS,
  GATHER,
  GATHER_AFTER,
  headline,
  SLEEP_AFTER,
  STIR_FORCE,
  STIR_RADIUS,
} from './ink-fluid';

/** `#0C0A0D` (ink), `#8B1E2D` (crimson) e `#C44536` (crimson.glow), de 0 a 1. */
const PAPER = [12 / 255, 10 / 255, 13 / 255];
const INK = [139 / 255, 30 / 255, 45 / 255];
const ACCENT = [196 / 255, 69 / 255, 54 / 255];

export function InkCanvas({ text, onFail }: { text: string; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.parentElement;
    const gl = canvas?.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    const fluid = gl ? createFluid(gl) : null;
    if (!canvas || !root || !fluid) {
      failRef.current();
      return;
    }
    fluid.setColors(PAPER, INK, ACCENT);
    const maskCanvas = document.createElement('canvas');

    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let visible = document.visibilityState === 'visible';
    let onScreen = true;
    let touched = -Number.POSITIVE_INFINITY;
    let active = performance.now();
    const born = performance.now();
    const hand = { x: 0, y: 0, on: false, down: false, moved: 0 };

    const build = () => {
      const rect = root.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      fluid.resize(canvas.width, canvas.height);
      drawMask(maskCanvas, text, width, height, getComputedStyle(root).fontFamily);
      fluid.setMask(maskCanvas);
      fluid.step(1 / 60, 0);
      fluid.draw();
    };

    // Gotas em volta das letras, que o título puxa para si.
    const bloom = () => {
      const { size, center } = headline(width, height);
      const y = 1 - center / height;
      for (let i = 0; i < 9; i++) {
        const x = 0.2 + (0.6 * (i + Math.random() * 0.6)) / 9;
        const dy = ((Math.random() - 0.5) * size * 0.6) / height;
        fluid.splat(x, y + dy, (Math.random() - 0.5) * 320, (Math.random() - 0.5) * 320, [0.45, 0], DROP_RADIUS * (0.6 + Math.random()));
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min((now - (last || now - 16)) / 1000, 1 / 30);
      last = now;
      if (hand.down || hand.moved > now - 100) active = now;
      const idle = now - touched;
      let gather = 0;
      if (idle > GATHER_AFTER) gather = GATHER * Math.min(1, (idle - GATHER_AFTER) / 1500);
      const age = now - born;
      if (age < 1500) gather = Math.max(gather, 0.012 + (age / 1500) * GATHER);
      fluid.step(dt, gather);
      fluid.draw();
      // Parado há 5 s: o laço dorme (zero quadros) até alguém mexer.
      if (now - active < SLEEP_AFTER || age < 4000) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf && visible) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    build();
    canvas.style.opacity = '1';
    bloom();
    start();
    // A fonte do título (next/font, `swap`) pode chegar depois: redesenha a máscara.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      build();
      active = performance.now();
      start();
    });

    const resizeObserver = new ResizeObserver(() => {
      const rect = root.getBoundingClientRect();
      if (Math.abs(rect.width - width) > 1 || Math.abs(rect.height - height) > 1) {
        build();
        active = performance.now();
        touched = -Number.POSITIVE_INFINITY;
        start();
      }
    });
    resizeObserver.observe(root);

    const update = () => {
      visible = onScreen && document.visibilityState === 'visible';
      start();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    intersection.observe(root);
    document.addEventListener('visibilitychange', update);

    const local = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / rect.width, y: 1 - (event.clientY - rect.top) / rect.height };
    };
    const onMove = (event: PointerEvent) => {
      const p = local(event);
      if (hand.on) {
        const dx = p.x - hand.x;
        const dy = p.y - hand.y;
        if (dx || dy) {
          fluid.splat(p.x, p.y, dx * STIR_FORCE, dy * STIR_FORCE, hand.down ? [0, 0.08] : [0, 0], STIR_RADIUS);
          touched = performance.now();
          hand.moved = touched;
        }
      }
      hand.x = p.x;
      hand.y = p.y;
      hand.on = true;
      start();
    };
    const onLeave = () => {
      hand.on = false;
      hand.down = false;
    };
    const onDown = (event: PointerEvent) => {
      const p = local(event);
      hand.down = true;
      hand.on = true;
      hand.x = p.x;
      hand.y = p.y;
      fluid.splat(p.x, p.y, 0, 0, [0, 0.65], DROP_RADIUS);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.012;
        fluid.splat(p.x + Math.cos(a) * r * (height / width), p.y + Math.sin(a) * r, Math.cos(a) * 420, Math.sin(a) * 420, [0, 0], STIR_RADIUS * 0.6);
      }
      touched = performance.now();
      active = touched;
      start();
    };
    const onUp = () => {
      hand.down = false;
    };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', update);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      fluid.destroy();
    };
  }, [text]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-slow ease-enter"
    />
  );
}
