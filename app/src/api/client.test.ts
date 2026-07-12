import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePlan } from './client';
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
