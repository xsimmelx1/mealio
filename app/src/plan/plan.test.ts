import { describe, expect, it } from 'vitest';
import { UserPreferencesSchema, type Recipe, type UserPreferences } from '../domain/schema';
import { isEligible, matchesMealType, preferenceScore, whySuitable } from './filterRecipes';
import { buildSlots, pickPlan, pickReplacementSlot } from './generatePlan';

function recipe(partial: Partial<Recipe> & { id: string }): Recipe {
  return {
    title: partial.id,
    mealStyles: [],
    mealTypes: ['mittagessen', 'abendessen'],
    dietTags: ['omnivor'],
    requiredAppliances: ['herd'],
    prepMinutes: 5,
    cookMinutes: 10,
    baseServings: 2,
    ingredients: [{ name: 'Zutat', amount: 100, unit: 'g', aisle: 'sonstiges' }],
    steps: ['a', 'b', 'c'],
    nutritionPerServing: null,
    estimatedCostPerServing: null,
    source: 'seed',
    isFavorite: false,
    createdAt: 0,
    ...partial,
  };
}

const prefs = (patch: Partial<UserPreferences> = {}): UserPreferences =>
  UserPreferencesSchema.parse({ ...patch });

describe('isEligible', () => {
  it('vegan verlangt vegan-Tag', () => {
    expect(isEligible(recipe({ id: 'v', dietTags: ['vegan'] }), prefs({ diet: 'vegan' }))).toBe(true);
    expect(isEligible(recipe({ id: 'o', dietTags: ['omnivor'] }), prefs({ diet: 'vegan' }))).toBe(false);
  });
  it('Gluten-Allergie verlangt glutenfrei-Tag', () => {
    expect(
      isEligible(recipe({ id: 'g', dietTags: ['omnivor', 'glutenfrei'] }), prefs({ allergies: ['gluten'] })),
    ).toBe(true);
    expect(isEligible(recipe({ id: 'n', dietTags: ['omnivor'] }), prefs({ allergies: ['gluten'] }))).toBe(false);
  });
  it('ungeliebte Zutat schließt aus', () => {
    const r = recipe({
      id: 'r',
      ingredients: [{ name: 'Koriander frisch', amount: 10, unit: 'g', aisle: 'obst-gemüse' }],
    });
    expect(isEligible(r, prefs({ avoidedIngredients: ['koriander'] }))).toBe(false);
  });
  it('negiert Geräte: ausgeschlossenes Gerät -> Rezept entfällt; leere Liste = keine Einschränkung', () => {
    const oven = recipe({ id: 'ov', requiredAppliances: ['backofen'] });
    expect(isEligible(oven, prefs({ excludedAppliances: ['backofen'] }))).toBe(false);
    expect(isEligible(oven, prefs({ excludedAppliances: ['mixer'] }))).toBe(true);
    expect(isEligible(oven, prefs({ excludedAppliances: [] }))).toBe(true);
  });
});

describe('matchesMealType', () => {
  it('leeres mealTypes gilt als Mittag/Abend, nie Frühstück', () => {
    const r = recipe({ id: 'r', mealTypes: [] });
    expect(matchesMealType(r, 'abendessen')).toBe(true);
    expect(matchesMealType(r, 'mittagessen')).toBe(true);
    expect(matchesMealType(r, 'fruehstueck')).toBe(false);
  });
  it('respektiert explizite Tags', () => {
    const b = recipe({ id: 'b', mealTypes: ['fruehstueck'] });
    expect(matchesMealType(b, 'fruehstueck')).toBe(true);
    expect(matchesMealType(b, 'abendessen')).toBe(false);
  });
});

describe('preferenceScore', () => {
  it('Favoriten und bevorzugte Styles erhöhen den Score', () => {
    const r = recipe({ id: 'r', isFavorite: true, mealStyles: ['schnell', 'budget'] });
    expect(preferenceScore(r, prefs({ preferredStyles: ['schnell'] }))).toBe(4);
  });
});

describe('whySuitable', () => {
  it('nennt erfüllte Präferenzen', () => {
    const r = recipe({ id: 'r', mealStyles: ['schnell'], prepMinutes: 5, cookMinutes: 10 });
    const reasons = whySuitable(r, prefs({ preferredStyles: ['schnell'] }));
    expect(reasons).toContain('Schnell');
    expect(reasons).toContain('schnell gemacht');
  });
});

