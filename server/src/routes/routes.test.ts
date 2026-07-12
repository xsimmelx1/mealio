import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { MockLlmClient } from '../llm/llmClient.js';
import { defaultMockResponder } from '../llm/mockResponder.js';

let app: Express;

beforeAll(() => {
  // Hohes Rate-Limit, damit die Test-Suite nicht selbst gedrosselt wird.
  // Der Standard-Responder liefert schema-valide, prefs-konforme Rezepte (E2E).
  app = createApp({
    llmClient: new MockLlmClient(defaultMockResponder),
    allowedOrigins: ['http://localhost:5173'],
    rateLimitMax: 10_000,
  });
});

describe('GET /health', () => {
  it('liefert 200 mit erwarteter Shape', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('POST /generate-plan', () => {
  it('gültiger Body -> 200, source=llm, schema-konforme Rezepte', async () => {
    const res = await request(app)
      .post('/generate-plan')
      .send({
        numberOfPeople: 2,
        diet: 'vegetarisch',
        allergies: [],
        avoidedIngredients: [],
        appliances: [],
        preferredStyles: [],
        days: 7,
      });
    expect(res.status).toBe(200);
    // MockLlmClient liefert schema-valide Rezepte -> gilt als "llm".
    expect(res.body.source).toBe('llm');
    expect(Array.isArray(res.body.recipes)).toBe(true);
    expect(res.body.recipes.length).toBe(7);
    const r = res.body.recipes[0];
    // Vertragskonformität: Pflichtfelder + nutrition null, keine Preise.
    expect(typeof r.title).toBe('string');
    expect(Array.isArray(r.mealStyles)).toBe(true);
    expect(Array.isArray(r.dietTags)).toBe(true);
    expect(Array.isArray(r.requiredAppliances)).toBe(true);
    expect(r.baseServings).toBe(2);
    expect(r.steps.length).toBeGreaterThanOrEqual(3);
    expect(r.ingredients.every((i: { amount: number }) => i.amount > 0)).toBe(true);
    expect(r.nutritionPerServing).toBeNull();
    expect(r).not.toHaveProperty('estimatedCostPerServing');
    expect(r).not.toHaveProperty('id');
    expect(r).not.toHaveProperty('source');
  });

  it('ungültiger Body (numberOfPeople=0) -> 400 mit issues', async () => {
    const res = await request(app)
      .post('/generate-plan')
      .send({ numberOfPeople: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('LLM liefert dauerhaft Müll -> sauberer Seed-Fallback (source=seed-fallback)', async () => {
    const brokenApp = createApp({
      llmClient: new MockLlmClient(() => ({ totaler: 'müll' })),
      allowedOrigins: ['http://localhost:5173'],
      rateLimitMax: 10_000,
    });
    const res = await request(brokenApp)
      .post('/generate-plan')
      .send({ numberOfPeople: 2, days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('seed-fallback');
    expect(res.body.recipes.length).toBe(7);
    expect(res.body.recipes[0].nutritionPerServing).toBeNull();
  });
});

describe('POST /nutrition', () => {
  it('gültiger Body -> 200 mit Vertrags-Shape', async () => {
    const res = await request(app)
      .post('/nutrition')
      .send({ ingredients: [{ name: 'Tomaten', amount: 100, unit: 'g' }], servings: 1 });
    expect(res.status).toBe(200);
    // Vertrag: perServing-Objekt oder null, Zähler + Liste.
    expect(res.body).toHaveProperty('perServing');
    expect(res.body).toHaveProperty('matchedCount');
    expect(res.body).toHaveProperty('unmatchedCount');
    expect(Array.isArray(res.body.unknownIngredients)).toBe(true);
    expect(res.body.matchedCount).toBe(1);
    expect(res.body.perServing).toMatchObject({
      kcal: expect.any(Number),
      protein: expect.any(Number),
      carbs: expect.any(Number),
      fat: expect.any(Number),
    });
  });

  it('unbekannte Zutat -> perServing null, in unknownIngredients', async () => {
    const res = await request(app)
      .post('/nutrition')
      .send({ ingredients: [{ name: 'Einhornstaub', amount: 100, unit: 'g' }] });
    expect(res.status).toBe(200);
    expect(res.body.perServing).toBeNull();
    expect(res.body.matchedCount).toBe(0);
    expect(res.body.unknownIngredients).toContain('Einhornstaub');
  });

  it('ungültiger Body (leere ingredients) -> 400', async () => {
    const res = await request(app).post('/nutrition').send({ ingredients: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('ungültiger Body (amount<=0) -> 400', async () => {
    const res = await request(app)
      .post('/nutrition')
      .send({ ingredients: [{ name: 'X', amount: 0, unit: 'g' }] });
    expect(res.status).toBe(400);
  });

  it('ungültiger Body (unbekannte unit) -> 400', async () => {
    const res = await request(app)
      .post('/nutrition')
      .send({ ingredients: [{ name: 'X', amount: 1, unit: 'dl' }] });
    expect(res.status).toBe(400);
  });
});

describe('POST /prices', () => {
  it('gültiger Body -> 200 mit Stub-Shape', async () => {
    const res = await request(app)
      .post('/prices')
      .send({ items: [{ productKey: 'milk-1l' }] });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { productKey: 'milk-1l', price: null, source: 'unknown' },
    ]);
  });

  it('ungültiger Body (fehlender productKey) -> 400', async () => {
    const res = await request(app).post('/prices').send({ items: [{}] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('unbekannte Route', () => {
  it('-> 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
