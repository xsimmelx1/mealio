import { describe, expect, it } from 'vitest';
import seedPrices from '../assets/prices.seed.json';
import type { SeedPrice } from '../domain/schema';
import { PriceEngine } from './priceEngine';

/** Belegt die Rezept-Preis-Linse (useLocalPriceEngine) auf echten Seed-Daten. */
const rows = seedPrices as SeedPrice[];
const haehnchen = { name: 'Hähnchenbrust', amount: 100, unit: 'g' as const };

describe('Preis-Linse: Supermarkt + Bio (echte Seed-Daten)', () => {
  it('Discounter (Aldi) ist nicht teurer als Vollsortimenter (Edeka)', () => {
    const aldi = new PriceEngine(rows, [], { preferredStore: 'aldi', preferredStoreType: 'discounter' });
    const edeka = new PriceEngine(rows, [], { preferredStore: 'edeka', preferredStoreType: 'vollsortimenter' });
    const a = aldi.ingredientPurchase(haehnchen);
    const e = edeka.ingredientPurchase(haehnchen);
    expect(a.status).toBe('ok');
    expect(e.status).toBe('ok');
    expect(a.cost).toBeLessThanOrEqual(e.cost);
  });

  it('Bio-Präferenz wählt eine Bio-Variante (Apfel)', () => {
    const plain = new PriceEngine(rows, []);
    const bio = new PriceEngine(rows, [], { preferredProductFlags: ['bio'] });
    expect(plain.resolve('apfel')?.flags).not.toContain('bio');
    expect(bio.resolve('apfel')?.flags).toContain('bio');
  });
});
