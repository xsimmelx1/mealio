import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, UserPreferencesSchema } from './schema';

describe('UserPreferences — preferredStores', () => {
  it('Default ist leer (= alle Märkte)', () => {
    expect(DEFAULT_PREFERENCES.preferredStores).toEqual([]);
  });

  it('Bestandsprefs ohne Feld erhalten beim Parsen den Default (Migration)', () => {
    const legacy = { id: 1, diet: 'vegan' };
    const parsed = UserPreferencesSchema.parse(legacy);
    expect(parsed.preferredStores).toEqual([]);
  });

  it('akzeptiert gültige storeIds und lehnt unbekannte ab', () => {
    expect(UserPreferencesSchema.parse({ preferredStores: ['aldi', 'rewe'] }).preferredStores).toEqual([
      'aldi',
      'rewe',
    ]);
    expect(() => UserPreferencesSchema.parse({ preferredStores: ['tegut'] })).toThrow();
  });
});
