/**
 * POST /generate-plan — LLM-Proxy (M4: reiner Mock).
 *
 * Der llmClient wird bereits durchgereicht, damit der Transport-Pfad steht.
 * Die echte Prompt-/Validierungs-/Repair-Pipeline folgt in M9 (recipe-engine).
 * Fällt der LLM-Aufruf aus, wird sauber auf deterministische Mock-Rezepte degradiert.
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { generatePlanSchema, type GeneratePlanInput, type Recipe } from '../schemas/index.js';
import { buildMockRecipes } from '../llm/mockRecipes.js';
import type { LlmClient } from '../llm/llmClient.js';
import { logger } from '../lib/logger.js';

export function createGeneratePlanRouter(llm: LlmClient): Router {
  const router = Router();

  router.post('/generate-plan', validateBody(generatePlanSchema), async (_req, res) => {
    const prefs = res.locals.body as GeneratePlanInput;

    // Transport-Pfad: wir rufen den Client an, verlassen uns aber (M4) auf Fixtures.
    // Der Mock-Client liefert leere Daten; der HTTP-Client wirft (noch) -> degradieren.
    let source: 'mock' | 'llm' = 'mock';
    try {
      const result = await llm.generateStructured<{ recipes?: Recipe[] }>({
        prompt: 'generate-plan (M4 stub — prompt kommt aus recipe-engine in M9)',
      });
      source = result.source;
    } catch (err) {
      // Sauberes Degradieren: LLM-Ausfall darf den Endpunkt nicht brechen.
      logger.warn('generate-plan: LLM-Aufruf fehlgeschlagen, nutze Mock-Fallback', {
        message: err instanceof Error ? err.message : String(err),
      });
      source = 'mock';
    }

    const recipes = buildMockRecipes(prefs);
    res.status(200).json({ source, recipes });
  });

  return router;
}
