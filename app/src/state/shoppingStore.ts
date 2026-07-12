import { create } from 'zustand';
import { db } from '../db/db';
import type { MealPlan, Recipe, ShoppingItem } from '../domain/schema';
import type { PriceEngine } from '../pricing/priceEngine';
import { aggregateShoppingItems } from '../shopping/aggregate';

interface ShoppingState {
  items: ShoppingItem[];
  showPantry: boolean;
  /** Aus Plan + Katalog + Engine neu aggregieren (behält isChecked/isPantry bei). */
  rebuild: (plan: MealPlan, catalog: Recipe[], engine: PriceEngine) => Promise<void>;
  load: () => Promise<void>;
  toggleCheck: (id: string) => Promise<void>;
  togglePantry: (id: string) => Promise<void>;
  setShowPantry: (show: boolean) => void;
}

export const useShoppingStore = create<ShoppingState>((set, get) => ({
  items: [],
  showPantry: true,

  rebuild: async (plan, catalog, engine) => {
    const fresh = aggregateShoppingItems(plan, catalog, engine);
    const prior = await db.shoppingItems.toArray();
    const priorById = new Map(prior.map((i) => [i.id, i]));
    const merged = fresh.map((it) => {
      const p = priorById.get(it.id);
      return p ? { ...it, isChecked: p.isChecked, isPantry: p.isPantry } : it;
    });
    await db.transaction('rw', db.shoppingItems, async () => {
      await db.shoppingItems.clear();
      await db.shoppingItems.bulkPut(merged);
    });
    set({ items: merged });
  },

  load: async () => {
    set({ items: await db.shoppingItems.toArray() });
  },

  toggleCheck: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const isChecked = !item.isChecked;
    await db.shoppingItems.update(id, { isChecked });
    set({ items: get().items.map((i) => (i.id === id ? { ...i, isChecked } : i)) });
  },

  togglePantry: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const isPantry = !item.isPantry;
    await db.shoppingItems.update(id, { isPantry });
    set({ items: get().items.map((i) => (i.id === id ? { ...i, isPantry } : i)) });
  },

  setShowPantry: (showPantry) => set({ showPantry }),
}));
