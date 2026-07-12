/**
 * recipeSource — Rezept-Quellen hinter einem gemeinsamen Interface (M9).
 *
 *  - LLMRecipeSource: baut Prompt, ruft den LlmClient, validiert und repariert.
 *    Genau EIN Repair-Versuch bei Schema-Parse-Fehler; danach Ausnahme -> die
 *    Route degradiert sauber auf die SeedRecipeSource.
 *  - SeedRecipeSource: liefert geprüfte Seed-Rezepte (kein Netz, kein Key).
 *
 * Ohne API-Key nutzt die Factory den MockLlmClient, der schema-valide, prefs-
 * konforme Rezepte liefert -> LLMRecipeSource funktioniert End-to-End (Quelle "llm").
 */

import type { GeneratePlanInput } from '../schemas/index.js';
import { logger } from '../lib/logger.js';
import type { LlmClient } from './llmClient.js';
import type { LlmRecipe, Recipe } from './recipeSchema.js';
import { llmPlanJsonSchema } from './recipeSchema.js';
import {
  buildRecipeSystemPrompt,
  buildRecipeUserPrompt,
  buildRepairPrompt,
} from './recipePrompt.js';
import { validatePlan } from './validateRecipe.js';
import { buildSeedPlan } from './seedRecipes.js';

/** Gemeinsame Schnittstelle aller Rezept-Quellen. */
export interface RecipeSource {
  /** Liefert einen geprüften Plan (Länge == prefs.days), niemals ungeprüft. */
  generatePlan(prefs: GeneratePlanInput): Promise<Recipe[]>;
}

/** Signalisiert, dass die LLM-Quelle keinen verwertbaren Plan liefern konnte. */
export class RecipeGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeGenerationError';
  }
}

/**
 * LLM-gestützte Quelle: Prompt -> LlmClient -> validatePlan (mit 1 Repair).
 * Wirft RecipeGenerationError, wenn selbst nach dem Repair kein valider Plan
 * entsteht (Transportfehler oder wiederholter Schema-Bruch) -> Seed-Fallback.
 */
export class LLMRecipeSource implements RecipeSource {
  constructor(private readonly llm: LlmClient) {}

  async generatePlan(prefs: GeneratePlanInput): Promise<Recipe[]> {
    const system = buildRecipeSystemPrompt();
    const userPrompt = buildRecipeUserPrompt(prefs);

    let raw: unknown;
    try {
      raw = await this.call(system, userPrompt, prefs);
    } catch (err) {
      throw new RecipeGenerationError(
        `LLM-Aufruf fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let result = validatePlan(raw, prefs);

    // Genau EIN gezielter Repair-Versuch bei Schema-Parse-Fehler.
    if (!result.ok) {
      logger.warn('LLMRecipeSource: Schema-Parse fehlgeschlagen, starte 1 Repair', {
        reason: result.reason,
      });
      try {
        const repairRaw = await this.call(system, buildRepairPrompt(prefs, result.reason), prefs);
        result = validatePlan(repairRaw, prefs);
      } catch (err) {
        throw new RecipeGenerationError(
          `Repair-Aufruf fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!result.ok) {
      throw new RecipeGenerationError(`Ausgabe nach Repair weiterhin ungültig: ${result.reason}`);
    }

    return result.recipes;
  }

  private async call(
    system: string,
    prompt: string,
    prefs: GeneratePlanInput,
  ): Promise<unknown> {
    const res = await this.llm.generateStructured<unknown>({
      system,
      prompt,
      schema: llmPlanJsonSchema,
      // Kontext nur für den MockLlmClient (echte Clients ignorieren ihn).
      context: { prefs },
    });
    return res.data;
  }
}

/** Fallback-Quelle: geprüfte Seed-Rezepte, ohne Netz/Key. */
export class SeedRecipeSource implements RecipeSource {
  async generatePlan(prefs: GeneratePlanInput): Promise<LlmRecipe[]> {
    return buildSeedPlan(prefs);
  }
}
