/**
 * seedRecipes — serverseitiger, geprüfter Fallback-Katalog (M9).
 *
 * Alle Einträge sind schema-konform (llmRecipeSchema) und diät-divers. Sie dienen
 * als Fallback, wenn das LLM keine verwertbare Ausgabe liefert (Netz/Key/Parse),
 * und als Ersatz für einzelne verworfene LLM-Rezepte in der Validierungs-Pipeline.
 *
 * Basis-Mengen sind für 1 Portion definiert und werden über scaleRecipe auf die
 * gewünschte Personenzahl skaliert.
 */

import type { GeneratePlanInput } from '../schemas/index.js';
import type { LlmRecipe } from './recipeSchema.js';
import { findAllergenViolation, normalizeDietPreference } from './dietRules.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Basis-Katalog, jeweils für baseServings = 1. */
export const SEED_RECIPES: readonly LlmRecipe[] = [
  {
    title: 'Rote-Linsen-Dal mit Reis',
    mealStyles: ['budget', 'veggie'],
    dietTags: ['vegan', 'vegetarisch', 'glutenfrei', 'laktosefrei'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 25,
    baseServings: 1,
    ingredients: [
      { name: 'Rote Linsen', amount: 80, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Kokosmilch', amount: 80, unit: 'ml', aisle: 'konserven' },
      { name: 'Reis', amount: 70, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Zwiebel', amount: 0.5, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Currypulver', amount: 1, unit: 'tsp', aisle: 'gewürze' },
    ],
    steps: [
      'Zwiebel würfeln und in etwas Öl glasig anschwitzen.',
      'Linsen, Currypulver und Kokosmilch zugeben, mit Wasser aufgießen und 20 Minuten köcheln.',
      'Reis nach Packungsanweisung garen und mit dem Dal servieren.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Kichererbsen-Gemüse-Curry',
    mealStyles: ['budget', 'veggie', 'familienfreundlich'],
    dietTags: ['vegan', 'vegetarisch', 'glutenfrei', 'laktosefrei'],
    requiredAppliances: ['herd'],
    prepMinutes: 15,
    cookMinutes: 20,
    baseServings: 1,
    ingredients: [
      { name: 'Kichererbsen', amount: 120, unit: 'g', aisle: 'konserven' },
      { name: 'Passierte Tomaten', amount: 120, unit: 'ml', aisle: 'konserven' },
      { name: 'Paprika', amount: 80, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Kokosmilch', amount: 60, unit: 'ml', aisle: 'konserven' },
      { name: 'Currypaste', amount: 1, unit: 'tbsp', aisle: 'gewürze' },
    ],
    steps: [
      'Paprika in Streifen schneiden und kurz anbraten.',
      'Currypaste, Tomaten und Kokosmilch zugeben und aufkochen.',
      'Kichererbsen unterrühren und 15 Minuten sanft köcheln lassen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Tofu-Gemüse-Wok mit Reisnudeln',
    mealStyles: ['schnell', 'veggie', 'fakeaway'],
    dietTags: ['vegan', 'vegetarisch', 'laktosefrei'],
    requiredAppliances: ['herd'],
    prepMinutes: 15,
    cookMinutes: 12,
    baseServings: 1,
    ingredients: [
      { name: 'Räuchertofu', amount: 100, unit: 'g', aisle: 'kühlregal' },
      { name: 'Reisnudeln', amount: 70, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Brokkoli', amount: 90, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Möhre', amount: 60, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Sojasauce', amount: 1, unit: 'tbsp', aisle: 'gewürze' },
    ],
    steps: [
      'Reisnudeln nach Packungsanweisung einweichen bzw. garen.',
      'Tofu würfeln und im Wok knusprig anbraten, Gemüse zugeben.',
      'Nudeln und Sojasauce unterheben und heiß servieren.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Gemüse-Pasta mit Tomatensauce',
    mealStyles: ['schnell', 'familienfreundlich', 'budget'],
    dietTags: ['vegetarisch'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 15,
    baseServings: 1,
    ingredients: [
      { name: 'Pasta', amount: 100, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Passierte Tomaten', amount: 150, unit: 'ml', aisle: 'konserven' },
      { name: 'Zwiebel', amount: 0.5, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Olivenöl', amount: 1, unit: 'tbsp', aisle: 'trockenwaren' },
      { name: 'Parmesan', amount: 15, unit: 'g', aisle: 'kühlregal' },
    ],
    steps: [
      'Pasta in reichlich Salzwasser al dente kochen.',
      'Zwiebel anschwitzen, Tomaten zugeben und 10 Minuten einköcheln.',
      'Pasta mit der Sauce vermengen und mit Parmesan bestreuen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Rührei mit Gemüse',
    mealStyles: ['schnell', 'high-protein', 'veggie'],
    dietTags: ['vegetarisch', 'glutenfrei', 'low-carb'],
    requiredAppliances: ['herd'],
    prepMinutes: 8,
    cookMinutes: 7,
    baseServings: 1,
    ingredients: [
      { name: 'Eier', amount: 2, unit: 'stück', aisle: 'kühlregal' },
      { name: 'Paprika', amount: 60, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Frühlingszwiebel', amount: 1, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Butter', amount: 10, unit: 'g', aisle: 'kühlregal' },
    ],
    steps: [
      'Paprika und Frühlingszwiebel klein schneiden.',
      'Gemüse in Butter anbraten, dann die verquirlten Eier zugeben.',
      'Bei mittlerer Hitze stocken lassen und mit Salz und Pfeffer würzen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Hähnchen-Reispfanne mit Gemüse',
    mealStyles: ['high-protein', 'familienfreundlich'],
    dietTags: ['omnivor', 'glutenfrei', 'laktosefrei'],
    requiredAppliances: ['herd'],
    prepMinutes: 15,
    cookMinutes: 20,
    baseServings: 1,
    ingredients: [
      { name: 'Hähnchenbrust', amount: 150, unit: 'g', aisle: 'fleisch-fisch' },
      { name: 'Reis', amount: 75, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Brokkoli', amount: 90, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Möhre', amount: 60, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Rapsöl', amount: 1, unit: 'tbsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Reis nach Packungsanweisung kochen.',
      'Hähnchen würfeln und in Öl kräftig anbraten.',
      'Gemüse zugeben, garen und mit dem Reis vermengen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Rinderhack-Zucchini-Pfanne',
    mealStyles: ['high-protein', 'schnell'],
    dietTags: ['omnivor', 'glutenfrei', 'laktosefrei', 'low-carb'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 18,
    baseServings: 1,
    ingredients: [
      { name: 'Rinderhackfleisch', amount: 130, unit: 'g', aisle: 'fleisch-fisch' },
      { name: 'Zucchini', amount: 120, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Passierte Tomaten', amount: 100, unit: 'ml', aisle: 'konserven' },
      { name: 'Zwiebel', amount: 0.5, unit: 'stück', aisle: 'obst-gemüse' },
    ],
    steps: [
      'Zwiebel würfeln, Zucchini in Scheiben schneiden.',
      'Hackfleisch krümelig anbraten, Zwiebel mitbraten.',
      'Zucchini und Tomaten zugeben und 12 Minuten schmoren.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Lachsfilet mit Ofengemüse',
    mealStyles: ['high-protein', 'familienfreundlich'],
    dietTags: ['pescetarisch', 'glutenfrei', 'laktosefrei'],
    requiredAppliances: ['backofen'],
    prepMinutes: 15,
    cookMinutes: 25,
    baseServings: 1,
    ingredients: [
      { name: 'Lachsfilet', amount: 140, unit: 'g', aisle: 'fleisch-fisch' },
      { name: 'Kartoffeln', amount: 200, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Zucchini', amount: 100, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Olivenöl', amount: 1, unit: 'tbsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Kartoffeln und Zucchini in Stücke schneiden, mit Öl auf ein Blech geben.',
      'Im Ofen bei 200 Grad 15 Minuten vorbacken.',
      'Lachs dazulegen und weitere 12 Minuten garen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Ofenkartoffeln mit Kräuterquark',
    mealStyles: ['budget', 'familienfreundlich', 'veggie'],
    dietTags: ['vegetarisch', 'glutenfrei'],
    requiredAppliances: ['backofen'],
    prepMinutes: 10,
    cookMinutes: 40,
    baseServings: 1,
    ingredients: [
      { name: 'Kartoffeln', amount: 250, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Magerquark', amount: 100, unit: 'g', aisle: 'kühlregal' },
      { name: 'Schnittlauch', amount: 5, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Olivenöl', amount: 1, unit: 'tbsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Kartoffeln halbieren, mit Öl mischen und auf ein Blech legen.',
      'Im Ofen bei 200 Grad etwa 35 Minuten backen.',
      'Quark mit Schnittlauch, Salz und Pfeffer verrühren und dazu servieren.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Overnight Oats mit Beeren',
    mealStyles: ['schnell', 'budget', 'veggie'],
    dietTags: ['vegetarisch'],
    requiredAppliances: [],
    prepMinutes: 5,
    cookMinutes: 0,
    baseServings: 1,
    ingredients: [
      { name: 'Haferflocken', amount: 50, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Milch', amount: 120, unit: 'ml', aisle: 'kühlregal' },
      { name: 'Beerenmischung', amount: 80, unit: 'g', aisle: 'tiefkühl' },
      { name: 'Honig', amount: 1, unit: 'tsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Haferflocken mit Milch verrühren und über Nacht kühlstellen.',
      'Am Morgen umrühren und bei Bedarf etwas Milch zugeben.',
      'Mit Beeren und Honig toppen und servieren.',
    ],
    nutritionPerServing: null,
  },
];

/** Skaliert ein Basis-Rezept (baseServings=1) auf die Personenzahl. */
export function scaleRecipe(recipe: LlmRecipe, people: number): LlmRecipe {
  const factor = people / recipe.baseServings;
  return {
    ...recipe,
    baseServings: people,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      amount: round2(ing.amount * factor),
    })),
  };
}

/** Normalisiert einen Titel für Duplikat-Erkennung. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Liefert die auf die Präferenzen gefilterten und auf die Personenzahl skalierten
 * Seed-Rezepte (jedes höchstens einmal). Filtert nach Diät, vermiedenen und
 * (per Keyword-Heuristik) allergenen Zutaten. Wird für den Fallback-Plan und für
 * das Ersetzen einzelner verworfener LLM-Rezepte genutzt.
 */
export function buildSeedPool(prefs: GeneratePlanInput): LlmRecipe[] {
  const wantedDiet = normalizeDietPreference(prefs.diet);
  const avoided = prefs.avoidedIngredients.map((a) => a.toLowerCase().trim()).filter(Boolean);
  const allergies = prefs.allergies;

  const matchesDiet = (recipe: LlmRecipe): boolean => {
    if (!wantedDiet) return true;
    return recipe.dietTags.includes(wantedDiet);
  };

  const hasAvoided = (recipe: LlmRecipe): boolean =>
    recipe.ingredients.some((ing) => {
      const n = ing.name.toLowerCase();
      return avoided.some((a) => n.includes(a) || a.includes(n));
    });

  const hasAllergen = (recipe: LlmRecipe): boolean =>
    findAllergenViolation(
      recipe.ingredients.map((i) => i.name),
      allergies,
      recipe.dietTags,
    ) !== null;

  let candidates = SEED_RECIPES.filter(
    (r) => matchesDiet(r) && !hasAvoided(r) && !hasAllergen(r),
  );

  // Nie leer ausliefern: Constraints schrittweise lockern (Diät zuletzt).
  if (candidates.length === 0) {
    candidates = SEED_RECIPES.filter((r) => matchesDiet(r) && !hasAllergen(r));
  }
  if (candidates.length === 0) {
    candidates = SEED_RECIPES.filter((r) => matchesDiet(r));
  }
  if (candidates.length === 0) {
    candidates = [...SEED_RECIPES];
  }

  return candidates.map((r) => scaleRecipe(r, prefs.numberOfPeople));
}

/**
 * Baut einen geprüften Seed-Plan: nutzt den gefilterten Pool und liefert genau
 * `days` Rezepte (wiederholt notfalls mit eindeutigem Titel-Suffix, damit keine
 * Plan-Duplikate entstehen).
 */
export function buildSeedPlan(prefs: GeneratePlanInput): LlmRecipe[] {
  const candidates = buildSeedPool(prefs);
  const wanted = Math.max(1, prefs.days);
  const out: LlmRecipe[] = [];
  for (let i = 0; i < wanted; i++) {
    const base = candidates[i % candidates.length]; // bereits skaliert
    // Bei Wiederholung eindeutigen Titel erzeugen (keine Plan-Duplikate).
    const title =
      i < candidates.length
        ? base.title
        : `${base.title} (Variante ${Math.floor(i / candidates.length) + 1})`;
    out.push({ ...base, title });
  }
  return out;
}
