import { describe, expect, it } from 'vitest';
import type { OnlinePrice } from '../api/client';
import { onlineItemCost } from './onlinePrice';

const base: OnlinePrice = {
  key: 'x',
  pricePerPackage: 2.0,
  packageSize: 500,
  packageUnit: 'g',
  currency: 'EUR',
  source: 'open-prices',
  updatedAt: '2026-07-01',
};

describe('onlineItemCost', () => {
  it('rechnet ganze Packungen (600 g -> 2 Pkg @2€ = 4€)', () => {
    expect(onlineItemCost({ totalAmount: 600, unit: 'g' }, base)).toBeCloseTo(4.0);
  });

  it('mindestens 1 Packung', () => {
    expect(onlineItemCost({ totalAmount: 100, unit: 'g' }, base)).toBeCloseTo(2.0);
  });

  it('null bei source unknown', () => {
    expect(onlineItemCost({ totalAmount: 100, unit: 'g' }, { ...base, source: 'unknown' })).toBeNull();
  });

  it('null wenn kein Packungsformat', () => {
    expect(
      onlineItemCost({ totalAmount: 100, unit: 'g' }, { ...base, packageSize: null }),
    ).toBeNull();
  });

  it('null bei nicht umrechenbarer Dimension (stück vs g)', () => {
    expect(onlineItemCost({ totalAmount: 2, unit: 'stück' }, base)).toBeNull();
  });
});
