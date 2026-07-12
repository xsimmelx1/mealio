import { describe, it, expect } from 'vitest';
import { generatePlanSchema, type GeneratePlanInput } from '../schemas/index.js';
import { MockLlmClient, type GenerateStructuredArgs } from './llmClient.js';
import { defaultMockResponder } from './mockResponder.js';
import {
  LLMRecipeSource,
  RecipeGenerationError,
  SeedRecipeSource,
} from './recipeSource.js';
import { llmRecipeSchema } from './recipeSchema.js';

function prefs(overrides: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return generatePlanSchema.parse({ numberOfPeople: 2, days: 7, ...overrides });
}

/** Erkennt den Repair-Aufruf am Prompt-Marker. */
const isRepair = (args: GenerateStructuredArgs): boolean => args.prompt.includes('UNGÜLTIG');

describe('LLMRecipeSource mit MockLlmClient (E2E ohne Key)', () => {
  it('liefert genau days schema-valide, prefs-konforme Rezepte', async () => {
    const source = new LLMRecipeSource(new MockLlmClient(defaultMockResponder));
    const recipes = await source.generatePlan(prefs({ diet: 'vegan', days: 5 }));
    expect(recipes.length).toBe(5);
    for (const r of recipes) {
      // Schema-Vertrag.
      expect(() => llmRecipeSchema.parse(r)).not.toThrow();
      expect(r.nutritionPerServing).toBeNull();
      expect(r.baseServings).toBe(2);
      // Diät-Constraint respektiert.
      expect(r.dietTags).toContain('vegan');
    }
  });
});

describe('LLMRecipeSource Schema-Repair (genau 1 Versuch)', () => {
  it('kaputte Ausgabe -> 1 Repair -> valider Plan', async () => {
    let calls = 0;
    const client = new MockLlmClient((args) => {
      calls++;
      if (!isRepair(args)) return { totaler: 'müll' }; // erster Versuch: kaputt
      return defaultMockResponder(args); // Repair: valide
    });
    const source = new LLMRecipeSource(client);
    const recipes = await source.generatePlan(prefs({ days: 4 }));
    expect(calls).toBe(2); // genau ein Repair-Versuch
    expect(recipes.length).toBe(4);
  });

  it('zweimal kaputt -> RecipeGenerationError (Route degradiert danach auf Seed)', async () => {
    let calls = 0;
    const client = new MockLlmClient(() => {
      calls++;
      return { immer: 'kaputt' };
    });
    const source = new LLMRecipeSource(client);
    await expect(source.generatePlan(prefs())).rejects.toBeInstanceOf(RecipeGenerationError);
    expect(calls).toBe(2); // Erstversuch + genau 1 Repair, dann Abbruch
  });

  it('Transportfehler des Clients -> RecipeGenerationError', async () => {
    const client = new MockLlmClient(() => {
      throw new Error('network down');
    });
    const source = new LLMRecipeSource(client);
    await expect(source.generatePlan(prefs())).rejects.toBeInstanceOf(RecipeGenerationError);
  });

  it('MockLlmClient ohne Responder (Default {}) -> unparsebar -> Fehler', async () => {
    const source = new LLMRecipeSource(new MockLlmClient());
    await expect(source.generatePlan(prefs())).rejects.toBeInstanceOf(RecipeGenerationError);
  });
});

describe('SeedRecipeSource (Fallback)', () => {
  it('liefert days schema-valide Rezepte ohne Netz/Key', async () => {
    const source = new SeedRecipeSource();
    const recipes = await source.generatePlan(prefs({ diet: 'vegan', days: 6 }));
    expect(recipes.length).toBe(6);
    for (const r of recipes) {
      expect(() => llmRecipeSchema.parse(r)).not.toThrow();
      expect(r.dietTags).toContain('vegan');
      expect(r.baseServings).toBe(2);
      expect(r.nutritionPerServing).toBeNull();
    }
  });

  it('erzeugt keine Titel-Duplikate, auch wenn days den Katalog übersteigt', async () => {
    const recipes = await new SeedRecipeSource().generatePlan(prefs({ diet: 'vegan', days: 20 }));
    const titles = recipes.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
