import type { BaseUnit } from './grammage';

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
  /** Sonderangebot? (true -> für Normalpreis-Zwecke ignorieren) */
  sale: boolean;
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
}