describe('buildSlots', () => {
  it('erzeugt Tag × Mahlzeit, kanonisch sortiert', () => {
    const slots = buildSlots(prefs({ planDays: [2, 0], mealTypes: ['abendessen', 'fruehstueck'] }));
    expect(slots).toHaveLength(4);
    // Tag 0 zuerst, Frühstück vor Abendessen
    expect(slots[0]).toEqual({ dayOfWeek: 0, mealType: 'fruehstueck' });
    expect(slots[1]).toEqual({ dayOfWeek: 0, mealType: 'abendessen' });
    expect(slots[2]).toEqual({ dayOfWeek: 2, mealType: 'fruehstueck' });
  });
});

describe('pickPlan', () => {
  const dinnerPool = Array.from({ length: 10 }, (_, i) => recipe({ id: `d${i}` }));

  it('füllt alle Slots (planDays × mealTypes), deterministisch', () => {
    const p = prefs({ planDays: [0, 1, 2], mealTypes: ['abendessen'] });
    const a = pickPlan(dinnerPool, p, 42);
    const b = pickPlan(dinnerPool, p, 42);
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
    expect(a.every((e) => e.mealType === 'abendessen' && e.recipeId)).toBe(true);
    // keine Duplikate innerhalb der Mahlzeit
    expect(new Set(a.map((e) => e.recipeId)).size).toBe(3);
  });

  it('trennt Mahlzeiten: Frühstück nur aus Frühstücks-Rezepten', () => {
    const pool = [
      ...dinnerPool,
      recipe({ id: 'b1', mealTypes: ['fruehstueck'], title: 'Porridge' }),
      recipe({ id: 'b2', mealTypes: ['fruehstueck'], title: 'Pancakes' }),
    ];
    const p = prefs({ planDays: [0], mealTypes: ['fruehstueck', 'abendessen'] });
    const plan = pickPlan(pool, p, 7);
    const bf = plan.find((e) => e.mealType === 'fruehstueck');
    const din = plan.find((e) => e.mealType === 'abendessen');
    expect(['b1', 'b2']).toContain(bf?.recipeId);
    expect(din?.recipeId?.startsWith('d')).toBe(true);
  });

  it('dedupliziert global: ein Rezept erscheint nicht bei Frühstück UND Abendessen', () => {
    const pool = [
      recipe({ id: 'multi', mealTypes: ['fruehstueck', 'abendessen'] }),
      recipe({ id: 'b1', mealTypes: ['fruehstueck'] }),
      recipe({ id: 'd1', mealTypes: ['abendessen'] }),
    ];
    const p = prefs({ planDays: [0], mealTypes: ['fruehstueck', 'abendessen'] });
    const plan = pickPlan(pool, p, 11);
    const ids = plan.map((e) => e.recipeId);
    expect(new Set(ids).size).toBe(2); // zwei verschiedene Rezepte, kein Duplikat
  });

  it('kein passendes Rezept für eine Mahlzeit -> Slot recipeId null (nicht geraten)', () => {
    // Pool hat keine Frühstücks-Rezepte
    const p = prefs({ planDays: [0, 1], mealTypes: ['fruehstueck'] });
    const plan = pickPlan(dinnerPool, p, 3);
    expect(plan).toHaveLength(2);
    expect(plan.every((e) => e.recipeId === null)).toBe(true);
  });
});

describe('pickReplacementSlot', () => {
  const pool = Array.from({ length: 8 }, (_, i) => recipe({ id: `d${i}` }));

  it('ersetzt einen Slot durch ein anderes, nicht anderswo genutztes Rezept', () => {
    const p = prefs({ planDays: [0, 1, 2], mealTypes: ['abendessen'] });
    const plan = pickPlan(pool, p, 5);
    const repl = pickReplacementSlot(pool, p, plan, 1, 'abendessen', 123);
    const current = plan.find((e) => e.dayOfWeek === 1)?.recipeId;
    const others = plan.filter((e) => e.dayOfWeek !== 1).map((e) => e.recipeId);
    expect(repl).not.toBeNull();
    expect(repl).not.toBe(current);
    expect(others).not.toContain(repl);
  });

  it('kein passendes Rezept -> null', () => {
    expect(pickReplacementSlot([], prefs(), [], 0, 'abendessen', 1)).toBeNull();
  });
});
