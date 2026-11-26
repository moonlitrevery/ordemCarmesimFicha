'use client';

import { LazyMotion, MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

const loadAnimation = () => import('./motion-features').then((m) => m.default);
// `domMax` acrescenta arrastar e `layoutId`: só onde se usa (Mesa, abas).
const loadMax = () => import('./motion-features-max').then((m) => m.default);

/**
 * Obrigatório em volta de `m.*`: sem ele os elementos aparecem, mas não animam.
 * As features chegam depois da página (import dinâmico). `reduced` força o
 * movimento reduzido (modo leve da Mesa); sem ele, vale a preferência do sistema.
 */
export function MotionProvider({
  children,
  full = false,
  reduced = false,
}: {
  children: ReactNode;
  full?: boolean;
  reduced?: boolean;
}) {
  return (
    <LazyMotion features={full ? loadMax : loadAnimation}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>
    </LazyMotion>
  );
}
