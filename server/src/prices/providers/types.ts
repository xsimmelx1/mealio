/**
 * Gemeinsames Interface für Online-Preis-Provider (opt-in, niedrigste Priorität).
 *
 * Rolle: Online-Preise sind laut Architektur die NIEDRIGSTE Quelle
 * (Manual > LocalSeed > Online). Das Frontend entscheidet über die Priorität —
 * dieses Modul liefert nur den Online-Adapter.
 *
 * Provider liefern einen Packungspreis + (falls verfügbar) Packungsgröße/-einheit.
 * Bei fehlendem Treffer -> null (nie werfen für "nicht gefunden"). Netz-/Parsefehler
 * dürfen werfen und werden vom Aufrufer still geschluckt -> Fallback auf "unknown".
 *
 * `fetchWithTimeout`/`toNumberOrNull` werden aus dem Nährwert-Provider-Modul
 * wiederverwendet (bewusst DRY: identische Rand-Casting-/Timeout-Semantik).
 */

export {
  fetchWithTimeout,
  toNumberOrNull,
} from '../../nutrition/providers/types.js';

/** Normalisierte Packungseinheit (Basis für Grundpreis-Berechnung im Frontend). */
export type PackageUnit = 'g' | 'ml' | 'stück';

/** Ein erfolgreich ermittelter Online-Preis (immer source "open-prices"). */
export interface OnlinePrice {
  /** Preis für eine Packung in `currency`. */
  pricePerPackage: number | null;
  /** Packungsgröße in `packageUnit` (z. B. 1000 für 1 kg), falls bekannt. */
  packageSize: number | null;
  /** Normalisierte Einheit der Packungsgröße, falls bekannt. */
  packageUnit: PackageUnit | null;
  /** ISO-4217-Währung, z. B. "EUR". */
  currency: string;
  /** Quelle. Für Online-Treffer immer "open-prices". */
  source: 'open-prices';
  /** ISO-Zeitstempel des zugrunde liegenden Preises, falls bekannt. */
  updatedAt: string | null;
}

/** Eingabe für einen Preis-Lookup (entspricht dem Request-Item). */
export interface PriceQuery {
  /** Stabiler productKey (z. B. Barcode). */
  key: string;
  /** Optionaler Suchbegriff/Anzeigename. */
  query?: string;
  /** Optionale Region (z. B. Land/Markt), aktuell nur für den Cache-Key relevant. */
  region?: string;
}

export interface PriceProvider {
  /** Menschlich lesbarer Name (für Logs/Attribution). */
  readonly name: string;
  /** Ermittelt einen Online-Preis; null = kein Treffer. */
  priceFor(item: PriceQuery): Promise<OnlinePrice | null>;
}
