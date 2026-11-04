'use client';

import { LazyMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./motion-features').then((m) => m.default);

/** Obrigatório em volta de `m.*`: sem ele os elementos aparecem, mas não animam. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
