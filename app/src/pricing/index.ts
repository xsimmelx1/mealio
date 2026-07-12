import { db } from '../db/db';
import { loadSeedPrices } from '../db/seed';
import type { Currency } from '../domain/enums';
import { PriceEngine } from './priceEngine';

export * from './priceEngine';
export * from './units';
export { matchProductKey, normalizeName } from './productMatch';

/**
 * Baut eine Preis-Engine aus den Seed-Preisen + manuellen Overrides (Dexie).
 * Offline-fähig: Seed-Preise liegen als gebündeltes JSON vor.
 */
export async function createPriceEngine(preferredStore?: string): Promise<PriceEngine> {
  const seed = loadSeedPrices();
  const overrides = await db.priceOverrides.toArray();
  return new PriceEngine(seed, overrides, { preferredStore });
}

const CURRENCY_LOCALE: Record<Currency, string> = {
  EUR: 'de-DE',
  CHF: 'de-CH',
  USD: 'en-US',
  GBP: 'en-GB',
};

/** Formatiert einen Betrag als Währung (Schätzwert-Kennzeichnung erfolgt separat in der UI). */
export function formatPrice(amount: number, currency: Currency = 'EUR'): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'de-DE', {
    style: 'currency',
    currency,
  }).format(amount);
}
