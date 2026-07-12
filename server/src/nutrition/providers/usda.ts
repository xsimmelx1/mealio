/**
 * USDA FoodData Central Provider.
 *
 * Lizenz: USDA FDC-Daten sind Public Domain (frei, auch kommerziell nutzbar).
 * API-Key aus process.env.FDC_API_KEY, Default "DEMO_KEY" (rate-limitiert).
 *
 * Robustheit: HTTP 200 != Erfolg -> Body/Felder prüfen. Nährwerte werden am Rand
 * defensiv in Zahlen gecastet.
 */

import type { NutritionProvider } from './types.js';
import { fetchWithTimeout, toNumberOrNull } from './types.js';
import type { Per100g } from '../nutritionSeed.js';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/** USDA-Nährstoff-Nummern (nutrientNumber) für die Makros je 100 g. */
const NUTRIENT = {
  kcal: '1008', // Energy (kcal)
  protein: '1003',
  fat: '1004',
  carbs: '1005',
} as const;

interface UsdaNutrient {
  nutrientNumber?: string;
  value?: unknown;
}
interface UsdaFood {
  foodNutrients?: UsdaNutrient[];
}
interface UsdaSearchResponse {
  foods?: UsdaFood[];
}

function extract(nutrients: UsdaNutrient[], number: string): number | null {
  const hit = nutrients.find((n) => n.nutrientNumber === number);
  return hit ? toNumberOrNull(hit.value) : null;
}

export function createUsdaProvider(
  apiKey = process.env.FDC_API_KEY ?? 'DEMO_KEY',
  timeoutMs = 4000,
): NutritionProvider {
  return {
    name: 'USDA FoodData Central',
    async lookup(name: string): Promise<Per100g | null> {
      const url =
        `${SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}` +
        `&query=${encodeURIComponent(name)}&pageSize=1&dataType=Foundation,SR%20Legacy`;

      const res = await fetchWithTimeout(url, timeoutMs);
      // Body IMMER prüfen — Statuscode allein genügt nicht.
      const data = (await res.json()) as UsdaSearchResponse;
      const food = data.foods?.[0];
      if (!food || !Array.isArray(food.foodNutrients)) return null;

      const kcal = extract(food.foodNutrients, NUTRIENT.kcal);
      const protein = extract(food.foodNutrients, NUTRIENT.protein);
      const carbs = extract(food.foodNutrients, NUTRIENT.carbs);
      const fat = extract(food.foodNutrients, NUTRIENT.fat);

      // Ohne Energiewert gilt der Treffer als unbrauchbar.
      if (kcal === null) return null;
      return {
        kcal,
        protein: protein ?? 0,
        carbs: carbs ?? 0,
        fat: fat ?? 0,
      };
    },
  };
}
