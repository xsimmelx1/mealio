import type { PriceOverride, SeedPrice, ShoppingItem } from '../domain/schema';
import { PriceEngine } from './priceEngine';
import { toBase } from './units';

/**
 * Summiert die Einkaufskosten (ganze Packungen) für ein bestimmtes Preisniveau
 * (Discounter vs. Vollsortimenter) — für den Supermarkt-Vergleich. Vorrats-Positionen
 * und Positionen ohne productKey werden übersprungen.
 */
export function totalForStoreType(
  items: ShoppingItem[],
  seedPrices: SeedPrice[],
  overrides: PriceOverride[],
  storeType: 'discounter' | 'vollsortimenter',
): { total: number; pricedCount: number } {
  const engine = new PriceEngine(seedPrices, overrides, { preferredStoreType: storeType });
  let total = 0;
  let pricedCount = 0;
  for (const it of items) {
    if (it.isPantry || !it.productKey) continue;
    const dim = toBase(it.totalAmount || 1, it.unit).dim;
    const w = engine.wholePackageCost(it.productKey, it.totalAmount, dim);
    if (w.cost != null) {
      total += w.cost;
      pricedCount++;
    }
  }
  return { total: Math.round(total * 100) / 100, pricedCount };
}
