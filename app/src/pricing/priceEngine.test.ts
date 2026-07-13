import { describe, expect, it } from 'vitest';
import { STORE_DEFAULT_BRAND, STORE_PRICE_INDEX } from '../domain/enums';
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

  it('bevorzugtes Preisniveau (vollsortimenter) wählt teureren Store', () => {
    const eng = new PriceEngine(seed, [], { preferredStoreType: 'vollsortimenter' });
    expect(eng.resolve('haehnchenbrust')?.storeId).toBe('rewe');
  });

  it('Discounter-Preisniveau wählt günstigeren Store', () => {
    const eng = new PriceEngine(seed, [], { preferredStoreType: 'discounter' });
    expect(eng.resolve('haehnchenbrust')?.storeId).toBe('aldi');
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

  it('KI-Fallback: ungematchte Zutat mit KI-Preis -> source ai', () => {
    const aiEng = new PriceEngine(seed, [], {
      aiPrices: new Map([['trueffeloel', { pricePerPackage: 4, packageSize: 100, packageUnit: 'ml' }]]),
    });
    const c = aiEng.ingredientCost({ name: 'Trüffelöl', amount: 10, unit: 'ml' });
    expect(c.status).toBe('ok');
    expect(c.source).toBe('ai');
    expect(c.cost).toBeCloseTo((10 / 100) * 4); // 0.4
    // ohne KI-Map bleibt es unmatched
    expect(new PriceEngine(seed, []).ingredientCost({ name: 'Trüffelöl', amount: 10, unit: 'ml' }).status).toBe('unmatched');
  });

  it('Seed schlägt KI (KI nur Fallback)', () => {
    const aiEng = new PriceEngine(seed, [], {
      aiPrices: new Map([['haehnchenbrust', { pricePerPackage: 99, packageSize: 100, packageUnit: 'g' }]]),
    });
    const c = aiEng.ingredientCost({ name: 'Hähnchenbrust', amount: 300, unit: 'g' });
    expect(c.source).toBe('seed'); // nicht ai
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

describe('PriceEngine.wholePackageCostForStore', () => {
  const storeSeed: SeedPrice[] = [
    { productKey: 'haehnchenbrust', label: 'Hähnchenbrust', brand: 'Meine Metzgerei', storeId: 'aldi', storeType: 'discounter', aisle: 'fleisch-fisch', packageSize: 500, packageUnit: 'g', pricePerPackage: 4.0 },
    { productKey: 'haehnchenbrust', label: 'Hähnchenbrust', brand: 'REWE Beste Wahl', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'fleisch-fisch', packageSize: 500, packageUnit: 'g', pricePerPackage: 6.0 },
  ];
  const eng = new PriceEngine(storeSeed, []);

  it('nutzt den exakten Markt-Preis + Marke aus dem Katalog', () => {
    const aldi = eng.wholePackageCostForStore('haehnchenbrust', 'Hähnchenbrust', 300, 'mass', 'aldi');
    expect(aldi.source).toBe('seed');
    expect(aldi.cost).toBeCloseTo(4.0); // ceil(300/500)=1 Packung
    expect(aldi.brand).toBe('Meine Metzgerei');
    const rewe = eng.wholePackageCostForStore('haehnchenbrust', 'Hähnchenbrust', 300, 'mass', 'rewe');
    expect(rewe.cost).toBeCloseTo(6.0);
    expect(rewe.brand).toBe('REWE Beste Wahl');
  });

  it('Markt ohne Katalog-Zeile -> KI-Basispreis × Markt-Index', () => {
    const aiEng = new PriceEngine([], [], {
      aiPrices: new Map([['trueffeloel', { pricePerPackage: 4, packageSize: 100, packageUnit: 'ml' }]]),
    });
    const edeka = aiEng.wholePackageCostForStore(null, 'Trüffelöl', 100, 'volume', 'edeka');
    expect(edeka.source).toBe('ai');
    // ceil(100/100)=1 Packung × (4 × Index edeka)
    expect(edeka.cost).toBeCloseTo(4 * STORE_PRICE_INDEX.edeka);
    expect(edeka.brand).toBe(STORE_DEFAULT_BRAND.edeka);
    // günstiger Discounter-Index < teurer Vollsortimenter-Index
    const aldi = aiEng.wholePackageCostForStore(null, 'Trüffelöl', 100, 'volume', 'aldi');
    expect(aldi.cost!).toBeLessThan(edeka.cost!);
  });

  it('nicht bepreisbar -> cost null', () => {
    expect(eng.wholePackageCostForStore(null, 'Sternenstaub', 10, 'mass', 'aldi').cost).toBeNull();
  });

  it('nutzt Angebotszeile als effektiven Bestpreis + Durchstreich-Regulärpreis', () => {
    const rows: SeedPrice[] = [
      { productKey: 'butter', label: 'Butter', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'kühlregal', packageSize: 250, packageUnit: 'g', pricePerPackage: 3.49 },
      { productKey: 'butter', label: 'Butter', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'kühlregal', packageSize: 250, packageUnit: 'g', pricePerPackage: 2.19, isOffer: true },
    ];
    const e = new PriceEngine(rows, []);
    const line = e.wholePackageCostForStore('butter', 'Butter', 250, 'mass', 'rewe');
    expect(line.onOffer).toBe(true);
    expect(line.cost).toBeCloseTo(2.19);
    expect(line.regularCost).toBeCloseTo(3.49);
    expect(line.unitPrice).toBeCloseTo(8.76); // 2.19€ / 250g -> €/kg
  });

  it('Flag-Präferenz "bio" wählt die Bio-Variante', () => {
    const rows: SeedPrice[] = [
      { productKey: 'milch', label: 'Milch', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'kühlregal', packageSize: 1000, packageUnit: 'ml', pricePerPackage: 0.95 },
      { productKey: 'milch', label: 'Milch', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'kühlregal', packageSize: 1000, packageUnit: 'ml', pricePerPackage: 1.25, flags: ['bio'] },
    ];
    const plain = new PriceEngine(rows, []);
    expect(plain.wholePackageCostForStore('milch', 'Milch', 1000, 'volume', 'rewe').cost).toBeCloseTo(0.95);
    const bio = new PriceEngine(rows, [], { preferredProductFlags: ['bio'] });
    const line = bio.wholePackageCostForStore('milch', 'Milch', 1000, 'volume', 'rewe');
    expect(line.cost).toBeCloseTo(1.25);
    expect(line.flags).toContain('bio');
  });

  it('reicht echt/geschätzt + Stand + Produktname aus der Katalog-Zeile durch', () => {
    const seedWithMeta: SeedPrice[] = [
      { productKey: 'mehl', label: 'Mehl', brand: 'ja!', storeId: 'rewe', storeType: 'vollsortimenter', aisle: 'backwaren', packageSize: 1000, packageUnit: 'g', pricePerPackage: 0.59, dataSource: 'real', priceDate: '2025-09', productName: 'ja! Weizenmehl Type 405 1kg', ean: '4337256679244' },
      { productKey: 'mehl', label: 'Mehl', brand: 'Eigenmarke', storeId: 'aldi', storeType: 'discounter', aisle: 'backwaren', packageSize: 1000, packageUnit: 'g', pricePerPackage: 0.48, dataSource: 'estimate' },
    ];
    const e = new PriceEngine(seedWithMeta, []);
    const real = e.wholePackageCostForStore('mehl', 'Mehl', 1000, 'mass', 'rewe');
    expect(real.dataSource).toBe('real');
    expect(real.priceDate).toBe('2025-09');
    expect(real.productName).toBe('ja! Weizenmehl Type 405 1kg');
    const est = e.wholePackageCostForStore('mehl', 'Mehl', 1000, 'mass', 'aldi');
    expect(est.dataSource).toBe('estimate');
    expect(est.priceDate).toBeUndefined();
  });
});
