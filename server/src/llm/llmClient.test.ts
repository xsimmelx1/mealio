import { afterEach, describe, it, expect, vi } from 'vitest';
import { createLlmClient, MockLlmClient, HttpLlmClient } from './llmClient.js';

describe('createLlmClient()', () => {
  it('liefert MockLlmClient ohne LLM_API_KEY', () => {
    const client = createLlmClient({});
    expect(client).toBeInstanceOf(MockLlmClient);
    expect(client.kind).toBe('mock');
  });

  it('liefert MockLlmClient bei LLM_PROVIDER=mock trotz Key', () => {
    const client = createLlmClient({ LLM_PROVIDER: 'mock', LLM_API_KEY: 'secret' });
    expect(client).toBeInstanceOf(MockLlmClient);
  });

  it('liefert HttpLlmClient mit Key und aktivem Provider', () => {
    const client = createLlmClient({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'secret-key' });
    expect(client).toBeInstanceOf(HttpLlmClient);
    expect(client.kind).toBe('http');
  });
});

describe('MockLlmClient', () => {
  it('generateStructured ist deterministisch und markiert source=mock', async () => {
    const client = new MockLlmClient();
    const result = await client.generateStructured({ prompt: 'x' });
    expect(result.source).toBe('mock');
    expect(result.data).toEqual({});
  });
});

describe('HttpLlmClient (Gemini)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parst die Gemini-Antwort zu JSON und markiert source=llm', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"recipes":[{"title":"Test"}]}' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new HttpLlmClient({ apiKey: 'k', model: 'gemini-flash-latest' });
    const result = await client.generateStructured<{ recipes: unknown[] }>({
      prompt: 'p',
      system: 's',
    });
    expect(result.source).toBe('llm');
    expect(result.data.recipes).toHaveLength(1);
    // Key steht nur in der URL, nie im Body.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gemini-flash-latest:generateContent');
    expect(String(init.body)).not.toContain('"k"');
  });

  it('toleriert Code-Fences/Prosa um das JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '```json\n{"a":1}\n```' }] } }],
        }),
      }),
    );
    const client = new HttpLlmClient({ apiKey: 'k', model: 'm', retry: { maxRetries: 0 } });
    const result = await client.generateStructured<{ a: number }>({ prompt: 'p' });
    expect(result.data.a).toBe(1);
  });

  it('wirft bei HTTP-Fehler (Route degradiert dann auf Seed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'quota' }),
    );
    const client = new HttpLlmClient({ apiKey: 'k', model: 'm', retry: { maxRetries: 0 } });
    await expect(client.generateStructured({ prompt: 'p' })).rejects.toThrow(/Gemini HTTP 429/);
  });
});
