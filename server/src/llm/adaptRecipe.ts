/**
 * adaptRecipe — poliert die Kochschritte eines bereits (deterministisch im Frontend)
 * auf vegetarisch/vegan umgestellten Rezepts, damit sie zu den neuen pflanzlichen
 * Zutaten passen (z. B. „Tofu anbraten" statt „Hähnchen anbraten").
 *
 * Grundsatz (recipe-engine): rohe LLM-Ausgabe ist NIE vertrauenswürdig. Wir übernehmen
 * NUR die neuen `steps` (Zutaten/Mengen bleiben die des Eingabe-Rezepts) und nur, wenn die
 * Ausgabe schema-konform ist und ≥3 Schritte hat. Bei Fehler/Timeout/Mock → Eingabe unverändert.
 */

import type { LlmClient } from './llmClient.js';
import type { LlmRecipe } from './recipeSchema.js';
import { llmPlanJsonSchema } from './recipeSchema.js';
import { parsePlan } from './validateRecipe.js';

export type TargetDiet = 'vegetarisch' | 'vegan';

export function buildAdaptSystemPrompt(): string {
  return [
    'Du bist ein Kochassistent. Ein Rezept wurde bereits auf eine pflanzliche Ernährungsform',
    'umgestellt (die Zutaten sind schon ersetzt). Deine EINZIGE Aufgabe: die Kochschritte so',
    'umschreiben, dass sie zu den neuen Zutaten passen und kulinarisch korrekt sind',
    '(z. B. Tofu marinieren/anbraten statt Hähnchen; Sojagranulat einweichen; Haferdrink statt Milch).',
    '',
    'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt {"recipes": [<ein Rezept>]}.',
    'KEINE Prosa, KEIN Markdown, KEINE Code-Fences.',
    '',
    'Regeln:',
    '- Übernimm title, mealStyles, mealTypes, dietTags, requiredAppliances, prepMinutes,',
    '  cookMinutes, baseServings und ingredients EXAKT unverändert aus der Eingabe.',
    '- Ändere NUR steps: klare deutsche Schritte, MINDESTENS 3, passend zu den neuen Zutaten.',
    '- Erfinde KEINE neuen Zutaten und entferne keine. nutritionPerServing MUSS null sein.',
    '- Nur gültiges JSON, das gegen das Schema parst.',
  ].join('\n');
}

export function buildAdaptUserPrompt(recipe: LlmRecipe, targetDiet: TargetDiet): string {
  const ingredientLines = recipe.ingredients
    .map((i) => `- ${i.name}: ${i.amount} ${i.unit}`)
    .join('\n');
  const stepLines = recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `Ziel-Ernährungsform: ${targetDiet}.`,
    `Titel: ${recipe.title}`,
    '',
    'Neue (bereits ersetzte) Zutaten:',
    ingredientLines,
    '',
    'Bisherige Schritte (an die neuen Zutaten anpassen):',
    stepLines,
    '',
    'Antworte nur mit {"recipes": [<das Rezept mit umgeschriebenen steps>]} als reines JSON.',
  ].join('\n');
}

/**
 * Poliert die Schritte per LLM. Übernimmt nur `steps` (≥3) aus schema-konformer Ausgabe;
 * alle anderen Felder (inkl. Zutaten) bleiben die des Eingabe-Rezepts. Fallback: Eingabe.
 */
export async function adaptRecipeSteps(
  recipe: LlmRecipe,
  targetDiet: TargetDiet,
  llm: LlmClient,
): Promise<LlmRecipe> {
  try {
    const res = await llm.generateStructured<unknown>({
      system: buildAdaptSystemPrompt(),
      prompt: buildAdaptUserPrompt(recipe, targetDiet),
      schema: llmPlanJsonSchema,
      retry: { timeoutMs: 60_000, maxRetries: 0 },
    });
    const parsed = parsePlan(res.data);
    if (parsed.ok && parsed.recipes[0] && parsed.recipes[0].steps.length >= 3) {
      // Nur die Schritte übernehmen — Zutaten/Mengen/Meta bleiben autoritativ aus der Eingabe.
      return { ...recipe, steps: parsed.recipes[0].steps };
    }
  } catch {
    /* LLM-Fehler/Timeout/kein Key → Eingabe unverändert (deterministische Schritte bleiben). */
  }
  return recipe;
}
