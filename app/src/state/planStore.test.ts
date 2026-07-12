import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../db/seed';
import { UserPreferencesSchema } from '../domain/schema';
import { usePlanStore } from './planStore';

function resetStore() {
  usePlanStore.setState({
    plan: null,
    catalog: [],
    status: 'idle',
    error: null,
    planSource: 'seed',
    fallbackNote: null,
  });
}

describe('planStore.generate — Quellenwahl & Fallback', () => {
  beforeEach(async () => {
    await seedDatabase(0);
    resetStore();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nutzt Seed-Katalog, wenn KI deaktiviert ist (kein Netz-Aufruf)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const prefs = UserPreferencesSchema.parse({ aiRecipesEnabled: false });

    await usePlanStore.getState().generate(prefs, 42);

    expect(usePlanStore.getState().planSource).toBe('seed');
    expect(usePlanStore.getState().plan?.entries).toHaveLength(7);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fällt bei KI-Fehler sauber auf den Seed-Katalog zurück', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const prefs = UserPreferencesSchema.parse({ aiRecipesEnabled: true });

    await usePlanStore.getState().generate(prefs, 42);

    const state = usePlanStore.getState();
    expect(state.planSource).toBe('seed');
    expect(state.fallbackNote).toMatch(/KI nicht erreichbar/i);
    expect(state.plan?.entries).toHaveLength(7);
    expect(state.status).toBe('ready');
  });

  it('markiert Plan als llm, wenn das Backend gültige Rezepte liefert', async () => {
    const recipes = Array.from({ length: 7 }, (_, i) => ({
      title: `KI-Rezept ${i}`,
      mealStyles: ['schnell'],
      dietTags: ['omnivor'],
      requiredAppliances: ['herd'],
      prepMinutes: 5,
      cookMinutes: 10,
      baseServings: 2,
      ingredients: [{ name: 'Reis', amount: 150, unit: 'g', aisle: 'trockenwaren' }],
      steps: ['a', 'b', 'c'],
      nutritionPerServing: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ source: 'llm', recipes }) }),
    );
    const prefs = UserPreferencesSchema.parse({ aiRecipesEnabled: true });

    await usePlanStore.getState().generate(prefs, 42);

    expect(usePlanStore.getState().planSource).toBe('llm');
    expect(usePlanStore.getState().plan?.entries).toHaveLength(7);
  });
});
