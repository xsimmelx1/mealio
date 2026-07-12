/**
 * validateRecipe — Post-Generierungs-Validierung roher LLM-Ausgabe (M9).
 *
 * Grundsatz: Rohe LLM-Ausgabe ist NIE vertrauenswürdig. Nichts wird ungeprüft
 * ausgeliefert. Die Pipeline arbeitet in zwei Ebenen:
 *
 *  1) Schema-Parse (parsePlan). Scheitert er -> der Aufrufer (LLMRecipeSource)
 *     schickt GENAU einen gezielten Repair-Prompt und parst erneut; scheitert es
 *     wieder -> vollständiger Seed-Fallback.
 *  2) Harte Checks je Rezept (checkRecipe): Allergene/verbotene Zutaten, nur
 *     erlaubte Geräte, amount>0, sinnvolle Einheit, Garzeit im Realbereich.
 *     baseServings wird bei Abweichung auf die Personenzahl skaliert (Korrektur
 *     statt Verwerfen). Verletzte Rezepte werden durch geprüfte Seed-Rezepte
 *     ersetzt; Titel-Duplikate im Plan werden entfernt und aufgefüllt.
 *
 * validatePlan ist rein (kein LLM/Netz) und damit deterministisch testbar.
 */

import type { GeneratePlanInput } from '../schemas/index.js';
import { logger } from '../lib/logger.js';
import {
  llmPlanSchema,
  MAX_COOK_MINUTES,
  MAX_PREP_MINUTES,
  type LlmIngredient,
  type LlmRecipe,
} from './recipeSchema.js';
import { findAllergenViolation } from './dietRules.js';
import { buildSeedPool, normalizeTitle, scaleRecipe } from './seedRecipes.js';

/** Ergebnis des Schema-Parse. */
export type ParseResult =
  | { ok: true; recipes: LlmRecipe[] }
  | { ok: false; reason: string };

/**
 * Parst rohe LLM-Ausgabe gegen das Plan-Schema. Akzeptiert entweder
 * { recipes: [...] } oder direkt ein Array [...] (toleranter Einstieg),
 * scheitert aber bei allem, was nicht schema-konform ist.
 */
export function parsePlan(raw: unknown): ParseResult {
  const candidate = Array.isArray(raw) ? { recipes: raw } : raw;
  const result = llmPlanSchema.safeParse(candidate);
  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: reason || 'Ausgabe entspricht nicht dem Rezept-Schema' };
  }
  return { ok: true, recipes: result.data.recipes };
}

/** Plausible Obergrenzen je Einheit (fängt absurde Mengen ab). */
const UNIT_MAX: Record<LlmIngredient['unit'], number> = {
  g: 20_000,
  kg: 20,
  ml: 20_000,
  l: 20,
  tsp: 60,
  tbsp: 60,
  stück: 100,
  prise: 10,
};

/** Ergebnis eines harten Checks für ein einzelnes Rezept. */
export type CheckResult =
  | { ok: true; recipe: LlmRecipe }
  | { ok: false; reason: string };

/**
 * Harte Checks für ein einzelnes Rezept gegen die Präferenzen.
 * Bei Erfolg wird das (ggf. auf numberOfPeople korrigierte) Rezept zurückgegeben.
 */
