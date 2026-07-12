/**
 * POST /nutrition — Nährwerte je Portion (M10, data-integrations).
 *
 * Primärquelle: lokaler Nährwert-Seed (offline, deterministisch). Optional
 * (Feature-Flag NUTRITION_ONLINE=1) ergänzend Online-Lookups gegen
 * USDA FoodData Central (Public Domain) und Open Food Facts (ODbL, Attribution +
 * Share-Alike; siehe server/README.md). Online-Ergebnisse werden mit TTL gecacht.
 *
 * Antwort-Vertrag:
 *   { perServing: {kcal,protein,carbs,fat} | null, matchedCount, unmatchedCount,
 *     unknownIngredients: string[] }
 *   perServing = Summe der Makros aller gematchten Zutaten / servings;
 *   null nur wenn matchedCount === 0 (nie 0 als Nährwert behaupten).
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { nutritionSchema, type NutritionInput } from '../schemas/index.js';
import { TtlCache } from '../cache/ttlCache.js';
import { computeNutrition } from '../nutrition/computeNutrition.js';
import type { Per100g } from '../nutrition/nutritionSeed.js';
import type { NutritionProvider } from '../nutrition/providers/types.js';
import { createUsdaProvider } from '../nutrition/providers/usda.js';
import { createOffProvider } from '../nutrition/providers/openfoodfacts.js';
import { logger } from '../lib/logger.js';

export interface NutritionRouterOptions {
  /** Online-Lookups aktiv (Default: process.env.NUTRITION_ONLINE === '1'). */
  online?: boolean;
  /** Provider in Prioritätsreihenfolge (Default: [USDA, OFF]). */
  providers?: readonly NutritionProvider[];
}

export function createNutritionRouter(options: NutritionRouterOptions = {}): Router {
  const router = Router();

  // TTL 24h: Nährwerte ändern sich kaum. undefined=Miss, null=bekannt-negativ.
  const cache = new TtlCache<Per100g | null>(24 * 60 * 60 * 1000);

  const online = options.online ?? process.env.NUTRITION_ONLINE === '1';
  const providers =
    options.providers ?? (online ? [createUsdaProvider(), createOffProvider()] : []);

  if (online) {
    logger.info('nutrition: Online-Lookups aktiv', {
      providers: providers.map((p) => p.name),
    });
  }

  router.post('/nutrition', validateBody(nutritionSchema), (_req, res, next) => {
    const { ingredients, servings } = res.locals.body as NutritionInput;

    computeNutrition(ingredients, { servings, online, providers, cache })
      .then((result) => {
        res.status(200).json(result);
      })
      .catch(next);
  });

  return router;
}
