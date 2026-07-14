import { describe, expect, it } from 'vitest';
import { MockLlmClient } from './llmClient.js';
import { defaultMockResponder } from './mockResponder.js';
import { adaptRecipeSteps } from './adaptRecipe.js';
import { hasAnimalIngredient } from './dietRules.js';
import type { LlmRecipe } from './recipeSchema.js';

const baseRecipe: LlmRecipe = {
  title: 'Gemüsepfanne mit Tofu',
  mealStyles: [],
  mealTypes: ['abendessen'],
  dietTags: ['vegan', 'vegetarisch'],
  requiredAppliances: ['herd'],
  prepMinutes: 10,
  cookMinutes: 15,
  baseServings: 2,
  ingredients: [
    { name: 'Tofu natur', amount: 300, unit: 'g', aisle: 'kühlregal' },
    { name: 'Haferdrink', amount: 200, unit: 'ml', aisle: 'kühlregal' },
  ],
  steps: ['Hähnchen anbraten.', 'Milch zugeben.', 'Servieren.'],
  nutritionPerServing: null,
};

describe('hasAnimalIngredient', () => {
  it('erkennt Fleisch/Fisch für vegetarisch und vegan', () => {
    expect(hasAnimalIngredient('Hähnchenbrustfilet', 'vegetarisch')).toBe(true);
    expect(hasAnimalIngredient('Lachsfilet', 'vegetarisch')).toBe(true);
    expect(hasAnimalIngredient('Hackfleisch', 'vegan')).toBe(true);
  });

  it('Milch/Ei/Honig nur für vegan tierisch', () => {
    expect(hasAnimalIngredient('Milch', 'vegetarisch')).toBe(false);
    expect(hasAnimalIngredient('Milch', 'vegan')).toBe(true);
    expect(hasAnimalIngredient('Honig', 'vegan')).toBe(true);
  });

  it('pflanzliche Zutaten sind nie tierisch', () => {
    for (const n of ['Tofu natur', 'Sojagranulat', 'Haferdrink', 'Räuchertofu (Fisch-Alternative)', 'Kokosmilch']) {
      expect(hasAnimalIngredient(n, 'vegan'), n).toBe(false);
    }
  });
});

describe('adaptRecipeSteps', () => {
  it('übernimmt neue Schritte (≥3), lässt Zutaten unverändert', async () => {
    const llm = new MockLlmClient(defaultMockResponder);
    const out = await adaptRecipeSteps(baseRecipe, 'vegan', llm);
    expect(out.ingredients).toEqual(baseRecipe.ingredients);
    expect(out.steps.length).toBeGreaterThanOrEqual(3);
    expect(out.title).toBe(baseRecipe.title);
  });

  it('bei unbrauchbarer LLM-Ausgabe -> Eingabe unverändert (deterministische Schritte bleiben)', async () => {
    const llm = new MockLlmClient(() => ({ totaler: 'müll' }));
    const out = await adaptRecipeSteps(baseRecipe, 'vegan', llm);
    expect(out).toEqual(baseRecipe);
  });
});
