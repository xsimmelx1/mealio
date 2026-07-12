import { useEffect, useState } from 'react';
import { usePrefsStore } from '../state/prefsStore';
import { seedDatabase } from './seed';

/**
 * Initialisiert die App-Datenbank beim ersten Render:
 * seedet die Rezepte (idempotent) und lädt die Präferenzen.
 * Gibt zurück, ob die Initialisierung abgeschlossen ist.
 */
export function useInitDb(): { ready: boolean; error: Error | null } {
  const loadPrefs = usePrefsStore((s) => s.load);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedDatabase();
        await loadPrefs();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPrefs]);

  return { ready, error };
}
