import { describe, it, expect } from 'vitest';
import seedRecipes from '../assets/recipes.seed.json';
import { SeedRecipeSchema } from './schema';
import { MEAL_TYPES } from './enums';

/**
 * Guardrail-Tests für die kuratierten Seed-Rezepte.
 * Rohe Seed-Daten sind erst dann vertrauenswürdig, wenn sie das
 * kanonische SeedRecipeSchema erfüllen und inhaltlich konsistent sind.
 */

/** Zutat-Keywords, die auf tierische Produkte hindeuten (vegan verboten). */
const ANIMAL_KEYWORDS = [
  'hähnchen',
  'huhn',
  'hühner',
  'pute',
  'rind',
  'hackfleisch',
  'schwein',
  'speck',
  'schinken',
  'wurst',
  'lachs',
  'thunfisch',
  'garnele',
  'fisch',
  'käse',
  'feta',
  'mozzarella',
  'parmesan',
  'sahne',
  'butter',
  'joghurt',
  'quark',
  'honig',
  'eier',
];

/** Fleisch/Fisch-Keywords, die in vegetarischen Rezepten verboten sind. */
const MEAT_FISH_KEYWORDS = [
  'hähnchen',
  'huhn',
  'hühner',
  'pute',
  'rind',
  'hackfleisch',
  'schwein',
  'speck',
  'schinken',
  'wurst',
  'lachs',
  'thunfisch',
  'garnele',
  'fisch',
];

/** Pflanzliche "Milch"-Produkte, die trotz Namens vegan sind. */
const PLANT_MILKS = ['kokosmilch', 'hafermilch', 'sojamilch', 'mandelmilch', 'reismilch'];

function containsKeyword(name: string, keywords: string[]): string | null {
  const lower = name.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

/** Wie containsKeyword, prüft aber zusätzlich echte (tierische) Milch. */
function containsAnimalKeyword(name: string): string | null {
  const hit = containsKeyword(name, ANIMAL_KEYWORDS);
  if (hit) return hit;
  const lower = name.toLowerCase();
  // "milch" nur beanstanden, wenn es kein Pflanzendrink ist.
  if (lower.includes('milch') && !PLANT_MILKS.some((m) => lower.includes(m))) {
    return 'milch';
  }
  return null;
}

describe('recipes.seed.json', () => {
  it('ist ein Array mit mindestens 39 Rezepten', () => {
    expect(Array.isArray(seedRecipes)).toBe(true);
    expect(seedRecipes.length).toBeGreaterThanOrEqual(39);
  });

  it('jedes Rezept hat mind. einen gültigen mealTypes-Eintrag', () => {
    for (const recipe of seedRecipes) {
      expect(
        recipe.mealTypes.length,
        `Rezept ${recipe.id} hat keine mealTypes`,
      ).toBeGreaterThanOrEqual(1);
      for (const mt of recipe.mealTypes) {
        expect(
          (MEAL_TYPES as readonly string[]).includes(mt),
          `Rezept ${recipe.id} hat ungültigen mealType "${mt}"`,
        ).toBe(true);
      }
    }
  });

  it('enthält mindestens 8 Frühstücks-Rezepte', () => {
    const fruehstueck = seedRecipes.filter((r) => r.mealTypes.includes('fruehstueck'));
    expect(fruehstueck.length).toBeGreaterThanOrEqual(8);
  });

  it('jedes Rezept ist gegen SeedRecipeSchema valide', () => {
    for (const recipe of seedRecipes) {
      const result = SeedRecipeSchema.safeParse(recipe);
      if (!result.success) {
        throw new Error(
          `Ungültiges Seed-Rezept ${(recipe as { id?: string }).id ?? '??'}: ${result.error.message}`,
        );
      }
      expect(result.success).toBe(true);
    }
  });

  it('alle IDs sind eindeutig und tragen das seed- Präfix', () => {
    const ids = seedRecipes.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith('seed-')).toBe(true);
    }
  });

  it('vegane Rezepte enthalten keine offensichtlich tierischen Zutaten', () => {
    const vegan = seedRecipes.filter((r) => r.dietTags.includes('vegan'));
    for (const recipe of vegan) {
      for (const ing of recipe.ingredients) {
        const hit = containsAnimalKeyword(ing.name);
        expect(
          hit,
          `Veganes Rezept ${recipe.id} enthält tierische Zutat "${ing.name}" (Keyword: ${hit})`,
        ).toBeNull();
      }
    }
  });

  it('vegetarische Rezepte enthalten kein Fleisch und keinen Fisch', () => {
    const veg = seedRecipes.filter((r) => r.dietTags.includes('vegetarisch'));
    for (const recipe of veg) {
      for (const ing of recipe.ingredients) {
        const hit = containsKeyword(ing.name, MEAT_FISH_KEYWORDS);
        expect(
          hit,
          `Vegetarisches Rezept ${recipe.id} enthält "${ing.name}" (Keyword: ${hit})`,
        ).toBeNull();
      }
    }
  });

  it('deckt jeden Meal-Style mit mindestens 3 Rezepten ab', () => {
    const styles = ['schnell', 'high-protein', 'familienfreundlich', 'fakeaway', 'veggie', 'budget'] as const;
    for (const style of styles) {
      const count = seedRecipes.filter((r) => r.mealStyles.includes(style)).length;
      expect(count, `Style "${style}" hat nur ${count} Rezepte`).toBeGreaterThanOrEqual(3);
    }
  });

  it('erfüllt die Diät-Abdeckung (>=6 veg*, >=2 pescetarisch)', () => {
    const vegCount = seedRecipes.filter(
      (r) => r.dietTags.includes('vegan') || r.dietTags.includes('vegetarisch'),
    ).length;
    const pescCount = seedRecipes.filter((r) => r.dietTags.includes('pescetarisch')).length;
    expect(vegCount).toBeGreaterThanOrEqual(6);
    expect(pescCount).toBeGreaterThanOrEqual(2);
  });
});
