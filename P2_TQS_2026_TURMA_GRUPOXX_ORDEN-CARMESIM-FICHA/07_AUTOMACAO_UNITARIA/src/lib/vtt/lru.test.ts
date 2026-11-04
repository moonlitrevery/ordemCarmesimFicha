import { describe, expect, it, vi } from 'vitest';
import { LruCache } from './lru';

describe('LruCache', () => {
  it('descarta o guardado há mais tempo', () => {
    const onEvict = vi.fn();
    const cache = new LruCache<number>(2, onEvict);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 1);
    cache.set('c', 3);
    expect(onEvict).toHaveBeenCalledWith(2, 'b');
    expect(cache.take('a')).toBe(1);
  });

  it('take não descarta', () => {
    const onEvict = vi.fn();
    const cache = new LruCache<number>(2, onEvict);
    cache.set('a', 1);
    expect(cache.take('a')).toBe(1);
    expect(cache.size).toBe(0);
    expect(onEvict).not.toHaveBeenCalled();
  });

  it('clear descarta tudo', () => {
    const onEvict = vi.fn();
    const cache = new LruCache<number>(2, onEvict);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
  });
});
