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
