/**
 * Zentrale zod-Schemata für Request-Validierung.
 * Bei Verstoß liefert die Error-Middleware 400 mit strukturierten `issues`.
 */

import { z } from 'zod';

/** Kurzer, getrimmter String mit Längengrenze (Input-Sanitizing). */
const shortString = z.string().trim().min(1).max(120);

/** Optionale Liste getrimmter Strings, defaultet auf []. */
const stringList = z.array(z.string().trim().min(1).max(120)).max(100).default([]);

/** Mahlzeit-Typen (Tageszeit), Spiegel des Frontends (app/src/domain/enums.ts). */
export const MEAL_TYPES = ['fruehstueck', 'mittagessen', 'abendessen'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/**
 * UserPreferences-artiges Objekt für /generate-plan.
 * Die vollständige Semantik kommt später aus der recipe-engine (M9);
 * hier nur der Transport-Kontrakt.
 */
export const generatePlanSchema = z.object({
  numberOfPeople: z.number().int().positive().max(50),
  diet: z.string().trim().max(60).optional().default('omnivore'),
  allergies: stringList,
  avoidedIngredients: stringList,
  appliances: stringList,
  preferredStyles: stringList,
  budget: z
    .union([z.number().nonnegative(), z.string().trim().max(60)])
    .optional(),
  days: z.number().int().positive().max(31).optional().default(7),
  /**
   * Angefragte Mahlzeiten (Teilmenge von fruehstueck/mittagessen/abendessen).
   * `days` gilt PRO Mahlzeit; insgesamt werden ~ days * mealTypes.length Rezepte
   * erzeugt. Fehlt das Feld, wird nur 'abendessen' geplant (rückwärtskompatibel).
   */
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(3).optional().default(['abendessen']),
});

export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

/** Unterstützte Einheiten (Masse, Volumen, Stück, Prise). */
export const nutritionUnitSchema = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'stück',
  'prise',
]);

export type NutritionUnit = z.infer<typeof nutritionUnitSchema>;

/** Einzelne Zutat für /nutrition. */
export const nutritionIngredientSchema = z.object({
  name: shortString,
  amount: z.number().positive(),
  unit: nutritionUnitSchema,
});

export const nutritionSchema = z.object({
  ingredients: z.array(nutritionIngredientSchema).min(1).max(200),
  servings: z.number().int().positive().max(100).default(1),
});

export type NutritionInput = z.infer<typeof nutritionSchema>;

/**
 * Einzelnes Preis-Item für /prices (M11-Vertrag).
 * `key` = stabiler productKey (z. B. Barcode); `query` = optionaler Anzeigename/Suchbegriff.
 */
export const priceItemSchema = z.object({
  key: shortString,
  query: z.string().trim().min(1).max(120).optional(),
  region: z.string().trim().max(60).optional(),
});

export const pricesSchema = z.object({
  items: z.array(priceItemSchema).min(1).max(200),
});

export type PricesInput = z.infer<typeof pricesSchema>;

// Hinweis: Der validierte Rezept-Typ lebt in llm/recipeSchema.ts (recipe-engine, M9).
