import type { UserPreferences } from '../domain/schema';

/** Grobe Kosten pro Portion für den Budget-Vorschlag (Schätzwert). */
export const PER_SERVING_EUR = 2.5;

/** Anzahl geplanter Mahlzeiten pro Woche (Tage × Mahlzeiten). */
export function slotsPerWeek(prefs: Pick<UserPreferences, 'planDays' | 'mealTypes'>): number {
  return prefs.planDays.length * prefs.mealTypes.length;
}

/**
 * Realistischer Budget-Vorschlag: Personen × geplante Mahlzeiten × Richtwert pro Portion,
 * auf 5 € gerundet. Mindestens 10 €.
 */
export function suggestedBudget(
  prefs: Pick<UserPreferences, 'numberOfPeople' | 'planDays' | 'mealTypes'>,
): number {
  const raw = prefs.numberOfPeople * slotsPerWeek(prefs) * PER_SERVING_EUR;
  return Math.max(10, Math.round(raw / 5) * 5);
}

/** Ist das gesetzte Budget deutlich zu knapp (< 60 % des Vorschlags)? */
export function isBudgetTight(
  prefs: Pick<UserPreferences, 'budget' | 'numberOfPeople' | 'planDays' | 'mealTypes'>,
): boolean {
  return prefs.budget > 0 && prefs.budget < suggestedBudget(prefs) * 0.6;
}
