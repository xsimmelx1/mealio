/**
 * POST /recipe-images — echtes Foto je Rezept (per Titel) über Openverse (CC-lizenziert, kein Key).
 * Ergebnis je key: { imageUrl, attribution, sourceUrl } oder null (kein Treffer). Lange gecacht
 * (Bilder ändern sich kaum). Bei Fehler -> null (nie geraten, App-Flow nie blockiert).
 */
import { Router } from 'express';
import { TtlCache } from '../cache/ttlCache.js';
import { validateBody } from '../lib/validate.js';
import { searchRecipeImage, type RecipeImageResult } from '../images/openverse.js';
import { recipeImagesSchema, type RecipeImagesInput } from '../schemas/index.js';

export function createRecipeImagesRouter(): Router {
  const router = Router();
  const cache = new TtlCache<RecipeImageResult | null>(30 * 24 * 60 * 60 * 1000); // 30 Tage je Query

  router.post('/recipe-images', validateBody(recipeImagesSchema), (_req, res, next) => {
    const { items } = res.locals.body as RecipeImagesInput;
    Promise.all(
      items.map(async (it) => {
        const cached = cache.get(it.query);
        const result = cached !== undefined ? cached : await searchRecipeImage(it.query);
        if (cached === undefined) cache.set(it.query, result);
        return {
          key: it.key,
          imageUrl: result?.imageUrl ?? null,
          attribution: result?.attribution ?? null,
          sourceUrl: result?.sourceUrl ?? null,
        };
      }),
    )
      .then((results) => res.status(200).json({ items: results }))
      .catch(next);
  });

  return router;
}
