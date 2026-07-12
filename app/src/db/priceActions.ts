import type { PriceEngine } from '../pricing/priceEngine';
import { db } from './db';

/**
 * Setzt einen manuellen Preis-Override (pro Packung) für ein Produkt.
 * Grundpreis wird aus der Packungsgröße des aufgelösten Produkts abgeleitet.
 */
export async function setPackagePriceOverride(
  productKey: string,
  pricePerPackage: number,
  engine: PriceEngine,
  now = Date.now(),
): Promise<void> {
  const resolved = engine.resolve(productKey);
  const packageSize = resolved?.packageSize ?? 1;
  const dim = resolved?.dim ?? 'mass';
  const perBase = pricePerPackage / packageSize;
  // basePrice pro kg/l/Stück (Masse/Volumen -> *1000).
  const basePrice = dim === 'count' ? perBase : perBase * 1000;
  await db.priceOverrides.put({
    productKey,
    storeId: 'manuell',
    region: '',
    pricePerPackage,
    basePrice,
    updatedAt: now,
  });
}

/** Entfernt alle manuellen Preis-Overrides. */
export async function resetPriceOverrides(): Promise<void> {
  await db.priceOverrides.clear();
}
