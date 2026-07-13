import { z } from 'zod';
import { APPLIANCES } from '../domain/enums';
import {
  NutritionSchema,
  RecipeSchema,
  type Ingredient,
  type Recipe,
  type UserPreferences,
} from '../domain/schema';
import { normalizeName } from '../pricing/productMatch';

/**
 * Zentraler API-Client. EINZIGER Ort für Backend-Aufrufe (nie Keys im Frontend).
 * Basis-URL aus Vite-Env (VITE_API_URL), Default lokaler Dev-Server.
 */
const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8787';

const DEFAULT_TIMEOUT_MS = 20_000;

/** LLM-Rezept aus dem Backend (ohne id/source/createdAt/isFavorite — die vergibt das Frontend). */
const LlmRecipeSchema = RecipeSchema.omit({
  id: true,
  source: true,
  createdAt: true,
  isFavorite: true,
});

const GeneratePlanResponse = z.object({
  source: z.string().optional(),
  recipes: z.array(z.unknown()),
});

async function fetchJson(path: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface GeneratePlanResult {
  source: string;
  recipes: Recipe[];
}

/**
 * Fordert einen (LLM-)Plan vom Backend an. Validiert jedes Rezept gegen das
 * Domänenschema; ungültige werden verworfen (nie ungeprüft übernehmen).
 */
export async function generatePlan(
  prefs: UserPreferences,
  days = 7,
  now = Date.now(),
): Promise<GeneratePlanResult> {
  const body = {
    numberOfPeople: prefs.numberOfPeople,
    diet: prefs.diet,
    allergies: prefs.allergies,
    avoidedIngredients: prefs.avoidedIngredients,
    // Server erwartet die VORHANDENEN Geräte -> aus der Ausschlussliste ableiten.
    appliances: APPLIANCES.filter((a) => !prefs.excludedAppliances.includes(a)),
    preferredStyles: prefs.preferredStyles,
    mealTypes: prefs.mealTypes,
    budget: prefs.budget,
    days,
  };
  const raw = await fetchJson('/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = GeneratePlanResponse.parse(raw);

  const recipes: Recipe[] = [];
  parsed.recipes.forEach((entry, i) => {
    const r = LlmRecipeSchema.safeParse(entry);
    if (!r.success) {
      console.warn('[api] LLM-Rezept verworfen (Schema):', r.error.issues[0]?.message);
      return;
    }
    recipes.push({
      ...r.data,
      id: `llm-${normalizeName(r.data.title) || 'rezept'}-${now}-${i}`,
      source: 'llm',
      isFavorite: false,
      createdAt: now,
    });
  });

  return { source: parsed.source ?? 'llm', recipes };
}

const NutritionResponse = z.object({
  perServing: NutritionSchema.nullable(),
  matchedCount: z.number(),
  unmatchedCount: z.number(),
  unknownIngredients: z.array(z.string()),
});
export type NutritionResult = z.infer<typeof NutritionResponse>;

/**
 * Berechnet Makros pro Portion aus einer Zutatliste (Backend: USDA/OFF + Seed).
 * perServing ist null, wenn keine Zutat gematcht wurde (nie 0 als Nährwert).
 */
export async function fetchNutrition(
  ingredients: Pick<Ingredient, 'name' | 'amount' | 'unit'>[],
  servings: number,
): Promise<NutritionResult> {
  const raw = await fetchJson('/nutrition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ingredients: ingredients.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit })),
      servings,
    }),
  });
  return NutritionResponse.parse(raw);
}

const OnlinePriceSchema = z.object({
  key: z.string(),
  pricePerPackage: z.number().nullable(),
  packageSize: z.number().nullable(),
  packageUnit: z.enum(['g', 'ml', 'stück']).nullable(),
  /** Typische Handelsmarke (nur KI-Schätzung); optional. */
  brand: z.string().optional(),
  currency: z.string(),
  source: z.enum(['open-prices', 'ai', 'unknown']),
  updatedAt: z.string().nullable(),
});
export type OnlinePrice = z.infer<typeof OnlinePriceSchema>;

