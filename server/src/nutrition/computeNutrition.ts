/**
 * Kern-Berechnung für /nutrition.
 *
 * Strategie:
 *   1. Lokaler Seed zuerst (offline, deterministisch, primär).
 *   2. Nur wenn kein Seed-Treffer UND online aktiviert -> Online-Provider
 *      (USDA, dann OFF) hinter TTL-Cache; Fehler werden still geschluckt.
 *   3. Menge -> Gramm normalisieren, Makros aus per-100g akkumulieren.
 *
 * Vertrag: perServing = Summe der Makros aller gematchten Zutaten / servings.
 * Nur wenn KEINE Zutat gematcht wurde -> perServing = null (nie 0 behaupten).
 * Zahlen auf 1 Nachkommastelle gerundet.
 */

import type { CacheStore } from '../cache/ttlCache.js';
import type { NutritionUnit } from '../schemas/index.js';
import { logger } from '../lib/logger.js';
import { matchSeedEntry, toGrams, macrosForGrams, normalizeName } from './matchNutrition.js';
import type { Per100g } from './nutritionSeed.js';
import type { NutritionProvider } from './providers/types.js';

export interface NutritionIngredientInput {
  name: string;
  amount: number;
  unit: NutritionUnit;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionResult {
  perServing: Macros | null;
  matchedCount: number;
  unmatchedCount: number;
  unknownIngredients: string[];
}

export interface ComputeOptions {
  servings?: number;
  /** Online nur versuchen, wenn true (Feature-Flag NUTRITION_ONLINE=1). */
  online?: boolean;
  /** Online-Provider in Prioritätsreihenfolge (z. B. [USDA, OFF]). */
  providers?: readonly NutritionProvider[];
  /**
   * Cache für Online-Lookups. undefined = Miss, null = bekannt-negativ
   * (verhindert wiederholte Abfragen für unbekannte Namen).
   */
  cache?: CacheStore<Per100g | null>;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fragt Online-Provider der Reihe nach ab (mit Cache). Fehler still schlucken.
 * Gibt per-100g oder null zurück.
 */
async function lookupOnline(
  name: string,
  providers: readonly NutritionProvider[],
  cache?: CacheStore<Per100g | null>,
): Promise<Per100g | null> {
  const cacheKey = `off-usda:${normalizeName(name)}`;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached; // Treffer ODER bekannt-negativ
  }

  for (const provider of providers) {
    try {
      const result = await provider.lookup(name);
      if (result) {
        cache?.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      // Netz-/Parsefehler NIE den App-Flow blockieren lassen.
      logger.warn('nutrition: Online-Provider fehlgeschlagen', {
        provider: provider.name,
        name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Nichts gefunden -> negativ cachen.
  cache?.set(cacheKey, null);
  return null;
}

/**
 * Berechnet die Nährwerte pro Portion gemäß Vertrag.
 * Seed ist synchron; Online-Zweig nur bei options.online.
 */
export async function computeNutrition(
  ingredients: readonly NutritionIngredientInput[],
  options: ComputeOptions = {},
): Promise<NutritionResult> {
  const servings = options.servings && options.servings >= 1 ? options.servings : 1;
  const providers = options.providers ?? [];

  const sum: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let matchedCount = 0;
  const unknownIngredients: string[] = [];

  for (const ing of ingredients) {
    const seed = matchSeedEntry(ing.name);

    let per100g: Per100g | null = seed;
    // Online kennt kein Stückgewicht -> nur der Seed liefert gramsPerPiece.
    const gramsPerPiece: number | undefined = seed?.gramsPerPiece;

    // Nur online versuchen, wenn Seed nichts lieferte und Flag gesetzt ist.
    if (!per100g && options.online && providers.length > 0) {
      per100g = await lookupOnline(ing.name, providers, options.cache);
    }

    if (!per100g) {
      unknownIngredients.push(ing.name);
      continue;
    }

    const grams = toGrams(ing.amount, ing.unit, gramsPerPiece);
    if (grams === null) {
      // z. B. "stück" ohne hinterlegtes Stückgewicht -> nicht umrechenbar.
      unknownIngredients.push(ing.name);
      continue;
    }

    const macros = macrosForGrams(per100g, grams);
    sum.kcal += macros.kcal;
    sum.protein += macros.protein;
    sum.carbs += macros.carbs;
    sum.fat += macros.fat;
    matchedCount += 1;
  }

  const unmatchedCount = unknownIngredients.length;

  if (matchedCount === 0) {
    return { perServing: null, matchedCount: 0, unmatchedCount, unknownIngredients };
  }

  return {
    perServing: {
      kcal: round1(sum.kcal / servings),
      protein: round1(sum.protein / servings),
      carbs: round1(sum.carbs / servings),
      fat: round1(sum.fat / servings),
    },
    matchedCount,
    unmatchedCount,
    unknownIngredients,
  };
}
