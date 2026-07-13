/**
 * TheMealDB-Adapter — Rohdaten-Quelle für den Rezept-Import.
 *
 * Lizenz/Attribution: TheMealDB stellt einen freien Test-Key `1` bereit. Pflicht ist
 * ein Link-Back auf das Originalrezept (wir liefern `sourceUrl`). Bilder werden NICHT
 * importiert (nur Text/Struktur). Kommerzieller Einsatz erwartet einen Patreon-
 * Produktionskey; der Test-Key kann ohne Vorwarnung brechen -> alle Aufrufe sind
 * defensiv (Timeout, 200-Body prüfen) und dürfen den App-Flow nie blockieren.
 *
 * Robustheit: TheMealDB antwortet mit HTTP 200 und `{"meals": null}`, wenn nichts
 * gefunden wurde. Deshalb wird IMMER der Body/das erwartete Feld geprüft, nie nur
 * der Statuscode. Rohdaten sind ENGLISCH mit imperialen Maßen.
 */

import { fetchWithTimeout } from '../../nutrition/providers/types.js';

/** Basis-URL mit freiem Test-Key `1`. */
const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';

/** Öffentliche Detailseite eines Rezepts (Link-Back-Pflicht). */
export function mealSourceUrl(idMeal: string): string {
  return `https://www.themealdb.com/meal/${encodeURIComponent(idMeal)}`;
}

/** Eine eingesammelte Roh-Zutat (Name + Maßangabe, beide englisch/imperial). */
export interface RawIngredient {
  name: string;
  measure: string;
}

/** Ein normalisiertes Roh-Rezept aus TheMealDB (englisch, imperiale Maße). */
export interface RawMeal {
  idMeal: string;
  title: string;
  category: string;
  area: string;
  instructions: string;
  ingredients: RawIngredient[];
  /** Foto-URL (strMealThumb); Link-Back via mealSourceUrl. */
  thumb: string;
}

/** Rohes Meal-Objekt der API (nur die genutzten Felder + dynamische Index-Keys). */
interface ApiMeal {
  idMeal?: unknown;
  strMeal?: unknown;
  strCategory?: unknown;
  strArea?: unknown;
  strInstructions?: unknown;
  [key: string]: unknown;
}

interface ApiResponse {
  meals?: ApiMeal[] | null;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Sammelt Zutaten aus strIngredient1..20 + strMeasure1..20 ein. Leere/whitespace-
 * only Einträge werden übersprungen (die API füllt oft bis Index 20 mit "" auf).
 */
function collectIngredients(meal: ApiMeal): RawIngredient[] {
  const out: RawIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = asString(meal[`strIngredient${i}`]);
    if (!name) continue;
    out.push({ name, measure: asString(meal[`strMeasure${i}`]) });
  }
  return out;
}

/** Wandelt ein rohes API-Meal in unser RawMeal; null, wenn Pflichtfelder fehlen. */
function toRawMeal(meal: ApiMeal | undefined | null): RawMeal | null {
  if (!meal || typeof meal !== 'object') return null;
  const idMeal = asString(meal.idMeal);
  const title = asString(meal.strMeal);
  const instructions = asString(meal.strInstructions);
  const ingredients = collectIngredients(meal);
  // Ohne id/Titel/Zutaten ist der Datensatz unbrauchbar.
  if (!idMeal || !title || ingredients.length === 0) return null;
  return {
    idMeal,
    title,
    category: asString(meal.strCategory),
    area: asString(meal.strArea),
    instructions,
    ingredients,
    thumb: asString(meal.strMealThumb),
  };
}

/** Adapter-Schnittstelle (injizierbar für Tests). */
export interface TheMealDbProvider {
  /** idMeal-Liste einer Kategorie (z. B. "Breakfast"). Leer bei keinem Treffer. */
  listByCategory(category: string): Promise<string[]>;
  /** Volldaten zu einer idMeal; null, wenn nicht gefunden. */
  lookupById(idMeal: string): Promise<RawMeal | null>;
  /** Ein zufälliges Voll-Rezept; null, wenn die API nichts liefert. */
  random(): Promise<RawMeal | null>;
}

/** Erzeugt den HTTP-Adapter gegen TheMealDB. */
export function createTheMealDbProvider(timeoutMs = 6000): TheMealDbProvider {
  async function getJson(path: string): Promise<ApiResponse> {
    const res = await fetchWithTimeout(`${BASE_URL}/${path}`, timeoutMs, {
      headers: { Accept: 'application/json' },
    });
    // 200 != Treffer: der Body wird immer geparst und geprüft.
    return (await res.json()) as ApiResponse;
  }

  return {
    async listByCategory(category: string): Promise<string[]> {
      const data = await getJson(`filter.php?c=${encodeURIComponent(category)}`);
      const meals = Array.isArray(data.meals) ? data.meals : [];
      return meals.map((m) => asString(m.idMeal)).filter((id) => id.length > 0);
    },

    async lookupById(idMeal: string): Promise<RawMeal | null> {
      const data = await getJson(`lookup.php?i=${encodeURIComponent(idMeal)}`);
      const meals = Array.isArray(data.meals) ? data.meals : [];
      return toRawMeal(meals[0]);
    },

    async random(): Promise<RawMeal | null> {
      const data = await getJson('random.php');
      const meals = Array.isArray(data.meals) ? data.meals : [];
      return toRawMeal(meals[0]);
    },
  };
}
