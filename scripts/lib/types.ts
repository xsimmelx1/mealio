import type { BaseUnit } from './grammage';
import type { ProductFlag } from '../../app/src/domain/enums';

/** Ein normalisiertes echtes Produkt aus einer Quelle (Shop/Datensatz). */
export interface RawProduct {
  name: string;
  brand: string | null;
  ean: string | null;
  /** Preis pro Packung in EUR. */
  price: number;
  /** Packungsgröße in Basiseinheit. */
  size: number;
  unit: BaseUnit;
  /** Quell-Kategorie (roh, quellenspezifisch). */
  category: string;
  /** Aktueller Angebotsartikel? (eigenes, i. d. R. günstigeres Produkt) */
  sale: boolean;
  /** Produkt-Eigenschaften (Bio/Fairtrade/Vegan/Regional), aus Name/Marke + OFF. */
  flags: ProductFlag[];
}

/** Eine Preisquelle (ein Adapter pro Markt/Datensatz). */
export interface PriceSource {
  /** storeId (muss zu STORE_IDS in app/src/domain/enums.ts passen). */
  storeId: string;
  /** Menschlicher Quellenname (Report/Attribution). */
  sourceName: string;
  /** Stand der Daten (YYYY-MM). */
  priceDate: string;
  /** Lädt & normalisiert die Produktliste. Bei Fehler: [] (nie werfen). */
  fetchProducts(): Promise<RawProduct[]>;
}

/** Angebote je Markt aus einer Angebotsquelle (Prospekt/Aggregator). */
export interface StoreOffers {
  /** storeId (muss zu STORE_IDS passen). */
  storeId: string;
  /** Angebotsprodukte (als RawProduct mit sale=true). */
  products: RawProduct[];
}

/** Eine Angebotsquelle (ein Adapter je Prospekt-/Angebotsnetzwerk). */
export interface OfferSource {
  sourceName: string;
  /** Gültigkeitsangabe (frei), z. B. "KW 29/2026". */
  validUntil?: string;
  /** Lädt aktuelle Angebote gruppiert nach Markt. Bei Fehler: [] (nie werfen). */
  fetchOffers(): Promise<StoreOffers[]>;
}

/** Kuratierte Zutat->Produkt-Spezifikation (scripts/ingredients.catalog.json). */
export interface IngredientSpec {
  productKey: string;
  label: string;
  aisle: string;
  packageUnit: BaseUnit;
  /** ALLE diese Tokens müssen im Produktnamen vorkommen (kleingeschrieben). */
  terms: string[];
  /** Erlaubte Quell-Kategorien (leer = beliebig). */
  categories?: string[];
  /** Disqualifizierende Tokens im Namen. */
  exclude?: string[];
  /** Bevorzugte Marken (Substring, case-insensitive) -> Scoring-Bonus. */
  preferBrands?: string[];
  /** Plausibler Packungsgrößen-Bereich in Basiseinheit (Ausreißer verwerfen). */
  size?: { min?: number; max?: number };
  /** Kuratierter Fallback-Preis (EUR/Packung), falls keine echte Quelle matcht — garantiert einen Preis. */
  fallbackPrice?: number;
  /** Packungsgröße/-einheit zum Fallback-Preis. */
  fallbackSize?: number;
  fallbackUnit?: BaseUnit;
}
