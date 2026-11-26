'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Força o movimento reduzido abaixo dele (Fase 15): a Mesa passa `lightMode`
 * (modo leve). Fora da Mesa, vale só a preferência do sistema.
 */
export const ReducedFxContext = createContext(false);

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Movimento reduzido para o que a Fase 15 anima à mão (contagem, pulso, glitch):
 * a preferência do sistema **ou** o modo leve da Mesa. Sem a Motion, para não
 * levá-la ao primeiro carregamento da ficha, da V.M. e da Mesa. O CSS se resolve
 * sozinho (`prefers-reduced-motion` e `[data-motion='reduced']` em globals.css).
 */
export function useReducedFx(): boolean {
  const forced = useContext(ReducedFxContext);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setSystem(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return forced || system;
}
