/**
 * recipePrompt — baut System-, User- und Repair-Prompts für die Rezeptgenerierung.
 *
 * Der System-Prompt erzwingt strukturierte JSON-Ausgabe gegen llmRecipeSchema
 * (keine Prosa, kein Markdown) und verankert die Nutzer-Präferenzen als HARTE
 * Constraints. Nährwerte und Preise werden ausdrücklich verboten (nutritionPerServing
 * MUSS null sein) — sie werden separat berechnet.
 */

import type { GeneratePlanInput } from '../schemas/index.js';
import { AISLES, APPLIANCES, DIET_TAGS, MEAL_STYLES, MEAL_TYPES, UNITS } from './recipeSchema.js';

/** Menschenlesbare Labels + Beispiele je Mahlzeit für den Prompt. */
const MEAL_TYPE_HINTS: Record<string, string> = {
  fruehstueck:
    'Frühstück (tageszeit-typisch: z. B. Porridge, Overnight Oats, Rührei, Joghurt-Bowl, Pancakes, Shakshuka, belegtes Brot — KEINE Currys, Braten oder Abend-Hauptgerichte)',
  mittagessen: 'Mittagessen (sättigend, alltagstauglich: Bowls, Salate, Suppen, Pfannengerichte, Pasta)',
  abendessen: 'Abendessen (warme Hauptgerichte: Pfannen, Aufläufe, Currys, Pasta, Fleisch-/Fisch-/Gemüsegerichte)',
};

/** Statische Ausgaberegeln (Format + Vollständigkeit). Enthält keine Nutzerdaten. */
export function buildRecipeSystemPrompt(): string {
  return [
    'Du bist ein Ernährungs- und Kochassistent, der Wochenpläne mit Rezepten erstellt.',
    'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt der Form {"recipes": [...]}.',
    'KEINE Prosa, KEINE Erklärungen, KEIN Markdown, KEINE Code-Fences, KEIN Text vor oder nach dem JSON.',
    '',
    'Jedes Rezept-Objekt MUSS exakt diese Felder haben:',
    '- title: string (deutsch, prägnant)',
    `- mealStyles: string[] — nur aus [${MEAL_STYLES.join(', ')}]`,
    `- mealTypes: string[] (NICHT leer) — nur aus [${MEAL_TYPES.join(', ')}]; passend zur Tageszeit des Gerichts`,
    `- dietTags: string[] — nur aus [${DIET_TAGS.join(', ')}]`,
    `- requiredAppliances: string[] — nur aus [${APPLIANCES.join(', ')}]`,
    '- prepMinutes: integer >= 0 (realistisch, <= 120)',
    '- cookMinutes: integer >= 0 (realistisch, <= 240)',
    '- baseServings: integer > 0',
    `- ingredients: Array von {name: string, amount: number > 0, unit ∈ [${UNITS.join(', ')}], aisle ∈ [${AISLES.join(', ')}]}`,
    '- steps: string[] mit MINDESTENS 3 klaren, aufeinanderfolgenden Schritten',
    '- nutritionPerServing: MUSS null sein',
    '',
    'Regeln:',
    '- Verwende realistische Mengen und zur Zutat passende Einheiten (z. B. Gewürze in tsp/tbsp/prise, Flüssigkeiten in ml/l, feste Zutaten in g/kg oder stück).',
    '- Ordne jede Zutat dem plausibelsten Supermarkt-Gang (aisle) zu.',
    '- ERFINDE KEINE Nährwerte und KEINE Preise. nutritionPerServing ist immer null. Nenne niemals Kalorien, Makros oder Kosten.',
    '- Liefere ausschließlich gültiges JSON, das gegen das vorgegebene Schema parst.',
  ].join('\n');
}

/** Formatiert eine Liste als Aufzählung oder "keine". */
function list(values: string[]): string {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(', ') : 'keine';
}

