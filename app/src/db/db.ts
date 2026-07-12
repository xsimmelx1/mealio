import Dexie, { type Table } from 'dexie';
import type {
  MealPlan,
  PriceOverride,
  Recipe,
  ShoppingItem,
  UserPreferences,
} from '../domain/schema';

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
  }
}

export const db = new MealioDB();
