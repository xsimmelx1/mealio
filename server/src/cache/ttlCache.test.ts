import { describe, it, expect, vi } from 'vitest';
import { TtlCache } from './ttlCache.js';

describe('TtlCache', () => {
  it('speichert und liest Werte', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('lässt Einträge nach TTL ablaufen', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.has('k')).toBe(false);
    vi.useRealTimers();
  });

  it('delete und clear funktionieren', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
