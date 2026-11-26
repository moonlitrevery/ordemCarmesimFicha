'use client';

import { useCallback, useEffect, useState } from 'react';

/** Preferências de layout da Mesa (Fase 12): só neste navegador. */
export const UI_KEYS = {
  sidebar: 'vtt:ui:sidebar',
  sidebarTab: 'vtt:ui:sidebar-tab',
  docsTab: 'vtt:ui:docs-tab',
  mediaTab: 'vtt:ui:media-tab',
  hud: 'vtt:ui:gm-hud',
  sheetTab: 'vtt:ui:sheet-tab',
} as const;

export function readPref<T>(key: string, parse: (raw: unknown) => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return parse(raw === null ? null : JSON.parse(raw));
  } catch {
    // Sem localStorage (janela anônima) ou valor estragado: vale o padrão.
    return parse(null);
  }
}

export function writePref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem localStorage: vale só nesta visita.
  }
}

/**
 * Estado salvo no localStorage. Começa no padrão e lê o salvo depois de montar,
 * para o HTML do servidor e o primeiro render do cliente serem iguais.
 */
export function usePref<T>(key: string, parse: (raw: unknown) => T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => parse(null));
  useEffect(() => {
    setValue(readPref(key, parse));
    // `parse` é uma função pura do módulo de quem chama: só a chave importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (next: T) => {
      setValue(next);
      writePref(key, next);
    },
    [key]
  );
  return [value, update];
}

/** Uma das opções, ou a primeira. */
export function oneOf<T extends string>(options: readonly T[]) {
  return (raw: unknown): T =>
    typeof raw === 'string' && (options as readonly string[]).includes(raw) ? (raw as T) : options[0];
}

export function parseBoolean(fallback: boolean) {
  return (raw: unknown): boolean => (typeof raw === 'boolean' ? raw : fallback);
}

/** Texto digitado em campo: atalhos de tecla não valem ali. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}
