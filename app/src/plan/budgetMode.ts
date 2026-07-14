import { loadSeedPrices } from '../db/seed';
import type { ProductFlag } from '../domain/enums';
import type { PriceOverride, Recipe } from '../domain/schema';
import { buildAiEngineMap } from '../pricing/aiPrices';
import type { AiPriceCacheEntry } from '../db/db';
import { PriceEngine } from '../pricing/priceEngine';

/**
 * Baut den Spar-Modus-Score-Boost für die Plan-Rangfolge:
 * - günstigere Rezepte (niedrigere Kosten/Portion) werden bevorzugt,
 * - Bonus je Zutat, deren Produkt aktuell im Angebot ist.
 * Additiv zu preferenceScore (Favorit +3, Style +1) — dominiert bewusst leicht.
 */
export function buildBudgetScoreBoost(
  overrides: PriceOverride[],
  aiEntries: AiPriceCacheEntry[],
  preferredProductFlags: ProductFlag[],
): (recipe: Recipe) => number {
  const seed = loadSeedPrices();
  const engine = new PriceEngine(seed, overrides, {
    aiPrices: buildAiEngineMap(aiEntries),
    preferredProductFlags,
  });
  const onOffer = new Set(seed.filter((p) => p.isOffer).map((p) => p.productKey));

  return (recipe: Recipe): number => {
    const perServing = engine.recipeCost(recipe).perServing;
    // Günstiger -> höher (negativer Kostenterm). ~2€/Portion => -4.
    let boost = -perServing * 2;
    // Angebots-Bonus: je Zutat mit aktuellem Angebot +1.5 (max +4.5).
    let offerHits = 0;
    for (const ing of recipe.ingredients) {
      const key = engine.keyForIngredient(ing);
      if (key && onOffer.has(key)) offerHits++;
    }
    boost += Math.min(offerHits, 3) * 1.5;
    return boost;
  };
}
