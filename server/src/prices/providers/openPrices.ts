/**
 * Open Food Facts "Open Prices" Provider (keyless, opt-in).
 *
 * Lizenz: Open Prices steht unter ODbL -> Attribution + Share-Alike der Datenbank.
 * Attribution siehe App (Über/Impressum) und server/README.md.
 * WICHTIG: Keine Open-Prices-Daten fest ins Repo kopieren — nur live abfragen + cachen.
 *
 * Zugriff: Open Prices ist barcode-zentriert (`product_code`). Wir leiten aus
 * `key`/`query` einen Barcode ab (reine Ziffern, 6–14 Stellen). Ohne Barcode gibt
 * es keinen verlässlichen Lookup -> null (kein Netz-Aufruf, kein Raten).
 *
 * Robustheit: HTTP 200 != Treffer -> Body/Felder prüfen (Open Prices liefert 200
 * auch für leere Ergebnislisten). Zahlen kommen teils als Strings -> am Rand casten.
 * Timeout via fetchWithTimeout; Fehler werden vom Aufrufer still geschluckt.
 *
 * Adapter-Muster: implementiert `PriceProvider`; weitere Quellen lassen sich als
 * zusätzliche Provider ergänzen und im Service in Prioritätsreihenfolge einhängen.
 */

import type { OnlinePrice, PackageUnit, PriceProvider, PriceQuery } from './types.js';
import { fetchWithTimeout, toNumberOrNull } from './types.js';

const PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';

/** Ein einzelner Preis-Eintrag aus Open Prices (Felder defensiv als unknown). */
interface OpenPricesEntry {
  price?: unknown;
  currency?: unknown;
  date?: unknown;
  created?: unknown;
  updated?: unknown;
  product?: {
    product_name?: unknown;
    product_quantity?: unknown;
    product_quantity_unit?: unknown;
  };
}
interface OpenPricesResponse {
  items?: OpenPricesEntry[];
  total?: unknown;
}

/** Extrahiert einen barcode-artigen Wert (nur Ziffern, 6–14 Stellen) aus dem Item. */
function barcodeFrom(item: PriceQuery): string | null {
  const candidates = [item.key, item.query];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const digits = c.trim();
    if (/^\d{6,14}$/.test(digits)) return digits;
  }
  return null;
}

/** Median einer nicht-leeren Zahlenliste (robuster gegen Ausreißer als das Mittel). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Normalisiert die Open-Prices-Mengeneinheit auf unsere PackageUnit. */
function normalizeUnit(unit: unknown): PackageUnit | null {
  if (typeof unit !== 'string') return null;
  const u = unit.trim().toLowerCase();
  if (u === 'g' || u === 'gram' || u === 'grams') return 'g';
  if (u === 'ml' || u === 'milliliter' || u === 'millilitre') return 'ml';
  if (u === 'kg') return 'g'; // Größe wird unten passend skaliert
  if (u === 'l' || u === 'liter' || u === 'litre') return 'ml';
  return null;
}

/** Liest Packungsgröße + normalisierte Einheit aus dem Produkt (falls vorhanden). */
function extractPackage(entry: OpenPricesEntry): {
  packageSize: number | null;
  packageUnit: PackageUnit | null;
} {
  const product = entry.product;
  if (!product) return { packageSize: null, packageUnit: null };

  const rawUnit = product.product_quantity_unit;
  const unit = normalizeUnit(rawUnit);
  let size = toNumberOrNull(product.product_quantity);

  // kg/l liefern die Größe in Basiseinheiten -> auf g/ml hochskalieren.
  if (size !== null && typeof rawUnit === 'string') {
    const u = rawUnit.trim().toLowerCase();
    if (u === 'kg' || u === 'l' || u === 'liter' || u === 'litre') size *= 1000;
  }

  if (unit === null || size === null || size <= 0) {
    return { packageSize: null, packageUnit: null };
  }
  return { packageSize: size, packageUnit: unit };
}

/** Wählt den ersten nicht-leeren String aus einer Kandidatenliste. */
function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() !== '') return c;
  }
  return null;
}

export function createOpenPricesProvider(timeoutMs = 4000): PriceProvider {
  return {
    name: 'Open Food Facts — Open Prices',
    async priceFor(item: PriceQuery): Promise<OnlinePrice | null> {
      const barcode = barcodeFrom(item);
      // Ohne Barcode kein verlässlicher Lookup -> gar nicht erst abfragen.
      if (!barcode) return null;

      const url =
        `${PRICES_URL}?product_code=${encodeURIComponent(barcode)}` +
        `&order_by=-created&page=1&size=25`;

      const res = await fetchWithTimeout(url, timeoutMs);
      // 200 != Treffer: erst den Body prüfen.
      const data = (await res.json()) as OpenPricesResponse;
      const entries = Array.isArray(data.items) ? data.items : [];
      if (entries.length === 0) return null;

      // Preise defensiv casten (teils Strings), nur plausible (>0) behalten.
      const prices = entries
        .map((e) => toNumberOrNull(e.price))
        .filter((n): n is number => n !== null && n > 0);
      if (prices.length === 0) return null;

      // order_by=-created -> entries[0] ist der jüngste Eintrag.
      const newest = entries[0]!;
      const currency =
        typeof newest.currency === 'string' && newest.currency.trim() !== ''
          ? newest.currency.trim().toUpperCase()
          : 'EUR';

      return {
        pricePerPackage: median(prices),
        ...extractPackage(newest),
        currency,
        source: 'open-prices',
        updatedAt: firstString(newest.updated, newest.created, newest.date),
      };
    },
  };
}
