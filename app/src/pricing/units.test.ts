import { describe, expect, it } from 'vitest';
import { packageDimension, reconcileFactor, toBase } from './units';

describe('toBase', () => {
  it('normalisiert Masse auf Gramm', () => {
    expect(toBase(2, 'kg')).toEqual({ qty: 2000, dim: 'mass' });
    expect(toBase(300, 'g')).toEqual({ qty: 300, dim: 'mass' });
  });

  it('normalisiert Volumen auf Milliliter', () => {
    expect(toBase(1, 'l')).toEqual({ qty: 1000, dim: 'volume' });
    expect(toBase(2, 'tbsp')).toEqual({ qty: 30, dim: 'volume' });
    expect(toBase(1, 'tsp')).toEqual({ qty: 5, dim: 'volume' });
  });

  it('behandelt Stück und Prise', () => {
    expect(toBase(3, 'stück')).toEqual({ qty: 3, dim: 'count' });
    expect(toBase(2, 'prise')).toEqual({ qty: 1, dim: 'mass' });
  });
});

describe('reconcileFactor', () => {
  it('gleiche Dimension -> 1', () => {
    expect(reconcileFactor('mass', 'mass')).toBe(1);
  });
  it('Masse <-> Volumen -> 1 (Näherung)', () => {
    expect(reconcileFactor('mass', 'volume')).toBe(1);
    expect(reconcileFactor('volume', 'mass')).toBe(1);
  });
  it('Stück <-> Nicht-Stück -> null (unbekannt)', () => {
    expect(reconcileFactor('count', 'mass')).toBeNull();
    expect(reconcileFactor('mass', 'count')).toBeNull();
  });
});

describe('packageDimension', () => {
  it('mappt Packungseinheit auf Dimension', () => {
    expect(packageDimension('g')).toBe('mass');
    expect(packageDimension('ml')).toBe('volume');
    expect(packageDimension('stück')).toBe('count');
  });
});
