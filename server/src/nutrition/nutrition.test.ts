import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeNutrition } from './computeNutrition.js';
import { matchSeedEntry, toGrams, normalizeName } from './matchNutrition.js';
import { toNumberOrNull } from './providers/types.js';
import { createOffProvider } from './providers/openfoodfacts.js';
import { createUsdaProvider } from './providers/usda.js';
import type { NutritionProvider } from './providers/types.js';
import { TtlCache } from '../cache/ttlCache.js';
import type { Per100g } from './nutritionSeed.js';

describe('normalizeName + matchSeedEntry', () => {
  it('faltet Umlaute und matcht exakt', () => {
    expect(normalizeName('Zwiebel')).toBe('zwiebel');
    expect(matchSeedEntry('Reis')?.key).toBe('reis');
  });

  it('nutzt Aliase (Spaghetti -> nudeln, Gehackte Tomaten -> dosentomaten)', () => {
    expect(matchSeedEntry('Spaghetti')?.key).toBe('nudeln');
    expect(matchSeedEntry('Gehackte Tomaten')?.key).toBe('dosentomaten');
    expect(matchSeedEntry('Naturjoghurt')?.key).toBe('joghurt');
  });

  it('rät nicht falsch: unbekannte Zutat -> null', () => {
    expect(matchSeedEntry('Einhornstaub')).toBeNull();
  });
});

describe('toGrams (Einheiten-Normalisierung)', () => {
  it('Masse: g direkt, kg *1000', () => {
    expect(toGrams(100, 'g')).toBe(100);
    expect(toGrams(1, 'kg')).toBe(1000);
  });
  it('Volumen: 1 ml ≈ 1 g, l *1000, tsp=5ml, tbsp=15ml', () => {
    expect(toGrams(100, 'ml')).toBe(100);
    expect(toGrams(1, 'l')).toBe(1000);
    expect(toGrams(1, 'tsp')).toBe(5);
    expect(toGrams(1, 'tbsp')).toBe(15);
  });
  it('prise ≈ 0.5 g', () => {
    expect(toGrams(1, 'prise')).toBe(0.5);
  });
  it('stück über gramsPerPiece; ohne Gewicht -> null', () => {
    expect(toGrams(2, 'stück', 58)).toBe(116);
    expect(toGrams(1, 'stück')).toBeNull();
  });
});

describe('computeNutrition (Seed, offline)', () => {
  it('einzelne Zutat pro 100 g korrekt', async () => {
    const res = await computeNutrition([{ name: 'Reis', amount: 100, unit: 'g' }]);
    expect(res.matchedCount).toBe(1);
    expect(res.perServing).toEqual({ kcal: 350, protein: 7, carbs: 78, fat: 1 });
  });

  it('kg skaliert korrekt (Faktor 10)', async () => {
    const res = await computeNutrition([{ name: 'Reis', amount: 1, unit: 'kg' }]);
    expect(res.perServing?.kcal).toBe(3500);
  });

  it('Öl per tbsp (15 g)', async () => {
    const res = await computeNutrition([{ name: 'Olivenöl', amount: 1, unit: 'tbsp' }]);
    expect(res.perServing?.kcal).toBeCloseTo(132.6, 1);
  });

  it('Ei per stück nutzt Stückgewicht (58 g)', async () => {
    const res = await computeNutrition([{ name: 'Eier', amount: 1, unit: 'stück' }]);
    expect(res.matchedCount).toBe(1);
    expect(res.perServing?.kcal).toBeCloseTo(82.9, 1);
  });

  it('Summierung mehrerer Zutaten + Teilung durch servings', async () => {
    const res = await computeNutrition(
      [
        { name: 'Reis', amount: 100, unit: 'g' },
        { name: 'Eier', amount: 1, unit: 'stück' },
      ],
      { servings: 2 },
    );
    expect(res.matchedCount).toBe(2);
    // (350 + 82.94) / 2
    expect(res.perServing?.kcal).toBeCloseTo(216.5, 1);
  });

  it('matchedCount===0 -> perServing null (nie 0)', async () => {
    const res = await computeNutrition([{ name: 'Einhornstaub', amount: 100, unit: 'g' }]);
    expect(res.perServing).toBeNull();
    expect(res.matchedCount).toBe(0);
    expect(res.unmatchedCount).toBe(1);
  });

  it('unmatchte Zutat landet in unknownIngredients, matchte zählt weiter', async () => {
    const res = await computeNutrition([
      { name: 'Reis', amount: 100, unit: 'g' },
      { name: 'Einhornstaub', amount: 50, unit: 'g' },
    ]);
    expect(res.matchedCount).toBe(1);
    expect(res.unknownIngredients).toEqual(['Einhornstaub']);
    expect(res.perServing).not.toBeNull();
  });

  it('stück ohne hinterlegtes Stückgewicht -> unknown (nicht umrechenbar)', async () => {
    // Brokkoli hat kein gramsPerPiece im Seed.
    const res = await computeNutrition([{ name: 'Brokkoli', amount: 1, unit: 'stück' }]);
    expect(res.matchedCount).toBe(0);
    expect(res.unknownIngredients).toContain('Brokkoli');
  });
});

