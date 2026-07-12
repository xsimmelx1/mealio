import { estimatePrices, type OnlinePrice } from '../api/client';
import { db } from '../db/db';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

function toOnlinePrice(e: {
  key: string;
  pricePerPackage: number;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'stück';
}): OnlinePrice {
  return {
    key: e.key,
    pricePerPackage: e.pricePerPackage,
    packageSize: e.packageSize,
    packageUnit: e.packageUnit,
    currency: 'EUR',
    source: 'ai',
    updatedAt: null,
  };
}

/**
 * Liefert KI-Preisschätzungen für die gegebenen Zutaten. Nutzt zuerst den Dexie-Cache
 * (7 Tage TTL) und fragt nur unbekannte Keys beim Backend an; frische Schätzungen werden
 * gecacht. Ergebnis: Map key -> OnlinePrice (source "ai"). Fehler werden geschluckt.
 */
export async function fetchAiPricesCached(
  items: { key: string; name: string }[],
  now: number = Date.now(),
): Promise<Record<string, OnlinePrice>> {
  const map: Record<string, OnlinePrice> = {};
  if (items.length === 0) return map;

  // 1. Cache lesen.
  const keys = items.map((i) => i.key);
  const cached = await db.aiPrices.where('key').anyOf(keys).toArray();
  const fresh = new Map(cached.filter((c) => now - c.cachedAt < TTL_MS).map((c) => [c.key, c]));
  for (const [key, c] of fresh) map[key] = toOnlinePrice(c);

  // 2. Nur unbekannte Keys ans Backend.
  const missing = items.filter((i) => !fresh.has(i.key));
  if (missing.length === 0) return map;

  try {
    const estimates = await estimatePrices(missing);
    const toStore = estimates.filter(
      (e) => e.source === 'ai' && e.pricePerPackage != null && e.packageSize != null && e.packageUnit,
    );
    if (toStore.length) {
      await db.aiPrices.bulkPut(
        toStore.map((e) => ({
          key: e.key,
          pricePerPackage: e.pricePerPackage as number,
          packageSize: e.packageSize as number,
          packageUnit: e.packageUnit as 'g' | 'ml' | 'stück',
          cachedAt: now,
        })),
      );
    }
    for (const e of estimates) if (e.source === 'ai') map[e.key] = e;
  } catch {
    /* KI-Schätzung optional; Fehler ignorieren (Positionen bleiben ohne Preis). */
  }
  return map;
}
