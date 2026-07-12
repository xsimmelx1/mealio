/**
 * Orchestrierung für /prices (Online-Zweig, opt-in).
 *
 * Rolle/Priorität: Diese Online-Preise sind die NIEDRIGSTE Quelle
 * (Manual > LocalSeed > Online); das Frontend entscheidet über die Priorität.
 * Zweck ist vor allem, Zutaten zu bepreisen, die NICHT im lokalen Seed liegen.
 *
 * Verhalten:
 *   - Online nur, wenn `online` (Feature-Flag PRICES_ONLINE=1) UND Provider vorhanden.
 *     Sonst liefert JEDES Item sofort ein "unknown"-Ergebnis (kein Netz-Aufruf).
 *   - Ergebnisse (inkl. Negativ-Treffer) werden mit TTL gecacht.
 *   - Blockiere NIE den App-Flow: pro Provider Timeout, Fehler werden still
 *     geschluckt -> das Item fällt auf "unknown" zurück.
 *   - Genau ein Ergebnis pro Request-Item, gleiche Reihenfolge/keys.
 */

import type { CacheStore } from '../cache/ttlCache.js';
import { logger } from '../lib/logger.js';
import type { OnlinePrice, PackageUnit, PriceProvider, PriceQuery } from './providers/types.js';

/** Ein Ergebnis-Item gemäß Response-Vertrag von POST /prices. */
export interface PriceResultItem {
  key: string;
  pricePerPackage: number | null;
  packageSize: number | null;
  packageUnit: PackageUnit | null;
  currency: string;
  source: 'open-prices' | 'unknown';
  updatedAt: string | null;
}

export interface ResolvePricesOptions {
  /** Online nur versuchen, wenn true (Feature-Flag PRICES_ONLINE=1). */
  online?: boolean;
  /** Online-Provider in Prioritätsreihenfolge (z. B. [OpenPrices]). */
  providers?: readonly PriceProvider[];
  /**
   * Cache für Online-Lookups. undefined = Miss, null = bekannt-negativ
   * (verhindert wiederholte Abfragen für unbekannte keys -> Negativ-Cache).
   */
  cache?: CacheStore<OnlinePrice | null>;
}

/** Das neutrale "unknown"-Ergebnis (nie raten, App-Flow nie blockieren). */
function unknownResult(key: string): PriceResultItem {
  return {
    key,
    pricePerPackage: null,
    packageSize: null,
    packageUnit: null,
    currency: 'EUR',
    source: 'unknown',
    updatedAt: null,
  };
}

/** Stabiler Cache-Key aus productKey + Region (query fließt nicht ein). */
function cacheKeyFor(item: PriceQuery): string {
  return `open-prices:${item.key}|${item.region ?? ''}`.toLowerCase();
}

/**
 * Fragt die Provider der Reihe nach ab (mit Cache). Fehler still schlucken.
 * Gibt einen OnlinePrice oder null zurück.
 */
async function lookupOnline(
  item: PriceQuery,
  providers: readonly PriceProvider[],
  cache?: CacheStore<OnlinePrice | null>,
): Promise<OnlinePrice | null> {
  const key = cacheKeyFor(item);
  if (cache) {
    const cached = cache.get(key);
    if (cached !== undefined) return cached; // Treffer ODER bekannt-negativ
  }

  for (const provider of providers) {
    try {
      const result = await provider.priceFor(item);
      if (result) {
        cache?.set(key, result);
        return result;
      }
    } catch (err) {
      // Netz-/Parse-/Timeout-Fehler dürfen den App-Flow NIE blockieren.
      logger.warn('prices: Online-Provider fehlgeschlagen', {
        provider: provider.name,
        key: item.key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Nichts gefunden -> negativ cachen (Negativ-Cache).
  cache?.set(key, null);
  return null;
}

/**
 * Löst Preise für alle Items auf. Reihenfolge/Anzahl = Eingabe.
 * Ohne `online`/Provider liefert jedes Item sofort "unknown" (kein Netz-Aufruf).
 */
export async function resolvePrices(
  items: readonly PriceQuery[],
  options: ResolvePricesOptions = {},
): Promise<PriceResultItem[]> {
  const providers = options.providers ?? [];

  if (!options.online || providers.length === 0) {
    return items.map((it) => unknownResult(it.key));
  }

  // Items parallel, aber jeder Lookup fängt seine Fehler selbst -> ein Ausfall
  // blockiert die übrigen nicht. Reihenfolge bleibt durch Promise.all erhalten.
  return Promise.all(
    items.map(async (it) => {
      const price = await lookupOnline(it, providers, options.cache);
      if (!price) return unknownResult(it.key);
      return {
        key: it.key,
        pricePerPackage: price.pricePerPackage,
        packageSize: price.packageSize,
        packageUnit: price.packageUnit,
        currency: price.currency,
        source: price.source,
        updatedAt: price.updatedAt,
      };
    }),
  );
}
