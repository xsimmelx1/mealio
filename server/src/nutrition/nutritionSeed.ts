/**
 * Lokaler Nährwert-Seed (Primärquelle, offline-fähig).
 *
 * Werte sind EIGENE Näherungs-/Schätzwerte pro 100 g bzw. pro 100 ml, grob an
 * üblichen Nährwerttabellen orientiert. Sie sind KEINE Kopie von Open Food Facts
 * o. ä. und unterliegen daher keiner ODbL-Attributions-/Share-Alike-Pflicht.
 * Für belastbare Werte dient der optionale Online-Lookup (USDA / OFF).
 *
 * Schlüssel = dieselben productKeys wie in app/src/assets/prices.seed.json, damit
 * die Abdeckung zwischen Preisen und Nährwerten möglichst deckungsgleich ist.
 *
 * Datenquellen der Live-Ergänzung siehe server/README.md (Abschnitt Datenquellen):
 *   - USDA FoodData Central  -> Public Domain
 *   - Open Food Facts        -> ODbL (Attribution + Share-Alike)
 */

/** Makro-Nährwerte je 100 g (oder je 100 ml bei Flüssigkeiten; ~1:1-Näherung). */
export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface SeedEntry extends Per100g {
  /** productKey (stabiler Schlüssel). */
  key: string;
  /** Typisches Gewicht in Gramm je Stück (nur für "stück"-Zutaten). */
  gramsPerPiece?: number;
}

/**
 * Kern-Zutaten mit per-100g-Werten. gramsPerPiece nur bei Zutaten, die sinnvoll
 * in "stück" gemessen werden (Ei, Zwiebel, Paprika, Banane, Apfel, Zitrone, Gurke, ...).
 */
