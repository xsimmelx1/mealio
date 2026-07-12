import { describe, it, expect } from 'vitest';
import { SEED_RECIPES, buildSeedPool } from './seedRecipes.js';
import { llmRecipeSchema, DIET_TAGS } from './recipeSchema.js';
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
