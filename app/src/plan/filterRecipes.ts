import type { Diet } from '../domain/enums';
import type { Recipe, UserPreferences } from '../domain/schema';

/**
 * Reine Rezept-Filter-/Ranking-Logik für die Plan-Generierung (deterministisch, testbar).
 */

/** Welche dietTags erfüllen eine gewählte Ernährungsform? */
const DIET_ACCEPTS: Record<Diet, (tags: string[]) => boolean> = {
  vegan: (t) => t.includes('vegan'),
  vegetarisch: (t) => t.includes('vegan') || t.includes('vegetarisch'),
  pescetarisch: (t) => t.includes('vegan') || t.includes('vegetarisch') || t.includes('pescetarisch'),
  omnivor: () => true,
};

/** Allergen-Keywords zur Zutat-Heuristik (für Allergien ohne eigenes dietTag). */
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  nüsse: ['nuss', 'nüsse', 'mandel', 'walnuss', 'haselnuss', 'cashew', 'pistazie', 'pecan'],
  erdnüsse: ['erdnuss', 'erdnüsse', 'peanut'],
  ei: ['ei', 'eier', 'eigelb', 'eiweiß', 'mayonnaise'],
  soja: ['soja', 'tofu', 'edamame', 'sojasauce', 'sojasoße', 'tempeh'],
  fisch: ['fisch', 'lachs', 'thunfisch', 'kabeljau', 'forelle', 'sardine', 'hering'],
  schalentiere: ['garnele', 'krabbe', 'shrimp', 'hummer', 'muschel', 'scampi', 'krebs'],
  sellerie: ['sellerie'],
  senf: ['senf'],
  sesam: ['sesam', 'tahin'],
};

const norm = (s: string) => s.toLowerCase();

function containsAllergen(recipe: Recipe, allergen: string): boolean {
  const keywords = ALLERGEN_KEYWORDS[allergen];
  if (!keywords) return false;
  return recipe.ingredients.some((ing) => {
    const n = norm(ing.name);
    return keywords.some((k) => n.includes(k));
  });
}

/** Ist ein Rezept für die Präferenzen zulässig (harte Filter)? */
export function isEligible(recipe: Recipe, prefs: UserPreferences): boolean {
  // Ernährungsform
  if (!DIET_ACCEPTS[prefs.diet](recipe.dietTags)) return false;

  // Allergien: gluten/laktose über dietTags, Rest über Zutat-Keywords.
  for (const allergy of prefs.allergies) {
    if (allergy === 'gluten') {
      if (!recipe.dietTags.includes('glutenfrei')) return false;
    } else if (allergy === 'laktose') {
      if (!recipe.dietTags.includes('laktosefrei')) return false;
    } else if (containsAllergen(recipe, allergy)) {
      return false;
    }
  }

  // Ungeliebte Zutaten
  if (prefs.avoidedIngredients.length) {
    const hasAvoided = recipe.ingredients.some((ing) => {
      const n = norm(ing.name);
      return prefs.avoidedIngredients.some((a) => a && n.includes(norm(a)));
    });
    if (hasAvoided) return false;
  }

  // Küchengeräte: alle benötigten müssen vorhanden sein.
  // Leere Geräteliste in den Prefs = keine Einschränkung (Onboarding übersprungen).
  if (prefs.appliances.length) {
    const ok = recipe.requiredAppliances.every((a) => prefs.appliances.includes(a));
    if (!ok) return false;
  }

  return true;
}

/** Präferenz-Score (weiches Ranking): Favoriten + bevorzugte Styles bevorzugen. */
export function preferenceScore(recipe: Recipe, prefs: UserPreferences): number {
  let score = 0;
  if (recipe.isFavorite) score += 3;
  for (const style of prefs.preferredStyles) {
    if (recipe.mealStyles.includes(style)) score += 1;
  }
  return score;
}

/** Alle zulässigen Rezepte für die Prefs. */
export function eligibleRecipes(recipes: Recipe[], prefs: UserPreferences): Recipe[] {
  return recipes.filter((r) => isEligible(r, prefs));
}
