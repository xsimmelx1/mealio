import type { PriceOverride, SeedPrice } from '../domain/schema';
import {
  STORE_DEFAULT_BRAND,
  STORE_PRICE_INDEX,
  type StoreId,
} from '../domain/enums';
import { matchProductKey, normalizeName } from './productMatch';
import { packageDimension, reconcileFactor, toBase, type Dimension } from './units';
import type { Ingredient, Recipe } from '../domain/schema';

/** KI-geschätzter Preis für eine Zutat (keyed nach normalizeName). */
export interface AiPriceEntry {
  pricePerPackage: number;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'stück';
  /** Optionale KI-geschätzte Marke (marktneutral). */
  brand?: string;
}

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
  source: PriceSource | 'ai' | null;
}

export interface RecipeCostEstimate {
  total: number;
  perServing: number;
  matchedCount: number;
  unmatchedCount: number;
}

/** Einkaufskosten einer Position bei EINEM konkreten Markt (für den Supermarkt-Vergleich). */
export interface StoreLineCost {
  /** Kosten (ganze Packungen) oder null, wenn für diesen Markt nicht bepreisbar. */
  cost: number | null;
  /** Marke/Eigenmarke in diesem Markt (Katalog) bzw. Fallback-Eigenmarke (KI). */
  brand: string | null;
  packages: number;
  /** 'seed' = Katalogpreis, 'ai' = KI-geschätzt (×Marktindex). */
  source: 'seed' | 'ai' | null;
  /** 'real' = echte Quelle (mit Datum/Produkt), 'estimate' = abgeleitet/geschätzt. */
  dataSource: 'real' | 'estimate' | null;
  /** Stand der echten Preisdaten (YYYY-MM), nur bei 'real'. */
  priceDate?: string;
  /** Echter Produktname der Quelle, nur bei 'real'. */
  productName?: string;
}

export interface PriceEngineOptions {
  /** Bevorzugter Store (storeId), z. B. aus Prefs.supermarket. */
  preferredStore?: string;
  /** Bevorzugtes Preisniveau (discounter/vollsortimenter), abgeleitet aus dem Supermarkt. */
  preferredStoreType?: 'discounter' | 'vollsortimenter';
  /** KI-geschätzte Preise (keyed nach normalizeName) als Fallback für ungematchte Zutaten. */
  aiPrices?: Map<string, AiPriceEntry>;
}