describe('computeNutrition (Online-Zweig)', () => {
  const okProvider: NutritionProvider = {
    name: 'FakeOK',
    lookup: vi.fn(async (): Promise<Per100g> => ({ kcal: 50, protein: 1, carbs: 10, fat: 0.2 })),
  };

  it('online=false -> Provider wird NICHT aufgerufen; Zutat bleibt unknown', async () => {
    const spy = vi.fn(async () => ({ kcal: 1, protein: 1, carbs: 1, fat: 1 }));
    const provider: NutritionProvider = { name: 'Spy', lookup: spy };
    const res = await computeNutrition([{ name: 'Dragonfruit', amount: 100, unit: 'g' }], {
      online: false,
      providers: [provider],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(res.matchedCount).toBe(0);
  });

  it('online=true -> unbekannte Seed-Zutat wird online gematcht', async () => {
    const res = await computeNutrition([{ name: 'Dragonfruit', amount: 200, unit: 'g' }], {
      online: true,
      providers: [okProvider],
    });
    expect(res.matchedCount).toBe(1);
    expect(res.perServing?.kcal).toBeCloseTo(100, 1);
  });

  it('Online-Fehler -> Fallback ohne Crash (Zutat unknown)', async () => {
    const boom: NutritionProvider = {
      name: 'Boom',
      lookup: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const res = await computeNutrition([{ name: 'Dragonfruit', amount: 100, unit: 'g' }], {
      online: true,
      providers: [boom],
    });
    expect(res.matchedCount).toBe(0);
    expect(res.unknownIngredients).toContain('Dragonfruit');
  });

  it('Provider liefert null (z. B. OFF 200 ohne Produkt) -> unknown; Ergebnis gecacht', async () => {
    const nullProvider = { name: 'NullP', lookup: vi.fn(async () => null) };
    const cache = new TtlCache<Per100g | null>(1000);
    const res1 = await computeNutrition([{ name: 'Dragonfruit', amount: 100, unit: 'g' }], {
      online: true,
      providers: [nullProvider],
      cache,
    });
    expect(res1.matchedCount).toBe(0);
    // Zweiter Aufruf nutzt den Negativ-Cache -> Provider wird nicht erneut befragt.
    await computeNutrition([{ name: 'Dragonfruit', amount: 100, unit: 'g' }], {
      online: true,
      providers: [nullProvider],
      cache,
    });
    expect(nullProvider.lookup).toHaveBeenCalledTimes(1);
  });

  it('Seed hat Vorrang: Provider wird für Seed-Treffer nicht befragt', async () => {
    const spy = vi.fn(async () => ({ kcal: 1, protein: 1, carbs: 1, fat: 1 }));
    const provider: NutritionProvider = { name: 'Spy', lookup: spy };
    await computeNutrition([{ name: 'Reis', amount: 100, unit: 'g' }], {
      online: true,
      providers: [provider],
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('toNumberOrNull (Rand-Casting)', () => {
  it('castet Strings (OFF liefert teils Strings)', () => {
    expect(toNumberOrNull('12.5')).toBe(12.5);
    expect(toNumberOrNull('12,5')).toBe(12.5);
    expect(toNumberOrNull(7)).toBe(7);
  });
  it('nicht-parsebar -> null', () => {
    expect(toNumberOrNull('abc')).toBeNull();
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull(NaN)).toBeNull();
  });
});

describe('OFF-Provider (fetch gemockt)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('HTTP 200 ohne Produkt (products=[]) -> null (nicht auf Status verlassen)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ count: 0, products: [] }), { status: 200 })),
    );
    const off = createOffProvider();
    expect(await off.lookup('nichtvorhanden')).toBeNull();
  });

  it('parst Nährwerte und castet String-Zahlen', async () => {
    const body = {
      count: 1,
      products: [
        {
          nutriments: {
            'energy-kcal_100g': '52',
            proteins_100g: '0.3',
            carbohydrates_100g: 14,
            fat_100g: '0.2',
          },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const off = createOffProvider();
    const res = await off.lookup('apfel');
    expect(res).toEqual({ kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 });
  });
});

describe('USDA-Provider (fetch gemockt)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leere foods -> null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ foods: [] }), { status: 200 })),
    );
    const usda = createUsdaProvider('DEMO_KEY');
    expect(await usda.lookup('nichts')).toBeNull();
  });

  it('extrahiert Makros über nutrientNumber', async () => {
    const body = {
      foods: [
        {
          foodNutrients: [
            { nutrientNumber: '1008', value: 165 },
            { nutrientNumber: '1003', value: 31 },
            { nutrientNumber: '1005', value: 0 },
            { nutrientNumber: '1004', value: 3.6 },
          ],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const usda = createUsdaProvider('DEMO_KEY');
    expect(await usda.lookup('chicken')).toEqual({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
  });
});
