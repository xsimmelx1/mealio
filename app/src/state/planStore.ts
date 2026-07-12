import { create } from 'zustand';
import { db } from '../db/db';
import type { MealType } from '../domain/enums';
import type { MealPlan, MealPlanEntry, Recipe, UserPreferences } from '../domain/schema';
import { pickPlan, pickReplacementSlot } from '../plan/generatePlan';
import { LLMRecipeSource, SeedRecipeSource } from '../plan/recipeSource';
import { isoWeekStart } from '../plan/week';

type PlanStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'empty' | 'error';

interface PlanState {
  plan: MealPlan | null;
  catalog: Recipe[];
  status: PlanStatus;
  error: string | null;
  planSource: 'seed' | 'llm';
  fallbackNote: string | null;
  load: () => Promise<void>;
  generate: (prefs: UserPreferences, seed?: number) => Promise<void>;
  reshuffleSlot: (day: number, mealType: MealType, prefs: UserPreferences, seed?: number) => Promise<void>;
  skipSlot: (day: number, mealType: MealType) => Promise<void>;
  recipeById: (id: string) => Recipe | undefined;
}

function planId(weekStart: string): string {
  return `plan-${weekStart}`;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function persistPlan(plan: MealPlan): Promise<void> {
  await db.mealPlans.put(plan);
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: null,
  catalog: [],
  status: 'idle',
  error: null,
  planSource: 'seed',
  fallbackNote: null,

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
    set({ status: 'generating', error: null, fallbackNote: null });
    try {
      let candidates: Recipe[];
      let planSource: 'seed' | 'llm' = 'seed';
      let fallbackNote: string | null = null;

      if (prefs.aiRecipesEnabled && isOnline()) {
        try {
          candidates = await new LLMRecipeSource().getCandidates(prefs);
          planSource = 'llm';
        } catch {
          fallbackNote = 'KI nicht erreichbar — Katalog verwendet.';
          candidates = await new SeedRecipeSource().getCandidates(prefs);
        }
      } else {
        candidates = await new SeedRecipeSource().getCandidates(prefs);
      }

      const entries = pickPlan(candidates, prefs, seed);
      const hasAny = entries.some((e) => e.recipeId);
      if (!hasAny) {
        set({ catalog: candidates, plan: null, status: 'empty', planSource, fallbackNote });
        return;
      }
      const weekStart = isoWeekStart();
      const plan: MealPlan = { id: planId(weekStart), weekStartDate: weekStart, entries };
      await persistPlan(plan);
      set({ plan, catalog: candidates, status: 'ready', planSource, fallbackNote });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  reshuffleSlot: async (day, mealType, prefs, seed = Date.now()) => {
    const { plan, catalog } = get();
    if (!plan) return;
    const replacement = pickReplacementSlot(catalog, prefs, plan.entries, day, mealType, seed);
    if (!replacement) return;
    const entries = upsertEntry(plan.entries, day, mealType, replacement);
    const next = { ...plan, entries };
    await persistPlan(next);
    set({ plan: next });
  },

  skipSlot: async (day, mealType) => {
    const { plan } = get();
    if (!plan) return;
    const entries = upsertEntry(plan.entries, day, mealType, null);
    const next = { ...plan, entries };
    await persistPlan(next);
    set({ plan: next });
  },

  recipeById: (id) => get().catalog.find((r) => r.id === id),
}));

/** Setzt/ersetzt den Eintrag eines Slots (fügt ihn an, falls noch nicht vorhanden). */
function upsertEntry(
  entries: MealPlanEntry[],
  day: number,
  mealType: MealType,
  recipeId: string | null,
): MealPlanEntry[] {
  const exists = entries.some((e) => e.dayOfWeek === day && e.mealType === mealType);
  if (exists) {
    return entries.map((e) =>
      e.dayOfWeek === day && e.mealType === mealType ? { ...e, recipeId } : e,
    );
  }
  return [...entries, { dayOfWeek: day, mealType, recipeId }];
}
