/**
 * Zentrale zod-Schemata für Request-Validierung.
 * Bei Verstoß liefert die Error-Middleware 400 mit strukturierten `issues`.
 */

import { z } from 'zod';

/** Kurzer, getrimmter String mit Längengrenze (Input-Sanitizing). */
const shortString = z.string().trim().min(1).max(120);

/** Optionale Liste getrimmter Strings, defaultet auf []. */
const stringList = z.array(z.string().trim().min(1).max(120)).max(100).default([]);

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
});

export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

/** Einzelne Zutat für /nutrition. */
export const nutritionIngredientSchema = z.object({
  name: shortString,
  amount: z.number().positive(),
  unit: z.string().trim().min(1).max(30),
});

export const nutritionSchema = z.object({
  ingredients: z.array(nutritionIngredientSchema).min(1).max(200),
});

export type NutritionInput = z.infer<typeof nutritionSchema>;

/** Einzelnes Preis-Item für /prices. */
export const priceItemSchema = z.object({
  productKey: shortString,
  storeId: z.string().trim().max(60).optional(),
  region: z.string().trim().max(60).optional(),
});

export const pricesSchema = z.object({
  items: z.array(priceItemSchema).min(1).max(200),
});

export type PricesInput = z.infer<typeof pricesSchema>;

/**
 * Domänen-Typ für ein (Mock-)Rezept. Vereinfachte Form; die echte,
 * validierte Rezept-Struktur folgt aus der recipe-engine (M9).
 */
export interface Recipe {
  id: string;
  title: string;
  diet: string;
  servings: number;
  styles: string[];
  ingredients: { name: string; amount: number; unit: string }[];
  steps: string[];
  estimatedCostPerServing: number | null;
}
