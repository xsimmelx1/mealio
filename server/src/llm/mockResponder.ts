/**
 * mockResponder — die Standard-Antwort des MockLlmClient für die recipe-engine.
 *
 * Erzeugt aus dem Aufruf-Kontext (UserPrefs) deterministisch schema-konforme,
 * prefs-respektierende Rezepte, sodass die vollständige Generierungs-/Validierungs-
 * Pipeline auch OHNE echten API-Key End-to-End funktioniert. Die Inhalte stammen
 * aus dem geprüften Seed-Katalog; getaggt wird die Antwort im Transport als "mock",
 * die Route bewertet einen erfolgreichen LLM-Lauf jedoch als Quelle "llm".
 */

import { generatePlanSchema, type GeneratePlanInput } from '../schemas/index.js';
import type { GenerateStructuredArgs } from './llmClient.js';
import { buildSeedPlan } from './seedRecipes.js';

/**
 * Liefert { recipes: [...] } aus dem Seed-Plan, wenn der Kontext gültige Prefs
 * enthält. Ohne verwertbaren Kontext -> leeres Objekt (rückwärtskompatibel).
 */
export function defaultMockResponder(args: GenerateStructuredArgs): unknown {
  const prefs = extractPrefs(args.context);
  if (!prefs) return {};
  return { recipes: buildSeedPlan(prefs) };
}

function extractPrefs(context: unknown): GeneratePlanInput | null {
  if (!context || typeof context !== 'object') return null;
  const source = 'prefs' in context ? (context as { prefs: unknown }).prefs : context;
  const parsed = generatePlanSchema.safeParse(source);
  return parsed.success ? parsed.data : null;
}