const PricesResponse = z.object({ items: z.array(OnlinePriceSchema) });

/**
 * Fragt Online-Preise (Open Prices) für mehrere Produkte an. Niedrigste Priorität
 * (füllt Lücken); nur sinnvoll wenn online + opt-in. Fehler werfen -> Aufrufer ignoriert.
 */
export async function fetchPrices(
  items: { key: string; query?: string; region?: string }[],
): Promise<OnlinePrice[]> {
  const raw = await fetchJson('/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return PricesResponse.parse(raw).items;
}

const ImportResponse = z.object({
  source: z.string().optional(),
  attribution: z.string().optional(),
  recipes: z.array(z.unknown()),
});

export interface ImportResult {
  recipes: Recipe[];
  attribution: string;
}

function deriveImportId(sourceUrl: string | undefined, title: string, i: number): string {
  const mealId = sourceUrl?.match(/(\d{3,})/)?.[1];
  return `themealdb-${mealId ?? (normalizeName(title) || 'rezept')}-${i}`;
}

/**
 * Importiert Rezepte aus TheMealDB (serverseitig ins Deutsche + Schema normalisiert).
 * Längeres Timeout, da pro Rezept eine LLM-Normalisierung läuft. Ungültige verworfen.
 */
export async function importRecipes(
  category = '',
  count = 6,
  now = Date.now(),
): Promise<ImportResult> {
  const raw = await fetchJson(
    '/import-recipes',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, count }),
    },
    90_000,
  );
  const parsed = ImportResponse.parse(raw);
  const recipes: Recipe[] = [];
  parsed.recipes.forEach((entry, i) => {
    const r = LlmRecipeSchema.safeParse(entry);
    if (!r.success) return;
    recipes.push({
      ...r.data,
      id: deriveImportId(r.data.sourceUrl, r.data.title, i),
      source: 'themealdb',
      isFavorite: false,
      createdAt: now,
    });
  });
  return { recipes, attribution: parsed.attribution ?? 'TheMealDB' };
}

/**
 * KI-geschätzte Preise für Zutaten ohne gefundenen Preis (letzte Instanz).
 * Gleiche Shape wie fetchPrices (source "ai" | "unknown"). Fehler werfen -> ignorieren.
 */
export async function estimatePrices(
  items: { key: string; name: string }[],
): Promise<OnlinePrice[]> {
  const raw = await fetchJson(
    '/estimate-prices',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    },
    60_000,
  );
  return PricesResponse.parse(raw).items;
}

const RecipeImageSchema = z.object({
  key: z.string(),
  imageUrl: z.string().nullable(),
  attribution: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});
export type RecipeImageResult = z.infer<typeof RecipeImageSchema>;
const RecipeImagesResponse = z.object({ items: z.array(RecipeImageSchema) });

/**
 * Sucht echte Rezeptfotos (Openverse, CC) per Titel. Fehler werfen -> Aufrufer ignoriert
 * (Bilder sind optional, Platzhalter bleibt).
 */
export async function fetchRecipeImages(
  items: { key: string; query: string }[],
): Promise<RecipeImageResult[]> {
  const raw = await fetchJson(
    '/recipe-images',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    },
    30_000,
  );
  return RecipeImagesResponse.parse(raw).items;
}

/** Health-Check des Backends (für Feature-Gating / Statusanzeige). */
export async function health(timeoutMs = 3000): Promise<boolean> {
  try {
    await fetchJson('/health', { method: 'GET' }, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export const apiClient = {
  generatePlan,
  fetchNutrition,
  fetchPrices,
  estimatePrices,
  fetchRecipeImages,
  importRecipes,
  health,
  baseUrl: BASE_URL,
};
