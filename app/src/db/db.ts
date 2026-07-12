import Dexie, { type Table } from 'dexie';
import type {
  MealPlan,
  PriceOverride,
  Recipe,
  ShoppingItem,
  UserPreferences,
} from '../domain/schema';

/** Gecachte KI-Preisschätzung (spart Gemini-Quota über Sessions hinweg). */
export interface AiPriceCacheEntry {
  key: string;
  pricePerPackage: number;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'stück';
  cachedAt: number;
}

/**
 * Mealio IndexedDB (Dexie). Einzige Persistenz für Domänendaten.
 * Kein localStorage für Domänendaten (nur Prefs-Singleton lebt ebenfalls hier).
 */
export class MealioDB extends Dexie {
  recipes!: Table<Recipe, string>;
  mealPlans!: Table<MealPlan, string>;
  shoppingItems!: Table<ShoppingItem, string>;
  priceOverrides!: Table<PriceOverride, string>;
  preferences!: Table<UserPreferences, number>;
  aiPrices!: Table<AiPriceCacheEntry, string>;

  constructor() {
    super('mealio');
    this.version(1).stores({
      // Indizes: nur was wir abfragen. isFavorite/source für Filter, weekStartDate für Plan-Lookup.
      recipes: 'id, isFavorite, source, *mealStyles, *dietTags',
      mealPlans: 'id, weekStartDate',
      shoppingItems: 'id, aisle, isChecked',
      priceOverrides: 'productKey',
      preferences: 'id',
    });
    // v2: Plan-Slots erhielten mealType; alte Pläne/Listen (altes Schema) verwerfen
    // (abgeleitete Daten, werden neu generiert). Rezepte/Prefs bleiben erhalten.
    this.version(2)
      .stores({
        recipes: 'id, isFavorite, source, *mealStyles, *mealTypes, *dietTags',
        mealPlans: 'id, weekStartDate',
        shoppingItems: 'id, aisle, isChecked',
        priceOverrides: 'productKey',
        preferences: 'id',
      })
      .upgrade(async (tx) => {
        await tx.table('mealPlans').clear();
        await tx.table('shoppingItems').clear();
      });
    // v3: Cache für KI-Preisschätzungen.
    this.version(3).stores({
      recipes: 'id, isFavorite, source, *mealStyles, *mealTypes, *dietTags',
      mealPlans: 'id, weekStartDate',
      shoppingItems: 'id, aisle, isChecked',
      priceOverrides: 'productKey',
      preferences: 'id',
      aiPrices: 'key',
    });
  }
}

export const db = new MealioDB();
