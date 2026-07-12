import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

import { createTheMealDbProvider, type TheMealDbProvider, type RawMeal } from './providers/theMealDb.js';
import { parseAmount, parseMeasure, guessAisle } from './measures.js';
import {
  normalizeRecipe,
  structuralMap,
  categoryToMealTypes,
  categoryToDietTags,
} from './normalizeRecipe.js';
import { MockLlmClient } from '../llm/llmClient.js';
import { checkRecipe } from '../llm/validateRecipe.js';
import { createImportRecipesRouter } from '../routes/importRecipes.js';
import { errorHandler } from '../lib/errorHandler.js';
import type { GeneratePlanInput } from '../schemas/index.js';

const CHECK_PREFS: GeneratePlanInput = {
  numberOfPeople: 2,
  diet: 'omnivore',
  allergies: [],
  avoidedIngredients: [],
  appliances: [],
  preferredStyles: [],
  budget: undefined,
  days: 1,
  mealTypes: ['fruehstueck', 'mittagessen', 'abendessen'],
};

/** Baut eine kleine Express-App nur mit dem Import-Router (Provider injizierbar). */
function makeApp(llm: MockLlmClient, provider: TheMealDbProvider): Express {
  const app = express();
  app.use(express.json());
  app.use(createImportRecipesRouter(llm, { provider }));
  app.use(errorHandler);
  return app;
}

/** Ein realistisches deutsches Rezept, wie es Gemini liefern würde. */
function germanRecipe(title: string) {
  return {
    title,
    mealStyles: ['schnell'],
    mealTypes: ['fruehstueck'],
    dietTags: ['vegetarisch'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 15,
    baseServings: 2,
    ingredients: [
      { name: 'Mehl', amount: 200, unit: 'g', aisle: 'trockenwaren' },
      { name: 'Milch', amount: 240, unit: 'ml', aisle: 'kühlregal' },
      { name: 'Eier', amount: 2, unit: 'stück', aisle: 'kühlregal' },
    ],
    steps: ['Zutaten verrühren.', 'Teig in der Pfanne backen.', 'Warm servieren.'],
    nutritionPerServing: null,
  };
}

// --- TheMealDB-Adapter (fetch gemockt) --------------------------------------

describe('TheMealDB-Adapter (fetch gemockt)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lookupById sammelt Zutaten + Maße aus strIngredient/strMeasure ein', async () => {
    const meal: Record<string, unknown> = {
      idMeal: '52772',
      strMeal: 'Teriyaki Chicken Casserole',
      strCategory: 'Chicken',
      strArea: 'Japanese',
      strInstructions: 'Preheat oven. Cook rice. Mix sauce. Bake.',
      strIngredient1: 'soy sauce',
      strMeasure1: '3/4 cup',
      strIngredient2: 'chicken breast',
      strMeasure2: '2 lb',
      strIngredient3: 'olive oil',
      strMeasure3: '1 tbsp',
      // Rest wie bei der echten API mit "" aufgefüllt:
      strIngredient4: '',
      strMeasure4: ' ',
      strIngredient5: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ meals: [meal] }), { status: 200 })),
    );

    const provider = createTheMealDbProvider();
    const raw = await provider.lookupById('52772');
    expect(raw).not.toBeNull();
    expect(raw?.idMeal).toBe('52772');
    expect(raw?.title).toBe('Teriyaki Chicken Casserole');
    expect(raw?.category).toBe('Chicken');
    expect(raw?.ingredients).toEqual([
      { name: 'soy sauce', measure: '3/4 cup' },
      { name: 'chicken breast', measure: '2 lb' },
      { name: 'olive oil', measure: '1 tbsp' },
    ]);
  });

  it('HTTP 200 mit {"meals": null} -> null (nicht auf Status verlassen)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ meals: null }), { status: 200 })),
    );
    const provider = createTheMealDbProvider();
    expect(await provider.lookupById('does-not-exist')).toBeNull();
  });

  it('listByCategory liefert die idMeal-Liste', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ meals: [{ idMeal: '1' }, { idMeal: '2' }] }), {
            status: 200,
          }),
      ),
    );
    const provider = createTheMealDbProvider();
    expect(await provider.listByCategory('Breakfast')).toEqual(['1', '2']);
  });
});

// --- Maß-Parser -------------------------------------------------------------

