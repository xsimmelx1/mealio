/**
 * Deterministische Mock-Rezepte für /generate-plan (M4).
 * Ersetzt später die echte LLM-Ausgabe aus der recipe-engine (M9).
 */

import type { Recipe } from '../schemas/index.js';
import type { GeneratePlanInput } from '../schemas/index.js';

/** Basis-Fixtures pro 1 Person; werden nach numberOfPeople skaliert. */
const BASE_RECIPES: Recipe[] = [
  {
    id: 'mock-veggie-pasta',
    title: 'Gemüse-Pasta mit Tomatensauce',
    diet: 'vegetarian',
    servings: 1,
    styles: ['italian', 'quick'],
    ingredients: [
      { name: 'Pasta', amount: 100, unit: 'g' },
      { name: 'Tomaten', amount: 150, unit: 'g' },
      { name: 'Zwiebel', amount: 0.5, unit: 'Stk' },
      { name: 'Olivenöl', amount: 10, unit: 'ml' },
    ],
    steps: ['Pasta kochen.', 'Sauce anbraten.', 'Vermengen und servieren.'],
    estimatedCostPerServing: null,
  },
  {
    id: 'mock-chicken-rice',
    title: 'Hähnchen mit Reis und Gemüse',
    diet: 'omnivore',
    servings: 1,
    styles: ['asian', 'protein'],
    ingredients: [
      { name: 'Hähnchenbrust', amount: 150, unit: 'g' },
      { name: 'Reis', amount: 80, unit: 'g' },
      { name: 'Brokkoli', amount: 100, unit: 'g' },
      { name: 'Sojasauce', amount: 15, unit: 'ml' },
    ],
    steps: ['Reis kochen.', 'Hähnchen anbraten.', 'Gemüse hinzufügen und würzen.'],
    estimatedCostPerServing: null,
  },
  {
    id: 'mock-lentil-curry',
    title: 'Rote-Linsen-Curry',
    diet: 'vegan',
    servings: 1,
    styles: ['indian', 'budget'],
    ingredients: [
      { name: 'Rote Linsen', amount: 90, unit: 'g' },
      { name: 'Kokosmilch', amount: 100, unit: 'ml' },
      { name: 'Currypaste', amount: 20, unit: 'g' },
      { name: 'Reis', amount: 80, unit: 'g' },
    ],
    steps: ['Linsen kochen.', 'Currypaste und Kokosmilch einrühren.', 'Mit Reis servieren.'],
    estimatedCostPerServing: null,
  },
  {
    id: 'mock-omelette',
    title: 'Gemüse-Omelett',
    diet: 'vegetarian',
    servings: 1,
    styles: ['breakfast', 'quick'],
    ingredients: [
      { name: 'Eier', amount: 2, unit: 'Stk' },
      { name: 'Paprika', amount: 50, unit: 'g' },
      { name: 'Käse', amount: 30, unit: 'g' },
    ],
    steps: ['Eier verquirlen.', 'Gemüse anbraten.', 'Eier zugeben und stocken lassen.'],
    estimatedCostPerServing: null,
  },
  {
    id: 'mock-beef-stew',
    title: 'Rindergulasch mit Kartoffeln',
    diet: 'omnivore',
    styles: ['hearty', 'slow'],
    servings: 1,
    ingredients: [
      { name: 'Rindfleisch', amount: 150, unit: 'g' },
      { name: 'Kartoffeln', amount: 200, unit: 'g' },
      { name: 'Zwiebel', amount: 1, unit: 'Stk' },
    ],
    steps: ['Fleisch anbraten.', 'Zwiebeln zugeben.', 'Mit Kartoffeln schmoren.'],
    estimatedCostPerServing: null,
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Liefert deterministische Mock-Rezepte, grob gefiltert nach Diät und
 * vermiedenen Zutaten sowie skaliert nach numberOfPeople.
 */
export function buildMockRecipes(prefs: GeneratePlanInput): Recipe[] {
  const diet = prefs.diet.toLowerCase();
  const avoided = new Set(prefs.avoidedIngredients.map((a) => a.toLowerCase()));

  // Diät-Kompatibilität: vegan < vegetarian < omnivore.
  const dietAllows = (recipeDiet: string): boolean => {
    if (diet === 'omnivore' || diet === '') return true;
    if (diet === 'vegetarian') return recipeDiet === 'vegetarian' || recipeDiet === 'vegan';
    if (diet === 'vegan') return recipeDiet === 'vegan';
    return recipeDiet === diet;
  };

  let candidates = BASE_RECIPES.filter((r) => dietAllows(r.diet));

  // Zutaten meiden.
  candidates = candidates.filter(
    (r) => !r.ingredients.some((ing) => avoided.has(ing.name.toLowerCase())),
  );

  // Fallback: nie leer ausliefern (sauberes Degradieren).
  if (candidates.length === 0) {
    candidates = BASE_RECIPES.slice(0, 3);
  }

  // Auf gewünschte Tage begrenzen, aber mindestens 1.
  const wanted = Math.max(1, Math.min(prefs.days, candidates.length));
  const selected = candidates.slice(0, wanted);

  // Nach numberOfPeople skalieren.
  return selected.map((r) => ({
    ...r,
    servings: prefs.numberOfPeople,
    ingredients: r.ingredients.map((ing) => ({
      ...ing,
      amount: round2(ing.amount * prefs.numberOfPeople),
    })),
  }));
}
