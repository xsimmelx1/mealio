import { describe, it, expect } from 'vitest';
import { generatePlanSchema, type GeneratePlanInput } from '../schemas/index.js';
import { checkRecipe, parsePlan, validatePlan } from './validateRecipe.js';
import { normalizeTitle } from './seedRecipes.js';
import type { LlmRecipe } from './recipeSchema.js';

function prefs(overrides: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return generatePlanSchema.parse({ numberOfPeople: 2, days: 3, ...overrides });
}

function recipe(overrides: Partial<LlmRecipe> = {}): LlmRecipe {
  return {
    title: 'Test-Rezept',
    mealStyles: ['schnell'],
    mealTypes: ['abendessen'],
    dietTags: ['vegetarisch'],
    requiredAppliances: ['herd'],
    prepMinutes: 10,
    cookMinutes: 15,
    baseServings: 2,
    ingredients: [{ name: 'Tomaten', amount: 100, unit: 'g', aisle: 'obst-gemüse' }],
    steps: ['Schritt eins.', 'Schritt zwei.', 'Schritt drei.'],
    nutritionPerServing: null,
    ...overrides,
  };
}

describe('parsePlan (Schema-Guardrail)', () => {
  it('verwirft nicht-schema-konforme Ausgabe', () => {
    expect(parsePlan({ irgendwas: true }).ok).toBe(false);
    expect(parsePlan('kein json objekt').ok).toBe(false);
    expect(parsePlan({ recipes: [{ title: 'X' }] }).ok).toBe(false); // Pflichtfelder fehlen
  });

  it('akzeptiert { recipes: [...] } und blankes Array', () => {
    const asObj = parsePlan({ recipes: [recipe()] });
    const asArr = parsePlan([recipe()]);
    expect(asObj.ok).toBe(true);
    expect(asArr.ok).toBe(true);
  });

  it('erzwingt nutritionPerServing=null, auch wenn das LLM Werte erfindet', () => {
    const res = parsePlan({
      recipes: [recipe({ nutritionPerServing: { kcal: 500 } as unknown as null })],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.recipes[0].nutritionPerServing).toBeNull();
  });

  it('erzwingt >=3 Schritte', () => {
    expect(parsePlan({ recipes: [recipe({ steps: ['nur', 'zwei'] })] }).ok).toBe(false);
  });
});

describe('checkRecipe (harte Checks)', () => {
  it('verwirft Allergen-Zutat (Keyword-Heuristik)', () => {
    const r = recipe({ ingredients: [{ name: 'Weizenmehl', amount: 100, unit: 'g', aisle: 'backwaren' }] });
    const res = checkRecipe(r, prefs({ allergies: ['gluten'] }));
    expect(res.ok).toBe(false);
  });

  it('akzeptiert gluten-Zutat, wenn dietTag glutenfrei gesetzt ist (Freibrief per dietTag)', () => {
    const r = recipe({
      dietTags: ['vegetarisch', 'glutenfrei'],
      ingredients: [{ name: 'Pasta', amount: 100, unit: 'g', aisle: 'trockenwaren' }],
    });
    const res = checkRecipe(r, prefs({ allergies: ['gluten'] }));
    expect(res.ok).toBe(true);
  });

  it('verwirft verbotene/zu vermeidende Zutat', () => {
    const res = checkRecipe(recipe(), prefs({ avoidedIngredients: ['tomaten'] }));
    expect(res.ok).toBe(false);
  });

  it('verwirft nicht verfügbares Gerät', () => {
    const r = recipe({ requiredAppliances: ['backofen'] });
    const res = checkRecipe(r, prefs({ appliances: ['herd'] }));
    expect(res.ok).toBe(false);
  });

  it('erlaubt Gerät, wenn keine Geräte-Präferenz gesetzt ist', () => {
    const r = recipe({ requiredAppliances: ['airfryer'] });
    expect(checkRecipe(r, prefs({ appliances: [] })).ok).toBe(true);
  });

  it('verwirft unrealistische Garzeit', () => {
    expect(checkRecipe(recipe({ cookMinutes: 999 }), prefs()).ok).toBe(false);
    expect(checkRecipe(recipe({ prepMinutes: 500 }), prefs()).ok).toBe(false);
  });

  it('verwirft unrealistische Menge/Einheit', () => {
    const r = recipe({ ingredients: [{ name: 'Salz', amount: 5000, unit: 'prise', aisle: 'gewürze' }] });
    expect(checkRecipe(r, prefs()).ok).toBe(false);
  });

  it('korrigiert baseServings auf numberOfPeople und skaliert Mengen', () => {
    const r = recipe({ baseServings: 1, ingredients: [{ name: 'Reis', amount: 80, unit: 'g', aisle: 'trockenwaren' }] });
    const res = checkRecipe(r, prefs({ numberOfPeople: 4 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipe.baseServings).toBe(4);
      expect(res.recipe.ingredients[0].amount).toBe(320);
    }
  });

  it('verwirft Rezept, dessen mealTypes nicht zur angefragten Mahlzeit passen', () => {
    const r = recipe({ mealTypes: ['fruehstueck'] });
    const res = checkRecipe(r, prefs({ mealTypes: ['abendessen'] }));
    expect(res.ok).toBe(false);
  });

  it('engt mealTypes auf die Schnittmenge mit den angefragten Typen ein', () => {
    const r = recipe({ mealTypes: ['mittagessen', 'abendessen'] });
    const res = checkRecipe(r, prefs({ mealTypes: ['abendessen'] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.recipe.mealTypes).toEqual(['abendessen']);
  });
});

describe('validatePlan (Plan-Ebene)', () => {
  it('meldet ok:false bei Schema-Bruch (Aufrufer entscheidet über Repair)', () => {
    expect(validatePlan({ nope: 1 }, prefs()).ok).toBe(false);
  });

  it('ersetzt ein verworfenes (allergenes) Rezept durch ein geprüftes Seed-Rezept', () => {
    const bad = recipe({
      title: 'Allergen-Bombe',
      ingredients: [{ name: 'Weizenmehl', amount: 100, unit: 'g', aisle: 'backwaren' }],
    });
    const res = validatePlan({ recipes: [bad] }, prefs({ allergies: ['gluten'], days: 3 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipes.length).toBe(3);
      // Das allergene Rezept darf NICHT enthalten sein.
      expect(res.recipes.some((r) => r.title === 'Allergen-Bombe')).toBe(false);
      // Kein geliefertes Rezept enthält Gluten-Keywords (Ersatz ist geprüft).
      for (const r of res.recipes) {
        expect(checkRecipe(r, prefs({ allergies: ['gluten'], days: 3 })).ok).toBe(true);
      }
    }
  });

  it('entfernt Titel-Duplikate im Plan', () => {
    const a = recipe({ title: 'Gleiches Gericht' });
    const b = recipe({ title: 'gleiches   gericht' }); // normalisiert identisch
    const res = validatePlan({ recipes: [a, b] }, prefs({ days: 5 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const keys = res.recipes.map((r) => normalizeTitle(r.title));
      expect(new Set(keys).size).toBe(keys.length); // alle eindeutig
      expect(res.recipes.length).toBe(5);
    }
  });

  it('liefert genau days Rezepte und alle baseServings==numberOfPeople', () => {
    const res = validatePlan({ recipes: [recipe()] }, prefs({ numberOfPeople: 3, days: 4 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipes.length).toBe(4);
      expect(res.recipes.every((r) => r.baseServings === 3)).toBe(true);
    }
  });

  it('liefert ~days Rezepte JE angefragter Mahlzeit, jeweils passend getaggt', () => {
    const res = validatePlan({ recipes: [recipe()] }, prefs({ days: 3, mealTypes: ['fruehstueck', 'abendessen'] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      // days=3 x 2 Mahlzeiten = 6 Rezepte insgesamt.
      expect(res.recipes.length).toBe(6);
      const fruehstueck = res.recipes.filter((r) => r.mealTypes.includes('fruehstueck'));
      const abendessen = res.recipes.filter((r) => r.mealTypes.includes('abendessen'));
      expect(fruehstueck.length).toBe(3);
      expect(abendessen.length).toBe(3);
      // Jedes Rezept trägt genau EINE der angefragten Mahlzeiten (nicht leer, ⊆).
      for (const r of res.recipes) {
        expect(r.mealTypes.length).toBeGreaterThanOrEqual(1);
        expect(r.mealTypes.every((m) => ['fruehstueck', 'abendessen'].includes(m))).toBe(true);
      }
    }
  });

  it('ordnet ein Frühstücks-LLM-Rezept korrekt der Frühstücks-Mahlzeit zu', () => {
    const b = recipe({
      title: 'Haferbrei mit Apfel',
      mealTypes: ['fruehstueck'],
      dietTags: ['vegetarisch'],
      ingredients: [{ name: 'Haferflocken', amount: 60, unit: 'g', aisle: 'trockenwaren' }],
    });
    const res = validatePlan({ recipes: [b] }, prefs({ days: 2, mealTypes: ['fruehstueck', 'abendessen'] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const match = res.recipes.find((r) => r.title === 'Haferbrei mit Apfel');
      expect(match?.mealTypes).toEqual(['fruehstueck']);
    }
  });
});
