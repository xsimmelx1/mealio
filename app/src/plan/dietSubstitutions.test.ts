import { describe, expect, it } from 'vitest';
import type { Ingredient, Recipe } from '../domain/schema';
import { adaptRecipeToDiet, findAnimalIngredients } from './dietSubstitutions';

function recipe(ingredients: Ingredient[], steps: string[] = ['Schritt eins.', 'Schritt zwei.', 'Schritt drei.']): Recipe {
  return {
    id: 'r1',
    title: 'Testgericht',
    mealStyles: [],
    mealTypes: ['abendessen'],
    dietTags: ['omnivor'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 20,
    baseServings: 2,
    ingredients,
    steps,
    nutritionPerServing: null,
    estimatedCostPerServing: null,
    source: 'seed',
    isFavorite: false,
    createdAt: 0,
  };
}
const ing = (name: string, amount: number, unit: Ingredient['unit'], aisle: Ingredient['aisle']): Ingredient => ({
  name,
  amount,
  unit,
  aisle,
});

describe('adaptRecipeToDiet', () => {
  it('Hackfleisch -> Sojagranulat mit Rehydrations-Ratio 0.4', () => {
    const { recipe: r, substitutions } = adaptRecipeToDiet(
      recipe([ing('Hackfleisch gemischt', 500, 'g', 'fleisch-fisch')]),
      'vegan',
    );
    expect(r.ingredients[0].name).toBe('Sojagranulat');
    expect(r.ingredients[0].productMatchId).toBe('sojagranulat');
    expect(r.ingredients[0].amount).toBeCloseTo(200);
    expect(substitutions).toEqual([{ from: 'Hackfleisch gemischt', to: 'Sojagranulat' }]);
  });

  it('Milch -> Haferdrink (ml bleibt)', () => {
    const { recipe: r } = adaptRecipeToDiet(recipe([ing('Milch', 250, 'ml', 'kühlregal')]), 'vegan');
    expect(r.ingredients[0].name).toBe('Haferdrink');
    expect(r.ingredients[0].productMatchId).toBe('haferdrink');
    expect(r.ingredients[0].amount).toBe(250);
  });

  it('vegan ersetzt Milch/Butter/Käse/Ei/Honig; Schritte werden angepasst', () => {
    const { recipe: r, unresolved } = adaptRecipeToDiet(
      recipe(
        [
          ing('Butter', 50, 'g', 'kühlregal'),
          ing('Gouda gerieben', 100, 'g', 'kühlregal'),
          ing('Eier', 2, 'stück', 'kühlregal'),
          ing('Honig', 20, 'g', 'trockenwaren'),
        ],
        ['Butter schmelzen, dann Eier verquirlen.'],
      ),
      'vegan',
    );
    const keys = r.ingredients.map((i) => i.productMatchId);
    expect(keys).toEqual(['vegane-butter', 'veganer-kaese', 'ei-ersatz', 'ahornsirup']);
    expect(r.dietTags).toContain('vegan');
    expect(r.dietTags).toContain('vegetarisch');
    expect(r.dietTags).not.toContain('omnivor');
    expect(unresolved).toHaveLength(0);
    expect(r.steps[0]).toContain('Vegane Butter');
    expect(r.steps[0]).toContain('Ei-Ersatz');
  });

  it('vegetarisch ersetzt nur Fleisch/Fisch, behält Milchprodukte', () => {
    const { recipe: r } = adaptRecipeToDiet(
      recipe([ing('Hähnchenbrustfilet', 300, 'g', 'fleisch-fisch'), ing('Gouda gerieben', 100, 'g', 'kühlregal')]),
      'vegetarisch',
    );
    expect(r.ingredients[0].productMatchId).toBe('tofu');
    expect(r.ingredients[1].name).toBe('Gouda gerieben'); // Milchprodukt bleibt
    expect(r.dietTags).toContain('vegetarisch');
  });

  it('bereits pflanzliche Zutaten bleiben unangetastet (kokosmilch, sojasauce)', () => {
    const { recipe: r, substitutions } = adaptRecipeToDiet(
      recipe([ing('Kokosmilch', 400, 'ml', 'konserven'), ing('Sojasauce', 20, 'ml', 'gewürze')]),
      'vegan',
    );
    expect(substitutions).toHaveLength(0);
    expect(r.ingredients.map((i) => i.name)).toEqual(['Kokosmilch', 'Sojasauce']);
  });

  it('Erdnussbutter wird NICHT als Butter ersetzt', () => {
    const { substitutions } = adaptRecipeToDiet(recipe([ing('Erdnussbutter', 30, 'g', 'trockenwaren')]), 'vegan');
    expect(substitutions).toHaveLength(0);
  });

  it('Fisch -> Tofu, gemeldet als konform', () => {
    const { recipe: r } = adaptRecipeToDiet(recipe([ing('Lachsfilet', 200, 'g', 'fleisch-fisch')]), 'vegetarisch');
    expect(r.ingredients[0].productMatchId).toBe('tofu');
    expect(findAnimalIngredients(r, 'vegetarisch')).toHaveLength(0);
  });
});
