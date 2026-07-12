import { describe, expect, it } from 'vitest';
import { UserPreferencesSchema, type Recipe, type UserPreferences } from '../domain/schema';
import { isEligible, preferenceScore, whySuitable } from './filterRecipes';
import { DAYS_PER_WEEK, pickReplacement, pickWeek } from './generatePlan';

function recipe(partial: Partial<Recipe> & { id: string }): Recipe {
  return {
    title: partial.id,
    mealStyles: [],
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
  it('Ernährungsform: vegan verlangt vegan-Tag', () => {
    const vegan = recipe({ id: 'v', dietTags: ['vegan', 'vegetarisch'] });
    const omni = recipe({ id: 'o', dietTags: ['omnivor'] });
    expect(isEligible(vegan, prefs({ diet: 'vegan' }))).toBe(true);
    expect(isEligible(omni, prefs({ diet: 'vegan' }))).toBe(false);
  });

  it('vegetarisch akzeptiert vegan-Rezepte', () => {
    const vegan = recipe({ id: 'v', dietTags: ['vegan'] });
    expect(isEligible(vegan, prefs({ diet: 'vegetarisch' }))).toBe(true);
  });

  it('Gluten-Allergie verlangt glutenfrei-Tag', () => {
    const gf = recipe({ id: 'gf', dietTags: ['omnivor', 'glutenfrei'] });
    const normal = recipe({ id: 'n', dietTags: ['omnivor'] });
    expect(isEligible(gf, prefs({ allergies: ['gluten'] }))).toBe(true);
    expect(isEligible(normal, prefs({ allergies: ['gluten'] }))).toBe(false);
  });

  it('Fisch-Allergie schließt Rezept mit Lachs aus (Keyword)', () => {
    const fish = recipe({
      id: 'f',
      ingredients: [{ name: 'Lachsfilet', amount: 200, unit: 'g', aisle: 'fleisch-fisch' }],
    });
    expect(isEligible(fish, prefs({ allergies: ['fisch'] }))).toBe(false);
  });

  it('ungeliebte Zutat schließt aus', () => {
    const r = recipe({
      id: 'r',
      ingredients: [{ name: 'Koriander frisch', amount: 10, unit: 'g', aisle: 'obst-gemüse' }],
    });
    expect(isEligible(r, prefs({ avoidedIngredients: ['koriander'] }))).toBe(false);
  });

  it('Geräte: leere Prefs-Liste = keine Einschränkung', () => {
    const oven = recipe({ id: 'ov', requiredAppliances: ['backofen'] });
    expect(isEligible(oven, prefs({ appliances: [] }))).toBe(true);
  });

  it('Geräte: benötigtes Gerät fehlt -> ausgeschlossen', () => {
    const oven = recipe({ id: 'ov', requiredAppliances: ['backofen'] });
    expect(isEligible(oven, prefs({ appliances: ['herd'] }))).toBe(false);
  });
});

describe('preferenceScore', () => {
  it('Favoriten und bevorzugte Styles erhöhen den Score', () => {
    const r = recipe({ id: 'r', isFavorite: true, mealStyles: ['schnell', 'budget'] });
    expect(preferenceScore(r, prefs({ preferredStyles: ['schnell'] }))).toBe(4); // 3 + 1
  });
});

describe('whySuitable', () => {
  it('nennt erfüllte Präferenzen (Style + schnell)', () => {
    const r = recipe({ id: 'r', mealStyles: ['schnell'], prepMinutes: 5, cookMinutes: 10 });
    const reasons = whySuitable(r, prefs({ diet: 'omnivor', preferredStyles: ['schnell'] }));
    expect(reasons).toContain('Schnell');
    expect(reasons).toContain('schnell gemacht');
  });

  it('nennt "ohne <Allergen>" für vermiedene Allergene', () => {
    const r = recipe({ id: 'r', dietTags: ['omnivor', 'glutenfrei'] });
    const reasons = whySuitable(r, prefs({ allergies: ['gluten'] }));
    expect(reasons.some((x) => x.includes('gluten'))).toBe(true);
  });
});

describe('pickWeek', () => {
  const pool = Array.from({ length: 10 }, (_, i) => recipe({ id: `r${i}` }));

  it('liefert 7 Einträge ohne Duplikate bei genügend Rezepten', () => {
    const ids = pickWeek(pool, prefs(), 42);
    expect(ids).toHaveLength(DAYS_PER_WEEK);
    expect(new Set(ids).size).toBe(DAYS_PER_WEEK);
  });

  it('ist deterministisch bei gleichem Seed', () => {
    expect(pickWeek(pool, prefs(), 42)).toEqual(pickWeek(pool, prefs(), 42));
  });

  it('unterschiedliche Seeds -> (meist) andere Auswahl', () => {
    const a = pickWeek(pool, prefs(), 1);
    const b = pickWeek(pool, prefs(), 999);
    expect(a).not.toEqual(b);
  });

  it('kleiner Pool -> 7 Einträge mit Wiederholung', () => {
    const small = [recipe({ id: 'x' }), recipe({ id: 'y' })];
    const ids = pickWeek(small, prefs(), 7);
    expect(ids).toHaveLength(DAYS_PER_WEEK);
  });

  it('leerer/kein passender Pool -> []', () => {
    expect(pickWeek([], prefs(), 7)).toEqual([]);
    const veganPool = [recipe({ id: 'o', dietTags: ['omnivor'] })];
    expect(pickWeek(veganPool, prefs({ diet: 'vegan' }), 7)).toEqual([]);
  });
});

describe('pickReplacement', () => {
  const pool = Array.from({ length: 10 }, (_, i) => recipe({ id: `r${i}` }));

  it('ersetzt Tag durch ein anderes, nicht anderswo genutztes Rezept', () => {
    const week = pickWeek(pool, prefs(), 5);
    const repl = pickReplacement(pool, prefs(), week, 2, 123);
    expect(repl).not.toBeNull();
    expect(repl).not.toBe(week[2]);
    expect(week.filter((_, i) => i !== 2)).not.toContain(repl);
  });

  it('kein passendes Rezept -> null', () => {
    expect(pickReplacement([], prefs(), [], 0, 1)).toBeNull();
  });
});
