import { z } from 'zod';
import {
  AISLES,
  ALLERGIES,
  APPLIANCES,
  CURRENCIES,
  DIET_TAGS,
  DIETS,
  MEAL_STYLES,
  MEAL_TYPES,
  PRODUCT_FLAGS,
  UNITS,
} from './enums';

/**
 * Kanonisches Domänen-Datenmodell der App (zod = Single Source of Truth).
 * Diese Typen werden in Dexie persistiert und in der gesamten UI verwendet.
 * Das server-seitige LLM-Generierungsschema (recipe-engine, M9) mappt hierauf.
 */

const unitEnum = z.enum(UNITS);
const aisleEnum = z.enum(AISLES);

/** Eine Zutat mit Menge, Einheit und Gang-Zuordnung. */
export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  unit: unitEnum,
  aisle: aisleEnum,
  /** Optionaler Verweis auf ein gematchtes Produkt (Nährwert/Preis). */
  productMatchId: z.string().optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/** Makronährwerte pro Portion. Optional/nullable = "unbekannt" (nie als 0 raten). */
export const NutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

/** Ein vollständiges Rezept (Seed oder LLM). */
export const RecipeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mealStyles: z.array(z.enum(MEAL_STYLES)).default([]),
  /** Für welche Tageszeiten das Rezept geeignet ist. Leer = Mittag/Abend (Default). */
  mealTypes: z.array(z.enum(MEAL_TYPES)).default([]),
  dietTags: z.array(z.enum(DIET_TAGS)).default([]),
  requiredAppliances: z.array(z.enum(APPLIANCES)).default([]),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  baseServings: z.number().int().positive(),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(3),
  /** Kuratiert (Seed) oder berechnet (/nutrition). null = unbekannt. */
  nutritionPerServing: NutritionSchema.nullable().default(null),
  /** Schätzwert, wird von der Preis-Engine berechnet. null = unbekannt. */
  estimatedCostPerServing: z.number().nonnegative().nullable().default(null),
  source: z.enum(['seed', 'llm', 'themealdb']),
  /** Optionaler Quell-Link (Attribution, z. B. TheMealDB). */
  sourceUrl: z.string().optional(),
  /** Optionales Rezeptfoto (TheMealDB-Thumbnail oder Openverse-Suche; nur URL, kein Byte). */
  imageUrl: z.string().optional(),
  /** Bild-Attribution (CC-Namensnennung, z. B. bei Openverse-Fotos). */
  imageAttribution: z.string().optional(),
  /** Quell-Link des Bilds (Attribution). */
  imageSourceUrl: z.string().optional(),
  isFavorite: z.boolean().default(false),
  createdAt: z.number().int().nonnegative(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/**
 * Ein Plan-Slot: (Wochentag 0=Mo…6=So) × Mahlzeit.
 * recipeId=null bedeutet „übersprungen/leer" (Nutzer will hier kein Gericht).
 */
export const MealPlanEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.string().min(1).nullable(),
});
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>;

export const MealPlanSchema = z.object({
  id: z.string().min(1),
  /** ISO-Datum (YYYY-MM-DD) des Wochen-Montags. */
  weekStartDate: z.string().min(1),
  entries: z.array(MealPlanEntrySchema),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

/** Ein aggregierter Einkaufslisten-Eintrag. */
export const ShoppingItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Gematchter Produktschlüssel (für Preis-Override); null wenn kein Match. */
  productKey: z.string().nullable().default(null),
  totalAmount: z.number().nonnegative(),
  unit: unitEnum,
  aisle: aisleEnum,
  /** Schätzwert; null = unbekannt. */
  estimatedPrice: z.number().nonnegative().nullable().default(null),
  isChecked: z.boolean().default(false),
  /** Herkunft der Preisschätzung. */
  source: z.enum(['manual', 'seed', 'online', 'unknown']).default('unknown'),
  /** ISO-Datum der Preisschätzung (Kennzeichnung in UI). */
  priceDate: z.string().nullable().default(null),
  /** Als Vorrat markiert -> aus Liste ausblendbar. */
  isPantry: z.boolean().default(false),
  /** Produkt-Eigenschaften (Bio/Fairtrade/Vegan/Regional) — Anzeige. */
  flags: z.array(z.enum(PRODUCT_FLAGS)).optional(),
  /** Effektiver Angebotspreis (falls im Angebot), sonst null. */
  offerPrice: z.number().nonnegative().nullable().optional(),
});
export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

