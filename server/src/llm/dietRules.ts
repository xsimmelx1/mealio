/**
 * dietRules — Heuristiken für Diät-Normalisierung und Allergen-Erkennung.
 *
 * Bewusst schlank und deterministisch (keyword-basiert, analog zum Frontend).
 * Wird von der Validierungs-Pipeline und dem Seed-Fallback gemeinsam genutzt.
 * Rohe LLM-Ausgabe wird hiermit gegen Nutzer-Constraints geprüft — nie vertraut.
 */

import type { DietTag } from './recipeSchema.js';

/**
 * Mappt eine Diät-Präferenz (deutsch oder englisch) auf einen DietTag,
 * gegen den Rezept-dietTags geprüft werden. Gibt null für "omnivor/egal".
 */
export function normalizeDietPreference(diet: string | undefined): DietTag | null {
  const d = (diet ?? '').toLowerCase().trim();
  switch (d) {
    case 'vegan':
      return 'vegan';
    case 'vegetarisch':
    case 'vegetarian':
      return 'vegetarisch';
    case 'pescetarisch':
    case 'pescetarian':
    case 'pescatarian':
      return 'pescetarisch';
    case 'omnivor':
    case 'omnivore':
    case '':
      return null;
    default:
      return null;
  }
}

/**
 * Zutat-Keywords je Allergen (Kleinschreibung, Teilstring-Match).
 * Absichtlich konservativ: lieber ein Rezept verwerfen als ein Allergen durchlassen.
 */
export const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  gluten: [
    'weizen',
    'mehl',
    'pasta',
    'nudel',
    'spaghetti',
    'brot',
    'brötchen',
    'semmel',
    'couscous',
    'bulgur',
    'gerste',
    'dinkel',
    'roggen',
    'paniermehl',
    'panko',
    'seitan',
    'grieß',
  ],
  laktose: [
    'milch',
    'butter',
    'käse',
    'sahne',
    'joghurt',
    'quark',
    'frischkäse',
    'mozzarella',
    'parmesan',
    'feta',
    'mascarpone',
    'schmand',
    'crème fraîche',
    'creme fraiche',
  ],
  nüsse: [
    'walnuss',
    'haselnuss',
    'mandel',
    'cashew',
    'pistazie',
    'pekan',
    'macadamia',
    'paranuss',
    'nuss',
  ],
  erdnüsse: ['erdnuss', 'erdnussbutter', 'peanut'],
  ei: ['ei ', 'eier', 'eigelb', 'eiweiß', 'eiweiss', 'mayonnaise', 'mayo'],
  soja: ['soja', 'tofu', 'edamame', 'miso', 'tempeh'],
  fisch: [
    'fisch',
    'lachs',
    'thunfisch',
    'kabeljau',
    'forelle',
    'hering',
    'sardelle',
    'anchovis',
    'makrele',
    'seelachs',
  ],
  schalentiere: [
    'garnele',
    'shrimp',
    'krabbe',
    'hummer',
    'muschel',
    'tintenfisch',
    'calamari',
    'scampi',
  ],
  sellerie: ['sellerie'],
  senf: ['senf'],
  sesam: ['sesam', 'tahin', 'tahini'],
};

/** Fleisch-/Wurst-Keywords (für Vegetarisch/Vegan-Konformität; ergänzt fisch/schalentiere). */
export const MEAT_KEYWORDS: string[] = [
  'hackfleisch',
  'hack',
  'fleisch',
  'hähnchen',
  'haehnchen',
  'hühn',
  'huhn',
  'pute',
  'geflügel',
  'rind',
  'gulasch',
  'steak',
  'schwein',
  'kalb',
  'lamm',
  'ente',
  'speck',
  'bacon',
  'schinken',
  'salami',
  'wurst',
  'würst',
  'chorizo',
  'kassler',
  'leber',
];

/** Bereits pflanzliche Marker → nie als tierisch werten (Spiegel des Frontends). */
const PLANT_MARKERS = ['vegan', 'pflanz', 'soja', 'tofu', 'hafer', 'kokos', 'mandel', 'seitan'];

/**
 * Prüft, ob ein Zutatname der Ziel-Diät widerspricht (tierisch). Vegetarisch verbietet
 * Fleisch/Fisch/Meeresfrüchte; Vegan zusätzlich Milch/Ei/Honig. Bereits pflanzliche Namen
 * (z. B. „Sojagranulat", „Räuchertofu") werden ignoriert.
 */
export function hasAnimalIngredient(name: string, diet: 'vegetarisch' | 'vegan'): boolean {
  const n = ` ${name.toLowerCase()} `;
  if (PLANT_MARKERS.some((m) => n.includes(m))) return false;
  const groups =
    diet === 'vegan'
      ? [MEAT_KEYWORDS, ALLERGEN_KEYWORDS.fisch, ALLERGEN_KEYWORDS.schalentiere, ALLERGEN_KEYWORDS.laktose, ALLERGEN_KEYWORDS.ei, ['honig']]
      : [MEAT_KEYWORDS, ALLERGEN_KEYWORDS.fisch, ALLERGEN_KEYWORDS.schalentiere];
  return groups.some((kws) => kws.some((kw) => n.includes(kw)));
}

/** DietTags, die ein Allergen bereits vertrauenswürdig ausschließen. */
const DIET_TAG_EXCLUDES: Partial<Record<string, DietTag>> = {
  gluten: 'glutenfrei',
  laktose: 'laktosefrei',
};

/**
 * Prüft, ob ein Zutatname ein gegebenes Allergen enthält (Keyword-Heuristik).
 */
export function ingredientHasAllergen(ingredientName: string, allergy: string): boolean {
  const keywords = ALLERGEN_KEYWORDS[allergy.toLowerCase().trim()];
  if (!keywords) return false;
  const n = ` ${ingredientName.toLowerCase()} `;
  return keywords.some((kw) => n.includes(kw));
}

/**
 * Findet das erste verletzte Allergen in einem Rezept.
 * Für gluten/laktose wird ein passender dietTag als vertrauenswürdiger
 * Freibrief akzeptiert (kein Keyword-Check nötig).
 */
export function findAllergenViolation(
  ingredientNames: string[],
  allergies: string[],
  dietTags: string[],
): { allergy: string; ingredient: string } | null {
  for (const allergy of allergies) {
    const a = allergy.toLowerCase().trim();
    const excludingTag = DIET_TAG_EXCLUDES[a];
    if (excludingTag && dietTags.includes(excludingTag)) {
      continue; // Rezept deklariert sich als frei -> per dietTag akzeptiert.
    }
    for (const name of ingredientNames) {
      if (ingredientHasAllergen(name, a)) {
        return { allergy: a, ingredient: name };
      }
    }
  }
  return null;
}