export function checkRecipe(recipe: LlmRecipe, prefs: GeneratePlanInput): CheckResult {
  const ingredientNames = recipe.ingredients.map((i) => i.name);

  // 1) Allergene (Keyword-Heuristik, gluten/laktose ggf. per dietTag akzeptiert).
  const allergen = findAllergenViolation(ingredientNames, prefs.allergies, recipe.dietTags);
  if (allergen) {
    return {
      ok: false,
      reason: `Allergen "${allergen.allergy}" über Zutat "${allergen.ingredient}"`,
    };
  }

  // 2) Verbotene/zu vermeidende Zutaten (Teilstring-Match in beide Richtungen).
  const avoided = prefs.avoidedIngredients.map((a) => a.toLowerCase().trim()).filter(Boolean);
  for (const name of ingredientNames) {
    const n = name.toLowerCase();
    const hit = avoided.find((a) => n.includes(a) || a.includes(n));
    if (hit) {
      return { ok: false, reason: `Verbotene Zutat "${name}" (vermieden: "${hit}")` };
    }
  }

  // 3) Nur erlaubte Geräte (falls Präferenz gesetzt).
  if (prefs.appliances.length > 0) {
    const allowed = new Set(prefs.appliances.map((a) => a.toLowerCase().trim()));
    const bad = recipe.requiredAppliances.find((a) => !allowed.has(a.toLowerCase()));
    if (bad) {
      return { ok: false, reason: `Nicht verfügbares Gerät "${bad}"` };
    }
  }

  // 4) amount>0 und 5) sinnvolle Einheit/Menge.
  for (const ing of recipe.ingredients) {
    if (!(ing.amount > 0)) {
      return { ok: false, reason: `Ungültige Menge für "${ing.name}"` };
    }
    if (ing.amount > UNIT_MAX[ing.unit]) {
      return {
        ok: false,
        reason: `Unrealistische Menge ${ing.amount} ${ing.unit} für "${ing.name}"`,
      };
    }
  }

  // 6) Garzeiten im Realbereich.
  if (recipe.prepMinutes > MAX_PREP_MINUTES) {
    return { ok: false, reason: `Vorbereitungszeit ${recipe.prepMinutes} min zu hoch` };
  }
  if (recipe.cookMinutes > MAX_COOK_MINUTES) {
    return { ok: false, reason: `Garzeit ${recipe.cookMinutes} min zu hoch` };
  }

  // 7) baseServings == numberOfPeople: bei Abweichung korrigieren (skalieren).
  let corrected = recipe;
  if (recipe.baseServings !== prefs.numberOfPeople) {
    corrected = scaleRecipe(recipe, prefs.numberOfPeople);
  }

  return { ok: true, recipe: corrected };
}

/** Endgültiges Validierungsergebnis eines Plans. */
export type ValidatePlanResult =
  | { ok: true; recipes: LlmRecipe[] }
  | { ok: false; reason: string };

/**
 * Validiert einen kompletten (rohen) LLM-Plan gegen die Präferenzen.
 *
 * - Schema-Parse; scheitert er -> { ok:false } (Aufrufer entscheidet über Repair).
 * - Je Rezept harte Checks; verletzte werden verworfen.
 * - Titel-Duplikate werden entfernt.
 * - Verworfene/fehlende Slots werden mit geprüften Seed-Rezepten aufgefüllt,
 *   bis genau `days` eindeutige Rezepte vorliegen. So wird NIE ungeprüft geliefert.
 */
export function validatePlan(raw: unknown, prefs: GeneratePlanInput): ValidatePlanResult {
  const parsed = parsePlan(raw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  const days = Math.max(1, prefs.days);
  const usedTitles = new Set<string>();
  const accepted: LlmRecipe[] = [];

  for (const recipe of parsed.recipes) {
    if (accepted.length >= days) break;
    const check = checkRecipe(recipe, prefs);
    if (!check.ok) {
      logger.warn('validatePlan: Rezept verworfen', {
        title: recipe.title,
        reason: check.reason,
      });
      continue;
    }
    const key = normalizeTitle(check.recipe.title);
    if (usedTitles.has(key)) {
      logger.warn('validatePlan: Duplikat verworfen', { title: check.recipe.title });
      continue;
    }
    usedTitles.add(key);
    accepted.push(check.recipe);
  }

  // Auffüllen mit geprüften Seed-Rezepten (eindeutige Titel garantiert).
  if (accepted.length < days) {
    fillFromSeed(accepted, usedTitles, prefs, days);
  }

  return { ok: true, recipes: accepted.slice(0, days) };
}

/** Füllt `accepted` mit Seed-Rezepten auf, ohne Titel-Duplikate zu erzeugen. */
function fillFromSeed(
  accepted: LlmRecipe[],
  usedTitles: Set<string>,
  prefs: GeneratePlanInput,
  days: number,
): void {
  const pool = buildSeedPool(prefs);
  if (pool.length === 0) return;

  let variant = 0;
  let poolIndex = 0;
  // Sicherheitslimit gegen Endlosschleifen.
  let guard = 0;
  while (accepted.length < days && guard < days * 4 + 8) {
    guard++;
    const base = pool[poolIndex % pool.length];
    poolIndex++;
    const suffix = variant > 0 ? ` (Variante ${variant})` : '';
    const title = `${base.title}${suffix}`;
    const key = normalizeTitle(title);
    if (poolIndex % pool.length === 0) variant++;
    if (usedTitles.has(key)) continue;
    usedTitles.add(key);
    accepted.push({ ...base, title });
  }
}