/** Manueller Preis-Override (schlägt Seed/Online). */
export const PriceOverrideSchema = z.object({
  /** Stabiler Schlüssel des Produkts (normalisierter Zutatname). */
  productKey: z.string().min(1),
  storeId: z.string().default('default'),
  region: z.string().default(''),
  /** Preis pro Packung. */
  pricePerPackage: z.number().nonnegative(),
  /** Grundpreis (pro kg/l/Stück) für interne Rechnung. */
  basePrice: z.number().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type PriceOverride = z.infer<typeof PriceOverrideSchema>;

/** Nutzer-Präferenzen (aus Onboarding + Einstellungen). Singleton (id=1). */
export const UserPreferencesSchema = z.object({
  id: z.literal(1).default(1),
  budget: z.number().nonnegative().default(60),
  currency: z.enum(CURRENCIES).default('EUR'),
  supermarket: z.string().default(''),
  /** Bevorzugte Produkt-Labels (Bio/Fairtrade/Vegan/Regional). Aktiv = wo verfügbar bevorzugt. */
  preferredProductFlags: z.array(z.enum(PRODUCT_FLAGS)).default([]),
  diet: z.enum(DIETS).default('omnivor'),
  allergies: z.array(z.enum(ALLERGIES)).default([]),
  preferredStyles: z.array(z.enum(MEAL_STYLES)).default([]),
  avoidedIngredients: z.array(z.string()).default([]),
  /** Geräte, die der Nutzer NICHT hat -> Rezepte, die sie brauchen, entfallen. */
  excludedAppliances: z.array(z.enum(APPLIANCES)).default([]),
  numberOfPeople: z.number().int().positive().default(2),
  /** Wochentage, die geplant werden sollen (0=Mo…6=So). */
  planDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  /** Mahlzeiten, die pro geplantem Tag vorkommen sollen. */
  mealTypes: z.array(z.enum(MEAL_TYPES)).default(['abendessen']),
  /** Online-Preise (experimentell) opt-in. */
  onlinePricesEnabled: z.boolean().default(false),
  /** KI-Rezeptgenerierung (experimentell) opt-in; sonst Seed-Katalog. */
  aiRecipesEnabled: z.boolean().default(false),
  /** Onboarding abgeschlossen/übersprungen? */
  onboardingComplete: z.boolean().default(false),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/** Default-Präferenzen (durch Parsen eines leeren Objekts über die Defaults). */
export const DEFAULT_PREFERENCES: UserPreferences = UserPreferencesSchema.parse({});

/** Schema für die Seed-Rezept-Datei (Array vor Vergabe von createdAt/isFavorite). */
export const SeedRecipeSchema = RecipeSchema.omit({
  createdAt: true,
  isFavorite: true,
  source: true,
}).extend({
  // Seed-Rezepte tragen keine createdAt/source im JSON – wird beim Import gesetzt.
});
export type SeedRecipe = z.infer<typeof SeedRecipeSchema>;

/** Ein Store-Preiseintrag im Seed (prices.seed.json). */
export const SeedPriceSchema = z.object({
  /** Normalisierter Produkt-/Zutatschlüssel (z. B. "haehnchenbrust"). */
  productKey: z.string().min(1),
  /** Anzeigename. */
  label: z.string().min(1),
  /** Marke / Eigenmarke des Produkts in diesem Markt (z. B. "ja!", "K-Classic"). */
  brand: z.string().optional(),
  storeId: z.string().min(1),
  storeType: z.enum(['discounter', 'vollsortimenter']),
  aisle: aisleEnum,
  /** Packungsgröße in Basiseinheit (g/ml/stück). */
  packageSize: z.number().positive(),
  /** Basiseinheit der Packung. */
  packageUnit: z.enum(['g', 'ml', 'stück']),
  /** Preis pro Packung. */
  pricePerPackage: z.number().nonnegative(),
  /** Herkunft des Preises: echt (gescrapte/kuratierte Quelle) vs. abgeleitete Schätzung. */
  dataSource: z.enum(['real', 'estimate']).optional(),
  /** Stand der Preisdaten (YYYY-MM), für UI-Kennzeichnung. */
  priceDate: z.string().optional(),
  /** Echter Produktname aus der Quelle (nur bei dataSource='real'). */
  productName: z.string().optional(),
  /** EAN/Barcode des echten Produkts (nur bei dataSource='real'). */
  ean: z.string().optional(),
  /** Produkt-Eigenschaften (Bio/Fairtrade/Vegan/Regional). */
  flags: z.array(z.enum(PRODUCT_FLAGS)).optional(),
  /** Diese Zeile ist ein aktueller Angebotsartikel (eigenes, günstigeres Produkt). */
  isOffer: z.boolean().optional(),
  /** Gültig bis (ISO-Datum), falls die Quelle es liefert. */
  offerValidUntil: z.string().optional(),
  /** Nutri-Score (a–e), aus Open Food Facts. */
  nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional(),
  /** Eco-Score (a–e), aus Open Food Facts. */
  ecoScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional(),
});
export type SeedPrice = z.infer<typeof SeedPriceSchema>;
