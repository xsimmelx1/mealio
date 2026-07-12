import { describe, it, expect } from 'vitest';
import { redact } from './logger.js';

describe('redact', () => {
  it('redigiert bekannte Secret-Keys', () => {
    const out = redact({
      LLM_API_KEY: 'super-secret',
      model: 'gemini-1.5-flash',
      nested: { authorization: 'Bearer xyz', ok: true },
    }) as Record<string, unknown>;

    expect(out.LLM_API_KEY).toBe('«redacted»');
    expect(out.model).toBe('gemini-1.5-flash');
    expect((out.nested as Record<string, unknown>).authorization).toBe('«redacted»');
    expect((out.nested as Record<string, unknown>).ok).toBe(true);
  });

  it('bricht bei Zyklen nicht ab', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
});
