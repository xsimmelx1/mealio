import { describe, expect, it } from 'vitest';
import { matchProductKey, normalizeName } from './productMatch';

describe('normalizeName', () => {
  it('faltet Umlaute und kebab-t', () => {
    expect(normalizeName('Hähnchenbrust')).toBe('haehnchenbrust');
    expect(normalizeName('Rote Linsen')).toBe('rote-linsen');
    expect(normalizeName('Thunfisch (Dose)')).toBe('thunfisch');
  });
});

describe('matchProductKey', () => {
  const keys = new Set([
    'haehnchenbrust',
    'dosentomaten',
    'nudeln',
    'rote-linsen',
    'spinat-tk',
    'reis',
  ]);

  it('nutzt Alias-Tabelle', () => {
    expect(matchProductKey('Gehackte Tomaten', keys)).toBe('dosentomaten');
    expect(matchProductKey('Spaghetti', keys)).toBe('nudeln');
    expect(matchProductKey('Blattspinat', keys)).toBe('spinat-tk');
  });

  it('exakter Treffer nach Normalisierung', () => {
    expect(matchProductKey('Rote Linsen', keys)).toBe('rote-linsen');
  });

  it('Teilstring-Heuristik (Milchreis -> reis)', () => {
    expect(matchProductKey('Milchreis', keys)).toBe('reis');
  });

  it('kein plausibler Treffer -> null', () => {
    expect(matchProductKey('Trüffelöl', keys)).toBeNull();
  });

  it('Alias nur wenn Ziel bekannt ist', () => {
    expect(matchProductKey('Gehackte Tomaten', new Set(['reis']))).toBeNull();
  });
});
