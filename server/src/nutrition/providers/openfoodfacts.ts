/**
 * Open Food Facts Provider (keyless).
 *
 * Lizenz: OFF-Daten stehen unter ODbL -> Attribution + Share-Alike der Datenbank
 * erforderlich. Attribution siehe App (Über/Impressum) und server/README.md.
 * WICHTIG: Keine OFF-Daten fest ins Repo kopieren — nur live abfragen + cachen.
 *
 * Robustheit: OFF liefert HTTP 200 auch, wenn nichts gefunden wurde
 * (z. B. count/products leer). Deshalb Body/Felder prüfen, nicht auf Status
 * vertrauen. Nährwerte kommen teils als Strings -> am Rand casten.
 */

import type { NutritionProvider } from './types.js';
import { fetchWithTimeout, toNumberOrNull } from './types.js';
import type { Per100g } from '../nutritionSeed.js';

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

interface OffNutriments {
  ['energy-kcal_100g']?: unknown;
  energy_100g?: unknown;
  proteins_100g?: unknown;
  carbohydrates_100g?: unknown;
  fat_100g?: unknown;
}
interface OffProduct {
  nutriments?: OffNutriments;
}
interface OffSearchResponse {
  count?: unknown;
  products?: OffProduct[];
}

export function createOffProvider(timeoutMs = 4000): NutritionProvider {
  return {
    name: 'Open Food Facts',
    async lookup(name: string): Promise<Per100g | null> {
      const url =
        `${SEARCH_URL}?search_terms=${encodeURIComponent(name)}` +
        `&search_simple=1&action=process&json=1&page_size=1` +
        `&fields=nutriments`;

      const res = await fetchWithTimeout(url, timeoutMs);
      // 200 != Treffer: erst den Body prüfen.
      const data = (await res.json()) as OffSearchResponse;
      const products = Array.isArray(data.products) ? data.products : [];
      if (products.length === 0) return null;

      const nutr = products[0]?.nutriments;
      if (!nutr) return null;

      // kcal bevorzugt; sonst aus kJ (energy_100g) umrechnen.
      let kcal = toNumberOrNull(nutr['energy-kcal_100g']);
      if (kcal === null) {
        const kj = toNumberOrNull(nutr.energy_100g);
        kcal = kj === null ? null : kj / 4.184;
      }
      if (kcal === null) return null;

      return {
        kcal,
        protein: toNumberOrNull(nutr.proteins_100g) ?? 0,
        carbs: toNumberOrNull(nutr.carbohydrates_100g) ?? 0,
        fat: toNumberOrNull(nutr.fat_100g) ?? 0,
      };
    },
  };
}
