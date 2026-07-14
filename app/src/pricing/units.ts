import type { Unit } from '../domain/enums';

/**
 * Einheiten-Normalisierung für die Preis-/Mengenmathematik.
 * Alles wird auf eine Basiseinheit je Dimension zurückgeführt:
 *   - mass   -> Gramm (g)
 *   - volume -> Milliliter (ml)
 *   - count  -> Stück
 * tsp/tbsp gelten als Volumen (Küchenstandard), prise als vernachlässigbare Masse.
 */
export type Dimension = 'mass' | 'volume' | 'count';

export interface BaseQuantity {
  qty: number;
  dim: Dimension;
}

const TSP_ML = 5;
const TBSP_ML = 15;
const PRISE_G = 0.5;

/** Wandelt (amount, unit) in eine Basismenge um. */
export function toBase(amount: number, unit: Unit): BaseQuantity {
  switch (unit) {
    case 'g':
      return { qty: amount, dim: 'mass' };
    case 'kg':
      return { qty: amount * 1000, dim: 'mass' };
    case 'prise':
      return { qty: amount * PRISE_G, dim: 'mass' };
    case 'ml':
      return { qty: amount, dim: 'volume' };
    case 'l':
      return { qty: amount * 1000, dim: 'volume' };
    case 'tsp':
      return { qty: amount * TSP_ML, dim: 'volume' };
    case 'tbsp':
      return { qty: amount * TBSP_ML, dim: 'volume' };
    case 'stück':
      return { qty: amount, dim: 'count' };
  }
}

/** Basiseinheit eines Produkt-Packungsformats (g | ml | stück) -> Dimension. */
export function packageDimension(packageUnit: 'g' | 'ml' | 'stück'): Dimension {
  return packageUnit === 'stück' ? 'count' : packageUnit === 'ml' ? 'volume' : 'mass';
}

/**
 * Durchschnittsgewicht (g) je Stück für Frischware, die in Rezepten oft in „Stück"
 * angegeben, im Katalog aber nach Gewicht bepreist wird. Ermöglicht die Umrechnung
 * Stück -> g, damit z. B. „2 Zwiebeln" einen Preis bekommt. Schätzwerte (DE-Handel),
 * keyed nach productKey.
 */
export const PIECE_GRAMS: Record<string, number> = {
  zwiebeln: 120,
  paprika: 160,
  knoblauch: 5, // eine Zehe
  tomaten: 80,
  karotten: 75,
  zucchini: 300,
  kartoffeln: 100,
  brokkoli: 400, // ein Kopf
  zitrone: 100,
  brot: 500, // ein Laib
};

/**
 * Reconciliation-Faktor, um eine Zutatmenge in der Produkt-Dimension auszudrücken.
 * - gleiche Dimension -> 1
 * - Masse <-> Volumen -> 1 (Näherung 1 g ≈ 1 ml; ausdrücklich Schätzwert)
 * - Stück <-> Masse/Volumen -> über `pieceGrams` (Ø-Stückgewicht), falls bekannt; sonst null
 * - sonst Stück <-> Nicht-Stück -> null (nicht sinnvoll umrechenbar)
 */
export function reconcileFactor(
  ingredientDim: Dimension,
  productDim: Dimension,
  pieceGrams?: number,
): number | null {
  if (ingredientDim === productDim) return 1;
  if (ingredientDim === 'count' || productDim === 'count') {
    if (!pieceGrams || pieceGrams <= 0) return null;
    // Zutat in Stück, Produkt nach Gewicht/Volumen -> Stück * Ø-Gewicht.
    if (ingredientDim === 'count') return pieceGrams;
    // Zutat nach Gewicht/Volumen, Produkt in Stück -> Menge / Ø-Gewicht.
    return 1 / pieceGrams;
  }
  return 1; // mass <-> volume Näherung
}