export class PriceEngine {
  private seedByKey = new Map<string, SeedPrice[]>();
  private overrideByKey = new Map<string, PriceOverride>();
  private knownKeys: Set<string>;
  private preferredStore?: string;
  private preferredStoreType?: 'discounter' | 'vollsortimenter';
  private aiPrices: Map<string, AiPriceEntry>;

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
    this.preferredStoreType = opts.preferredStoreType;
    this.aiPrices = opts.aiPrices ?? new Map();
  }

  /** Alle bekannten productKeys (für Matching). */
  keys(): ReadonlySet<string> {
    return this.knownKeys;
  }

  private cheapest(list: SeedPrice[]): SeedPrice {
    return list.reduce((best, p) =>
      p.pricePerPackage / p.packageSize < best.pricePerPackage / best.packageSize ? p : best,
    );
  }

  /**
   * Wählt den passendsten Seed-Preis: exakter Store > passendes Preisniveau
   * (aus dem gewählten Supermarkt) > Discounter > günstigster Grundpreis.
   */
  private pickSeed(productKey: string): SeedPrice | null {
    const list = this.seedByKey.get(productKey);
    if (!list || list.length === 0) return null;

    // 1. Exakter Store-Treffer (z. B. Seed hat genau diese storeId).
    if (this.preferredStore) {
      const match = list.find((p) => p.storeId.toLowerCase() === this.preferredStore);
      if (match) return match;
    }
    // 2. Passendes Preisniveau des gewählten Supermarkts (Discounter vs. Vollsortimenter).
    if (this.preferredStoreType) {
      const typed = list.filter((p) => p.storeType === this.preferredStoreType);
      if (typed.length) return this.cheapest(typed);
    }
    // 3. Standard: Discounter, sonst günstigster.
    const discounter = list.filter((p) => p.storeType === 'discounter');
    return this.cheapest(discounter.length ? discounter : list);
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

  /** Proportionale Kosten einer einzelnen Zutatmenge (Seed/Manual, sonst KI-Fallback). */
  ingredientCost(ing: Pick<Ingredient, 'name' | 'amount' | 'unit' | 'productMatchId'>): IngredientCost {
    if (ing.amount <= 0) {
      return { status: 'ok', productKey: null, cost: 0, source: null };
    }
    const key = this.keyForIngredient(ing);

    // 1. Seed/Manual-Preis über den gematchten Produktschlüssel.
    if (key) {
      const product = this.resolve(key);
      if (product) {
        const base = toBase(ing.amount, ing.unit);
        const factor = reconcileFactor(base.dim, product.dim);
        if (factor !== null) {
          return { status: 'ok', productKey: key, cost: base.qty * factor * product.basePricePerUnit, source: product.source };
        }
      }
    }

    // 2. KI-Fallback (keyed nach normalisiertem Namen).
    const ai = this.aiPrices.get(normalizeName(ing.name));
    if (ai && ai.packageSize > 0) {
      const base = toBase(ing.amount, ing.unit);
      const factor = reconcileFactor(base.dim, packageDimension(ai.packageUnit));
      if (factor !== null) {
        const cost = base.qty * factor * (ai.pricePerPackage / ai.packageSize);
        return { status: 'ok', productKey: key, cost, source: 'ai' };
      }
    }

    return { status: 'unmatched', productKey: key, cost: 0, source: null };
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

  /**
   * Einkaufskosten (ganze Packungen) einer Position bei EINEM konkreten Markt (storeId) —
   * Kern des Supermarkt-Vergleichs. Kette:
   *  1. Kuratierte Katalog-Zeile mit exakt dieser storeId (echter Preis + Marke).
   *  2. KI-Basispreis (nach normalisiertem Namen) × Markt-Index (Fallback-Marke je Markt).
   *  3. sonst null (für diesen Markt nicht bepreisbar).
   * `name` wird nur für den KI-Fallback gebraucht (Katalog-Positionen matchen über productKey).
   */
  wholePackageCostForStore(
    productKey: string | null,
    name: string,
    totalBaseQty: number,
    dim: Dimension,
    storeId: StoreId,
  ): StoreLineCost {
    // 1. Kuratierter Katalogpreis für genau diesen Markt.
    if (productKey) {
      const list = this.seedByKey.get(productKey);
      const row = list?.find((p) => p.storeId.toLowerCase() === storeId);
      if (row) {
        const factor = reconcileFactor(dim, packageDimension(row.packageUnit));
        if (factor === null) return { cost: null, brand: null, packages: 0, source: null, dataSource: null };
        const packages = Math.max(1, Math.ceil((totalBaseQty * factor) / row.packageSize));
        const isReal = row.dataSource === 'real';
        return {
          cost: round2(packages * row.pricePerPackage),
          brand: row.brand ?? STORE_DEFAULT_BRAND[storeId],
          packages,
          source: 'seed',
          dataSource: isReal ? 'real' : 'estimate',
          ...(isReal && row.priceDate ? { priceDate: row.priceDate } : {}),
          ...(isReal && row.productName ? { productName: row.productName } : {}),
        };
      }
    }

    // 2. KI-Fallback: marktneutraler Basispreis × Markt-Index.
    const ai = this.aiPrices.get(normalizeName(name));
    if (ai && ai.packageSize > 0) {
      const factor = reconcileFactor(dim, packageDimension(ai.packageUnit));
      if (factor !== null) {
        const perPackage = ai.pricePerPackage * STORE_PRICE_INDEX[storeId];
        const packages = Math.max(1, Math.ceil((totalBaseQty * factor) / ai.packageSize));
        return {
          cost: round2(packages * perPackage),
          brand: ai.brand ?? STORE_DEFAULT_BRAND[storeId],
          packages,
          source: 'ai',
          dataSource: 'estimate',
        };
      }
    }

    return { cost: null, brand: null, packages: 0, source: null, dataSource: null };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
