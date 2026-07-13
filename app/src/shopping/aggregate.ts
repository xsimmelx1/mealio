import type { MealPlan, Recipe, ShoppingItem } from '../domain/schema';
import type { PriceEngine } from '../pricing/priceEngine';
import { normalizeName } from '../pricing/productMatch';
import { toBase, type Dimension } from '../pricing/units';

/**
 * Aggregiert die Zutaten aller Rezepte eines Wochenplans zu einer Einkaufsliste.
 * - Gruppierung nach Produkt (gematchter productKey, sonst normalisierter Name)
 *   UND Dimension (Masse/Volumen/Stück getrennt).
 * - Mengen werden in der Basiseinheit (g/ml/stück) summiert.
 * - Preis über ganze Packungen (Preis-Engine); unmatched -> Preis unbekannt (null).
 * Rein & deterministisch bei gegebener Engine.
 */

interface Accum {
  key: string;
  productKey: string | null;
  name: string;
  qty: number;
  dim: Dimension;
  aisle: ShoppingItem['aisle'];
}

const BASE_UNIT: Record<Dimension, ShoppingItem['unit']> = {
  mass: 'g',
  volume: 'ml',
  count: 'stück',
};

export function aggregateShoppingItems(
  plan: MealPlan,
  catalog: Recipe[],
  engine: PriceEngine,
  now = 0,
): ShoppingItem[] {
  const byId = new Map<string, Recipe>(catalog.map((r) => [r.id, r]));
  const groups = new Map<string, Accum>();

  for (const entry of plan.entries) {
    if (!entry.recipeId) continue; // übersprungener Slot
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      if (ing.amount <= 0) continue;
      const base = toBase(ing.amount, ing.unit);
      const productKey = engine.keyForIngredient(ing);
      const groupBase = productKey ?? normalizeName(ing.name);
      const key = `${groupBase}::${base.dim}`;
      const existing = groups.get(key);
      if (existing) {
        existing.qty += base.qty;
      } else {
        groups.set(key, {
          key,
          productKey,
          name: productKey ? productKey : ing.name,
          qty: base.qty,
          dim: base.dim,
          aisle: ing.aisle,
        });
      }
    }
  }

  const items: ShoppingItem[] = [];
  for (const g of groups.values()) {
    let estimatedPrice: number | null = null;
    let source: ShoppingItem['source'] = 'unknown';
    let priceDate: string | null = null;
    let flags: ShoppingItem['flags'] = [];
    let offerPrice: number | null = null;
    if (g.productKey) {
      const resolved = engine.resolve(g.productKey);
      const whole = engine.wholePackageCost(g.productKey, g.qty, g.dim);
      if (whole.cost !== null) {
        estimatedPrice = whole.cost;
        source = whole.source ?? 'unknown';
        // Anzeigename: Produkt-Label falls vorhanden.
        if (resolved?.label) g.name = resolved.label;
        priceDate = SEED_PRICE_DATE;
        flags = resolved?.flags ?? [];
        // estimatedPrice ist bereits der effektive (Angebots-)Preis; markiere Angebot.
        if (resolved?.onOffer) offerPrice = estimatedPrice;
      }
    }
    items.push({
      id: `si-${g.key}`,
      name: capitalize(g.name),
      productKey: g.productKey,
      totalAmount: Math.round(g.qty * 100) / 100,
      unit: BASE_UNIT[g.dim],
      aisle: g.aisle,
      estimatedPrice,
      isChecked: false,
      source,
      priceDate,
      isPantry: false,
      flags,
      offerPrice,
    });
  }

  // Stabile Sortierung: nach Gang, dann Name.
  items.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  // now aktuell ungenutzt (Signatur für spätere Datumsstempel); vermeidet Lint-Fehler.
  void now;
  return items;
}

/** Seed-Preise sind Schätzwerte Stand Mitte 2026. */
export const SEED_PRICE_DATE = '2026-07';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