describe('measures (Maß-Parser + Aisle)', () => {
  it('parst Ganzzahlen, Dezimal-, einfache/gemischte und Unicode-Brüche', () => {
    expect(parseAmount('2')).toBe(2);
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('½')).toBe(0.5);
    expect(parseAmount('')).toBeNull();
  });

  it('rechnet imperiale Maße in unsere Einheiten um', () => {
    expect(parseMeasure('1 cup')).toEqual({ amount: 240, unit: 'ml' });
    expect(parseMeasure('2 tbsp')).toEqual({ amount: 2, unit: 'tbsp' });
    expect(parseMeasure('1 tsp')).toEqual({ amount: 1, unit: 'tsp' });
    expect(parseMeasure('1 oz')).toEqual({ amount: 28, unit: 'g' });
    expect(parseMeasure('2 lb')).toEqual({ amount: 908, unit: 'g' });
    expect(parseMeasure('1 can')).toEqual({ amount: 400, unit: 'g' });
    expect(parseMeasure('2 cloves')).toEqual({ amount: 2, unit: 'stück' });
    expect(parseMeasure('1 pinch')).toEqual({ amount: 1, unit: 'prise' });
    expect(parseMeasure('200g')).toEqual({ amount: 200, unit: 'g' });
    // leer -> 1 stück
    expect(parseMeasure('')).toEqual({ amount: 1, unit: 'stück' });
  });

  it('guessAisle ordnet englische Zutaten plausibel zu', () => {
    expect(guessAisle('chicken breast')).toBe('fleisch-fisch');
    expect(guessAisle('milk')).toBe('kühlregal');
    expect(guessAisle('onion')).toBe('obst-gemüse');
    expect(guessAisle('rice')).toBe('trockenwaren');
    expect(guessAisle('wibblewobble')).toBe('sonstiges');
  });
});

// --- Kategorie-Mapping + strukturelles Mapping ------------------------------

describe('Kategorie-Mapping + structuralMap (ohne Gemini)', () => {
  const raw: RawMeal = {
    idMeal: '1',
    title: 'Pancakes',
    category: 'Breakfast',
    area: 'American',
    instructions: 'Mix flour and milk. Fry in a pan. Serve with syrup.',
    ingredients: [
      { name: 'flour', measure: '1 cup' },
      { name: 'milk', measure: '200 ml' },
    ],
  };

  it('categoryToMealTypes/DietTags', () => {
    expect(categoryToMealTypes('Breakfast')).toEqual(['fruehstueck']);
    expect(categoryToMealTypes('Beef')).toEqual(['mittagessen', 'abendessen']);
    expect(categoryToDietTags('Vegan')).toEqual(['vegan', 'vegetarisch']);
    expect(categoryToDietTags('Seafood')).toEqual(['pescetarisch']);
    expect(categoryToDietTags('Chicken')).toEqual(['omnivor']);
    expect(categoryToDietTags('Miscellaneous')).toEqual([]);
  });

  it('structuralMap erzeugt schema-konformes Rezept (>=3 Schritte, nutrition null)', () => {
    const mapped = structuralMap(raw);
    expect(mapped.title).toBe('Pancakes');
    expect(mapped.mealTypes).toEqual(['fruehstueck']);
    expect(mapped.baseServings).toBe(2);
    expect(mapped.steps.length).toBeGreaterThanOrEqual(3);
    expect(mapped.nutritionPerServing).toBeNull();
    // wird von den harten Checks akzeptiert
    const checked = checkRecipe(mapped, CHECK_PREFS);
    expect(checked.ok).toBe(true);
  });
});

// --- Normalisierung via (gemocktem) Gemini ----------------------------------

describe('normalizeRecipe (llmClient gemockt)', () => {
  const raw: RawMeal = {
    idMeal: '1',
    title: 'Pancakes',
    category: 'Breakfast',
    area: 'American',
    instructions: 'Mix. Fry. Serve.',
    ingredients: [{ name: 'flour', measure: '1 cup' }],
  };

  it('gemockter Gemini-Output -> validiertes deutsches Recipe (Schema, nutrition null)', async () => {
    const llm = new MockLlmClient(() => ({ recipes: [germanRecipe('Pfannkuchen')] }));
    const recipe = await normalizeRecipe(raw, llm);
    expect(recipe.title).toBe('Pfannkuchen');
    expect(recipe.nutritionPerServing).toBeNull();
    const checked = checkRecipe(recipe, CHECK_PREFS);
    expect(checked.ok).toBe(true);
  });

  it('nicht parsebarer Output (Mock/kein Key) -> strukturelles Mapping (kein Fehler)', async () => {
    const llm = new MockLlmClient(() => ({})); // Default-Mock ohne Rezepte
    const recipe = await normalizeRecipe(raw, llm);
    // fällt strukturell auf den (englischen) Originaltitel zurück
    expect(recipe.title).toBe('Pancakes');
    expect(recipe.nutritionPerServing).toBeNull();
  });

  it('LLM wirft -> Fehler propagiert (Pipeline überspringt)', async () => {
    const llm = new MockLlmClient(() => {
      throw new Error('Gemini 429');
    });
    await expect(normalizeRecipe(raw, llm)).rejects.toThrow('Gemini 429');
  });
});

// --- Pipeline / Route -------------------------------------------------------

