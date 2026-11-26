'use client';

/**
 * Faixa com fundo de tinta (Fase 15, item 14): só no login e no topo da Lore,
 * nunca na Mesa nem na ficha. Começa (e fica, se for o caso) num fundo
 * estático com o título; o canvas WebGL2 só baixa e liga quando:
 * - não há "reduzir movimento";
 * - o aparelho não é fraco (mais de 4 núcleos e mais de 4 GB, o mesmo critério
 *   do modo leve da Mesa);
 * - o navegador tem WebGL2.
 * Se o WebGL falhar no meio, volta ao estático.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const InkCanvas = dynamic(() => import('./InkCanvas').then((mod) => mod.InkCanvas), { ssr: false });

function canRunInk(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const cores = navigator.hardwareConcurrency;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if ((cores && cores <= 4) || (memory && memory <= 4)) return false;
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    // Só um teste: devolve o contexto na hora (o navegador limita quantos existem).
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(probe);
  } catch {
    return false;
  }
}

export function InkHero({
  title,
  href,
  label,
  className = '',
}: {
  title: string;
  /** A faixa inteira vira link (login: o título levava ao início). */
  href?: string;
  /** Nome acessível do link ou da faixa. */
  label?: string;
  className?: string;
}) {
  const [ink, setInk] = useState(false);

  useEffect(() => {
    setInk(canRunInk());
  }, []);

  return (
    <div
      className={
        // `touch-pan-y`: mexer na tinta com o dedo não trava a rolagem da página.
        'relative overflow-hidden rounded-xl border border-ink-border bg-ink font-display touch-pan-y ' + className
      }
    >
      {/* Estático (e fallback): o título com um halo carmesim parado. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_50%,rgba(139,30,45,0.35),transparent_70%)]"
      />
      <p
        aria-hidden
        className="absolute inset-0 flex items-center justify-center px-4 text-center text-4xl font-semibold text-crimson-soft md:text-6xl"
      >
        {title}
      </p>
      {ink && <InkCanvas text={title} onFail={() => setInk(false)} />}
      {href ? (
        // O movimento sobre o link continua chegando à tinta (os eventos sobem).
        <Link href={href} aria-label={label ?? title} className="absolute inset-0 z-10 rounded-xl" />
      ) : (
        <span className="sr-only">{label ?? title}</span>
      )}
    </div>
  );
}
