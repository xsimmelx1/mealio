import type { Recipe, UserPreferences } from '../domain/schema';
import { eligibleRecipes, preferenceScore } from './filterRecipes';

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
 * Ordnet zulässige Rezepte nach Präferenz-Score (desc), innerhalb gleicher Scores
 * seeded-zufällig. So kommen Favoriten/bevorzugte Styles zuerst, mit Varianz.
 */
export function rankRecipes(
  recipes: Recipe[],
  prefs: UserPreferences,
  rand: () => number,
): Recipe[] {
  const shuffled = seededShuffle(recipes, rand);
  return shuffled
    .map((r) => ({ r, score: preferenceScore(r, prefs) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/**
 * Erzeugt 7 Tages-Rezept-IDs (ohne Duplikate, solange genug Rezepte da sind).
 * Reicht der Pool nicht für 7 verschiedene, werden Rezepte wiederholt (in Reihenfolge).
 * Rein & deterministisch bei gegebenem seed.
 */
export function pickWeek(recipes: Recipe[], prefs: UserPreferences, seed: number): string[] {
  const rand = mulberry32(seed);
  const pool = eligibleRecipes(recipes, prefs);
  if (pool.length === 0) return [];

  const ranked = rankRecipes(pool, prefs, rand);
  const ids: string[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    ids.push(ranked[day % ranked.length].id);
  }
  return ids;
}

/**
 * Wählt für einen einzelnen Tag ein neues Rezept, das möglichst nicht bereits
 * in der Woche vorkommt (Duplikate-Vermeidung). Gibt null zurück, wenn kein
 * zulässiges Rezept existiert.
 */
export function pickReplacement(
  recipes: Recipe[],
  prefs: UserPreferences,
  currentWeekIds: string[],
  dayIndex: number,
  seed: number,
): string | null {
  const rand = mulberry32(seed);
  const pool = eligibleRecipes(recipes, prefs);
  if (pool.length === 0) return null;

  const ranked = rankRecipes(pool, prefs, rand);
  const usedElsewhere = new Set(currentWeekIds.filter((_, i) => i !== dayIndex));
  const current = currentWeekIds[dayIndex];

  // Bevorzugt: nicht anderswo verwendet UND nicht das aktuelle.
  const fresh = ranked.find((r) => !usedElsewhere.has(r.id) && r.id !== current);
  if (fresh) return fresh.id;
  // Sonst: irgendeins, das nicht das aktuelle ist.
  const notCurrent = ranked.find((r) => r.id !== current);
  return (notCurrent ?? ranked[0]).id;
}
