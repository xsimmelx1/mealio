import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimatePrices, fetchNutrition, fetchPrices, generatePlan, importRecipes } from './client';
import { UserPreferencesSchema } from '../domain/schema';

const prefs = UserPreferencesSchema.parse({ numberOfPeople: 2 });

const validRecipe = {
  title: 'KI-Pfanne',
  mealStyles: ['schnell'],
  dietTags: ['omnivor'],
  requiredAppliances: ['herd'],
  prepMinutes: 5,
  cookMinutes: 10,
  baseServings: 2,
  ingredients: [{ name: 'Reis', amount: 150, unit: 'g', aisle: 'trockenwaren' }],
  steps: ['a', 'b', 'c'],
  nutritionPerServing: null,
};

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('apiClient.generatePlan', () => {
  it('parst gültige Rezepte und vergibt id/source/createdAt', async () => {
    mockFetchOnce({ source: 'llm', recipes: [validRecipe] });
    const res = await generatePlan(prefs, 7, 111);
    expect(res.recipes).toHaveLength(1);
    expect(res.recipes[0].source).toBe('llm');
    expect(res.recipes[0].id).toMatch(/^llm-/);
    expect(res.recipes[0].nutritionPerServing).toBeNull();
  });

  it('verwirft schema-ungültige Rezepte (nie ungeprüft übernehmen)', async () => {
    const broken = { ...validRecipe, steps: ['nur einer'] }; // <3 Schritte
    mockFetchOnce({ source: 'llm', recipes: [validRecipe, broken] });
    const res = await generatePlan(prefs, 7, 1);
    expect(res.recipes).toHaveLength(1);
  });

  it('wirft bei HTTP-Fehler', async () => {
    mockFetchOnce({}, false, 500);
    await expect(generatePlan(prefs)).rejects.toThrow();
  });
});

describe('apiClient.fetchNutrition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parst die Nährwert-Antwort gegen den Vertrag', async () => {
    mockFetchOnce({
      perServing: { kcal: 500, protein: 40, carbs: 30, fat: 15 },
      matchedCount: 2,
      unmatchedCount: 1,
      unknownIngredients: ['salz'],
    });
    const res = await fetchNutrition(
      [{ name: 'Reis', amount: 150, unit: 'g' }],
      2,
    );
    expect(res.perServing?.kcal).toBe(500);
    expect(res.unmatchedCount).toBe(1);
    expect(res.unknownIngredients).toContain('salz');
  });

  it('akzeptiert perServing null (unbekannt)', async () => {
    mockFetchOnce({ perServing: null, matchedCount: 0, unmatchedCount: 3, unknownIngredients: [] });
    const res = await fetchNutrition([{ name: 'X', amount: 1, unit: 'g' }], 1);
    expect(res.perServing).toBeNull();
  });
});

describe('apiClient.importRecipes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parst importierte Rezepte, vergibt themealdb-id/source, verwirft ungültige', async () => {
    const valid = {
      title: 'Apfel-Porridge',
      mealStyles: ['schnell'],
      mealTypes: ['fruehstueck'],
      dietTags: ['vegetarisch'],
      requiredAppliances: ['herd'],
      prepMinutes: 5,
      cookMinutes: 10,
      baseServings: 2,
      ingredients: [{ name: 'Haferflocken', amount: 80, unit: 'g', aisle: 'trockenwaren' }],
      steps: ['a', 'b', 'c'],
      nutritionPerServing: null,
      sourceUrl: 'https://www.themealdb.com/meal/52959',
    };
    const invalid = { ...valid, steps: ['nur einer'] };
    mockFetchOnce({ source: 'themealdb', attribution: 'TheMealDB', recipes: [valid, invalid] });
    const res = await importRecipes('Breakfast', 6, 42);
    expect(res.attribution).toBe('TheMealDB');
    expect(res.recipes).toHaveLength(1);
    expect(res.recipes[0].source).toBe('themealdb');
    expect(res.recipes[0].id).toContain('themealdb-52959');
  });
});

describe('apiClient.estimatePrices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parst KI-Preisschätzungen (source ai)', async () => {
    mockFetchOnce({
      items: [
        {
          key: 'safran',
          pricePerPackage: 3.5,
          packageSize: 2,
          packageUnit: 'g',
          currency: 'EUR',
          source: 'ai',
          updatedAt: null,
        },
      ],
    });
    const res = await estimatePrices([{ key: 'safran', name: 'Safran' }]);
    expect(res[0].source).toBe('ai');
    expect(res[0].pricePerPackage).toBe(3.5);
  });
});

describe('apiClient.fetchPrices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parst Online-Preise gegen den Vertrag', async () => {
    mockFetchOnce({
      items: [
        {
          key: 'safran',
          pricePerPackage: 3.5,
          packageSize: 2,
          packageUnit: 'g',
          currency: 'EUR',
          source: 'open-prices',
          updatedAt: '2026-07-01',
        },
      ],
    });
    const res = await fetchPrices([{ key: 'safran', query: 'Safran' }]);
    expect(res).toHaveLength(1);
    expect(res[0].source).toBe('open-prices');
    expect(res[0].pricePerPackage).toBe(3.5);
  });
});
