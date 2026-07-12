/**
 * normalizeRecipe — übersetzt & normalisiert ein englisches TheMealDB-Roh-Rezept
 * über Gemini in unser LLM-Rezeptschema (Deutsch, unsere Einheiten/Gänge/Enums).
 *
 * Strategie / sauberes Degradieren:
 *  - Es wird IMMER `llm.generateStructured` aufgerufen (mit `llmPlanJsonSchema`).
 *  - Wirft der Aufruf (Gemini 429/Quota/Netz), propagiert der Fehler -> die Pipeline
 *    überspringt genau dieses Rezept (blockiert nie die ganze Anfrage).
 *  - Liefert der Aufruf keinen parsebaren Rezept-Output (z. B. MockLlmClient ohne
 *    echten Key), wird NUR strukturell gemappt (ohne Übersetzung) -> nie leer.
 *  - Nachvalidierung (checkRecipe) macht die aufrufende Pipeline.
 */

import type { LlmClient } from '../llm/llmClient.js';
import type { DietTag, LlmRecipe, MealType } from '../llm/recipeSchema.js';
import {
  AISLES,
  APPLIANCES,
  DIET_TAGS,
  llmPlanJsonSchema,
  MEAL_STYLES,
  MEAL_TYPES,
  UNITS,
} from '../llm/recipeSchema.js';
import { parsePlan } from '../llm/validateRecipe.js';
import { guessAisle, parseMeasure } from './measures.js';
import type { RawMeal } from './providers/theMealDb.js';

/** Ordnet die TheMealDB-Kategorie unseren Mahlzeit-Typen zu. */
export function categoryToMealTypes(category: string): MealType[] {
  return category.trim().toLowerCase() === 'breakfast'
    ? ['fruehstueck']
    : ['mittagessen', 'abendessen'];
}

/** Leitet Diät-Tags aus der Kategorie ab (nur wenn klar). */
export function categoryToDietTags(category: string): DietTag[] {
  switch (category.trim().toLowerCase()) {
    case 'vegan':
      return ['vegan', 'vegetarisch'];
    case 'vegetarian':
      return ['vegetarisch'];
    case 'seafood':
      return ['pescetarisch'];
    case 'beef':
    case 'chicken':
    case 'pork':
    case 'lamb':
    case 'goat':
      return ['omnivor'];
    default:
      return [];
  }
}

/** Zerlegt einen Instruktions-Block in >= 3 saubere Schritte (max. 30, je <= 1000). */
function splitSteps(instructions: string): string[] {
  const clean = instructions.replace(/\r/g, '').trim();
  let parts = clean
    .split(/\n+/)
    .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').trim())
    .filter((s) => s.length > 0);

  // Kein Zeilenumbruch-Layout -> an Satzenden trennen.
  if (parts.length < 3) {
    parts = clean
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  parts = parts.map((s) => s.slice(0, 1000)).slice(0, 30);

  // Mindestens 3 Schritte (Schema-Anforderung) — knappe Instruktionen auffüllen.
  while (parts.length < 3) {
    parts.push('Nach Belieben abschmecken und servieren.');
  }
  return parts;
}

/**
 * Rein strukturelles Mapping OHNE Übersetzung (Fallback ohne echtes Gemini).
 * Erzeugt ein schema-konformes Rezept: englische Texte, Maße grob umgerechnet.
 */
export function structuralMap(raw: RawMeal): LlmRecipe {
  const ingredients = raw.ingredients.slice(0, 60).map((ri) => {
    const { amount, unit } = parseMeasure(ri.measure);
    return { name: ri.name.slice(0, 120), amount, unit, aisle: guessAisle(ri.name) };
  });

  return {
    title: raw.title.slice(0, 160),
    mealStyles: [],
    mealTypes: categoryToMealTypes(raw.category),
    dietTags: categoryToDietTags(raw.category),
    requiredAppliances: [],
    prepMinutes: 15,
    cookMinutes: 30,
    baseServings: 2,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: raw.title.slice(0, 120), amount: 1, unit: 'stück', aisle: 'sonstiges' }],
    steps: splitSteps(raw.instructions),
    nutritionPerServing: null,
  };
}

