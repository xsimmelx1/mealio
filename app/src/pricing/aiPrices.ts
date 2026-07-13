import { estimatePrices, type OnlinePrice } from '../api/client';
import { db, type AiPriceCacheEntry } from '../db/db';
import type { AiPriceEntry } from './priceEngine';
import { normalizeName } from './productMatch';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

const isFresh = (e: AiPriceCacheEntry, now: number) => now - e.cachedAt < TTL_MS;

/** Map (normalizeName -> {pricePerPackage,packageSize,packageUnit}) für die Preis-Engine. */
export function buildAiEngineMap(
  entries: AiPriceCacheEntry[],
  now: number = Date.now(),
): Map<string, AiPriceEntry> {
  const map = new Map<string, AiPriceEntry>();
  for (const e of entries) {
    if (isFresh(e, now)) {
      map.set(e.key, {
        pricePerPackage: e.pricePerPackage,
        packageSize: e.packageSize,
        packageUnit: e.packageUnit,
      });
    }
  }
  return map;
}

/** Map (normalizeName -> OnlinePrice mit source "ai") für die Einkaufsliste. */
export function buildAiOnlineMap(
  entries: AiPriceCacheEntry[],
  now: number = Date.now(),
): Record<string, OnlinePrice> {
  const map: Record<string, OnlinePrice> = {};
  for (const e of entries) {
    if (!isFresh(e, now)) continue;
    map[e.key] = {
      key: e.key,
      pricePerPackage: e.pricePerPackage,
      packageSize: e.packageSize,
      packageUnit: e.packageUnit,
      currency: 'EUR',
      source: 'ai',
      updatedAt: null,
    };
  }
  return map;
}

/**
 * Stellt sicher, dass für die gegebenen Zutatnamen KI-Preisschätzungen im Cache liegen.
 * Keyed nach normalizeName. Fragt nur fehlende Namen an (online). Alle Fehler werden
 * geschluckt (KI-Preise sind optional). Kein Effekt offline.
 */
export async function ensureAiEstimates(
  names: string[],
  online: boolean,
  now: number = Date.now(),
): Promise<void> {
  if (!online || names.length === 0) return;
  try {
    // normName -> repräsentativer Originalname (für den Prompt).
    const byKey = new Map<string, string>();
    for (const n of names) {
      const k = normalizeName(n);
      if (k && !byKey.has(k)) byKey.set(k, n);
    }
    if (byKey.size === 0) return;

    const cached = await db.aiPrices.where('key').anyOf([...byKey.keys()]).toArray();
    const fresh = new Set(cached.filter((e) => isFresh(e, now)).map((e) => e.key));
    const missing = [...byKey.entries()].filter(([k]) => !fresh.has(k));
    if (missing.length === 0) return;

    const estimates = await estimatePrices(missing.map(([key, name]) => ({ key, name })));
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
  } catch {
    /* KI-Preise optional; Fehler (Netz/DB/Teardown) ignorieren. */
  }
}
