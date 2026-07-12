import { generatePlan } from '../api/client';
import { db } from '../db/db';
import type { Recipe, UserPreferences } from '../domain/schema';

/**
 * Abstraktion über die Herkunft der Rezept-Kandidaten für einen Plan.
 * Die eigentliche (deterministische) Wochen-Zusammenstellung passiert im planStore
 * über generatePlan.ts — so bleibt sie offline-fähig und testbar.
 *
 * - SeedRecipeSource: lokaler Katalog aus Dexie (offline).
 * - LLMRecipeSource: kommt in M9 (ruft das Backend /generate-plan), gleiche Schnittstelle.
 */
export interface RecipeSource {
  readonly kind: 'seed' | 'llm';
  getCandidates(prefs: UserPreferences): Promise<Recipe[]>;
}

export class SeedRecipeSource implements RecipeSource {
  readonly kind = 'seed' as const;
  constructor(private readonly loadCatalog: () => Promise<Recipe[]> = () => db.recipes.toArray()) {}

  async getCandidates(_prefs: UserPreferences): Promise<Recipe[]> {
    return this.loadCatalog();
  }
}

/**
 * Holt LLM-generierte, serverseitig validierte Rezepte über das Backend und
 * persistiert sie in Dexie (source='llm'), damit Detail-/Einkaufsansicht offline
 * darauf zugreifen können. Wirft bei Netz-/Backend-Fehlern (Aufrufer fällt zurück).
 */
export class LLMRecipeSource implements RecipeSource {
  readonly kind = 'llm' as const;

  async getCandidates(prefs: UserPreferences): Promise<Recipe[]> {
    const { recipes } = await generatePlan(prefs);
    if (recipes.length === 0) throw new Error('Backend lieferte keine gültigen Rezepte');
    await db.recipes.bulkPut(recipes);
    return recipes;
  }
}
