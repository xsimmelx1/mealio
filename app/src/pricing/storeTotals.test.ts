import { describe, expect, it } from 'vitest';
import type { SeedPrice, ShoppingItem } from '../domain/schema';
import { totalForStoreType } from './storeTotals';

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
