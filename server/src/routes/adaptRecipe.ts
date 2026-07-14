/**
 * POST /adapt-recipe — poliert die Kochschritte eines bereits umgestellten Rezepts per LLM,
 * damit sie zu den neuen pflanzlichen Zutaten passen (KI-Schrittpolitur, siehe llm/adaptRecipe).
 *
 * Die Zutaten kommen bereits deterministisch ersetzt aus dem Frontend; der Endpunkt ändert
 * NUR die Schritte. Bei LLM-Ausfall/kein Key wird das Rezept unverändert zurückgegeben —
 * der Endpunkt bricht nie. Antwort-Kontrakt: { recipes: [Recipe] } (wie /import-recipes).
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { adaptRecipeSchema, type AdaptRecipeInput } from '../schemas/index.js';
import type { LlmClient } from '../llm/llmClient.js';
import { adaptRecipeSteps } from '../llm/adaptRecipe.js';

export function createAdaptRecipeRouter(llm: LlmClient): Router {
  const router = Router();

  router.post('/adapt-recipe', validateBody(adaptRecipeSchema), async (_req, res) => {
    const { recipe, targetDiet } = res.locals.body as AdaptRecipeInput;
    const adapted = await adaptRecipeSteps(recipe, targetDiet, llm);
    res.status(200).json({ recipes: [adapted] });
  });

  return router;
}
