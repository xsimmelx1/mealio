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
import type { LlmRecipe, MealType } from './recipeSchema.js';
import { findAllergenViolation, normalizeDietPreference } from './dietRules.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Basis-Katalog, jeweils für baseServings = 1. */
export const SEED_RECIPES: readonly LlmRecipe[] = [
  {
    title: 'Rote-Linsen-Dal mit Reis',
    mealStyles: ['budget', 'veggie'],
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['fruehstueck', 'mittagessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['abendessen'],
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
    mealTypes: ['mittagessen', 'abendessen'],
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
    mealTypes: ['fruehstueck'],
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
  {
    title: 'Bananen-Porridge mit Haferdrink',
    mealStyles: ['schnell', 'budget', 'veggie'],
    mealTypes: ['fruehstueck'],
    dietTags: ['vegan', 'vegetarisch', 'laktosefrei'],
    requiredAppliances: ['herd'],
    prepMinutes: 5,
    cookMinutes: 10,
    baseServings: 1,
    ingredients: [
      { name: 'Haferflocken', amount: 50, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Haferdrink', amount: 200, unit: 'ml', aisle: 'kühlregal' },
      { name: 'Banane', amount: 1, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Ahornsirup', amount: 1, unit: 'tsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Haferflocken mit dem Haferdrink aufkochen und 5 Minuten köcheln lassen.',
      'Banane in Scheiben schneiden und unterheben.',
      'In eine Schale füllen und mit Ahornsirup süßen.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Joghurt-Bowl mit Obst und Haferflocken',
    mealStyles: ['schnell', 'high-protein', 'veggie'],
    mealTypes: ['fruehstueck'],
    dietTags: ['vegetarisch'],
    requiredAppliances: [],
    prepMinutes: 5,
    cookMinutes: 0,
    baseServings: 1,
    ingredients: [
      { name: 'Naturjoghurt', amount: 150, unit: 'g', aisle: 'kühlregal' },
      { name: 'Banane', amount: 1, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Haferflocken', amount: 30, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Honig', amount: 1, unit: 'tsp', aisle: 'trockenwaren' },
    ],
    steps: [
      'Joghurt in eine Schale geben.',
      'Banane in Scheiben schneiden und mit den Haferflocken darauf verteilen.',
      'Mit Honig beträufeln und servieren.',
    ],
    nutritionPerServing: null,
  },
  {
    title: 'Shakshuka mit Feta',
    mealStyles: ['veggie', 'high-protein'],
    mealTypes: ['fruehstueck', 'mittagessen'],
    dietTags: ['vegetarisch', 'glutenfrei', 'low-carb'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 20,
    baseServings: 1,
    ingredients: [
      { name: 'Eier', amount: 2, unit: 'stück', aisle: 'kühlregal' },
      { name: 'Gehackte Tomaten', amount: 200, unit: 'g', aisle: 'konserven' },
      { name: 'Paprika', amount: 60, unit: 'g', aisle: 'obst-gemüse' },
      { name: 'Zwiebel', amount: 0.5, unit: 'stück', aisle: 'obst-gemüse' },
      { name: 'Feta', amount: 40, unit: 'g', aisle: 'kühlregal' },
    ],
    steps: [
      'Zwiebel und Paprika würfeln und anschwitzen.',
      'Gehackte Tomaten zugeben und 10 Minuten einköcheln lassen.',
      'Eier hineingleiten lassen, stocken lassen und mit Feta bestreuen.',
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

/** Angefragte Mahlzeiten aus den Prefs; nie leer (Default 'abendessen'). */
export function requestedMealTypes(prefs: GeneratePlanInput): MealType[] {
  const wanted = prefs.mealTypes.filter((m): m is MealType =>
    (['fruehstueck', 'mittagessen', 'abendessen'] as const).includes(m as MealType),
  );
  return wanted.length > 0 ? wanted : ['abendessen'];
}

/**
 * Liefert die auf die Präferenzen gefilterten und auf die Personenzahl skalierten
 * Seed-Rezepte (jedes höchstens einmal). Filtert nach Diät, vermiedenen und
 * (per Keyword-Heuristik) allergenen Zutaten. Ist `meal` gesetzt, werden nur
 * dafür geeignete Rezepte zurückgegeben und deren mealTypes auf genau [meal]
 * eingeengt (Response-Kontrakt: mealTypes ⊆ angefragte Typen). Wird für den
 * Fallback-Plan und für das Ersetzen einzelner verworfener LLM-Rezepte genutzt.
 */
export function buildSeedPool(prefs: GeneratePlanInput, meal?: MealType): LlmRecipe[] {
  const wantedDiet = normalizeDietPreference(prefs.diet);
  const avoided = prefs.avoidedIngredients.map((a) => a.toLowerCase().trim()).filter(Boolean);
  const allergies = prefs.allergies;

  const matchesDiet = (recipe: LlmRecipe): boolean => {
    if (!wantedDiet) return true;
    return recipe.dietTags.includes(wantedDiet);
  };

  const matchesMeal = (recipe: LlmRecipe): boolean =>
    meal === undefined || recipe.mealTypes.includes(meal);

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
    (r) => matchesMeal(r) && matchesDiet(r) && !hasAvoided(r) && !hasAllergen(r),
  );

  // Nie leer ausliefern: Constraints schrittweise lockern (Meal/Diät zuletzt).
  if (candidates.length === 0) {
    candidates = SEED_RECIPES.filter((r) => matchesMeal(r) && matchesDiet(r) && !hasAllergen(r));
  }
  if (candidates.length === 0) {
    candidates = SEED_RECIPES.filter((r) => matchesMeal(r) && matchesDiet(r));
  }
  if (candidates.length === 0) {
    candidates = SEED_RECIPES.filter((r) => matchesMeal(r));
  }
  if (candidates.length === 0) {
    candidates = [...SEED_RECIPES];
  }

  return candidates.map((r) => {
    const scaled = scaleRecipe(r, prefs.numberOfPeople);
    // Auf die angefragte Mahlzeit einengen, damit die Response nur ⊆ enthält.
    return meal ? { ...scaled, mealTypes: [meal] } : scaled;
  });
}

/**
 * Baut einen geprüften Seed-Plan über ALLE angefragten Mahlzeiten. Pro Mahlzeit
 * werden `days` Rezepte erzeugt (wiederholt notfalls mit eindeutigem Titel-Suffix,
 * damit keine Plan-Duplikate entstehen). Jedes Rezept trägt mealTypes = [meal].
 */
export function buildSeedPlan(prefs: GeneratePlanInput): LlmRecipe[] {
  const meals = requestedMealTypes(prefs);
  const perMeal = Math.max(1, prefs.days);
  const usedTitles = new Set<string>();
  const out: LlmRecipe[] = [];

  for (const meal of meals) {
    const candidates = buildSeedPool(prefs, meal);
    let added = 0;
    let i = 0;
    let guard = 0;
    while (added < perMeal && guard < perMeal * 4 + 8) {
      guard++;
      const base = candidates[i % candidates.length]; // bereits skaliert
      const variant = Math.floor(i / candidates.length);
      const title = variant === 0 ? base.title : `${base.title} (Variante ${variant + 1})`;
      i++;
      const key = normalizeTitle(title);
      if (usedTitles.has(key)) continue;
      usedTitles.add(key);
      out.push({ ...base, title });
      added++;
    }
  }
  return out;
}
