import { create } from 'zustand';
import { db } from '../db/db';
import { DEFAULT_PREFERENCES, UserPreferencesSchema, type UserPreferences } from '../domain/schema';

/**
 * Präferenzen-Store (Zustand). Quelle der Wahrheit ist Dexie (Singleton id=1);
 * der Store hält eine In-Memory-Kopie und persistiert jede Änderung.
 */
interface PrefsState {
  prefs: UserPreferences;
  loaded: boolean;
  /** Aus Dexie laden (oder Defaults anlegen). */
  load: () => Promise<void>;
  /** Teil-Update: mergen, validieren, persistieren. */
  update: (patch: Partial<UserPreferences>) => Promise<void>;
  /** Auf Defaults zurücksetzen. */
  reset: () => Promise<void>;
}

async function persist(prefs: UserPreferences): Promise<UserPreferences> {
  const valid = UserPreferencesSchema.parse({ ...prefs, id: 1 });
  await db.preferences.put(valid);
  return valid;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: DEFAULT_PREFERENCES,
  loaded: false,
  load: async () => {
    const existing = await db.preferences.get(1);
    if (existing) {
      // Über das Schema laufen lassen, damit neue Felder Defaults erhalten (Migration).
      const merged = UserPreferencesSchema.parse({ ...DEFAULT_PREFERENCES, ...existing, id: 1 });
      set({ prefs: merged, loaded: true });
    } else {
      const created = await persist(DEFAULT_PREFERENCES);
      set({ prefs: created, loaded: true });
    }
  },
  update: async (patch) => {
    const next = await persist({ ...get().prefs, ...patch });
    set({ prefs: next });
  },
  reset: async () => {
    const next = await persist(DEFAULT_PREFERENCES);
    set({ prefs: next });
  },
}));
