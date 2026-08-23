'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '@/components/ui/SaveIndicator';

export function useDebouncedSave<T>(
  value: T,
  saveFn: (value: T) => Promise<void>,
  delay = 600,
  enabled = true
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const first = useRef(true);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        await saveFnRef.current(value);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay, enabled]);

  const markIdle = useCallback(() => setStatus('idle'), []);

  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(markIdle, 1500);
    return () => clearTimeout(t);
  }, [status, markIdle]);

  return status;
}
