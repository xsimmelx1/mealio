import { describe, expect, it } from 'vitest';
import seedPrices from '../assets/prices.seed.json';
import seedRecipes from '../assets/recipes.seed.json';
import { matchProductKey } from '../pricing/productMatch';
import { SeedPriceSchema } from './schema';

/**
 * Verifikation der Seed-Preisdatei (prices.seed.json).
 * Preise sind bewusst geschätzte Startwerte (DE, Mitte 2026) – hier wird nur
 * strukturelle Konsistenz gegen das Domänen-Schema geprüft, nicht die Höhe.
 */

/** Mindestzahl abgedeckter Kernzutaten (eindeutige productKeys). */
const MIN_CORE_INGREDIENTS = 25;

/** Mindest-Match-Quote der Rezept-Zutat-Vorkommen gegen den Seed-Preiskatalog. */
const MIN_MATCH_RATE = 0.88;

describe('prices.seed.json', () => {
  it('ist ein nicht-leeres Array', () => {
    expect(Array.isArray(seedPrices)).toBe(true);
    expect(seedPrices.length).toBeGreaterThan(0);
  });

  it('jeder Eintrag ist valide gegen SeedPriceSchema', () => {
    for (const entry of seedPrices) {
      const result = SeedPriceSchema.safeParse(entry);
      if (!result.success) {
        throw new Error(
          `Ungültiger Seed-Preis-Eintrag ${JSON.stringify(entry)}: ${result.error.message}`,
        );
      }
    }
  });

  it('deckt mindestens die geforderte Anzahl Kernzutaten ab', () => {
    const keys = new Set(seedPrices.map((entry) => entry.productKey));
    expect(keys.size).toBeGreaterThanOrEqual(MIN_CORE_INGREDIENTS);
  });

  it('hat je productKey mindestens einen Discounter-Eintrag', () => {
    const keys = new Set(seedPrices.map((entry) => entry.productKey));
    for (const key of keys) {
      const hasDiscounter = seedPrices.some(
        (entry) => entry.productKey === key && entry.storeType === 'discounter',
      );
      expect(hasDiscounter, `Kein Discounter-Eintrag für "${key}"`).toBe(true);
    }
  });

  it('enthält Fairtrade-, Regional- und Bio-Zeilen (Label-Overlay)', () => {
    const count = (flag: string) =>
      seedPrices.filter((e) => (e.flags ?? []).includes(flag as never)).length;
    expect(count('fairtrade'), 'keine Fairtrade-Zeilen').toBeGreaterThan(0);
    expect(count('regional'), 'keine Regional-Zeilen').toBeGreaterThan(0);
    expect(count('bio'), 'zu wenige Bio-Zeilen').toBeGreaterThan(10);
  });

  it('productKeys sind kebab-case ASCII', () => {
    for (const entry of seedPrices) {
      expect(entry.productKey, `productKey "${entry.productKey}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('Grundpreis (pricePerPackage/packageSize) ist positiv und plausibel je productKey', () => {
    const byKey = new Map<string, number[]>();
    for (const entry of seedPrices) {
      const basePrice = entry.pricePerPackage / entry.packageSize;
      expect(basePrice).toBeGreaterThan(0);
      const list = byKey.get(entry.productKey) ?? [];
      list.push(basePrice);
      byKey.set(entry.productKey, list);
    }
    // Grundpreise der gleichen Zutat dürfen über Stores nicht um mehr als Faktor 5 abweichen.
    for (const [key, prices] of byKey) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      expect(max / min, `Grundpreis-Spreizung zu groß für "${key}"`).toBeLessThanOrEqual(5);
    }
  });

  it(`matcht mindestens ${Math.round(MIN_MATCH_RATE * 100)}% der Rezept-Zutat-Vorkommen`, () => {
    const knownKeys = new Set(seedPrices.map((entry) => entry.productKey));
    const names = seedRecipes.flatMap((recipe) => recipe.ingredients.map((ing) => ing.name));
    expect(names.length, 'Keine Rezept-Zutaten gefunden').toBeGreaterThan(0);

    const unmatched: string[] = [];
    let matched = 0;
    for (const name of names) {
      if (matchProductKey(name, knownKeys)) matched += 1;
      else unmatched.push(name);
    }

    const rate = matched / names.length;
    expect(
      rate,
      `Match-Quote ${(rate * 100).toFixed(1)}% < ${MIN_MATCH_RATE * 100}%. ` +
        `Unmatched: ${[...new Set(unmatched)].join(', ')}`,
    ).toBeGreaterThanOrEqual(MIN_MATCH_RATE);
  });
});
