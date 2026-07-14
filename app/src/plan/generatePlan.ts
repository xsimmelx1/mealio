import { MEAL_TYPES, type MealType } from '../domain/enums';
import type { MealPlanEntry, Recipe, UserPreferences } from '../domain/schema';
import { eligibleForMeal, preferenceScore } from './filterRecipes';

export const DAYS_PER_WEEK = 7;

/** Deterministischer PRNG (mulberry32) für reproduzierbare Pläne/Shuffles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates-Shuffle (non-mutating). */
export function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Ordnet Rezepte nach Präferenz-Score (desc), innerhalb gleicher Scores seeded-zufällig.
 * Optionaler `scoreBoost` addiert einen weiteren Term (z. B. Spar-Modus: günstiger + Angebote).
 */
export function rankRecipes(
  recipes: Recipe[],
  prefs: UserPreferences,
  rand: () => number,
  scoreBoost?: (recipe: Recipe) => number,
): Recipe[] {
  const shuffled = seededShuffle(recipes, rand);
  return shuffled
    .map((r) => ({ r, score: preferenceScore(r, prefs) + (scoreBoost ? scoreBoost(r) : 0) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Sortiert Mahlzeiten in kanonische Reihenfolge (Frühstück → Mittag → Abend). */
function orderedMealTypes(mealTypes: MealType[]): MealType[] {
  return MEAL_TYPES.filter((m) => mealTypes.includes(m));
}

/**
 * Baut die Plan-Slots aus den Prefs: für jeden gewählten Wochentag × jede gewählte
 * Mahlzeit ein Slot (kanonisch sortiert: Tag aufsteigend, dann Mahlzeit).
 */
export function buildSlots(prefs: UserPreferences): { dayOfWeek: number; mealType: MealType }[] {
  const days = [...prefs.planDays].sort((a, b) => a - b);
  const meals = orderedMealTypes(prefs.mealTypes);
  const slots: { dayOfWeek: number; mealType: MealType }[] = [];
  for (const day of days) for (const mt of meals) slots.push({ dayOfWeek: day, mealType: mt });
  return slots;
}

/**
 * Erzeugt Plan-Einträge für alle Slots. Pro Mahlzeit werden Duplikate vermieden,
 * solange genug passende Rezepte existieren; sonst wird wiederholt. Slots ohne
 * passendes Rezept erhalten recipeId=null. Rein & deterministisch bei gegebenem seed.
 */
export function pickPlan(
  recipes: Recipe[],
  prefs: UserPreferences,
  seed: number,
  scoreBoost?: (recipe: Recipe) => number,
): MealPlanEntry[] {
  const rand = mulberry32(seed);
  const slots = buildSlots(prefs);

  // Pro Mahlzeit einmal ranken (deterministisch über den geteilten rand).
  const rankedByMeal = new Map<MealType, Recipe[]>();
  for (const mt of orderedMealTypes(prefs.mealTypes)) {
    rankedByMeal.set(mt, rankRecipes(eligibleForMeal(recipes, prefs, mt), prefs, rand, scoreBoost));
  }

  // GLOBALE Dedup: kein Rezept wiederholt sich irgendwo im Plan, solange der Pool reicht
  // (verhindert z. B. dasselbe Gericht bei Frühstück UND Mittag). Erst wenn eine Mahlzeit
  // zu wenige verschiedene Rezepte hat, wird innerhalb dieser Mahlzeit wiederholt.
  const used = new Set<string>();
  return slots.map((slot) => {
    const ranked = rankedByMeal.get(slot.mealType) ?? [];
    // Bevorzugt ein global noch nicht verwendetes Rezept; sonst (Pool erschöpft) das
    // best-gerankte, auch wenn es sich wiederholt.
    const pick = ranked.find((r) => !used.has(r.id)) ?? ranked[0] ?? null;
    if (pick) used.add(pick.id);
    return { dayOfWeek: slot.dayOfWeek, mealType: slot.mealType, recipeId: pick ? pick.id : null };
  });
}

/**
 * Wählt für einen einzelnen Slot (Tag × Mahlzeit) ein neues Rezept, möglichst
 * verschieden vom aktuellen und von anderen Slots derselben Mahlzeit.
 * Gibt null zurück, wenn kein passendes Rezept existiert.
 */
export function pickReplacementSlot(
  recipes: Recipe[],
  prefs: UserPreferences,
  entries: MealPlanEntry[],
  dayOfWeek: number,
  mealType: MealType,
  seed: number,
): string | null {
  const rand = mulberry32(seed);
  const ranked = rankRecipes(eligibleForMeal(recipes, prefs, mealType), prefs, rand);
  if (ranked.length === 0) return null;

  const usedElsewhere = new Set(
    entries
      .filter((e) => e.mealType === mealType && e.dayOfWeek !== dayOfWeek && e.recipeId)
      .map((e) => e.recipeId as string),
  );
  const current = entries.find((e) => e.dayOfWeek === dayOfWeek && e.mealType === mealType)?.recipeId;

  const fresh = ranked.find((r) => !usedElsewhere.has(r.id) && r.id !== current);
  if (fresh) return fresh.id;
  const notCurrent = ranked.find((r) => r.id !== current);
  return (notCurrent ?? ranked[0]).id;
}

/**
 * Wählt für einen Slot das GÜNSTIGSTE zulässige Rezept (Kosten via costOf aufsteigend),
 * verschieden vom aktuellen und von anderen Slots derselben Mahlzeit. Null, wenn keins passt.
 */
export function pickCheapestReplacement(
  recipes: Recipe[],
  prefs: UserPreferences,
  entries: MealPlanEntry[],
  dayOfWeek: number,
  mealType: MealType,
  costOf: (recipe: Recipe) => number,
): string | null {
  const pool = eligibleForMeal(recipes, prefs, mealType);
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => costOf(a) - costOf(b));

  const usedElsewhere = new Set(
    entries
      .filter((e) => e.mealType === mealType && e.dayOfWeek !== dayOfWeek && e.recipeId)
      .map((e) => e.recipeId as string),
  );
  const current = entries.find((e) => e.dayOfWeek === dayOfWeek && e.mealType === mealType)?.recipeId;

  const fresh = sorted.find((r) => !usedElsewhere.has(r.id) && r.id !== current);
  if (fresh) return fresh.id;
  const notCurrent = sorted.find((r) => r.id !== current);
  return (notCurrent ?? sorted[0]).id;
}
