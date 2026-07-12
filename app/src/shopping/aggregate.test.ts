import { describe, expect, it } from 'vitest';
import type { MealPlan, Recipe, SeedPrice } from '../domain/schema';
import { PriceEngine } from '../pricing/priceEngine';
import { aggregateShoppingItems } from './aggregate';

const seed: SeedPrice[] = [
  {
    productKey: 'haehnchenbrust',
    label: 'Hähnchenbrust',
    storeId: 'aldi',
    storeType: 'discounter',
    aisle: 'fleisch-fisch',
    packageSize: 500,
    packageUnit: 'g',
    pricePerPackage: 4.0,
  },
  {
    productKey: 'reis',
    label: 'Reis',
    storeId: 'aldi',
    storeType: 'discounter',
    aisle: 'trockenwaren',
    packageSize: 1000,
    packageUnit: 'g',
    pricePerPackage: 2.0,
  },
];

function recipe(id: string, ingredients: Recipe['ingredients']): Recipe {
  return {
    id,
    title: id,
    mealStyles: [],
    dietTags: ['omnivor'],
    requiredAppliances: ['herd'],
    prepMinutes: 5,
    cookMinutes: 10,
    baseServings: 2,
    ingredients,
    steps: ['a', 'b', 'c'],
    nutritionPerServing: null,
    estimatedCostPerServing: null,
    source: 'seed',
    isFavorite: false,
    createdAt: 0,
  };
}

const catalog: Recipe[] = [
  recipe('A', [
    { name: 'Hähnchenbrust', amount: 300, unit: 'g', aisle: 'fleisch-fisch' },
    { name: 'Reis', amount: 150, unit: 'g', aisle: 'trockenwaren' },
  ]),
  recipe('B', [
    { name: 'Hähnchenbrust', amount: 200, unit: 'g', aisle: 'fleisch-fisch' },
    { name: 'Salz', amount: 1, unit: 'prise', aisle: 'gewürze' },
  ]),
];

const plan: MealPlan = {
  id: 'plan-x',
  weekStartDate: '2026-07-06',
  entries: [
    { dayOfWeek: 0, recipeId: 'A' },
    { dayOfWeek: 1, recipeId: 'B' },
  ],
};

describe('aggregateShoppingItems', () => {
  const engine = new PriceEngine(seed, []);
  const items = aggregateShoppingItems(plan, catalog, engine);

  it('summiert gleiche Zutaten über Tage (300g + 200g = 500g Hähnchen)', () => {
    const chicken = items.find((i) => i.productKey === 'haehnchenbrust');
    expect(chicken?.totalAmount).toBe(500);
    expect(chicken?.unit).toBe('g');
  });

  it('berechnet ganze Packungen (500g -> 1 Packung @4€)', () => {
    const chicken = items.find((i) => i.productKey === 'haehnchenbrust');
    expect(chicken?.estimatedPrice).toBeCloseTo(4.0);
    expect(chicken?.source).toBe('seed');
  });

  it('unmatchte Zutat -> Preis null (nicht 0)', () => {
    const salt = items.find((i) => i.name.toLowerCase().includes('salz'));
    expect(salt).toBeDefined();
    expect(salt?.estimatedPrice).toBeNull();
    expect(salt?.source).toBe('unknown');
  });

  it('ist nach Gang sortiert', () => {
    const aisles = items.map((i) => i.aisle);
    const sorted = [...aisles].sort((a, b) => a.localeCompare(b));
    expect(aisles).toEqual(sorted);
  });

  it('setzt priceDate für gematchte Positionen', () => {
    const rice = items.find((i) => i.productKey === 'reis');
    expect(rice?.priceDate).toBe('2026-07');
  });
});
