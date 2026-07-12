import { create } from 'zustand';
import { db } from '../db/db';
import type { MealPlan, Recipe, UserPreferences } from '../domain/schema';
import { DAYS_PER_WEEK, pickReplacement, pickWeek } from '../plan/generatePlan';
import { SeedRecipeSource, type RecipeSource } from '../plan/recipeSource';
import { isoWeekStart } from '../plan/week';

type PlanStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'empty' | 'error';

interface PlanState {
  plan: MealPlan | null;
  catalog: Recipe[];
  status: PlanStatus;
  error: string | null;
  source: RecipeSource;
  load: () => Promise<void>;
  generate: (prefs: UserPreferences, seed?: number) => Promise<void>;
  reshuffleDay: (dayOfWeek: number, prefs: UserPreferences, seed?: number) => Promise<void>;
  recipeById: (id: string) => Recipe | undefined;
}

function planId(weekStart: string): string {
  return `plan-${weekStart}`;
}

function entriesFromIds(ids: string[]): MealPlan['entries'] {
  return ids.map((recipeId, dayOfWeek) => ({ dayOfWeek, recipeId }));
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: null,
  catalog: [],
  status: 'idle',
  error: null,
  source: new SeedRecipeSource(),

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const weekStart = isoWeekStart();
      const [plan, catalog] = await Promise.all([
        db.mealPlans.get(planId(weekStart)),
        db.recipes.toArray(),
      ]);
      set({ plan: plan ?? null, catalog, status: plan ? 'ready' : 'idle' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  generate: async (prefs, seed = Date.now()) => {
    set({ status: 'generating', error: null });
    try {
      const candidates = await get().source.getCandidates(prefs);
      const ids = pickWeek(candidates, prefs, seed);
      if (ids.length === 0) {
        set({ catalog: candidates, plan: null, status: 'empty' });
        return;
      }
      const weekStart = isoWeekStart();
      const plan: MealPlan = {
        id: planId(weekStart),
        weekStartDate: weekStart,
        entries: entriesFromIds(ids),
      };
      await db.mealPlans.put(plan);
      set({ plan, catalog: candidates, status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  reshuffleDay: async (dayOfWeek, prefs, seed = Date.now()) => {
    const { plan, catalog } = get();
    if (!plan) return;
    const ids: string[] = Array.from({ length: DAYS_PER_WEEK }, (_, day) => {
      const e = plan.entries.find((x) => x.dayOfWeek === day);
      return e ? e.recipeId : '';
    });
    const replacement = pickReplacement(catalog, prefs, ids, dayOfWeek, seed);
    if (!replacement) return;
    ids[dayOfWeek] = replacement;
    const next: MealPlan = { ...plan, entries: entriesFromIds(ids) };
    await db.mealPlans.put(next);
    set({ plan: next });
  },

  recipeById: (id) => get().catalog.find((r) => r.id === id),
}));
