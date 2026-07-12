/**
 * POST /nutrition — STUB (M4).
 *
 * Kontrakt steht; echte USDA/OFF-Anbindung folgt in M10 (data-integrations).
 * Cache ist bereits verdrahtet, damit spätere echte Lookups nur einmal je Zutat
 * geschehen. Aktuell: jede Zutat -> status "unknown".
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { nutritionSchema, type NutritionInput } from '../schemas/index.js';
import { TtlCache } from '../cache/ttlCache.js';

interface NutritionItem {
  name: string;
  status: 'unknown';
}

export function createNutritionRouter(): Router {
  const router = Router();
  // Vorbereitet für M10: TTL 24h für Nährwerte.
  const cache = new TtlCache<NutritionItem>(24 * 60 * 60 * 1000);

  router.post('/nutrition', validateBody(nutritionSchema), (_req, res) => {
    const { ingredients } = res.locals.body as NutritionInput;

    const items: NutritionItem[] = ingredients.map((ing) => {
      const key = ing.name.toLowerCase();
      const cached = cache.get(key);
      if (cached) return cached;
      const item: NutritionItem = { name: ing.name, status: 'unknown' };
      cache.set(key, item);
      return item;
    });

    res.status(200).json({ items });
  });

  return router;
}