describe('POST /import-recipes (Pipeline)', () => {
  const meals: RawMeal[] = [
    {
      idMeal: '101',
      title: 'Full English Breakfast',
      category: 'Breakfast',
      area: 'British',
      instructions: 'Fry eggs. Grill bacon. Serve hot.',
      ingredients: [{ name: 'eggs', measure: '2' }],
    },
    {
      idMeal: '102',
      title: 'Shakshuka',
      category: 'Breakfast',
      area: 'Egyptian',
      instructions: 'Cook sauce. Add eggs. Simmer.',
      ingredients: [{ name: 'tomato', measure: '1 can' }],
    },
  ];

  function fakeProvider(overrides: Partial<TheMealDbProvider> = {}): TheMealDbProvider {
    return {
      listByCategory: vi.fn(async () => meals.map((m) => m.idMeal)),
      lookupById: vi.fn(async (id: string) => meals.find((m) => m.idMeal === id) ?? null),
      random: vi.fn(async () => null),
      ...overrides,
    };
  }

  it('liefert Vertrags-Shape { source, attribution, recipes[] } mit sourceUrl', async () => {
    const llm = new MockLlmClient((args) => {
      // Titel aus dem User-Prompt herausfinden und deutsch zurückgeben
      const isShakshuka = args.prompt.includes('Shakshuka');
      return { recipes: [germanRecipe(isShakshuka ? 'Shakshuka' : 'Englisches Frühstück')] };
    });
    const app = makeApp(llm, fakeProvider());

    const res = await request(app).post('/import-recipes').send({ category: 'Breakfast', count: 2 });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('themealdb');
    expect(res.body.attribution).toMatch(/TheMealDB/);
    expect(res.body.recipes.length).toBe(2);

    const r = res.body.recipes[0];
    expect(typeof r.title).toBe('string');
    expect(Array.isArray(r.mealStyles)).toBe(true);
    expect(Array.isArray(r.mealTypes)).toBe(true);
    expect(r.mealTypes.length).toBeGreaterThanOrEqual(1);
    expect(r.baseServings).toBe(2);
    expect(r.steps.length).toBeGreaterThanOrEqual(3);
    expect(r.ingredients.every((i: { amount: number }) => i.amount > 0)).toBe(true);
    expect(r.nutritionPerServing).toBeNull();
    expect(r.sourceUrl).toMatch(/themealdb\.com\/meal\/10/);
    expect(r).not.toHaveProperty('id');
    expect(r).not.toHaveProperty('source');
    expect(r).not.toHaveProperty('createdAt');
  });

  it('ein Rezept scheitert (Gemini wirft) -> übersprungen, Rest kommt durch', async () => {
    const llm = new MockLlmClient((args) => {
      if (args.prompt.includes('Shakshuka')) throw new Error('Gemini 429 quota');
      return { recipes: [germanRecipe('Englisches Frühstück')] };
    });
    const app = makeApp(llm, fakeProvider());

    const res = await request(app).post('/import-recipes').send({ category: 'Breakfast', count: 2 });
    expect(res.status).toBe(200);
    expect(res.body.recipes.length).toBe(1);
    expect(res.body.recipes[0].title).toBe('Englisches Frühstück');
  });

  it('ungültiger Body (count=0) -> 400', async () => {
    const llm = new MockLlmClient(() => ({}));
    const app = makeApp(llm, fakeProvider());
    const res = await request(app).post('/import-recipes').send({ count: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('ungültiger Body (count > 10) -> 400', async () => {
    const llm = new MockLlmClient(() => ({}));
    const app = makeApp(llm, fakeProvider());
    const res = await request(app).post('/import-recipes').send({ count: 11 });
    expect(res.status).toBe(400);
  });

  it('Cache: zweiter Call gleiche category -> kein erneuter Provider-/LLM-Aufruf', async () => {
    const responder = vi.fn(() => ({ recipes: [germanRecipe('Frühstück')] }));
    const llm = new MockLlmClient(responder);
    const provider = fakeProvider();
    const app = makeApp(llm, provider);

    const first = await request(app).post('/import-recipes').send({ category: 'Breakfast', count: 2 });
    expect(first.status).toBe(200);
    const callsAfterFirst = (provider.listByCategory as ReturnType<typeof vi.fn>).mock.calls.length;
    const llmCallsAfterFirst = responder.mock.calls.length;

    const second = await request(app).post('/import-recipes').send({ category: 'Breakfast', count: 2 });
    expect(second.status).toBe(200);
    // Keine weiteren Provider-/LLM-Aufrufe: Ergebnis kam aus dem Cache.
    expect((provider.listByCategory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterFirst,
    );
    expect(responder.mock.calls.length).toBe(llmCallsAfterFirst);
    expect(second.body.recipes).toEqual(first.body.recipes);
  });
});
