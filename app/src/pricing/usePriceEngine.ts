import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { loadSeedPrices } from '../db/seed';
import { usePrefsStore } from '../state/prefsStore';
import { PriceEngine } from './priceEngine';

/**
 * Reaktive Preis-Engine: berücksichtigt bevorzugten Supermarkt (Prefs) und
 * manuelle Overrides (Dexie, live). Baut sich neu, wenn sich Overrides/Store ändern.
 */
export function usePriceEngine(): PriceEngine {
  const supermarket = usePrefsStore((s) => s.prefs.supermarket);
  const overrides = useLiveQuery(() => db.priceOverrides.toArray(), [], []);
  return useMemo(
    () => new PriceEngine(loadSeedPrices(), overrides ?? [], { preferredStore: supermarket }),
    [overrides, supermarket],
  );
}
