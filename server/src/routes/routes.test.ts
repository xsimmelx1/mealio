import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { MockLlmClient } from '../llm/llmClient.js';

let app: Express;

beforeAll(() => {
  // Hohes Rate-Limit, damit die Test-Suite nicht selbst gedrosselt wird.
  app = createApp({
    llmClient: new MockLlmClient(),
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
  it('gültiger Body -> 200, source=mock, recipes>0', async () => {
    const res = await request(app)
      .post('/generate-plan')
      .send({
        numberOfPeople: 2,
        diet: 'vegetarian',
        allergies: [],
        avoidedIngredients: [],
        appliances: [],
        preferredStyles: [],
      });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('mock');
    expect(Array.isArray(res.body.recipes)).toBe(true);
    expect(res.body.recipes.length).toBeGreaterThan(0);
    // Skalierung nach numberOfPeople.
    expect(res.body.recipes[0].servings).toBe(2);
  });

  it('ungültiger Body (numberOfPeople=0) -> 400 mit issues', async () => {
    const res = await request(app)
      .post('/generate-plan')
      .send({ numberOfPeople: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });
});

describe('POST /nutrition', () => {
  it('gültiger Body -> 200 mit Stub-Shape', async () => {
    const res = await request(app)
      .post('/nutrition')
      .send({ ingredients: [{ name: 'Tomate', amount: 100, unit: 'g' }] });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ name: 'Tomate', status: 'unknown' }]);
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
