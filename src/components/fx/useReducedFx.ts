'use client';

import { MotionConfigContext, useReducedMotion } from 'framer-motion';
import { useContext } from 'react';

/**
 * Movimento reduzido para o que a Fase 15 anima à mão (`animate`, molas): vale
 * a preferência do sistema **ou** um `MotionConfig reducedMotion="always"` acima
 * (modo leve da Mesa, via `MotionProvider reduced`).
 *
 * `useReducedMotionConfig` da Motion não serve sozinho: sem `MotionConfig` em
 * volta, o padrão é `never` e a preferência do sistema seria ignorada.
 */
export function useReducedFx(): boolean {
  const system = useReducedMotion();
  const { reducedMotion } = useContext(MotionConfigContext);
  return reducedMotion === 'always' || Boolean(system);
}
