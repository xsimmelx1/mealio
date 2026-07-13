import { describe, expect, it } from 'vitest';
import { UserPreferencesSchema } from '../domain/schema';
import { isBudgetTight, slotsPerWeek, suggestedBudget } from './budget';

const prefs = (patch = {}) => UserPreferencesSchema.parse({ ...patch });

describe('budget helpers', () => {
  it('slotsPerWeek = Tage × Mahlzeiten', () => {
    expect(slotsPerWeek(prefs({ planDays: [0, 1, 2], mealTypes: ['abendessen'] }))).toBe(3);
    expect(
      slotsPerWeek(prefs({ planDays: [0, 1], mealTypes: ['fruehstueck', 'abendessen'] })),
    ).toBe(4);
  });

  it('suggestedBudget = Personen × Slots × 2.5, auf 5 gerundet, min 10', () => {
    // 2 Personen × 7 Slots × 2.5 = 35
    expect(suggestedBudget(prefs({ numberOfPeople: 2 }))).toBe(35);
    // kleiner Plan -> Mindestbudget 10
    expect(suggestedBudget(prefs({ numberOfPeople: 1, planDays: [0], mealTypes: ['abendessen'] }))).toBe(10);
  });

  it('isBudgetTight: deutlich unter Vorschlag -> true', () => {
    expect(isBudgetTight(prefs({ numberOfPeople: 2, budget: 10 }))).toBe(true); // 10 < 35*0.6=21
    expect(isBudgetTight(prefs({ numberOfPeople: 2, budget: 30 }))).toBe(false);
    expect(isBudgetTight(prefs({ numberOfPeople: 2, budget: 0 }))).toBe(false); // 0 = kein Budget
  });
});
