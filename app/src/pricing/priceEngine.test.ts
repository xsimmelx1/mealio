import { describe, expect, it } from 'vitest';
import type { PriceOverride, SeedPrice } from '../domain/schema';
import { PriceEngine } from './priceEngine';

const seed: SeedPrice[] = [
  {
    productKey: 'haehnchenbrust',
    label: 'Hähnchenbrust',
    storeId: 'aldi',
    storeType: 'discounter',
    aisle: 'fleisch-fisch',
    packageSize: 500,
    packageUnit: 'g',
    pricePerPackage: 4.0,
  },
  {
    productKey: 'haehnchenbrust',
    label: 'Hähnchenbrust',
    storeId: 'rewe',
    storeType: 'vollsortimenter',
    aisle: 'fleisch-fisch',
    packageSize: 500,
    packageUnit: 'g',
    pricePerPackage: 6.0,
  },
  {
    productKey: 'milch',
    label: 'Milch',
    storeId: 'aldi',
    storeType: 'discounter',
    aisle: 'kühlregal',
    packageSize: 1000,
    packageUnit: 'ml',
    pricePerPackage: 1.0,
  },
  {
    productKey: 'eier',
    label: 'Eier',
    storeId: 'aldi',
    storeType: 'discounter',
    aisle: 'kühlregal',
    packageSize: 10,
    packageUnit: 'stück',
    pricePerPackage: 2.0,
  },
];

describe('PriceEngine.resolve', () => {
  it('bevorzugt Discounter, sonst günstigsten Grundpreis', () => {
    const eng = new PriceEngine(seed, []);
    const p = eng.resolve('haehnchenbrust');
    expect(p?.storeId).toBe('aldi');
    expect(p?.basePricePerUnit).toBeCloseTo(4.0 / 500);
  });

  it('respektiert bevorzugten Store', () => {
    const eng = new PriceEngine(seed, [], { preferredStore: 'rewe' });
    expect(eng.resolve('haehnchenbrust')?.storeId).toBe('rewe');
  });

  it('manueller Override schlägt Seed-Preis (Provider-Priorität)', () => {
    const override: PriceOverride = {
      productKey: 'haehnchenbrust',
      storeId: 'manuell',
      region: '',
      pricePerPackage: 3.0,
      basePrice: 6.0,
      updatedAt: 1,
    };
    const eng = new PriceEngine(seed, [override]);
    const p = eng.resolve('haehnchenbrust');
    expect(p?.source).toBe('manual');
    expect(p?.pricePerPackage).toBe(3.0);
    expect(p?.basePricePerUnit).toBeCloseTo(3.0 / 500);
  });

  it('unbekannter Key -> null', () => {
    expect(new PriceEngine(seed, []).resolve('gibtsnicht')).toBeNull();
  });
});

describe('PriceEngine.ingredientCost', () => {
  const eng = new PriceEngine(seed, []);

  it('rechnet Masse proportional (300 g von 500 g @ 4€)', () => {
    const c = eng.ingredientCost({ name: 'Hähnchenbrust', amount: 300, unit: 'g' });
    expect(c.status).toBe('ok');
    expect(c.cost).toBeCloseTo((300 / 500) * 4.0);
  });

  it('0-Menge -> Kosten 0, kein Fehler', () => {
    const c = eng.ingredientCost({ name: 'Hähnchenbrust', amount: 0, unit: 'g' });
    expect(c).toMatchObject({ status: 'ok', cost: 0 });
  });

  it('Volumen gegen ml-Produkt (250 ml Milch von 1000 ml @ 1€)', () => {
    const c = eng.ingredientCost({ name: 'Milch', amount: 250, unit: 'ml' });
    expect(c.cost).toBeCloseTo(0.25);
  });

  it('unbekannte Zutat -> unmatched (NICHT 0 als Preis behaupten)', () => {
    const c = eng.ingredientCost({ name: 'Trüffelöl aus Alba', amount: 10, unit: 'ml' });
    expect(c.status).toBe('unmatched');
    expect(c.source).toBeNull();
  });

  it('Stück-Zutat gegen Stück-Produkt (2 Eier von 10 @ 2€)', () => {
    const c = eng.ingredientCost({ name: 'Eier', amount: 2, unit: 'stück' });
    expect(c.cost).toBeCloseTo((2 / 10) * 2.0);
  });

  it('Stück gegen Masse-Produkt -> unmatched (nicht umrechenbar)', () => {
    const c = eng.ingredientCost({ name: 'Hähnchenbrust', amount: 2, unit: 'stück' });
    expect(c.status).toBe('unmatched');
  });
});

describe('PriceEngine.recipeCost', () => {
  const eng = new PriceEngine(seed, []);

  it('summiert gematchte Zutaten und teilt durch Portionen; zählt unmatched', () => {
    const est = eng.recipeCost({
      baseServings: 2,
      ingredients: [
        { name: 'Hähnchenbrust', amount: 300, unit: 'g', aisle: 'fleisch-fisch' },
        { name: 'Milch', amount: 500, unit: 'ml', aisle: 'kühlregal' },
        { name: 'Sternenstaub', amount: 1, unit: 'prise', aisle: 'gewürze' },
      ],
    });
    const expectedTotal = (300 / 500) * 4.0 + (500 / 1000) * 1.0;
    expect(est.total).toBeCloseTo(expectedTotal, 2);
    expect(est.perServing).toBeCloseTo(expectedTotal / 2, 2);
    expect(est.matchedCount).toBe(2);
    expect(est.unmatchedCount).toBe(1);
  });
});

describe('PriceEngine.wholePackageCost', () => {
  const eng = new PriceEngine(seed, []);

  it('rundet auf ganze Packungen auf (600 g Hähnchen -> 2 Packungen)', () => {
    const r = eng.wholePackageCost('haehnchenbrust', 600, 'mass');
    expect(r.packages).toBe(2);
    expect(r.cost).toBeCloseTo(8.0);
  });

  it('mindestens 1 Packung bei kleiner Menge', () => {
    const r = eng.wholePackageCost('haehnchenbrust', 50, 'mass');
    expect(r.packages).toBe(1);
    expect(r.cost).toBeCloseTo(4.0);
  });

  it('unbekannter Key -> cost null', () => {
    expect(eng.wholePackageCost('nix', 100, 'mass').cost).toBeNull();
  });
});