function budgetLine(budget: GeneratePlanInput['budget']): string {
  if (budget === undefined || budget === null || budget === '') {
    return '- Budget: nicht angegeben (dennoch preisbewusst und alltagstauglich planen)';
  }
  if (typeof budget === 'number') {
    return `- Budget: ca. ${budget} pro Woche — bevorzuge günstige, alltagstaugliche Zutaten`;
  }
  return `- Budget: ${budget} — bevorzuge günstige, alltagstaugliche Zutaten`;
}

/**
 * Baut den User-Prompt mit den harten Constraints aus den Präferenzen.
 * numberOfPeople bestimmt baseServings; days bestimmt die Anzahl der Rezepte.
 */
export function buildRecipeUserPrompt(prefs: GeneratePlanInput): string {
  const days = Math.max(1, prefs.days);
  const meals = prefs.mealTypes.length > 0 ? prefs.mealTypes : ['abendessen'];
  const total = days * meals.length;
  const lines: string[] = [
    `Erstelle GENAU ${total} verschiedene Rezepte (keine Duplikate, keine Titel-Wiederholungen).`,
    `Davon je ${days} Rezepte PRO angefragter Mahlzeit.`,
    '',
    'Angefragte Mahlzeiten (jedes Rezept genau EINER zuordnen und mealTypes entsprechend setzen):',
    ...meals.map((m) => `- ${MEAL_TYPE_HINTS[m] ?? m}`),
    '',
    'HARTE Constraints (alle Rezepte MÜSSEN sie erfüllen):',
    `- Jedes Rezept ist tageszeit-typisch für seine Mahlzeit; ein Frühstück ist KEIN Curry/Braten.`,
    `- mealTypes enthält NUR angefragte Typen (${meals.join(', ')}) und ist nie leer.`,
    `- Personenzahl: ${prefs.numberOfPeople} — setze baseServings bei JEDEM Rezept auf genau ${prefs.numberOfPeople} und skaliere die Mengen entsprechend.`,
    `- Ernährungsform: ${prefs.diet} — jedes Rezept muss dazu passen (setze passende dietTags).`,
    `- Allergien/Unverträglichkeiten (STRIKT meiden, auch versteckte Quellen): ${list(prefs.allergies)}`,
    `- Zu vermeidende Zutaten (dürfen NICHT vorkommen): ${list(prefs.avoidedIngredients)}`,
    budgetLine(prefs.budget),
  ];

  if (prefs.appliances.length > 0) {
    lines.push(
      `- Verfügbare Küchengeräte: ${list(prefs.appliances)} — requiredAppliances darf NUR Geräte aus dieser Liste enthalten.`,
    );
  } else {
    lines.push(
      '- Küchengeräte: nicht eingeschränkt — halte requiredAppliances dennoch minimal und alltagstauglich.',
    );
  }

  if (prefs.preferredStyles.length > 0) {
    lines.push(
      `- Bevorzugte Meal-Styles: ${list(prefs.preferredStyles)} — richte die Auswahl daran aus (mealStyles setzen).`,
    );
  }

  lines.push(
    '',
    'Erinnerung: Antworte nur mit {"recipes": [...]} als reines JSON. nutritionPerServing bleibt null.',
  );

  return lines.join('\n');
}

/**
 * Baut den GEZIELTEN Repair-Prompt (genau einmal), wenn die erste Ausgabe nicht
 * gegen das Schema parst. Enthält den konkreten Grund und die Ausgangs-Anforderung.
 */
export function buildRepairPrompt(prefs: GeneratePlanInput, reason: string): string {
  return [
    'Deine vorherige Antwort war UNGÜLTIG und konnte nicht verarbeitet werden.',
    `Grund: ${reason}`,
    '',
    'Korrigiere das und antworte erneut AUSSCHLIESSLICH mit gültigem JSON {"recipes": [...]}.',
    'Kein Markdown, keine Prosa, keine Code-Fences. Halte dich exakt an das geforderte Schema.',
    'nutritionPerServing MUSS null sein. Erfinde keine Nährwerte oder Preise.',
    '',
    buildRecipeUserPrompt(prefs),
  ].join('\n');
}