/** System-Prompt: striktes JSON, keine Prosa, exakt EIN übersetztes Rezept. */
export function buildNormalizeSystemPrompt(): string {
  return [
    'Du bist ein Koch- und Übersetzungsassistent. Du normalisierst EIN englisches Rezept',
    'ins Deutsche und in ein striktes JSON-Format.',
    'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt der Form {"recipes": [<ein Rezept>]}.',
    'KEINE Prosa, KEINE Erklärungen, KEIN Markdown, KEINE Code-Fences.',
    '',
    'Das Rezept-Objekt MUSS exakt diese Felder haben:',
    '- title: string (Deutsch, prägnant)',
    `- mealStyles: string[] — nur aus [${MEAL_STYLES.join(', ')}]`,
    `- mealTypes: string[] (NICHT leer) — nur aus [${MEAL_TYPES.join(', ')}]`,
    `- dietTags: string[] — nur aus [${DIET_TAGS.join(', ')}]`,
    `- requiredAppliances: string[] — nur aus [${APPLIANCES.join(', ')}]`,
    '- prepMinutes: integer >= 0 (realistisch, <= 120)',
    '- cookMinutes: integer >= 0 (realistisch, <= 240)',
    '- baseServings: MUSS 2 sein (Mengen entsprechend grob skalieren)',
    `- ingredients: Array von {name (Deutsch), amount (> 0), unit ∈ [${UNITS.join(', ')}], aisle ∈ [${AISLES.join(', ')}]}`,
    '- steps: string[] mit MINDESTENS 3 klaren, deutschen Schritten',
    '- nutritionPerServing: MUSS null sein',
    '',
    'Übersetzungs- und Umrechnungsregeln:',
    '- Übersetze Titel, alle Zutatnamen und alle Schritte ins Deutsche.',
    '- Rechne imperiale Maße in unsere Einheiten um: 1 cup ≈ 240 ml; tbsp bleibt tbsp;',
    '  tsp bleibt tsp; 1 oz ≈ 28 g; 1 lb ≈ 454 g; "can"/"tin" ≈ 400 g bzw. ml;',
    '  "clove" -> stück; "pinch"/"dash" -> prise. Parse Brüche wie ½ oder 1 1/2 korrekt.',
    '- Ordne jede Zutat dem plausibelsten Supermarkt-Gang (aisle) zu.',
    '- mealTypes: Kategorie "Breakfast" -> ["fruehstueck"], sonst ["mittagessen", "abendessen"].',
    '- dietTags ableiten: Kategorie Vegan -> vegan+vegetarisch; Vegetarian -> vegetarisch;',
    '  Seafood -> pescetarisch; Fleisch-Kategorien (Beef/Chicken/Pork/Lamb) -> omnivor;',
    '  glutenfrei/laktosefrei NUR wenn eindeutig.',
    '- ERFINDE KEINE Nährwerte. nutritionPerServing ist immer null.',
    '- Liefere ausschließlich gültiges JSON, das gegen das Schema parst.',
  ].join('\n');
}

/** User-Prompt: bettet die englischen Rohdaten ein. */
export function buildNormalizeUserPrompt(raw: RawMeal): string {
  const ingredientLines = raw.ingredients
    .map((ri) => `- ${ri.name}${ri.measure ? ` — ${ri.measure}` : ''}`)
    .join('\n');
  return [
    'Normalisiere und übersetze dieses Rezept aus TheMealDB:',
    `Titel (Englisch): ${raw.title}`,
    `Kategorie: ${raw.category || '(unbekannt)'}`,
    `Region: ${raw.area || '(unbekannt)'}`,
    '',
    'Zutaten (Name — Maß, Englisch/imperial):',
    ingredientLines || '(keine)',
    '',
    'Zubereitung (Englisch):',
    raw.instructions || '(keine)',
    '',
    'Antworte nur mit {"recipes": [<ein normalisiertes deutsches Rezept>]} als reines JSON.',
  ].join('\n');
}

/**
 * Normalisiert ein Roh-Rezept. Wirft nur, wenn der LLM-Transport wirft (-> Pipeline
 * überspringt dieses Rezept). Bei nicht verwertbarem Output -> strukturelles Mapping.
 */
export async function normalizeRecipe(raw: RawMeal, llm: LlmClient): Promise<LlmRecipe> {
  const res = await llm.generateStructured<unknown>({
    system: buildNormalizeSystemPrompt(),
    prompt: buildNormalizeUserPrompt(raw),
    schema: llmPlanJsonSchema,
  });

  const parsed = parsePlan(res.data);
  if (parsed.ok && parsed.recipes.length > 0) {
    return parsed.recipes[0];
  }
  // Kein echtes Gemini / kein parsebarer Output -> strukturell mappen (ohne Übersetzung).
  return structuralMap(raw);
}