export const NUTRITION_SEED: readonly SeedEntry[] = [
  // Fleisch / Fisch
  { key: 'haehnchenbrust', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { key: 'haehnchenfluegel', kcal: 203, protein: 30.5, carbs: 0, fat: 8.1 },
  { key: 'hackfleisch', kcal: 250, protein: 17, carbs: 0, fat: 20 },
  { key: 'lachsfilet', kcal: 208, protein: 20, carbs: 0, fat: 13 },
  { key: 'thunfisch', kcal: 116, protein: 26, carbs: 0, fat: 1 },
  { key: 'garnelen', kcal: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  // Vegetarische Proteine
  { key: 'tofu', kcal: 144, protein: 15, carbs: 2, fat: 8 },
  { key: 'sojagranulat', kcal: 345, protein: 50, carbs: 20, fat: 1.5 },
  // Eier / Milchprodukte
  { key: 'eier', kcal: 143, protein: 13, carbs: 1.1, fat: 9.5, gramsPerPiece: 58 },
  { key: 'gouda', kcal: 356, protein: 25, carbs: 2.2, fat: 27 },
  { key: 'mozzarella', kcal: 254, protein: 18, carbs: 3, fat: 19 },
  { key: 'feta', kcal: 264, protein: 14, carbs: 4, fat: 21 },
  { key: 'joghurt', kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.5 },
  { key: 'milch', kcal: 64, protein: 3.4, carbs: 4.8, fat: 3.5 },
  { key: 'haferdrink', kcal: 45, protein: 1, carbs: 6.5, fat: 1.5 },
  { key: 'butter', kcal: 717, protein: 0.9, carbs: 0.6, fat: 81 },
  // Getreide / Trockenwaren
  { key: 'reis', kcal: 350, protein: 7, carbs: 78, fat: 1 },
  { key: 'nudeln', kcal: 350, protein: 12, carbs: 71, fat: 1.5 },
  { key: 'haferflocken', kcal: 372, protein: 13.5, carbs: 59, fat: 7 },
  { key: 'rote-linsen', kcal: 341, protein: 24, carbs: 52, fat: 1.5 },
  { key: 'quinoa', kcal: 368, protein: 14, carbs: 64, fat: 6 },
  { key: 'mehl', kcal: 348, protein: 10, carbs: 72, fat: 1 },
  { key: 'zucker', kcal: 400, protein: 0, carbs: 100, fat: 0 },
  { key: 'brot', kcal: 250, protein: 8, carbs: 47, fat: 3 },
  // Gemüse
  { key: 'kartoffeln', kcal: 77, protein: 2, carbs: 17, fat: 0.1 },
  { key: 'zwiebeln', kcal: 40, protein: 1.1, carbs: 9, fat: 0.1, gramsPerPiece: 110 },
  { key: 'knoblauch', kcal: 149, protein: 6, carbs: 33, fat: 0.5, gramsPerPiece: 5 },
  { key: 'paprika', kcal: 31, protein: 1, carbs: 6, fat: 0.3, gramsPerPiece: 150 },
  { key: 'tomaten', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, gramsPerPiece: 85 },
  { key: 'karotten', kcal: 41, protein: 0.9, carbs: 10, fat: 0.2, gramsPerPiece: 65 },
  { key: 'zucchini', kcal: 17, protein: 1.2, carbs: 3.1, fat: 0.3, gramsPerPiece: 200 },
  { key: 'brokkoli', kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 },
  { key: 'spinat-tk', kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  { key: 'gurke', kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1, gramsPerPiece: 400 },
  { key: 'salatmix', kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2 },
  { key: 'mais', kcal: 86, protein: 3.2, carbs: 19, fat: 1.2 },
  { key: 'sojasprossen', kcal: 44, protein: 5, carbs: 4, fat: 1.4 },
  { key: 'erbsen', kcal: 81, protein: 5, carbs: 14, fat: 0.4 },
  // Konserven / Basis
  { key: 'dosentomaten', kcal: 24, protein: 1.2, carbs: 4, fat: 0.2 },
  { key: 'tomatenmark', kcal: 82, protein: 4.3, carbs: 15, fat: 0.5 },
  { key: 'kichererbsen', kcal: 130, protein: 7, carbs: 18, fat: 2.5 },
  { key: 'kidneybohnen', kcal: 116, protein: 8, carbs: 16, fat: 0.5 },
  { key: 'kokosmilch', kcal: 197, protein: 2, carbs: 3, fat: 20 },
  // Öle / Saucen
  { key: 'olivenoel', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { key: 'rapsoel', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { key: 'sesamoel', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { key: 'sojasauce', kcal: 60, protein: 8, carbs: 6, fat: 0 },
  // Gewürze / Kräuter (per 100 g; bei Prise vernachlässigbar, aber vollständig)
  { key: 'currypulver', kcal: 325, protein: 13, carbs: 56, fat: 13 },
  { key: 'paprikapulver', kcal: 282, protein: 14, carbs: 54, fat: 13 },
  { key: 'salz', kcal: 0, protein: 0, carbs: 0, fat: 0 },
  { key: 'pfeffer', kcal: 251, protein: 10, carbs: 64, fat: 3.3 },
  { key: 'chili', kcal: 282, protein: 12, carbs: 57, fat: 14 },
  { key: 'oregano', kcal: 265, protein: 9, carbs: 69, fat: 4.3 },
  { key: 'bruehe', kcal: 4, protein: 0.2, carbs: 0.6, fat: 0.1 },
  { key: 'basilikum', kcal: 23, protein: 3.2, carbs: 2.7, fat: 0.6 },
  { key: 'petersilie', kcal: 36, protein: 3, carbs: 6, fat: 0.8 },
  // Obst
  { key: 'zitrone', kcal: 29, protein: 1.1, carbs: 9, fat: 0.3, gramsPerPiece: 100 },
  { key: 'banane', kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, gramsPerPiece: 120 },
  { key: 'apfel', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, gramsPerPiece: 150 },
  // Backen / Sonstiges
  { key: 'backpulver', kcal: 53, protein: 0, carbs: 28, fat: 0 },
  { key: 'trockenhefe', kcal: 325, protein: 40, carbs: 41, fat: 7.6 },
  { key: 'erdnuesse', kcal: 567, protein: 26, carbs: 16, fat: 49 },
];

/** Bekannte productKeys (Set) für schnelles Matching. */
export const SEED_KEYS: ReadonlySet<string> = new Set(NUTRITION_SEED.map((e) => e.key));

/** Schneller Zugriff key -> SeedEntry. */
export const SEED_BY_KEY: ReadonlyMap<string, SeedEntry> = new Map(
  NUTRITION_SEED.map((e) => [e.key, e]),
);
