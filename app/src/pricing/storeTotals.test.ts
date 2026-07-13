import { describe, expect, it } from 'vitest';
import { STORE_IDS } from '../domain/enums';
import type { SeedPrice, ShoppingItem } from '../domain/schema';
import { PriceEngine } from './priceEngine';
import { budgetReach, compareAllStores, totalForStoreType } from './storeTotals';

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
];

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'si-haehnchenbrust::mass',
  name: 'Hähnchenbrust',
  productKey: 'haehnchenbrust',
  totalAmount: 500,
  unit: 'g',
  aisle: 'fleisch-fisch',
  estimatedPrice: null,
  isChecked: false,
  source: 'seed',
  priceDate: null,
  isPantry: false,
  ...over,
});

describe('totalForStoreType', () => {
  it('Discounter günstiger als Vollsortimenter', () => {
    const items = [item()];
    expect(totalForStoreType(items, seed, [], 'discounter').total).toBeCloseTo(4.0);
    expect(totalForStoreType(items, seed, [], 'vollsortimenter').total).toBeCloseTo(6.0);
  });

  it('Vorrats-Positionen und productKey-lose werden übersprungen', () => {
    const items = [item({ isPantry: true }), item({ id: 'x', productKey: null })];
    const r = totalForStoreType(items, seed, [], 'discounter');
    expect(r.total).toBe(0);
    expect(r.pricedCount).toBe(0);
  });
});

const mk = (storeId: string, storeType: SeedPrice['storeType'], price: number): SeedPrice => ({
  productKey: 'haehnchenbrust',
  label: 'Hähnchenbrust',
  brand: `${storeId}-Marke`,
  storeId,
  storeType,
  aisle: 'fleisch-fisch',
  packageSize: 500,
  packageUnit: 'g',
  pricePerPackage: price,
});

// 7 Märkte, aufsteigende Preise -> aldi günstigster, edeka teuerster.
const sevenStoreSeed: SeedPrice[] = [
  mk('aldi', 'discounter', 4.0),
  mk('lidl', 'discounter', 4.1),
  mk('penny', 'discounter', 4.2),
  mk('netto', 'discounter', 4.3),
  mk('kaufland', 'vollsortimenter', 4.5),
  mk('rewe', 'vollsortimenter', 5.0),
  mk('edeka', 'vollsortimenter', 5.2),
];

describe('compareAllStores', () => {
  const engine = new PriceEngine(sevenStoreSeed, []);

  it('liefert alle 7 Märkte, günstigster zuerst, mit korrekter Ersparnis', () => {
    const cmp = compareAllStores([item()], engine);
    expect(cmp.stores).toHaveLength(7);
    expect(cmp.stores.map((s) => s.storeId)).toContain('aldi');
    expect(new Set(cmp.stores.map((s) => s.storeId))).toEqual(new Set(STORE_IDS));
    expect(cmp.cheapest?.storeId).toBe('aldi');
    expect(cmp.cheapest?.total).toBeCloseTo(4.0);
    expect(cmp.mostExpensive?.storeId).toBe('edeka');
    expect(cmp.savings).toBeCloseTo(1.2);
    // aufsteigend sortiert
    const totals = cmp.stores.map((s) => s.total);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    // Positions-Aufschlüsselung: jede Zeile hat einen Preis+Marke je Markt
    expect(cmp.rows).toHaveLength(1);
    expect(cmp.rows[0].byStore.aldi.brand).toBe('aldi-Marke');
  });

  it('nichts bepreisbar -> cheapest null', () => {
    const cmp = compareAllStores([item({ productKey: null })], engine);
    expect(cmp.cheapest).toBeNull();
    expect(cmp.stores).toHaveLength(0);
  });
});

describe('budgetReach', () => {
  it('Gesamtsumme im Budget -> ganzer Plan', () => {
    expect(budgetReach(40, 60, 7)).toEqual({ fits: true, coveredDays: 7 });
  });

  it('über Budget -> anteilige Tage (abgerundet)', () => {
    // 30 € Budget, 60 € Warenkorb, 7 Tage -> floor(0.5*7)=3
    expect(budgetReach(60, 30, 7)).toEqual({ fits: false, coveredDays: 3 });
  });

  it('kein Budget gesetzt -> ganzer Plan', () => {
    expect(budgetReach(999, 0, 5)).toEqual({ fits: true, coveredDays: 5 });
  });
});
