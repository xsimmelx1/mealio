import { create } from 'zustand';
import { db } from '../db/db';
import type { MealPlan, Recipe, UserPreferences } from '../domain/schema';
import { DAYS_PER_WEEK, pickReplacement, pickWeek } from '../plan/generatePlan';
import { LLMRecipeSource, SeedRecipeSource } from '../plan/recipeSource';
import { isoWeekStart } from '../plan/week';

type PlanStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'empty' | 'error';

interface PlanState {
  plan: MealPlan | null;
  catalog: Recipe[];
  status: PlanStatus;
  error: string | null;
  /** Welche Quelle den zuletzt generierten Plan erzeugt hat. */
  planSource: 'seed' | 'llm';
  /** Grund, warum auf Seed zurückgefallen wurde (falls KI angefordert war). */
  fallbackNote: string | null;
  load: () => Promise<void>;
  generate: (prefs: UserPreferences, seed?: number) => Promise<void>;
  reshuffleDay: (dayOfWeek: number, prefs: UserPreferences, seed?: number) => Promise<void>;
  recipeById: (id: string) => Recipe | undefined;
}

/** Ist ein Netz-Zugang vorhanden? (In Tests via navigator.onLine mockbar.) */
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
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
      // Quelle wählen: KI nur wenn opt-in UND online; sonst Seed. Bei KI-Fehler -> Seed.
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

      const ids = pickWeek(candidates, prefs, seed);
      if (ids.length === 0) {
        set({ catalog: candidates, plan: null, status: 'empty', planSource, fallbackNote });
        return;
      }
      const weekStart = isoWeekStart();
      const plan: MealPlan = {
        id: planId(weekStart),
        weekStartDate: weekStart,
        entries: entriesFromIds(ids),
      };
      await db.mealPlans.put(plan);
      set({ plan, catalog: candidates, status: 'ready', planSource, fallbackNote });
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
