/**
 * Zutat-Matching + Einheiten-Normalisierung für /nutrition.
 *
 * Analog zur Frontend-Logik (app/src/pricing/productMatch.ts): Umlaut-Faltung,
 * Alias-Tabelle, exakter Treffer, dann Teilstring-Heuristik. Es wird NIE falsch
 * geraten — kein plausibler Treffer -> null (Zutat gilt als "Nährwert unbekannt").
 *
 * Mengen werden auf Gramm normalisiert:
 *   - Masse: g direkt, kg * 1000
 *   - Volumen: 1 ml ≈ 1 g (Näherung), l * 1000; tsp = 5 ml, tbsp = 15 ml
 *   - prise ≈ 0.5 g
 *   - stück über hinterlegtes Stückgewicht (gramsPerPiece); fehlt es -> null
 *     (Stückangabe ohne Gewicht ist nicht sinnvoll umrechenbar).
 */

import type { NutritionUnit } from '../schemas/index.js';
import { NUTRITION_SEED, SEED_KEYS, SEED_BY_KEY } from './nutritionSeed.js';
import type { Per100g, SeedEntry } from './nutritionSeed.js';

/** Normalisiert einen Namen zu einem ASCII-kebab-Schlüsselkandidaten. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Alias: normalisierter Name -> productKey (deckt Seed-Rezept-Varianten ab). */
const ALIASES: Record<string, string> = {
  // Tomaten
  'gehackte-tomaten': 'dosentomaten',
  'passierte-tomaten': 'dosentomaten',
  'stueckige-tomaten': 'dosentomaten',
  kirschtomaten: 'tomaten',
  // Pasta
  spaghetti: 'nudeln',
  penne: 'nudeln',
  fusilli: 'nudeln',
  tagliatelle: 'nudeln',
  reisnudeln: 'nudeln',
  // Öle
  sonnenblumenoel: 'rapsoel',
  pflanzenoel: 'rapsoel',
  // Proteine
  haehnchenbrustfilet: 'haehnchenbrust',
  hackfleisch: 'hackfleisch',
  rinderhackfleisch: 'hackfleisch',
  rindergulasch: 'hackfleisch',
  lachs: 'lachsfilet',
  'thunfisch-in-dose': 'thunfisch',
  raeuchertofu: 'tofu',
  // Gemüse
  zwiebel: 'zwiebeln',
  'rote-zwiebel': 'zwiebeln',
  'rote-zwiebeln': 'zwiebeln',
  fruehlingszwiebel: 'zwiebeln',
  fruehlingszwiebeln: 'zwiebeln',
  lauch: 'zwiebeln',
  blattspinat: 'spinat-tk',
  spinat: 'spinat-tk',
  karotte: 'karotten',
  suesskartoffeln: 'kartoffeln',
  // Milchprodukte
  naturjoghurt: 'joghurt',
  vollmilch: 'milch',
  'geriebener-kaese': 'gouda',
  reibekaese: 'gouda',
  kaese: 'gouda',
  // Brühen
  gemuesebruehe: 'bruehe',
  rinderbruehe: 'bruehe',
  // Gewürze
  chilipulver: 'chili',
  chiliflocken: 'chili',
  majoran: 'oregano',
  schnittlauch: 'petersilie',
  knoblauchpulver: 'knoblauch',
  // Zitrus
  limette: 'zitrone',
  // Nüsse / Sonstiges
  erdnuesse: 'erdnuesse',
  oliven: 'olivenoel',
  chiasamen: 'haferflocken',
  ahornsirup: 'zucker',
};

/** Volumen-Umrechnung in ml je Einheit. */
const ML_PER_UNIT: Partial<Record<NutritionUnit, number>> = {
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
};

const PRISE_GRAMS = 0.5;

/**
 * Findet den Seed-Eintrag für einen Zutatnamen.
 * Reihenfolge: Alias -> exakter Treffer -> längster Teilstring-Treffer.
 * null, wenn kein plausibler Treffer existiert.
 */
export function matchSeedEntry(name: string): SeedEntry | null {
  const norm = normalizeName(name);
  if (!norm) return null;

  const alias = ALIASES[norm];
  if (alias && SEED_KEYS.has(alias)) return SEED_BY_KEY.get(alias) ?? null;

  if (SEED_KEYS.has(norm)) return SEED_BY_KEY.get(norm) ?? null;

  let best: SeedEntry | null = null;
  for (const entry of NUTRITION_SEED) {
    const key = entry.key;
    if (norm.includes(key) || key.includes(norm)) {
      if (!best || key.length > best.key.length) best = entry;
    }
  }
  return best;
}

/**
 * Rechnet eine Menge in Gramm um. gramsPerPiece nur relevant für "stück".
 * null, wenn nicht umrechenbar (z. B. "stück" ohne hinterlegtes Stückgewicht).
 */
export function toGrams(
  amount: number,
  unit: NutritionUnit,
  gramsPerPiece?: number,
): number | null {
  switch (unit) {
    case 'g':
      return amount;
    case 'kg':
      return amount * 1000;
    case 'prise':
      return amount * PRISE_GRAMS;
    case 'stück':
      return gramsPerPiece !== undefined ? amount * gramsPerPiece : null;
    case 'ml':
    case 'l':
    case 'tsp':
    case 'tbsp': {
      const ml = ML_PER_UNIT[unit];
      // 1 ml ≈ 1 g (Näherung).
      return ml !== undefined ? amount * ml : null;
    }
    default:
      return null;
  }
}

/** Makros für eine gegebene Grammzahl aus per-100g-Werten berechnen. */
export function macrosForGrams(per100g: Per100g, grams: number): Per100g {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
  };
}
