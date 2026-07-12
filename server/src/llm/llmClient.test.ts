import { describe, it, expect } from 'vitest';
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
