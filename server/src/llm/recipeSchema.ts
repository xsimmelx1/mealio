/**
 * recipeSchema — die Structured-Output-Vorgabe für LLM-generierte Rezepte (M9).
 *
 * Dieses Schema ist der EINZIGE Vertrag, gegen den rohe LLM-Ausgabe geparst wird.
 * Es spiegelt exakt den Frontend-Kontrakt (app/src/domain/schema.ts -> RecipeSchema),
 * aber OHNE die Felder, die das Frontend selbst vergibt (id, source, createdAt,
 * isFavorite) und OHNE Preise. Nährwerte werden NIE vom LLM geraten -> immer null.
 *
 * Rohe LLM-Ausgabe ist NIE vertrauenswürdig: alles Weitere (Allergene, Geräte,
 * Portionen, Garzeiten, Duplikate) prüft validateRecipe.ts nach dem Parse.
 */

import { z } from 'zod';

/** Mengeneinheiten für Zutaten (Single Source of Truth, Spiegel des Frontends). */
export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'stück', 'prise'] as const;
export type Unit = (typeof UNITS)[number];

/** Meal-Styles (bevorzugte Rezept-Charaktere). */
export const MEAL_STYLES = [
  'schnell',
  'high-protein',
  'familienfreundlich',
  'fakeaway',
  'veggie',
  'budget',
] as const;
export type MealStyle = (typeof MEAL_STYLES)[number];

/** Mahlzeit-Typen (Tageszeit), Spiegel des Frontends (app/src/domain/enums.ts). */
export const MEAL_TYPES = ['fruehstueck', 'mittagessen', 'abendessen'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Diät-Tags, die ein Rezept erfüllt. */
export const DIET_TAGS = [
  'omnivor',
  'vegetarisch',
  'vegan',
  'pescetarisch',
  'glutenfrei',
  'laktosefrei',
  'low-carb',
] as const;
export type DietTag = (typeof DIET_TAGS)[number];

/** Küchengeräte, die ein Rezept voraussetzen kann. */
export const APPLIANCES = [
  'herd',
  'backofen',
  'mikrowelle',
  'airfryer',
  'mixer',
  'pürierstab',
  'toaster',
  'wasserkocher',
] as const;
export type Appliance = (typeof APPLIANCES)[number];

/** Supermarkt-Gänge (für Einkaufsliste-Gruppierung). */
export const AISLES = [
  'obst-gemüse',
  'kühlregal',
  'tiefkühl',
  'trockenwaren',
  'konserven',
  'backwaren',
  'fleisch-fisch',
  'getränke',
  'gewürze',
  'sonstiges',
] as const;
export type Aisle = (typeof AISLES)[number];

/** Realistische Ober-/Untergrenzen für Zeiten (Plausibilität, kein LLM-Vertrauen). */
export const MAX_PREP_MINUTES = 120;
export const MAX_COOK_MINUTES = 240;

/** Eine Zutat mit Menge, Einheit und Gang. amount MUSS > 0 sein. */
export const llmIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100_000),
  unit: z.enum(UNITS),
  aisle: z.enum(AISLES),
});
export type LlmIngredient = z.infer<typeof llmIngredientSchema>;

/**
 * Ein einzelnes LLM-Rezept. Enum-Felder defaulten auf []; steps erfordert >= 3.
 * nutritionPerServing wird bewusst auf null gezwungen: Was das Modell hier auch
 * liefert, wird verworfen (.catch(null)) — Nährwerte kommen separat aus /nutrition.
 */
export const llmRecipeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  mealStyles: z.array(z.enum(MEAL_STYLES)).default([]),
  // Für welche Tageszeit(en) das Rezept gedacht ist. Nie leer: fehlt es, wird
  // 'abendessen' angenommen. Ein explizit leeres Array wird von validateRecipe
  // als Verstoß behandelt (Repair/Seed-Fallback), damit die Response nie ein
  // Rezept ohne mealTypes ausliefert.
  mealTypes: z.array(z.enum(MEAL_TYPES)).default(['abendessen']),
  dietTags: z.array(z.enum(DIET_TAGS)).default([]),
  requiredAppliances: z.array(z.enum(APPLIANCES)).default([]),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  baseServings: z.number().int().positive(),
  ingredients: z.array(llmIngredientSchema).min(1).max(60),
  steps: z.array(z.string().trim().min(1).max(1000)).min(3).max(30),
  // Niemals LLM-Nährwerte vertrauen: alles außer null -> null; fehlend -> null.
  nutritionPerServing: z
    .null()
    .catch(null)
    .default(null),
});
export type LlmRecipe = z.infer<typeof llmRecipeSchema>;

/** Der Wurzel-Container, den das Modell liefern soll: { recipes: [...] }. */
export const llmPlanSchema = z.object({
  recipes: z.array(llmRecipeSchema).min(1).max(31),
});
export type LlmPlan = z.infer<typeof llmPlanSchema>;

/**
 * Der Rezept-Typ, den /generate-plan ausliefert. Identisch mit dem geparsten
 * LlmRecipe (nutritionPerServing immer null). Das Frontend ergänzt id/source/etc.
 */
export type Recipe = LlmRecipe;

/**
 * JSON-Schema-Repräsentation für Provider mit Structured-Output-Erzwingung.
 * Wird als `schema` an llmClient.generateStructured übergeben. Bewusst handgepflegt,
 * damit sie providerunabhängig bleibt (kein zod-to-json-schema als Abhängigkeit).
 */
export const llmPlanJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'mealStyles',
          'mealTypes',
          'dietTags',
          'requiredAppliances',
          'prepMinutes',
          'cookMinutes',
          'baseServings',
          'ingredients',
          'steps',
          'nutritionPerServing',
        ],
        properties: {
          title: { type: 'string' },
          mealStyles: { type: 'array', items: { enum: [...MEAL_STYLES] } },
          mealTypes: { type: 'array', minItems: 1, items: { enum: [...MEAL_TYPES] } },
          dietTags: { type: 'array', items: { enum: [...DIET_TAGS] } },
          requiredAppliances: { type: 'array', items: { enum: [...APPLIANCES] } },
          prepMinutes: { type: 'integer', minimum: 0 },
          cookMinutes: { type: 'integer', minimum: 0 },
          baseServings: { type: 'integer', minimum: 1 },
          ingredients: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'amount', 'unit', 'aisle'],
              properties: {
                name: { type: 'string' },
                amount: { type: 'number', exclusiveMinimum: 0 },
                unit: { enum: [...UNITS] },
                aisle: { enum: [...AISLES] },
              },
            },
          },
          steps: { type: 'array', minItems: 3, items: { type: 'string' } },
          nutritionPerServing: { type: 'null' },
        },
      },
    },
  },
};
