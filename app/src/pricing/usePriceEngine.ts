import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { loadSeedPrices } from '../db/seed';
import { storeTypeFor } from '../domain/enums';
import { usePrefsStore } from '../state/prefsStore';
import { buildAiEngineMap } from './aiPrices';
import { PriceEngine } from './priceEngine';

/**
 * Reaktive Preis-Engine: berücksichtigt bevorzugten Supermarkt (Prefs) inkl.
 * Preisniveau, manuelle Overrides UND gecachte KI-Preisschätzungen (alle live aus Dexie).
 */
export function usePriceEngine(): PriceEngine {
  const supermarket = usePrefsStore((s) => s.prefs.supermarket);
  const overrides = useLiveQuery(() => db.priceOverrides.toArray(), [], []);
  const aiEntries = useLiveQuery(() => db.aiPrices.toArray(), [], []);
  return useMemo(
    () =>
      new PriceEngine(loadSeedPrices(), overrides ?? [], {
        preferredStore: supermarket,
        preferredStoreType: storeTypeFor(supermarket) ?? undefined,
        aiPrices: buildAiEngineMap(aiEntries ?? []),
      }),
    [overrides, supermarket, aiEntries],
  );
}
