import type { PriceOverride, SeedPrice } from '../domain/schema';
import { matchProductKey } from './productMatch';
import { packageDimension, reconcileFactor, toBase, type Dimension } from './units';
import type { Ingredient, Recipe } from '../domain/schema';

/**
 * Client-seitige Preis-Engine (offline-fähig).
 * Provider-Kette: ManualOverride (Dexie) > LocalSeedPrices (JSON) > Online (M11, hier nicht).
 * Rechnet intern immer mit Grundpreisen (pro g/ml/Stück).
 */

export type PriceSource = 'manual' | 'seed';

export interface ResolvedProduct {
  productKey: string;
  label: string;
  storeId: string;
  source: PriceSource;
  pricePerPackage: number;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'stück';
  dim: Dimension;
  /** Grundpreis pro Basiseinheit (€/g bzw. €/ml bzw. €/Stück). */
  basePricePerUnit: number;
}

export interface IngredientCost {
  status: 'ok' | 'unmatched';
  productKey: string | null;
  cost: number; // 0 bei unmatched
  source: PriceSource | null;
}

export interface RecipeCostEstimate {
  total: number;
  perServing: number;
  matchedCount: number;
  unmatchedCount: number;
}

export interface PriceEngineOptions {
  /** Bevorzugter Store (storeId), z. B. aus Prefs.supermarket. */
  preferredStore?: string;
}

export class PriceEngine {
  private seedByKey = new Map<string, SeedPrice[]>();
  private overrideByKey = new Map<string, PriceOverride>();
  private knownKeys: Set<string>;
  private preferredStore?: string;

  constructor(seedPrices: SeedPrice[], overrides: PriceOverride[], opts: PriceEngineOptions = {}) {
    for (const p of seedPrices) {
      const list = this.seedByKey.get(p.productKey) ?? [];
      list.push(p);
      this.seedByKey.set(p.productKey, list);
    }
    for (const o of overrides) {
      this.overrideByKey.set(o.productKey, o);
    }
    this.knownKeys = new Set([...this.seedByKey.keys(), ...this.overrideByKey.keys()]);
    this.preferredStore = opts.preferredStore?.trim().toLowerCase() || undefined;
  }

  /** Alle bekannten productKeys (für Matching). */
  keys(): ReadonlySet<string> {
    return this.knownKeys;
  }

  /** Wählt den passendsten Seed-Preis für einen Key (Store-Präferenz > Discounter > günstigster Grundpreis). */
  private pickSeed(productKey: string): SeedPrice | null {
    const list = this.seedByKey.get(productKey);
    if (!list || list.length === 0) return null;

    if (this.preferredStore) {
      const match = list.find((p) => p.storeId.toLowerCase() === this.preferredStore);
      if (match) return match;
    }
    const discounter = list.filter((p) => p.storeType === 'discounter');
    const pool = discounter.length ? discounter : list;
    // günstigster Grundpreis
    return pool.reduce((best, p) =>
      p.pricePerPackage / p.packageSize < best.pricePerPackage / best.packageSize ? p : best,
    );
  }

  /** Löst einen productKey zu einem konkreten Produkt inkl. Grundpreis auf. */
  resolve(productKey: string): ResolvedProduct | null {
    const seed = this.pickSeed(productKey);
    const override = this.overrideByKey.get(productKey);

    if (seed) {
      const dim = packageDimension(seed.packageUnit);
      const pricePerPackage = override ? override.pricePerPackage : seed.pricePerPackage;
      return {
        productKey,
        label: seed.label,
        storeId: override ? override.storeId : seed.storeId,
        source: override ? 'manual' : 'seed',
        pricePerPackage,
        packageSize: seed.packageSize,
        packageUnit: seed.packageUnit,
        dim,
        basePricePerUnit: pricePerPackage / seed.packageSize,
      };
    }

    // Override ohne Seed-Format: basePrice ist pro kg/l/Stück -> auf Basiseinheit runterrechnen.
    // Ohne bekannte Dimension nehmen wir Masse (g) als Näherung an.
    if (override) {
      return {
        productKey,
        label: productKey,
        storeId: override.storeId,
        source: 'manual',
        pricePerPackage: override.pricePerPackage,
        packageSize: 1000,
        packageUnit: 'g',
        dim: 'mass',
        basePricePerUnit: override.basePrice / 1000,
      };
    }

    return null;
  }

  /** Findet den productKey einer Zutat (Alias/Match). */
  keyForIngredient(ing: Pick<Ingredient, 'name' | 'productMatchId'>): string | null {
    if (ing.productMatchId && this.knownKeys.has(ing.productMatchId)) return ing.productMatchId;
    return matchProductKey(ing.name, this.knownKeys);
  }

  /** Proportionale Kosten einer einzelnen Zutatmenge. */
  ingredientCost(ing: Pick<Ingredient, 'name' | 'amount' | 'unit' | 'productMatchId'>): IngredientCost {
    if (ing.amount <= 0) {
      return { status: 'ok', productKey: null, cost: 0, source: null };
    }
    const key = this.keyForIngredient(ing);
    if (!key) return { status: 'unmatched', productKey: null, cost: 0, source: null };

    const product = this.resolve(key);
    if (!product) return { status: 'unmatched', productKey: key, cost: 0, source: null };

    const base = toBase(ing.amount, ing.unit);
    const factor = reconcileFactor(base.dim, product.dim);
    if (factor === null) {
      return { status: 'unmatched', productKey: key, cost: 0, source: null };
    }
    const cost = base.qty * factor * product.basePricePerUnit;
    return { status: 'ok', productKey: key, cost, source: product.source };
  }

  /** Schätzt die Kosten eines Rezepts (proportional) inkl. pro Portion. */
  recipeCost(recipe: Pick<Recipe, 'ingredients' | 'baseServings'>): RecipeCostEstimate {
    let total = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    for (const ing of recipe.ingredients) {
      const c = this.ingredientCost(ing);
      if (c.status === 'unmatched') {
        unmatchedCount++;
      } else {
        total += c.cost;
        if (c.productKey) matchedCount++;
      }
    }
    const servings = recipe.baseServings > 0 ? recipe.baseServings : 1;
    return {
      total: round2(total),
      perServing: round2(total / servings),
      matchedCount,
      unmatchedCount,
    };
  }

  /**
   * Kosten für eine aggregierte Einkaufsmenge unter Berücksichtigung GANZER Packungen.
   * totalBaseQty ist in der Basiseinheit der Zutat-Dimension.
   */
  wholePackageCost(
    productKey: string,
    totalBaseQty: number,
    dim: Dimension,
  ): { cost: number | null; source: PriceSource | null; packages: number } {
    const product = this.resolve(productKey);
    if (!product) return { cost: null, source: null, packages: 0 };
    const factor = reconcileFactor(dim, product.dim);
    if (factor === null) return { cost: null, source: null, packages: 0 };
    const needed = totalBaseQty * factor;
    const packages = Math.max(1, Math.ceil(needed / product.packageSize));
    return { cost: round2(packages * product.pricePerPackage), source: product.source, packages };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
