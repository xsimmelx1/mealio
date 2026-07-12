import { describe, it, expect } from 'vitest';
import { MockLlmClient } from '../llm/llmClient.js';
import { estimatePrices } from './estimatePrices.js';

const items = [
  { key: 'safran', name: 'Safran' },
  { key: 'ahornsirup', name: 'Ahornsirup' },
];

describe('estimatePrices', () => {
  it('nutzt gültige KI-Schätzungen (source ai), rundet Preis', async () => {
    const llm = new MockLlmClient(() => ({
      estimates: [
        { key: 'safran', pricePerPackage: 3.499, packageSize: 2, packageUnit: 'g' },
        { key: 'ahornsirup', pricePerPackage: 4.5, packageSize: 250, packageUnit: 'ml' },
      ],
    }));
    const res = await estimatePrices(items, llm);
    expect(res[0]).toMatchObject({ key: 'safran', source: 'ai', pricePerPackage: 3.5, packageUnit: 'g' });
    expect(res[1]).toMatchObject({ key: 'ahornsirup', source: 'ai', packageSize: 250 });
  });

  it('ungültige/fehlende Werte -> unknown (nie geraten)', async () => {
    const llm = new MockLlmClient(() => ({
      estimates: [{ key: 'safran', pricePerPackage: -1, packageSize: 2, packageUnit: 'g' }],
    }));
    const res = await estimatePrices(items, llm);
    expect(res.find((r) => r.key === 'safran')?.source).toBe('unknown'); // Preis <= 0
    expect(res.find((r) => r.key === 'ahornsirup')?.source).toBe('unknown'); // fehlt komplett
  });

  it('LLM-Fehler -> alle unknown, kein Wurf', async () => {
    const llm = new MockLlmClient(() => {
      throw new Error('Gemini 429');
    });
    const res = await estimatePrices(items, llm);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.source === 'unknown')).toBe(true);
  });
});
