import {
  STORE_DEFAULT_BRAND,
  storeTypeOf,
  type StoreId,
} from '../../app/src/domain/enums';
import type { SeedPrice } from '../../app/src/domain/schema';

/**
 * REWE-relative Preisfaktoren je Markt für ABGELEITETE Schätzpreise (Discounter günstiger,
 * Vollsortimenter etwas teurer). Nur genutzt, wo keine echte Quelle vorliegt.
 */
export const STORE_FACTOR: Record<StoreId, number> = {
  aldi: 0.82,
  lidl: 0.83,
  penny: 0.85,
  netto: 0.86,
  kaufland: 0.92,
  rewe: 1.0,
  edeka: 1.02,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Anchor {
  productKey: string;
  label: string;
  aisle: SeedPrice['aisle'];
  packageSize: number;
  packageUnit: SeedPrice['packageUnit'];
  pricePerPackage: number; // REWE-Referenzpreis (real oder alt)
}

/** Abgeleitete (geschätzte) Preiszeile für einen Markt aus dem REWE-Anker. */
export function deriveRow(anchor: Anchor, storeId: StoreId): SeedPrice {
  return {
    productKey: anchor.productKey,
    label: anchor.label,
    brand: STORE_DEFAULT_BRAND[storeId],
    storeId,
    storeType: storeTypeOf(storeId),
    aisle: anchor.aisle,
    packageSize: anchor.packageSize,
    packageUnit: anchor.packageUnit,
    pricePerPackage: round2(anchor.pricePerPackage * STORE_FACTOR[storeId]),
    dataSource: 'estimate',
  };
}
