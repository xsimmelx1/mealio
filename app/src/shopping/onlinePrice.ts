import type { OnlinePrice } from '../api/client';
import type { ShoppingItem } from '../domain/schema';
import { packageDimension, reconcileFactor, toBase } from '../pricing/units';

/**
 * Berechnet aus einem Online-Preis (Open Prices) die Kosten für eine
 * Einkaufsposition über ganze Packungen. Gibt null zurück, wenn kein
 * verwertbarer Preis/Packungsformat vorliegt (dann nur Info, kein Betrag).
 */
export function onlineItemCost(
  item: Pick<ShoppingItem, 'totalAmount' | 'unit'>,
  price: OnlinePrice,
): number | null {
  if ((price.source !== 'open-prices' && price.source !== 'ai') || price.pricePerPackage == null)
    return null;
  if (price.packageSize == null || price.packageUnit == null || price.packageSize <= 0) return null;

  const base = toBase(item.totalAmount, item.unit);
  const factor = reconcileFactor(base.dim, packageDimension(price.packageUnit));
  if (factor === null) return null;

  const packages = Math.max(1, Math.ceil((base.qty * factor) / price.packageSize));
  return Math.round(packages * price.pricePerPackage * 100) / 100;
}
