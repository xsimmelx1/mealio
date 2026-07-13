/**
 * POST /import-recipes — importiert Rezepte aus der freien DB TheMealDB und
 * normalisiert sie via Gemini ins Deutsche + in unser Rezeptschema.
 *
 * Ablauf:
 *  1) Kategorie -> idMeal-Liste (filter.php) + lookup.php; ODER N× random.php.
 *  2) Je Roh-Rezept: Gemini-Normalisierung (normalizeRecipe) -> Schema-Parse ->
 *     harte Checks (checkRecipe, permissive Prefs). Fehler PRO Rezept werden
 *     einzeln abgefangen (Gemini 429/Quota, Parse-Fehler) -> Rezept übersprungen,
 *     nie die ganze Anfrage.
 *  3) TTL-Cache je Kategorie gegen wiederholte Gemini-/TheMealDB-Last.
 *
 * Antwort-Vertrag (Frontend baut exakt dagegen):
 *   { source: "themealdb", attribution, recipes: Recipe[] }
 * Jedes Recipe hat EXAKT das /generate-plan-Feldformat + optional `sourceUrl`
 * (Link-Back auf das Originalrezept). nutritionPerServing ist immer null.
 *
 * Lizenz: TheMealDB (Test-Key 1) verlangt einen Link-Back -> `sourceUrl`. Es werden
 * KEINE Bilder importiert (nur Text/Struktur).
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { importRecipesSchema, type ImportRecipesInput } from '../schemas/index.js';
import type { GeneratePlanInput } from '../schemas/index.js';
import type { LlmClient } from '../llm/llmClient.js';
import type { LlmRecipe, Recipe } from '../llm/recipeSchema.js';
import { checkRecipe } from '../llm/validateRecipe.js';
import { TtlCache } from '../cache/ttlCache.js';
import { logger } from '../lib/logger.js';
import { normalizeRecipesBatch } from '../recipes/normalizeRecipe.js';
import {
  createTheMealDbProvider,
  mealSourceUrl,
  type RawMeal,
  type TheMealDbProvider,
} from '../recipes/providers/theMealDb.js';

/** Attribution laut Vertrag (auch in App-Impressum + README zu führen). */
export const THEMEALDB_ATTRIBUTION = 'Rezepte via TheMealDB (themealdb.com)';

/** Ein ausgeliefertes Rezept = /generate-plan-Format + optionaler Link-Back + Foto. */
export type ImportedRecipe = Recipe & { sourceUrl?: string; imageUrl?: string };

export interface ImportRecipesRouterOptions {
  /** TheMealDB-Adapter (Default: HTTP-Adapter; injizierbar für Tests). */
  provider?: TheMealDbProvider;
  /** Cache-TTL in ms (Default 6 h). */
  cacheTtlMs?: number;
}

/**
 * Permissive Prefs für die harten Checks: keine Diät-/Allergie-/Geräte-Restriktion,
 * alle Mahlzeiten erlaubt. baseServings wird dabei auf 2 korrigiert (Vertrag).
 */
const IMPORT_CHECK_PREFS: GeneratePlanInput = {
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

export function createImportRecipesRouter(
  llm: LlmClient,
  options: ImportRecipesRouterOptions = {},
): Router {
  const router = Router();
  const provider = options.provider ?? createTheMealDbProvider();
  // Fertige (validierte) Import-Ergebnisse je Cache-Key zwischenspeichern.
  const cache = new TtlCache<ImportedRecipe[]>(options.cacheTtlMs ?? 6 * 60 * 60 * 1000);

  /** Holt die Roh-Rezepte für eine Kategorie oder N× zufällig. */
  async function fetchRawMeals(category: string | undefined, count: number): Promise<RawMeal[]> {
    if (category) {
      const ids = await provider.listByCategory(category);
      const picked = ids.slice(0, count);
      const meals: RawMeal[] = [];
      for (const id of picked) {
        try {
          const meal = await provider.lookupById(id);
          if (meal) meals.push(meal);
        } catch (err) {
          logger.warn('import-recipes: lookup fehlgeschlagen, überspringe', {
            id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return meals;
    }

    // Ohne Kategorie: N× zufälliges Voll-Rezept (Duplikate per idMeal vermeiden).
    const meals: RawMeal[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < count * 2 && meals.length < count; i++) {
      try {
        const meal = await provider.random();
        if (meal && !seen.has(meal.idMeal)) {
          seen.add(meal.idMeal);
          meals.push(meal);
        }
      } catch (err) {
        logger.warn('import-recipes: random fehlgeschlagen, überspringe', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return meals;
  }

  router.post('/import-recipes', validateBody(importRecipesSchema), (_req, res, next) => {
    const { category, count } = res.locals.body as ImportRecipesInput;
    const cacheKey = (category ?? '__random__').toLowerCase();

    const cached = cache.get(cacheKey);
    if (cached) {
      res
        .status(200)
        .json({ source: 'themealdb', attribution: THEMEALDB_ATTRIBUTION, recipes: cached });
      return;
    }

    (async (): Promise<ImportedRecipe[]> => {
      const rawMeals = await fetchRawMeals(category, count);
      // EIN LLM-Aufruf für alle Rezepte (spart Quota/Rate-Limit); bei LLM-Fehler
      // liefert normalizeRecipesBatch strukturelle Fallbacks (nie leer).
      const normalizedList: LlmRecipe[] = await normalizeRecipesBatch(rawMeals, llm);
      const recipes: ImportedRecipe[] = [];

      normalizedList.forEach((normalized, i) => {
        const checked = checkRecipe(normalized, IMPORT_CHECK_PREFS);
        if (!checked.ok) {
          logger.warn('import-recipes: Rezept verworfen', {
            title: normalized.title,
            reason: checked.reason,
          });
          return;
        }
        recipes.push({
          ...checked.recipe,
          sourceUrl: mealSourceUrl(rawMeals[i].idMeal),
          imageUrl: rawMeals[i].thumb || undefined,
        });
      });
      return recipes;
    })()
      .then((recipes) => {
        // Nur nicht-leere Ergebnisse cachen (Fehltreffer nicht einfrieren).
        if (recipes.length > 0) cache.set(cacheKey, recipes);
        res
          .status(200)
          .json({ source: 'themealdb', attribution: THEMEALDB_ATTRIBUTION, recipes });
      })
      .catch(next);
  });

  return router;
}
