/**
 * Einfacher In-Memory Cache mit TTL (Time-To-Live).
 *
 * Bewusst minimal: Map + Ablaufzeitstempel. Vorbereitet für /nutrition und /prices,
 * damit externe Quellen (USDA/OFF, Preis-Engine) später nicht bei jedem Request
 * angefragt werden müssen. Eine SQLite-basierte, persistente Variante kann später
 * hinter demselben Interface ergänzt werden.
 */

export interface CacheStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  get size(): number;
}

interface Entry<V> {
  value: V;
  expiresAt: number; // epoch ms
}

export class TtlCache<V> implements CacheStore<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly defaultTtlMs: number;

  /** @param defaultTtlMs Standard-TTL in Millisekunden (Default: 1 Stunde). */
  constructor(defaultTtlMs = 60 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private isExpired(entry: Entry<V>): boolean {
    return entry.expiresAt <= Date.now();
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Entfernt abgelaufene Einträge und liefert die Anzahl der verbleibenden. */
  prune(): number {
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) this.store.delete(key);
    }
    return this.store.size;
  }

  get size(): number {
    return this.store.size;
  }
}
