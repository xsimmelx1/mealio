import { describe, it, expect } from 'vitest';
import { SEED_RECIPES, buildSeedPool, buildSeedPlan } from './seedRecipes.js';
import { llmRecipeSchema, DIET_TAGS, MEAL_TYPES } from './recipeSchema.js';
import { generatePlanSchema } from '../schemas/index.js';

describe('Seed-Katalog', () => {
  it('enthält >=8 schema-valide Rezepte', () => {
    expect(SEED_RECIPES.length).toBeGreaterThanOrEqual(8);
    for (const r of SEED_RECIPES) {
      expect(() => llmRecipeSchema.parse(r)).not.toThrow();
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      expect(r.nutritionPerServing).toBeNull();
    }
  });

  it('ist diät-divers (deckt vegan, vegetarisch, omnivor, pescetarisch ab)', () => {
    const tags = new Set(SEED_RECIPES.flatMap((r) => r.dietTags));
    for (const t of ['vegan', 'vegetarisch', 'omnivor', 'pescetarisch'] as const) {
      expect(DIET_TAGS).toContain(t);
      expect(tags.has(t)).toBe(true);
    }
  });

  it('jedes Seed-Rezept hat mind. einen gültigen mealTypes-Eintrag', () => {
    for (const r of SEED_RECIPES) {
      expect(r.mealTypes.length).toBeGreaterThanOrEqual(1);
      for (const m of r.mealTypes) expect(MEAL_TYPES).toContain(m);
    }
  });

  it('deckt jede Mahlzeit mit mind. einem Seed-Rezept ab', () => {
    for (const m of MEAL_TYPES) {
      expect(SEED_RECIPES.some((r) => r.mealTypes.includes(m))).toBe(true);
    }
  });

  it('buildSeedPool(meal) liefert nur passende, auf [meal] eingeengte Rezepte', () => {
    const p = generatePlanSchema.parse({ numberOfPeople: 2 });
    const pool = buildSeedPool(p, 'fruehstueck');
    expect(pool.length).toBeGreaterThan(0);
    for (const r of pool) {
      expect(r.mealTypes).toEqual(['fruehstueck']);
    }
  });

  it('buildSeedPlan erzeugt days Rezepte JE angefragter Mahlzeit', () => {
    const p = generatePlanSchema.parse({
      numberOfPeople: 2,
      days: 4,
      mealTypes: ['fruehstueck', 'abendessen'],
    });
    const plan = buildSeedPlan(p);
    expect(plan.length).toBe(8);
    expect(plan.filter((r) => r.mealTypes.includes('fruehstueck')).length).toBe(4);
    expect(plan.filter((r) => r.mealTypes.includes('abendessen')).length).toBe(4);
    expect(new Set(plan.map((r) => r.title)).size).toBe(plan.length);
  });

  it('buildSeedPool respektiert Allergien (kein Gluten-Rezept bei gluten-Allergie)', () => {
    const p = generatePlanSchema.parse({ numberOfPeople: 2, allergies: ['gluten'] });
    const pool = buildSeedPool(p);
    expect(pool.length).toBeGreaterThan(0);
    // Kein Rezept mit klassischer Gluten-Zutat ohne glutenfrei-Tag.
    for (const r of pool) {
      const names = r.ingredients.map((i) => i.name.toLowerCase()).join(' ');
      const hasGlutenKeyword = /pasta|nudel|mehl|brot|couscous|bulgur/.test(names);
      if (hasGlutenKeyword) expect(r.dietTags).toContain('glutenfrei');
    }
  });
});
