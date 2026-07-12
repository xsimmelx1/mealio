/**
 * POST /generate-plan — echte LLM-Rezeptgenerierung mit Validierungs-/Repair-Pipeline (M9).
 *
 * Ablauf:
 *  1) LLMRecipeSource: Prompt aus Prefs -> LlmClient -> Schema-Parse -> 1 Repair
 *     -> harte Checks (Allergene/Geräte/Mengen/Zeiten) -> Seed-Ersatz/Dedup.
 *  2) Bei Ausnahme (Transportfehler, ohne Key/Netz via HTTP-Client, oder Ausgabe
 *     nach Repair weiterhin ungültig) -> sauberer Fallback auf SeedRecipeSource.
 *
 * Antwort-Kontrakt (vom Frontend erwartet): { source, recipes: Recipe[] }.
 * Jedes Recipe trägt nutritionPerServing:null; id/source/createdAt/isFavorite
 * vergibt das Frontend selbst. Der API-Key existiert nur serverseitig.
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { generatePlanSchema, type GeneratePlanInput } from '../schemas/index.js';
import type { LlmClient } from '../llm/llmClient.js';
import { LLMRecipeSource, SeedRecipeSource } from '../llm/recipeSource.js';
import type { Recipe } from '../llm/recipeSchema.js';
import { logger } from '../lib/logger.js';

export function createGeneratePlanRouter(llm: LlmClient): Router {
  const router = Router();
  const llmSource = new LLMRecipeSource(llm);
  const seedSource = new SeedRecipeSource();

  router.post('/generate-plan', validateBody(generatePlanSchema), async (_req, res) => {
    const prefs = res.locals.body as GeneratePlanInput;

    let source: 'llm' | 'seed-fallback' = 'llm';
    let recipes: Recipe[];
    try {
      recipes = await llmSource.generatePlan(prefs);
    } catch (err) {
      // Sauberes Degradieren: LLM-Ausfall darf den Endpunkt nie brechen.
      logger.warn('generate-plan: LLM-Quelle fehlgeschlagen, nutze Seed-Fallback', {
        message: err instanceof Error ? err.message : String(err),
      });
      recipes = await seedSource.generatePlan(prefs);
      source = 'seed-fallback';
    }

    res.status(200).json({ source, recipes });
  });

  return router;
}
