import { describe, expect, it } from 'vitest';
import { queryVariants } from './openverse';

describe('queryVariants', () => {
  it('schneidet Beilagen ab " mit " ab und splittet Bindestriche', () => {
    const v = queryVariants('Ofen-Lachs mit mediterranem Gemüse');
    expect(v[0]).toBe('Ofen-Lachs mit mediterranem Gemüse'); // voller Titel zuerst
    expect(v).toContain('Ofen Lachs'); // Kerngericht
  });

  it('entfernt Füll-Adjektive (schnelle/cremiges …)', () => {
    const v = queryVariants('Cremiges Rote-Linsen-Dal');
    expect(v.some((q) => q === 'Rote Linsen Dal')).toBe(true);
    expect(v.some((q) => q.toLowerCase().startsWith('cremiges'))).toBe(true); // voller Titel bleibt als erste Variante
  });

  it('liefert eindeutige, nicht-leere Varianten von spezifisch nach allgemein', () => {
    const v = queryVariants('Kichererbsen-Curry mit Spinat');
    expect(new Set(v).size).toBe(v.length);
    expect(v.every((q) => q.length >= 3)).toBe(true);
    expect(v).toContain('Kichererbsen Curry');
  });
});
